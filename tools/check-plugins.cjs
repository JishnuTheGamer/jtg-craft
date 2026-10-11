const assert = require('node:assert/strict');
const {createPluginCatalog} = require('../lib/plugin-catalog.cjs');
let server = {version:'1.20.4',key:'server-a'}, offline = false;
const requests = [];
const build = (id, game, loader, filename, date = '2026-10-01') => ({id,game_versions:[game],loaders:[loader],date_published:date,version_type:'release',version_number:id,files:[{filename,url:'https://cdn.modrinth.com/'+filename,primary:true,size:100,hashes:{sha512:'a'.repeat(128)}}]});
const catalog = createPluginCatalog({
    getContext:async()=>({...server}), curated:[{id:'via',slug:'via',title:'ViaVersion',categories:['utility'],directDownload:'https://unverified/latest.jar'}],
    getJSON:async url=>{
        requests.push(url); if(offline)throw new Error('offline');
        if(url.includes('/search?'))return {hits:[{project_id:'via',slug:'via',title:'ViaVersion'},{project_id:'wrong',slug:'wrong',title:'Unsupported'}]};
        if(url.includes('/wrong/'))return [build('wrong','1.21.1','paper','wrong.jar')];
        return [build('newest','1.21.1','paper','newest.jar'),build('fabric','1.20.4','fabric','fabric.jar'),build('folia','1.20.4','folia','folia.jar'),build('matching','1.20.4','spigot','ViaVersion.jar')];
    }
});
(async()=>{
    assert.equal(catalog.normalize('26.1.2 (Tiny Takeover Update)'),'26.1.2');
    assert.equal(catalog.normalize('1.21.11-pre5'),'1.21.11-pre5');
    await assert.rejects(catalog.getVersion('bad/url'));
    const browse=await catalog.search('','all'); assert.equal(browse.hits.length,1);assert.equal(browse.unavailable.length,0);
    const result=await catalog.search('via','utility');assert.equal(result.hits[0].versionId,'matching');assert.equal(result.unavailable[0].status,'unavailable');
    assert(requests.some(url=>url.includes('game_versions=')&&decodeURIComponent(url).includes('1.20.4')));
    assert(requests.filter(url=>url.includes('/version')).every(url=>url.includes('game_versions=')),'No unfiltered fallback');
    assert(!requests.some(url=>url.includes('unverified')),'No direct latest fallback');
    const selected=await catalog.getVersion('via');server.version='1.21.1';await assert.rejects(catalog.assertContext(selected),/changed/);
    assert.equal((await catalog.getVersion('via',{fresh:true})).versionId,'newest');server.key='server-b';await assert.rejects(catalog.assertContext({...selected,serverVersion:'1.21.1'}),/changed/);
    server.version='26.2';await assert.rejects(catalog.getVersion('via',{fresh:true}),/No Paper/);
    offline=true;await assert.rejects(catalog.search('via'),/Cannot verify/);await assert.rejects(catalog.getVersion('via',{fresh:true}),/offline/);
    assert.equal(catalog.choose([build('source','1.20.4','paper','thing-sources.jar')],'1.20.4'),null);
    console.log('Plugin policy: exact MC version, Paper-compatible platform, correct older JAR, unavailable search, categories, no latest/client fallback, server changes and offline refusal passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
