// Embedded into the existing PC main process and Android bridge by sync-ui.cjs.
// No new runtime file is required by older hot updaters.
function createPluginCatalog({ getJSON, getContext, curated = [], getInstalled = async () => [] }) {
    const loaders = ['paper', 'spigot', 'bukkit'];
    const cache = new Map();
    const normalize = value => {
        const match = String(value || '').match(/(?:^|[^\d])(\d+(?:\.\d+){0,2}(?:-(?:pre|rc)\d+)?)(?=$|[^\d.])/);
        if (!match) throw new Error('Cannot read the Minecraft server version. Open or create a server first.');
        return match[1];
    };
    async function context() {
        const value = await getContext();
        return { ...value, version: normalize(value.version) };
    }
    function choose(versions, serverVersion) {
        if (!Array.isArray(versions)) throw new Error('Invalid plugin version response.');
        const eligible = versions.filter(version => Array.isArray(version.game_versions) && version.game_versions.includes(serverVersion)
            && Array.isArray(version.loaders) && version.loaders.some(loader => loaders.includes(loader)));
        eligible.sort((a, b) => (a.version_type === 'release' ? 0 : 1) - (b.version_type === 'release' ? 0 : 1)
            || Date.parse(b.date_published || 0) - Date.parse(a.date_published || 0));
        for (const version of eligible) {
            const files = (version.files || []).filter(file => /^[^/\\]+\.jar$/i.test(file.filename || '')
                && !/(?:[-_.](?:sources|dev|javadoc|fabric|forge|neoforge|quilt)(?:[-_.]|$))/i.test(file.filename)
                && /^https:\/\//i.test(file.url || '') && /^[a-f0-9]{128}$/i.test(file.hashes?.sha512 || ''));
            const file = files.find(file => /(?:paper|spigot|bukkit)/i.test(file.filename)) || files.find(file => file.primary) || files[0];
            if (file) return { downloadUrl: file.url, fileName: file.filename, versionNumber: version.version_number,
                versionId: version.id, size: file.size, sha512: file.hashes.sha512, serverVersion, compatible: true };
        }
        return null;
    }
    async function resolve(project, options = {}) {
        if (!/^[a-zA-Z0-9_-]+$/.test(project || '')) throw new Error('Choose a plugin from the catalog.');
        const server = options.context || await context();
        const key = server.version + ':' + project;
        const previous = cache.get(key);
        if (!options.fresh && previous && Date.now() - previous.time < 60000) return previous.value;
        const params = new URLSearchParams({ loaders: JSON.stringify(loaders), game_versions: JSON.stringify([server.version]) });
        const versions = await getJSON(`https://api.modrinth.com/v2/project/${encodeURIComponent(project)}/version?${params}`);
        const value = choose(versions, server.version);
        if (cache.size > 300) cache.clear();
        cache.set(key, { time: Date.now(), value });
        return value;
    }
    async function getVersion(project, options = {}) {
        const server = await context();
        const value = await resolve(project, { ...options, context: server });
        if (!value) throw new Error(`No Paper/Spigot/Bukkit JAR is listed for Minecraft ${server.version}.`);
        return { ...value, serverKey: server.key };
    }
    async function assertContext(expected) {
        const actual = await context();
        if (actual.version !== expected.serverVersion || actual.key !== expected.serverKey) throw new Error('The selected server or Minecraft version changed. Search again before installing.');
    }
    async function search(query = '', category = 'all') {
        const server = await context();
        const text = String(query || '').trim();
        const categoryFilter = category && category !== 'all' ? category : null;
        const facets = [['project_type:plugin'], loaders.map(loader => 'categories:' + loader)];
        if (categoryFilter) facets.push(['categories:' + categoryFilter]);
        const searchURL = compatible => {
            const params = new URLSearchParams({ facets: JSON.stringify(compatible ? [...facets, ['versions:' + server.version]] : facets), limit: compatible ? '40' : '12' });
            if (text) params.set('query', text); else params.set('index', 'downloads');
            return 'https://api.modrinth.com/v2/search?' + params;
        };
        const responses = await Promise.allSettled([getJSON(searchURL(true)), ...(text ? [getJSON(searchURL(false))] : [])]);
        if (responses.every(response => response.status === 'rejected')) throw new Error('Cannot verify plugins right now. Check your connection and try again.');
        let candidates = curated.filter(plugin => (!categoryFilter || plugin.categories?.includes(categoryFilter))
            && (!text || [plugin.title, plugin.slug, plugin.description].some(value => String(value || '').toLowerCase().includes(text.toLowerCase()))))
            .map(plugin => ({ ...plugin, isCurated: true }));
        for (const response of responses) {
            if (response.status !== 'fulfilled') continue;
            if (!Array.isArray(response.value?.hits)) throw new Error('Invalid plugin search response.');
            for (const hit of response.value.hits) {
                if (!candidates.some(item => item.slug === hit.slug || item.id === hit.project_id)) candidates.push({ ...hit, id: hit.project_id, isCurated: false });
            }
        }
        if (!candidates.length && responses.every(response => response.status === 'rejected')) throw new Error('Cannot verify plugins right now. Check your connection and try again.');
        const installed = await getInstalled();
        const norm = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const hits = [], unavailable = [];
        let cursor = 0, verificationFailures = 0;
        await Promise.all(Array.from({ length: Math.min(6, candidates.length) }, async () => {
            while (cursor < candidates.length) {
                const position = cursor++, item = candidates[position];
                try {
                    const build = await resolve(item.slug || item.id, { context: server });
                    if (build) hits.push({ ...item, ...build, position, isInstalled: installed.some(file => {
                        const name = norm(String(file).replace(/\.jar(?:\.disabled)?$/i, ''));
                        return name && [item.slug, item.title].some(value => norm(value) && (name.includes(norm(value)) || norm(value).includes(name)));
                    }) });
                    else if (text) unavailable.push({ ...item, position, reason: `No Paper/Spigot/Bukkit JAR is listed for Minecraft ${server.version}.`, status: 'unavailable' });
                } catch (error) {
                    verificationFailures++;
                    if (text) unavailable.push({ ...item, position, status: 'unverified', reason: 'Compatibility could not be verified. Try again later.' });
                }
            }
        }));
        hits.sort((a, b) => a.position - b.position); unavailable.sort((a, b) => a.position - b.position);
        return { hits, unavailable, serverVersion: server.version, platform: 'Paper', verificationFailures,
            warning: verificationFailures || responses.some(response => response.status === 'rejected') ? 'Some plugins could not be verified. Refresh to retry.' : '' };
    }
    return { search, getVersion, assertContext, choose, normalize };
}
module.exports = { createPluginCatalog };
