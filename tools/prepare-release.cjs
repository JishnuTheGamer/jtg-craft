const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const digest = file => {
    const target = path.join(root, file);
    let bytes = fs.readFileSync(target);
    if (/\.(?:js|cjs|css|html|json)$/.test(file)) {
        const normalized = Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
        if (!bytes.equals(normalized)) fs.writeFileSync(target, normalized);
        bytes = normalized;
    }
    return crypto.createHash('sha256').update(bytes).digest('hex');
};
const tag = 'v1.0.5';
// Keep the public download URLs stable; source files use an immutable code tag.
const releaseTag = 'jtgcraft_v1';
const installer = 'Jtg-craft.Setup.1.0.0.exe';
const release = `https://github.com/JishnuTheGamer/jtg-craft/releases/download/${releaseTag}/`;
const update = (file, version, code, files, extras, changes) => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, file)));
    Object.assign(manifest, { version, versionCode: code, releaseDate: '2026-10-05', sourceRef: tag, files, ...extras });
    manifest.sha256 = Object.fromEntries(files.filter(f => f !== file).map(f => [f, digest(f)]));
    if (manifest.changelog[0]?.version !== version) manifest.changelog.unshift({version, versionCode: code, date:'2026-10-05', type:'patch', title:'Premium interface, reliable updates and Java runtime selection', changes});
    fs.writeFileSync(path.join(root, file), JSON.stringify(manifest, null, 2) + '\n');
    return manifest;
};
const desktop = update('update-check.json', '1.0.5', 105,
    ['lib/java-policy.cjs','lib/update-manager.cjs','lib/zip-runtime.cjs','src/index.html','src/style.css','src/renderer.js','src/splash.html','preload.js','main.js','update-check.json'],
    {minimumBinaryVersion:'1.0.0', downloadUrl: release + installer, nativeUpdate:{version:'1.0.5',url:release+installer}},
    ['Auto Java version labels and creation use the same policy as the backend; manual Java remains available.', 'Settings operations show a progress popup; RAM and CPU limits follow actual device hardware.', 'Verified, staged desktop hot updates with rollback on failure and safe shutdown before relaunch.']);
const mobile = update('mobile/mobile-update-check.json', '1.0.9', 1009,
    ['mobile/www/index.html','mobile/www/style.css','mobile/www/mobile-patches.css','mobile/www/mobile-bridge.js','mobile/www/renderer.js'],
    {updateMode:'native-aware', requiredNativeCode:9, nativeUpdate:{version:'1.0.9',versionCode:9,url:release+'jtg-craft-mobile-v1.apk'}, downloadUrl:release+'jtg-craft-mobile-v1.apk'},
    ['Native app upgrade required once for older APKs: use the APK on this release; existing servers are retained when installed over the old app.', 'Verified complete web bundles load HTML, JavaScript and CSS after activation; failed downloads keep the installed app.', 'Future native upgrades download inside the app and open Android installation confirmation; package, version and signing certificate are checked.', 'Android Java 21/25 use pinned Bionic ARM64 archives with checksums; MC 26.x selects Java 25.', 'System Bionic allocator verification, Android 16 JVM compatibility flags, actual device RAM/CPU limits, and Phone Storage permission flow.']);
if (process.argv.includes('--artifacts')) {
    for (const suffix of ['', '.blockmap']) {
        for (const name of ['Jtg-craft Setup 1.0.5.exe', 'Jtg-craft-Setup-1.0.5.exe']) {
            const from = path.join(root, 'dist', name + suffix);
            if (fs.existsSync(from)) fs.renameSync(from, path.join(root,'dist',installer+suffix));
        }
    }
    const latestPath = path.join(root, 'dist', 'latest.yml');
    if (fs.existsSync(latestPath)) fs.writeFileSync(latestPath, fs.readFileSync(latestPath,'utf8').replaceAll('Jtg-craft-Setup-1.0.5.exe', installer).replaceAll('Jtg-craft Setup 1.0.5.exe', installer));
    mobile.nativeUpdate.sha256 = digest('mobile/apk/jtg-craft-mobile-v1.apk');
    mobile.nativeUpdate.size = fs.statSync(path.join(root,'mobile/apk/jtg-craft-mobile-v1.apk')).size;
    fs.writeFileSync(path.join(root,'mobile/mobile-update-check.json'),JSON.stringify(mobile,null,2)+'\n');
    desktop.nativeUpdate.sha256 = digest('dist/' + installer);
    desktop.nativeUpdate.size = fs.statSync(path.join(root,'dist',installer)).size;
    fs.writeFileSync(path.join(root,'update-check.json'),JSON.stringify(desktop,null,2)+'\n');
}
fs.copyFileSync(path.join(root,'mobile/mobile-update-check.json'),path.join(root,'mobile/www/mobile-update-check.json'));
console.log('Release manifests prepared for PC 1.0.5 / Android 1.0.9 (stable downloads: ' + releaseTag + ', source: ' + tag + ').');
