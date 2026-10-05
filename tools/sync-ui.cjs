// Keep one visual system in both editions without changing their backend adapters.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
for (const [source, targets] of [
    ['ui/design.js', ['src/renderer.js', 'mobile/www/renderer.js']],
    ['ui/design.css', ['src/style.css', 'mobile/src/mobile-patches.css']],
]) {
    const code = fs.readFileSync(path.join(root, source), 'utf8').trim();
    const start = '/* JTG_SHARED_UI_START */';
    const end = '/* JTG_SHARED_UI_END */';
    const region = new RegExp('/\\* JTG_SHARED_UI_START \\*/[\\s\\S]*?/\\* JTG_SHARED_UI_END \\*/\\s*', 'g');
    for (const target of targets) {
        const file = path.join(root, target);
        const original = fs.readFileSync(file, 'utf8').replace(region, '').trimEnd();
        const shared = `${start}\n${code}\n${end}\n`;
        const updated = source.endsWith('.js') ? shared + original + '\n' : original + '\n\n' + shared;
        if (fs.readFileSync(file, 'utf8') !== updated) fs.writeFileSync(file, updated);
    }
}
fs.copyFileSync(path.join(root, 'mobile/src/mobile-patches.css'), path.join(root, 'mobile/www/mobile-patches.css'));
console.log('Shared interface synced to desktop and mobile.');
