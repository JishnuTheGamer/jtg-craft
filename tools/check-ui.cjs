// UI integration checks with an isolated mock backend; never starts a real server.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'ui-preview');
fs.mkdirSync(output, { recursive: true });
const props = { motd: 'A JTG Craft server', 'server-port': '25565', 'max-players': '20', gamemode: 'survival', difficulty: 'normal', pvp: 'true', 'online-mode': 'true', 'white-list': 'false', 'level-name': 'world', 'level-seed': '', 'level-type': 'minecraft:custom', 'view-distance': '8', 'simulation-distance': '6', 'rcon.password': 'test-secret', 'custom-plugin-setting': 'keep-this-value' };
const mock = `
window.__calls = []; window.__listeners = {};
const fixtureProps = ${JSON.stringify(props)};
const values = {
getSystemInfo: { totalRamMB: 8192, cores: 8 }, pickDirectory: 'preview-server',
checkDiskSpace: {ok: true, freeGB: 20}, checkExistingServer: {exists: true, name:'Craft Survival'},
getDefaultStoragePaths: {phoneStorage: 'preview-server'}, getLiveStats: {cpuPercent: 4.2, ramUsedMB: 720, ramTotalMB: 2048},
propsGet: fixtureProps, fetchPaperVersions: ['1.21.1','1.20.4'], getJavaSettings: {setting:'auto', configuredSetting:'auto', installedPath:'java/bin/java'},
getAppVersion: '1.0.3', getServerVersion: '1.20.4', getServerConfig: {version:'1.20.4', ram:2048, cpu:2}, getHotUpdateChangelog: [],
getInstalledPlugins: [], pluginsInstalled: [], pluginList: [], getServerMetadata: {name:'Craft Survival',version:'1.20.4'},
getNetworkInfo: {sameDeviceJoin:'127.0.0.1:25565',lanJoin:'192.168.1.3:25565'}, checkForUpdatesManual: {updateAvailable:false},
checkJava: {found:true,version:17}, fmList: [], playersGetCache: [], worldList: []
};
window.api = new Proxy({}, {get(_, key) {
if (key === 'then') return undefined;
if (String(key).startsWith('on')) return cb => { window.__listeners[key] = cb; };
return async (...args) => {
window.__calls.push({key,args});
if (key === 'checkForUpdatesManual') return window.__update || values.checkForUpdatesManual;
if (key === 'applyGithubHotUpdate') return {success:true, version:'1.0.9', versionCode:1009, nativeUpdate:true};
if (key === 'installNativeUpdate') return {permissionRequired:true};
if (key === 'serverStart' || key === 'serverStop') {
const running = key === 'serverStart';
window.__listeners.onServerState?.(location.pathname.includes('/mobile/') ? {running} : running ? 'running' : 'stopped');
return {success:true};
}
if (key === 'serverRestart') { window.__listeners.onServerState?.(location.pathname.includes('/mobile/') ? {running:true} : 'running'); return {success:true}; }
return key in values ? values[key] : {success:true,version:'1.0.3', versionCode:103};
};
}});
`;
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    const file = path.resolve(root, rel);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
    if (rel.endsWith('mobile-bridge.js')) { res.setHeader('Content-Type', mime['.js']); return res.end(mock); }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
    let content = fs.readFileSync(file);
    if (rel === 'src/index.html') content = content.toString().replace('<script src="renderer.js">', `<script>${mock}</script><script src="renderer.js">`);
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.end(content);
});
async function clickPanel(page, name, mobile) {
    if (mobile) await page.locator('#btn-sidebar-toggle').click();
    const selector = mobile ? '.drawer-nav' : '.sidebar-nav';
    await page.locator(`${selector} [data-panel="panel-${name}"]`).first().click();
    await page.locator(`#panel-${name}`).waitFor({state:'visible'});
    await page.waitForTimeout(260);
}
async function geometry(page) {
    return page.evaluate(() => {
        const panel = document.querySelector('.panel.active');
        const rect = panel.getBoundingClientRect();
        const cmd = document.querySelector('#inp-cmd').getBoundingClientRect();
        return {viewport:innerWidth, panelLeft:rect.left, panelRight:rect.right, overflow:panel.scrollWidth-panel.clientWidth, cmdBottom:cmd.bottom, height:innerHeight};
    });
}
(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const browser = await chromium.launch({executablePath:process.env.JTG_TEST_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless:true});
    try {
        for (const mobile of [false,true]) {
            const name = mobile ? 'mobile' : 'desktop';
            const context = await browser.newContext({viewport:mobile ? {width:390,height:844} : {width:1280,height:850}, permissions:['clipboard-read','clipboard-write']});
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.route('https://**/*', route => route.abort());
            await page.goto(`http://127.0.0.1:${port}/${mobile ? 'mobile/www' : 'src'}/index.html`);
            if (!mobile) await page.locator('#btn-get-started').click();
            await page.locator('#screen-dashboard.active').waitFor();
            if (mobile) await page.waitForTimeout(2200);
            if (mobile) assert.equal(await page.locator('.mobile-bottombar').count(), 0);
            await page.locator('#btn-start').click();
            assert.equal(await page.locator('#btn-stop').isEnabled(), true);
            await page.locator('#inp-cmd').fill('list'); await page.locator('#btn-cmd').click();
            assert(await page.evaluate(() => window.__calls.some(call=>call.key==='serverCommand' && call.args[0]==='list')));
            await page.evaluate(() => window.__listeners.onConsoleData('[12:04:17 INFO]: Starting Paper 1.20.4\n[12:04:18 INFO]: Loading world "world"\n[12:04:20 WARN]: Server is running in offline mode\n[12:04:21 INFO]: Done (4.102s)! For help, type "help"\n[12:04:22 INFO]: Alex joined the game\n\u001b[31m[12:04:23 ERROR]: Example plugin failed to load\u001b[0m\n'));
            await page.waitForTimeout(200);
            await page.screenshot({path:path.join(output,`${name}-console.png`)});
            const bounds = await geometry(page);
            assert(bounds.overflow<=1 && bounds.panelRight<=bounds.viewport+1 && bounds.cmdBottom<bounds.height, JSON.stringify(bounds));
            await page.locator('#log-level').selectOption('error');
            assert.equal(await page.locator('.log-line:visible').count(), 1);
            await page.locator('#log-level').selectOption('all');
            await page.locator('#log-search').fill('Alex'); await page.waitForTimeout(180);
            assert.equal(await page.locator('.log-line:visible').count(), 1);
            await page.locator('#log-search').fill(''); await page.waitForTimeout(180);
            await page.locator('#log-copy').click();
            assert((await page.evaluate(()=>navigator.clipboard.readText())).includes('Alex joined'));
            await page.locator('#log-follow').uncheck();
            await page.evaluate(() => window.__listeners.onConsoleData(Array.from({length:2500},(_,i)=>'line '+i+'\n').join('')));
            await page.waitForTimeout(250);
            assert.equal(await page.locator('.log-line').count(), 2000);
            await page.locator('#log-clear').click(); assert.equal(await page.locator('.log-line').count(), 0);
            await page.locator('#btn-stop').click(); assert.equal(await page.locator('#btn-start').isEnabled(), true);

            await clickPanel(page,'props',mobile);
            await page.locator('#property-server-port').waitFor();
            assert.equal(await page.locator('#property-level-type').inputValue(),'minecraft:custom');
            await page.locator('#property-server-port').fill('0');
            await page.locator('#btn-save-props').click();
            assert.equal(await page.evaluate(()=>window.__calls.filter(call=>call.key==='propsSave').length),0);
            await page.locator('#property-server-port').fill('25565');
            await page.locator('#property-motd').fill('My updated server');
            await page.locator('#btn-save-props').click();
            const saved = await page.evaluate(()=>window.__calls.find(call=>call.key==='propsSave').args[0]);
            assert.equal(saved.motd,'My updated server'); assert.equal(saved['custom-plugin-setting'],'keep-this-value');
            assert.equal(saved['level-type'],'minecraft:custom'); assert(!('undefined' in saved));
            assert.deepEqual(Object.keys(saved).sort(), Object.keys(props).sort());
            await page.evaluate(() => { document.querySelector('#props-form').scrollTop=0; document.querySelectorAll('.toast').forEach(toast=>toast.remove()); });
            await page.screenshot({path:path.join(output,`${name}-properties.png`)});
            assert((await geometry(page)).overflow<=1);
            await page.locator('.property-filter[data-category="performance"]').click();
            assert.equal(await page.locator('.prop-field:visible').count(),2);
            await page.locator('#props-search-inp').fill('nothing-matches');
            assert(await page.locator('#properties-empty').isVisible());

            await clickPanel(page,'settings',mobile);
            if (mobile) {
                await page.evaluate(() => window.__update = {updateAvailable:true, version:'1.0.9', versionCode:1009, nativeUpdate:true});
                await page.locator('#btn-check-updates').click();
                await page.locator('#btn-download-update').click();
                assert.equal(await page.locator('#btn-relaunch-update').innerText(),'Install App Update');
                await page.locator('#btn-relaunch-update').click();
                assert((await page.locator('#update-check-status').innerText()).includes('Allow app installs'));
                assert(await page.locator('#btn-relaunch-update').isEnabled());
                await page.evaluate(() => window.__listeners.onHotUpdateAvailable({prepared:true,nativeUpdate:false,version:'1.0.9',versionCode:1009}));
                assert((await page.locator('#btn-relaunch-update').innerText()).includes('Relaunch'));
                assert(await page.locator('#btn-download-update').isHidden());
                await page.evaluate(() => window.__update = {updateAvailable:false,version:'1.0.8'});
            }
            assert.equal(await page.locator('[data-theme-choice]').count(),8);
            for (const theme of ['ember','ocean','amber','forest','violet','paper','sky','rose']) {
                await page.locator(`[data-theme-choice="${theme}"]`).click();
                assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),theme);
                assert((await geometry(page)).overflow<=1);
            }
            await page.locator('[data-theme-choice="paper"]').click();
            await page.evaluate(() => document.querySelector('#panel-settings').scrollTop=0);
            await page.waitForTimeout(250);
            await page.screenshot({path:path.join(output,`${name}-light-settings.png`)});
            await page.reload();
            if (!mobile) await page.locator('#btn-get-started').click();
            if (mobile) await page.waitForTimeout(2200);
            assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'paper');
            await clickPanel(page,'settings',mobile);
            await page.locator('[data-theme-choice="ember"]').click();
            await page.evaluate(() => document.querySelector('#panel-settings').scrollTop=0);
            await page.waitForTimeout(250);
            await page.screenshot({path:path.join(output,`${name}-settings.png`)});
            if (mobile) {
                await page.setViewportSize({width:320,height:700});
                await clickPanel(page,'console',true);
                assert((await geometry(page)).overflow<=1);
                await page.screenshot({path:path.join(output,'mobile-narrow.png')});
                await page.setViewportSize({width:390,height:480});
                const keyboardBounds = await geometry(page);
                assert(keyboardBounds.cmdBottom < keyboardBounds.height, JSON.stringify(keyboardBounds));
                await page.setViewportSize({width:390,height:844});
                await page.locator('#btn-sidebar-toggle').click();
                await page.waitForTimeout(260);
                await page.screenshot({path:path.join(output,'mobile-sidebar.png')});
                await page.locator('#btn-drawer-close').click();
            }
            assert.deepEqual(errors,[], `${name} JavaScript errors`);
            console.log(`${name}: themes, persistence, logs, controls, property save/validation and layout checks passed`);
            await context.close();
        }
    } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode=1; });
