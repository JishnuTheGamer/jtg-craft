const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const fsSync = require('node:fs');
const { pipeline } = require('node:stream/promises');
const ALLOWED = new Set(['src/index.html', 'src/style.css', 'src/renderer.js', 'src/splash.html', 'main.js', 'preload.js', 'lib/update-manager.cjs', 'lib/java-policy.cjs', 'lib/zip-runtime.cjs', 'update-check.json']);
function validateManifest(manifest) {
    if (!Number.isSafeInteger(manifest?.versionCode) || !manifest.version || !Array.isArray(manifest.files) || !manifest.files.length) throw new Error('Invalid update manifest.');
    if (new Set(manifest.files).size !== manifest.files.length || manifest.files.some(file => !ALLOWED.has(file))) throw new Error('Unsupported update file.');
    for (const file of manifest.files) {
        if (file !== 'update-check.json' && !/^[a-f0-9]{64}$/.test(manifest.sha256?.[file] || '')) throw new Error(`Missing checksum: ${file}`);
    }
}
async function applyUpdate({ baseDir, manifest, download, progress = () => {} }) {
    validateManifest(manifest);
    const staged = [];
    // Download and verify everything before touching an installed file.
    for (const file of manifest.files) {
        const bytes = file === 'update-check.json' ? Buffer.from(JSON.stringify(manifest, null, 2) + '\n') : Buffer.from(await download(file));
        if (file !== 'update-check.json' && crypto.createHash('sha256').update(bytes).digest('hex') !== manifest.sha256[file]) throw new Error(`Checksum mismatch: ${file}. Installed files were kept.`);
        staged.push({ file, bytes });
        progress({ current: staged.length, total: manifest.files.length, file, pct: Math.round(staged.length / manifest.files.length * 100) });
    }
    // Write the installed-version marker last, and restore on a write failure.
    staged.sort((a, b) => Number(a.file === 'update-check.json') - Number(b.file === 'update-check.json'));
    const previous = [];
    try {
        for (const entry of staged) {
            const target = path.join(baseDir, entry.file);
            let original = null;
            try { original = await fs.readFile(target); } catch (e) { if (e.code !== 'ENOENT') throw e; }
            await fs.mkdir(path.dirname(target), { recursive: true });
            const temporary = target + '.jtg-update-' + Date.now();
            try {
                await fs.writeFile(temporary, entry.bytes);
                await fs.rename(temporary, target);
                previous.push({ target, original });
            } finally { await fs.unlink(temporary).catch(() => {}); }
        }
    } catch (e) {
        const failures = [];
        for (const { target, original } of previous.reverse()) {
            try {
                if (original === null) await fs.unlink(target);
                else await fs.writeFile(target, original);
            } catch (error) { failures.push(error.message); }
        }
        if (failures.length) throw new Error('Update failed and file permissions prevented complete restoration: ' + failures.join('; '));
        throw e;
    }
    return { success: true, version: manifest.version, versionCode: manifest.versionCode };
}
async function prepareInstaller({ directory, update, request, progress = () => {} }) {
    if (!update?.url?.startsWith('https://github.com/JishnuTheGamer/jtg-craft/releases/download/') || !/^[a-f0-9]{64}$/.test(update.sha256 || '')) throw new Error('Invalid installer metadata.');
    await fs.mkdir(directory, { recursive: true });
    const target = path.join(directory, 'jtg-craft-upgrade.exe');
    const temporary = target + '.part';
    try {
        const response = await request(update.url);
        const total = Number(response.headers['content-length']) || update.size || 0;
        let bytes = 0;
        const checksum = crypto.createHash('sha256');
        response.data.on('data', chunk => {
            bytes += chunk.length;
            if (bytes > 300 * 1024 * 1024) { response.data.destroy(new Error('Installer exceeds size limit.')); return; }
            checksum.update(chunk);
            progress({pct:total ? Math.min(100,Math.round(bytes / total * 100)) : 0,file:'PC installer'});
        });
        await pipeline(response.data, fsSync.createWriteStream(temporary));
        if (checksum.digest('hex') !== update.sha256) throw new Error('Installer checksum mismatch.');
        await fs.rename(temporary, target);
        return target;
    } catch (error) { await fs.unlink(temporary).catch(() => {}); throw error; }
}
module.exports = { validateManifest, applyUpdate, prepareInstaller };
