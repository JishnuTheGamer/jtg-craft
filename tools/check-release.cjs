const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for (const name of ['update-check.json','mobile/mobile-update-check.json']) {
    const manifest = JSON.parse(fs.readFileSync(name));
    for (const file of manifest.files) {
        if (file !== name) {
            assert.equal(sha(file),manifest.sha256[file],file);
            assert(!fs.readFileSync(file,'utf8').includes('\r\n'),'Noncanonical OTA line endings: '+file);
        }
    }
    const artifact = name.startsWith('mobile/') ? 'mobile/apk/jtg-craft-mobile-v1.apk' : 'dist/Jtg-craft.Setup.1.0.0.exe';
    const filename = name.startsWith('mobile/') ? 'jtg-craft-mobile-v1.apk' : 'Jtg-craft.Setup.1.0.0.exe';
    const stableUrl = 'https://github.com/JishnuTheGamer/jtg-craft/releases/download/jtgcraft_v1/' + filename;
    assert.equal(manifest.downloadUrl, stableUrl);
    assert.equal(manifest.nativeUpdate.url, stableUrl);
    assert.equal(sha(artifact),manifest.nativeUpdate.sha256,artifact);
    assert.equal(fs.statSync(artifact).size,manifest.nativeUpdate.size);
    for (const file of manifest.files.filter(f=>f!==name)) {
        const packaged = name.startsWith('mobile/') ? file.replace('mobile/www/','mobile/android/app/src/main/assets/public/') : 'dist/win-unpacked/resources/app/'+file;
        assert.equal(sha(file),sha(packaged),'Packaged file: '+file);
    }
}
assert(fs.readFileSync('mobile/android/app/build.gradle','utf8').includes('versionCode 9'));
assert.equal(JSON.parse(fs.readFileSync('package.json')).version,'1.0.5');
console.log('Release hashes, artifact sizes, canonical GitHub bytes, packaged desktop/Android assets and version metadata passed.');
