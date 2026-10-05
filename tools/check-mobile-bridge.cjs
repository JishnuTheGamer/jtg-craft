const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const calls = [];
let remote = {version:'1.0.9',versionCode:1009,nativeUpdate:{versionCode:8}};
let installed = {version:'1.0.8',versionCode:1008,nativeCode:8};
let fetchOk = true;
const plugins = {
    AppUpdater: {
        addListener: () => {}, getInstalledVersions: async () => installed,
        prepareWebUpdate: async () => { calls.push('web'); return {success:true}; },
        prepareNativeUpdate: async () => { calls.push('native'); return {success:true,nativeUpdate:true}; },
        activateWebUpdate: async () => calls.push('activate'), installNativeUpdate: async () => calls.push('installer')
    },
    ServerProcess:{prepareForUpdate:async()=>calls.push('stop'),getServerConfig:async()=>({version:'26.1'})},
    JavaManager:{setJavaVersion:async()=>calls.push('java-setting'),checkJava25:async()=>({installed:false}),installJava:async options=>{calls.push('java-'+options.version);return {success:true};}}
};
const window = {Capacitor:{registerPlugin:name=>plugins[name] || {}}};
vm.runInNewContext(fs.readFileSync('mobile/src/mobile-bridge.js','utf8'),{window,console:{log:()=>{},warn:()=>{}},setTimeout:()=>{},setInterval:()=>{},AbortSignal,fetch:async()=>({ok:fetchOk,status:503,json:async()=>remote})});
(async()=>{
    const api=window.api;
    assert((await api.fetchPaperVersions()).includes('26.2'));
    assert((await api.fetchPaperVersions()).includes('26.1.2'));
    assert.equal((await api.checkForUpdatesManual()).nativeUpdate,false);
    await api.applyGithubHotUpdate();assert.equal(calls.pop(),'web');
    remote.nativeUpdate.versionCode=9;
    assert.equal((await api.checkForUpdatesManual()).nativeUpdate,true);
    await api.applyGithubHotUpdate();assert.equal(calls.pop(),'native');
    await api.installNativeUpdate();assert.deepEqual(calls.splice(0),['stop','installer']);
    await api.relaunchApp();assert.deepEqual(calls.splice(0),['stop','activate']);
    fetchOk=false;await assert.rejects(api.applyGithubHotUpdate(),/503/);assert.equal(calls.length,0);
    fetchOk=true;remote.versionCode=1008;remote.nativeUpdate.versionCode=8;
    assert.equal((await api.checkForUpdatesManual()).updateAvailable,false);
    const invalid=await api.setJavaVersion('21');assert.equal(invalid.success,false);assert.equal(calls.length,0);
    await api.setJavaVersion('25');assert(calls.includes('java-25'));assert(!calls.includes('java-21'));
    console.log('Mobile bridge: native vs web upgrades, safe activation/install ordering, failed fetch, current-version detection and Java 25 routing passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
