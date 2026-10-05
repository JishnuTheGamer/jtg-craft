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
const tag = 'v1.0.4';
const release = `https://github.com/JishnuTheGamer/jtg-craft/releases/download/${tag}/`;
const update = (file, version, code, files, extras, changes) => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, file)));
    Object.assign(manifest, { version, versionCode: code, releaseDate: '2026-10-05', sourceRef: tag, files, ...extras });
    manifest.sha256 = Object.fromEntries(files.filter(f => f !== file).map(f => [f, digest(f)]));
    if (manifest.changelog[0]?.version !== version) manifest.changelog.unshift({version, versionCode: code, date:'2026-10-05', type:'patch', title:'Premium interface, reliable updates and Java runtime selection', changes});
    fs.writeFileSync(path.join(root, file), JSON.stringify(manifest, null, 2) + '\n');
    return manifest;
};
const desktop = update('update-check.json', '1.0.4', 104,
    ['lib/java-policy.cjs','lib/update-manager.cjs','lib/zip-runtime.cjs','src/index.html','src/style.css','src/renderer.js','src/splash.html','preload.js','main.js','update-check.json'],
    {minimumBinaryVersion:'1.0.0', downloadUrl: release + 'Jtg-craft-Setup-1.0.4.exe', nativeUpdate:{version:'1.0.4',url:release+'Jtg-craft-Setup-1.0.4.exe'}},
    ['Shared black/crimson interface, eight saved themes, searchable logs and grouped server properties.', 'Exact Java 17/21/25 selection; missing runtimes are installed without substituting an incompatible Java.', 'Verified, staged desktop hot updates with rollback on failure and safe shutdown before relaunch.']);
const mobile = update('mobile/mobile-update-check.json', '1.0.8', 1008,
    ['mobile/www/index.html','mobile/www/style.css','mobile/www/mobile-patches.css','mobile/www/mobile-bridge.js','mobile/www/renderer.js'],
    {updateMode:'native-aware', requiredNativeCode:8, nativeUpdate:{version:'1.0.8',versionCode:8,url:release+'jtg-craft-mobile-v1.apk'}, downloadUrl:release+'jtg-craft-mobile-v1.apk'},
    ['Native app upgrade required once for older APKs: use the APK on this release; existing servers are retained when installed over the old app.', 'Verified complete web bundles load HTML, JavaScript and CSS after activation; failed downloads keep the installed app.', 'Future native upgrades download inside the app and open Android installation confirmation; package, version and signing certificate are checked.', 'Android Java 21/25 use pinned Bionic ARM64 archives with checksums; MC 26.x selects Java 25.', 'Android 11/12+ heap pointer-tagging fix and mobile sidebar navigation without bottom tabs.']);
if (process.argv.includes('--artifacts')) {
    const installer = 'Jtg-craft-Setup-1.0.4.exe';
    for (const suffix of ['', '.blockmap']) {
        const from = path.join(root, 'dist', 'Jtg-craft Setup 1.0.4.exe' + suffix);
        if (fs.existsSync(from)) fs.renameSync(from, path.join(root,'dist',installer+suffix));
    }
    mobile.nativeUpdate.sha256 = digest('mobile/apk/jtg-craft-mobile-v1.apk');
    mobile.nativeUpdate.size = fs.statSync(path.join(root,'mobile/apk/jtg-craft-mobile-v1.apk')).size;
    fs.writeFileSync(path.join(root,'mobile/mobile-update-check.json'),JSON.stringify(mobile,null,2)+'\n');
    desktop.nativeUpdate.sha256 = digest('dist/' + installer);
    desktop.nativeUpdate.size = fs.statSync(path.join(root,'dist',installer)).size;
    fs.writeFileSync(path.join(root,'update-check.json'),JSON.stringify(desktop,null,2)+'\n');
}
fs.copyFileSync(path.join(root,'mobile/mobile-update-check.json'),path.join(root,'mobile/www/mobile-update-check.json'));
console.log('Release manifests prepared for PC 1.0.4 / Android 1.0.8 (' + tag + ').');
