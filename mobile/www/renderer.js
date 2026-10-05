/* JTG_SHARED_UI_START */
(() => {
function requiredJava(version) {
    const match = String(version || '').match(/(?:^|[^\d])(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
    if (!match) return 21;
    const [, major, minor, patch = '0'] = match.map(String);
    if (+major >= 26) return 25;
    if (+major === 1 && (+minor >= 21 || (+minor === 20 && +patch >= 5))) return 21;
    return 17;
}
function targetJava(setting, version) {
    const minimum = requiredJava(version);
    const target = !setting || setting === 'auto' ? minimum : Number(setting);
    if (![17, 21, 25].includes(target)) throw new Error('Choose Auto, Java 17, 21 or 25.');
    // Manual runtimes are explicit overrides; Minecraft/plugins decide compatibility.
    return target;
}
function resourceLimits(totalRamMB, cores) {
    const total = Math.max(512, Math.floor(Number(totalRamMB) || 2048));
    const reserve = Math.min(2048, Math.max(512, Math.floor(total / 4)));
    const maxRamMB = Math.max(512, Math.floor((total - reserve) / 256) * 256);
    const maxCpuCores = Math.max(1, Math.floor(Number(cores) || 1));
    return { totalRamMB: total, reservedRamMB: reserve, maxRamMB, maxCpuCores, recommendedRamMB: Math.min(2048, maxRamMB), recommendedCpuCores: Math.max(1, Math.floor(maxCpuCores / 2)) };
}
window.JtgJavaPolicy = { requiredJava, targetJava }; window.JtgResourcePolicy = { resourceLimits };

})();
/* Shared JTG Craft interface. Synced into both renderers by tools/sync-ui.cjs. */
(() => {
    'use strict';
    const themes = [
        ['ember', 'Ember', 'Black / Crimson', '#d73c47', false],
        ['ocean', 'Ocean', 'Charcoal / Blue', '#639cf4', false],
        ['amber', 'Amber', 'Charcoal / Gold', '#e5b65d', false],
        ['forest', 'Forest', 'Charcoal / Green', '#61bc93', false],
        ['violet', 'Violet', 'Charcoal / Purple', '#ae8ce8', false],
        ['paper', 'Paper', 'White / Graphite', '#40434b', true],
        ['sky', 'Sky', 'White / Blue', '#285fc4', true],
        ['rose', 'Rose', 'White / Red', '#b43d39', true],
    ];
    let logState;
    let propertyFilter = 'all';
    let propertyBaseline = {};
    let activeOperation = false;
    function operationProgress(percent, status) {
        if (!activeOperation) return;
        const known = percent != null && Number.isFinite(Number(percent));
        const pct = known ? Math.max(0, Math.min(100, Math.round(Number(percent)))) : 0;
        const bar = document.querySelector('#operation-bar');
        bar.style.width = known ? pct + '%' : '35%'; bar.classList.toggle('indeterminate', !known);
        document.querySelector('#operation-percent').textContent = known ? `${pct}% complete · ${100-pct}% remaining` : 'Working…';
        if (status) document.querySelector('#operation-status').textContent = status;
    }
    async function runOperation(title, task) {
        if (activeOperation) throw new Error('Wait for the current operation to finish.');
        let dialog = document.querySelector('#operation-dialog');
        if (!dialog) {
            dialog = document.createElement('div'); dialog.id = 'operation-dialog'; dialog.className = 'operation-overlay hidden';
            dialog.innerHTML = '<section class="operation-card" role="dialog" aria-modal="true" aria-labelledby="operation-title" tabindex="-1"><span class="ui-eyebrow">JTG CRAFT</span><h2 id="operation-title"></h2><p id="operation-status" role="status"></p><div class="progress-track"><div id="operation-bar" class="progress-fill"></div></div><p id="operation-percent"></p><button id="operation-close" class="btn secondary">Close</button></section>';
            document.body.appendChild(dialog);
            dialog.querySelector('#operation-close').onclick = () => { if (!activeOperation) dialog.classList.add('hidden'); };
            dialog.onkeydown = event => { if (event.key === 'Escape' && !activeOperation) dialog.classList.add('hidden'); if (event.key === 'Tab') { event.preventDefault(); (activeOperation ? dialog.querySelector('.operation-card') : dialog.querySelector('#operation-close')).focus(); } };
        }
        dialog.classList.remove('hidden','failed'); activeOperation = true;
        dialog.querySelector('#operation-title').textContent = title; dialog.querySelector('#operation-close').disabled = true;
        dialog.querySelector('.operation-card').focus(); operationProgress(null,'Preparing…');
        const buttons = [...document.querySelectorAll('#panel-settings button')].filter(button => !button.disabled);
        buttons.forEach(button => button.disabled = true);
        try { const result = await task(); if (result && result.success === false) throw new Error(result.error || 'Operation failed.'); operationProgress(100,'Completed successfully.'); return result; }
        catch (error) { dialog.classList.add('failed'); dialog.querySelector('#operation-status').textContent = error.message || String(error); dialog.querySelector('#operation-percent').textContent = 'Operation failed'; dialog.querySelector('#operation-bar').classList.remove('indeterminate'); throw error; }
        finally { activeOperation = false; buttons.forEach(button => button.disabled = false); dialog.querySelector('#operation-close').disabled = false; dialog.querySelector('#operation-close').focus(); }
    }
    async function loadResources() {
        if (!window.api.getServerConfig) return;
        const [info,cfg] = await Promise.all([window.api.getSystemInfo(),window.api.getServerConfig()]);
        const limits = window.JtgResourcePolicy.resourceLimits(info.totalRamMB,info.cores);
        const ram = document.querySelector('#settings-sld-ram'), cpu = document.querySelector('#settings-sld-cpu');
        if (!ram || !cpu) return;
        ram.min = 512; ram.max = info.maxRamMB || limits.maxRamMB; ram.value = Math.min(+ram.max,Math.max(512,cfg.ramMB || cfg.ram || limits.recommendedRamMB));
        cpu.max = info.maxCpuCores || limits.maxCpuCores; cpu.value = Math.min(+cpu.max,Math.max(1,cfg.cpuCores || cfg.cpu || limits.recommendedCpuCores));
        document.querySelector('#settings-inp-name').value = cfg.name || '';
        document.querySelector('#settings-inp-path').value = cfg.path || '';
        const versionSelect = document.querySelector('#settings-version-select');
        if (versionSelect && [...versionSelect.options].some(option => option.value === cfg.version)) versionSelect.value = cfg.version;
        document.querySelector('#settings-lbl-ram-max').textContent = (+ram.max / 1024).toFixed(2) + ' GB';
        document.querySelector('#settings-lbl-cpu-max').textContent = cpu.max;
        const refresh = () => { document.querySelector('#settings-lbl-ram').textContent = ram.value; document.querySelector('#settings-lbl-cpu').textContent = cpu.value; };
        ram.oninput = cpu.oninput = refresh; refresh();
        document.querySelector('#btn-settings-save-config').onclick = async () => {
            try { const name = document.querySelector('#settings-inp-name').value.trim(); if (!name) throw new Error('Enter a server name.');
                await runOperation('Saving server configuration',()=>window.api.saveServerConfig({name,ram:+ram.value,cpu:+cpu.value}));
                document.querySelectorAll('#sidebar-server-name,#drawer-server-name').forEach(el=>el.textContent=name);
                notify('Saved. Restart your server to apply resource changes.');
            } catch (error) { notify(error.message); }
        };
    }
    function applyTheme(id) {
        const theme = themes.find(t => t[0] === id) || themes[0];
        document.documentElement.dataset.theme = theme[0];
        document.documentElement.dataset.appearance = theme[4] ? 'light' : 'dark';
        try { localStorage.setItem('jtg-theme', theme[0]); } catch (_) {}
        document.querySelectorAll('[data-theme-choice]').forEach(button => {
            const selected = button.dataset.themeChoice === theme[0];
            button.setAttribute('aria-pressed', String(selected));
            button.classList.toggle('selected', selected);
        });
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.content = theme[4] ? '#f5f5f3' : '#09090b';
        if (window.api && window.api.setInterfaceTheme) {
            Promise.resolve(window.api.setInterfaceTheme(theme[4])).catch(() => {});
        }
    }
    let savedTheme;
    try { savedTheme = localStorage.getItem('jtg-theme'); } catch (_) {}
    applyTheme(savedTheme);

    function notify(text) {
        const container = document.querySelector('#toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = text;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3500);
    }
    function init() {
        const settings = document.querySelector('#panel-settings .settings-grid');
        if (settings && !document.querySelector('#settings-sld-ram')) {
            const card = document.createElement('section'); card.className = 'settings-card server-config-card';
            card.innerHTML = '<div class="sc-content"><h3>Server configuration</h3><label>Server name<input id="settings-inp-name" class="prop-input" maxlength="32"></label><label>RAM: <strong id="settings-lbl-ram"></strong> MB<input id="settings-sld-ram" type="range" min="512" step="256"></label><div class="range-labels"><span>512 MB</span><span id="settings-lbl-ram-max"></span></div><label>CPU cores: <strong id="settings-lbl-cpu"></strong><input id="settings-sld-cpu" type="range" min="1" step="1"></label><div class="range-labels"><span>1</span><span id="settings-lbl-cpu-max"></span></div><label>Server folder<input id="settings-inp-path" class="prop-input" readonly></label><button id="btn-settings-save-config" class="btn primary">Save Configuration</button></div>';
            settings.prepend(card);
        }
        if (settings) {
            const card = document.createElement('section');
            card.className = 'settings-card appearance-card';
            card.innerHTML = '<div class="sc-content"><span class="ui-eyebrow">MAKE IT YOURS</span><h3>Appearance</h3><p>One familiar workspace. Choose your colour palette.<br>Your choice is saved on this device.</p><div class="theme-grid" role="group" aria-label="Colour theme"></div></div>';
            themes.forEach(([id, name, desc, colour, light]) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'theme-choice';
                button.dataset.themeChoice = id;
                button.setAttribute('aria-label', name + ': ' + desc);
                button.innerHTML = '<span class="theme-sample"><i></i><i></i><i></i></span><strong></strong><small></small>';
                button.style.setProperty('--sample-bg', light ? '#f5f5f3' : '#18191b');
                button.style.setProperty('--sample-accent', colour);
                button.querySelector('strong').textContent = name;
                button.querySelector('small').textContent = desc;
                button.onclick = () => applyTheme(id);
                card.querySelector('.theme-grid').appendChild(button);
            });
            settings.prepend(card);
            applyTheme(document.documentElement.dataset.theme);
        }

        const panel = document.querySelector('#panel-console');
        const log = document.querySelector('#console-log');
        if (panel && log) {
            const heading = panel.querySelector('h3');
            if (heading) {
                const title = document.createElement('div');
                title.className = 'ui-heading';
                heading.before(title);
                title.innerHTML = '<span class="ui-eyebrow">SERVER WORKSPACE</span>';
                const line = document.createElement('div'); line.className = 'ui-heading-line';
                line.appendChild(heading);
                const status = document.createElement('span'); status.id = 'ui-process-state'; status.className = 'process-badge'; status.textContent = 'Server stopped';
                line.appendChild(status); title.appendChild(line);
                const subtitle = document.createElement('p'); subtitle.className = 'ui-heading-subtitle'; subtitle.textContent = 'Live server activity & commands'; title.appendChild(subtitle);
                heading.textContent = 'Console';
            }
            const toolbar = document.createElement('div');
            toolbar.className = 'log-toolbar';
            toolbar.innerHTML = '<input id="log-search" type="search" placeholder="Search logs…" aria-label="Search server logs"><select id="log-level" aria-label="Log level"><option value="all">All messages</option><option value="warning">Warnings</option><option value="error">Errors</option></select><label class="log-follow"><input id="log-follow" type="checkbox" checked> Follow live</label><button id="log-copy" class="btn secondary sm" type="button">Copy logs</button><button id="log-clear" class="btn secondary sm" type="button">Clear</button>';
            log.before(toolbar);
            const footer = document.createElement('div');
            footer.className = 'log-footer';
            footer.innerHTML = '<span id="log-count">Waiting for server output</span><span>Last 2,000 lines · local session</span>';
            log.after(footer);
            log.setAttribute('role', 'region');
            log.setAttribute('aria-label', 'Server output');
            log.tabIndex = 0;
            logState = { log, rows: [], pending: '', tail: null, frame: 0 };
            document.querySelector('#log-level').onchange = filterLogs;
            let searchTimer;
            document.querySelector('#log-search').oninput = () => {
                clearTimeout(searchTimer);
                searchTimer = setTimeout(filterLogs, 100);
            };
            document.querySelector('#log-follow').onchange = event => {
                if (event.target.checked) log.scrollTop = log.scrollHeight;
            };
            document.querySelector('#log-clear').onclick = clearConsole;
            document.querySelector('#log-copy').onclick = async () => {
                flushLogs();
                try {
                    await navigator.clipboard.writeText(logState.rows.map(row => row.textContent).join('\n'));
                    notify('Logs copied');
                } catch (_) { notify('Could not copy logs. Select the log text to copy it.'); }
            };
            const command = document.querySelector('#inp-cmd');
            if (command) {
                command.placeholder = 'Type a server command, e.g. help';
                command.setAttribute('aria-label', 'Server command');
                command.autocomplete = 'off';
                command.spellcheck = false;
            }
        }

        const props = document.querySelector('#panel-props');
        if (props) {
            props.querySelector('h3').textContent = 'Server properties';
            const toolbar = props.querySelector('.props-toolbar');
            const search = document.querySelector('#props-search-inp');
            if (search) { search.placeholder = 'Search settings by name or key…'; search.setAttribute('aria-label', 'Search server properties'); }
            const note = document.createElement('p');
            note.className = 'properties-note';
            note.innerHTML = '<span id="properties-save-state">Changes apply after restarting your server.</span>';
            toolbar.before(note);
            const filters = document.createElement('div');
            filters.className = 'property-filters';
            filters.setAttribute('role', 'group');
            filters.setAttribute('aria-label', 'Property categories');
            [['all', 'All settings'], ['game', 'Gameplay'], ['world', 'World'], ['connection', 'Connection'], ['performance', 'Performance'], ['advanced', 'Advanced']].forEach(([id, text]) => {
                const button = document.createElement('button');
                button.type = 'button'; button.className = 'property-filter'; button.dataset.category = id;
                button.textContent = text; button.setAttribute('aria-pressed', String(id === 'all'));
                button.onclick = () => { propertyFilter = id; filterProperties(); };
                filters.appendChild(button);
            });
            toolbar.after(filters);
            const empty = document.createElement('p');
            empty.id = 'properties-empty'; empty.className = 'ui-empty'; empty.hidden = true;
            empty.textContent = 'No settings match your search.';
            document.querySelector('#props-form').after(empty);
        }
        document.querySelectorAll('.nav-item[data-panel]').forEach(item => {
            item.tabIndex = 0;
            item.setAttribute('role', 'button');
            item.onkeydown = event => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); item.click(); }
            };
        });
        const serverName = document.querySelector('.sidebar-brand #sidebar-server-name');
        if (serverName) {
            const brand = document.createElement('div');
            serverName.before(brand);
            brand.innerHTML = '<div class="sidebar-brand-label">JTG CRAFT</div>';
            brand.appendChild(serverName);
        }
    }
    function levelOf(text) {
        return /\b(ERROR|FATAL|SEVERE)\b|exception|\[SERVER STOPPED\].*code [1-9]/i.test(text) ? 'error' : /\bWARN(?:ING)?\b/i.test(text) ? 'warning' : 'info';
    }
    function matchLog(row) {
        const query = document.querySelector('#log-search').value.toLowerCase();
        const level = document.querySelector('#log-level').value;
        return (!query || row.textContent.toLowerCase().includes(query)) && (level === 'all' || row.dataset.level === level);
    }
    function updateLogCount() {
        const visible = logState.rows.filter(row => !row.hidden).length;
        document.querySelector('#log-count').textContent = logState.rows.length ? visible + ' of ' + logState.rows.length + ' lines' : 'Waiting for server output';
        logState.log.dataset.empty = logState.rows.length === 0 ? 'waiting' : visible === 0 ? 'filtered' : '';
    }
    function filterLogs() {
        if (!logState) return;
        logState.rows.forEach(row => { row.hidden = !matchLog(row); });
        updateLogCount();
    }
    function flushLogs() {
        if (!logState) return;
        if (logState.frame) cancelAnimationFrame(logState.frame);
        logState.frame = 0;
        const pending = logState.pending;
        logState.pending = '';
        if (!pending) return;
        const fragment = document.createDocumentFragment();
        const pieces = pending.split('\n');
        pieces.forEach((text, index) => {
            if (!logState.tail && (text || index < pieces.length - 1)) {
                const row = document.createElement('div');
                row.className = 'log-line';
                logState.rows.push(row);
                logState.tail = row;
                fragment.appendChild(row);
            }
            if (logState.tail) {
                const row = logState.tail;
                row.textContent = (row.textContent + text).slice(-32768);
                row.dataset.level = levelOf(row.textContent);
                row.hidden = !matchLog(row);
            }
            if (index < pieces.length - 1) logState.tail = null;
        });
        logState.log.appendChild(fragment);
        while (logState.rows.length > 2000) logState.rows.shift().remove();
        updateLogCount();
        if (document.querySelector('#log-follow').checked) logState.log.scrollTop = logState.log.scrollHeight;
    }
    function appendConsole(data) {
        if (!logState) return;
        const text = typeof data === 'object' && data !== null ? (data.text || JSON.stringify(data)) : String(data == null ? '' : data);
        logState.pending = (logState.pending + text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\r\n/g, '\n')).slice(-262144);
        if (!logState.frame) logState.frame = requestAnimationFrame(flushLogs);
    }
    function clearConsole() {
        if (!logState) return;
        if (logState.frame) cancelAnimationFrame(logState.frame);
        logState.pending = ''; logState.tail = null; logState.rows = []; logState.frame = 0;
        logState.log.replaceChildren();
        updateLogCount();
    }

    const info = {
        'motd': ['Server description', 'The message players see in their server list.', 'connection'],
        'server-port': ['Server port', 'Java players connect through this port (default 25565).', 'connection', 1, 65535],
        'server-ip': ['Bind address', 'Usually leave empty to accept connections on all interfaces.', 'connection'],
        'max-players': ['Player limit', 'Maximum number of players allowed online.', 'connection', 1, 2147483647],
        'online-mode': ['Account verification', 'Verify Java accounts. Check your proxy or Floodgate setup before changing.', 'connection'],
        'white-list': ['Allowlist', 'Only players on your whitelist can join.', 'connection'],
        'enforce-whitelist': ['Enforce allowlist', 'Remove connected players who are not on the allowlist.', 'connection'],
        'gamemode': ['Default game mode', 'The starting game mode for new players.', 'game'],
        'difficulty': ['Difficulty', 'Controls mob damage, hunger and other survival rules.', 'game'],
        'pvp': ['Player combat', 'Allow players to damage each other.', 'game'],
        'hardcore': ['Hardcore mode', 'Players have one life. Review before enabling.', 'game'],
        'allow-flight': ['Allow flight', 'Allow flight without the server kicking the player.', 'game'],
        'force-gamemode': ['Force game mode', 'Apply the default mode when players join.', 'game'],
        'enable-command-block': ['Command blocks', 'Allow command blocks to execute commands.', 'game'],
        'spawn-protection': ['Spawn protection', 'Protected radius around world spawn.', 'game', 0, 2147483647],
        'level-name': ['World folder', 'Folder name of the world to load.', 'world'],
        'level-seed': ['World seed', 'Used when generating a new world.', 'world'],
        'level-type': ['World generation', 'Generation style for a new world.', 'world'],
        'allow-nether': ['Nether dimension', 'Allow access to the Nether.', 'world'],
        'view-distance': ['View distance', 'Chunks sent to players. Lower values reduce resource usage.', 'performance', 2, 32],
        'simulation-distance': ['Simulation distance', 'Chunks that tick around each player.', 'performance', 2, 32],
        'max-tick-time': ['Watchdog timeout', 'Milliseconds before a stalled tick triggers shutdown; -1 disables it.', 'performance', -1, 2147483647],
        'network-compression-threshold': ['Compression threshold', 'Packet size in bytes; -1 disables compression.', 'performance', -1, 2147483647],
    };
    function propertyCategory(key) {
        if (info[key]) return info[key][2];
        if (/^(spawn-|generate-|level-)/.test(key)) return 'world';
        if (/^(rcon|query|enable-rcon|enable-query|resource-pack)/.test(key)) return 'advanced';
        return 'advanced';
    }
    function renderProperties(props, form, options, booleanKeys) {
        form.replaceChildren();
        const saveState = document.querySelector('#properties-save-state');
        saveState.textContent = 'Changes apply after restarting your server.';
        saveState.classList.remove('dirty');
        propertyBaseline = Object.fromEntries(Object.entries(props).map(([key, value]) => [key, String(value)]));
        const groups = [['game', 'Gameplay', 'Player rules and permissions'], ['connection', 'Connection', 'Who can join and how'], ['world', 'World', 'Generation and dimensions'], ['performance', 'Performance', 'Balance resources and player experience'], ['advanced', 'Advanced', 'Additional server configuration']];
        groups.forEach(([category, title, desc]) => {
            const entries = Object.entries(props).filter(([key]) => propertyCategory(key) === category);
            if (!entries.length) return;
            const section = document.createElement('section'); section.className = 'property-section'; section.dataset.category = category;
            const header = document.createElement('div'); header.className = 'property-section-heading';
            const heading = document.createElement('h4'); heading.textContent = title;
            const sub = document.createElement('p'); sub.textContent = desc;
            header.append(heading, sub); section.appendChild(header);
            const fields = document.createElement('div'); fields.className = 'property-fields';
            entries.forEach(([key, value]) => {
                const metadata = info[key];
                const field = document.createElement('div'); field.className = 'prop-field'; field.dataset.propKey = key.toLowerCase();
                field.dataset.search = (key + ' ' + (metadata ? metadata[0] + ' ' + metadata[1] : '')).toLowerCase();
                const label = document.createElement('label'); label.htmlFor = 'property-' + key;
                label.textContent = metadata ? metadata[0] : key.replace(/[-_]/g, ' ').replace(/^./, char => char.toUpperCase());
                const rawKey = document.createElement('code'); rawKey.className = 'property-key'; rawKey.textContent = key;
                const choices = options[key] || (booleanKeys.includes(key) || /^(true|false)$/.test(String(value)) ? ['true', 'false'] : null);
                let input;
                if (choices) {
                    input = document.createElement('select');
                    const values = choices.includes(String(value)) ? choices : [String(value), ...choices];
                    values.forEach(choice => {
                        const option = document.createElement('option'); option.value = choice;
                        option.textContent = choice === 'true' ? 'Enabled' : choice === 'false' ? 'Disabled' : choice.replace('minecraft:', '').replace(/_/g, ' ');
                        input.appendChild(option);
                    });
                } else {
                    input = document.createElement('input'); input.type = metadata && metadata.length > 3 ? 'number' : 'text';
                    if (input.type === 'number') { input.min = metadata[3]; input.max = metadata[4]; input.step = 1; input.required = true; }
                    if (/password|secret/.test(key)) { input.type = 'password'; input.autocomplete = 'new-password'; }
                }
                input.id = 'property-' + key; input.className = 'prop-input'; input.dataset.key = key; input.value = String(value);
                const description = document.createElement('small'); description.id = input.id + '-help'; description.className = 'property-help'; description.textContent = metadata ? metadata[1] : 'Saved using the original server.properties key.';
                input.setAttribute('aria-describedby', description.id);
                field.append(label, rawKey, input, description); fields.appendChild(field);
            });
            section.appendChild(fields); form.appendChild(section);
        });
        const search = document.querySelector('#props-search-inp');
        search.oninput = filterProperties;
        form.oninput = () => {
            const dirty = [...form.querySelectorAll('.prop-input')].some(input => propertyBaseline[input.dataset.key] !== input.value);
            const state = document.querySelector('#properties-save-state');
            state.textContent = dirty ? 'Unsaved changes · Save, then restart to apply.' : 'Changes apply after restarting your server.';
            state.classList.toggle('dirty', dirty);
        };
        filterProperties();
    }
    function filterProperties() {
        const query = document.querySelector('#props-search-inp').value.trim().toLowerCase();
        let count = 0;
        document.querySelectorAll('.property-section').forEach(section => {
            let visible = 0;
            section.querySelectorAll('.prop-field').forEach(field => {
                field.hidden = !((propertyFilter === 'all' || propertyFilter === section.dataset.category) && (!query || field.dataset.search.includes(query)));
                if (!field.hidden) visible++;
            });
            section.hidden = visible === 0; count += visible;
        });
        const empty = document.querySelector('#properties-empty');
        if (empty) empty.hidden = count > 0;
        document.querySelectorAll('.property-filter').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.category === propertyFilter)));
    }
    function validateProperties() {
        const inputs = document.querySelectorAll('#props-form .prop-input');
        for (const input of inputs) {
            if (!input.checkValidity()) {
                propertyFilter = 'all'; document.querySelector('#props-search-inp').value = ''; filterProperties();
                input.scrollIntoView({ block: 'center' }); input.reportValidity(); return false;
            }
        }
        return inputs.length > 0;
    }
    function propertiesSaved() {
        document.querySelectorAll('#props-form .prop-input').forEach(input => { propertyBaseline[input.dataset.key] = input.value; });
        const state = document.querySelector('#properties-save-state');
        state.textContent = 'Saved · Restart your server to apply these settings.'; state.classList.remove('dirty');
    }
    function setProcessState(running) {
        const badge = document.querySelector('#ui-process-state');
        if (badge) { badge.textContent = running ? 'Process running' : 'Server stopped'; badge.classList.toggle('running', running); }
    }
    window.JtgUI = { appendConsole, clearConsole, renderProperties, validateProperties, propertiesSaved, applyTheme, setProcessState, runOperation, operationProgress, loadResources };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
/* JTG_SHARED_UI_END */
// ============================================================
//  Jtg-craft — Renderer (all UI logic)
// ============================================================

const initApp = async () => {

    // ── Helpers ─────────────────────────────────────────────
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    function toast(msg, type = 'success') {
        const el = document.createElement('div');
        el.className = `toast ${type}`;
        el.textContent = msg;
        $('#toast-container').appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 4000);
    }

    function showScreen(id) {
        $$('.screen').forEach(s => { s.classList.add('hidden'); s.classList.remove('active'); });
        const target = document.getElementById(id);
        target.classList.remove('hidden');
        // Flush style before adding active for transition to play
        void target.offsetWidth;
        target.classList.add('active');
    }

    function openDrawer() {
        const drawer = $('#mobile-sidebar-drawer');
        const backdrop = $('#sidebar-backdrop');
        if (drawer) drawer.classList.add('open');
        if (backdrop) backdrop.classList.remove('hidden');
    }

    function closeDrawer() {
        const drawer = $('#mobile-sidebar-drawer');
        const backdrop = $('#sidebar-backdrop');
        if (drawer) drawer.classList.remove('open');
        if (backdrop) backdrop.classList.add('hidden');
    }

    function showPanel(id) {
        if (!id) return;
        $$('.panel').forEach(p => { p.classList.add('hidden'); p.classList.remove('active'); });
        $$('.nav-item').forEach(n => n.classList.remove('active'));
        const panel = document.getElementById(id);
        if (panel) {
            panel.classList.remove('hidden');
            panel.classList.add('active');
        }
        $$(`.nav-item[data-panel="${id}"]`).forEach(nav => nav.classList.add('active'));
        
        // Lazy-load panel data whenever panel is displayed
        if (id === 'panel-plugins') {
            loadPlugins();
            loadInstalledPlugins();
        }
        if (id === 'panel-files') loadFileManager('');
        if (id === 'panel-worlds') loadWorlds();
        if (id === 'panel-players') loadPlayers();
        if (id === 'panel-props') loadProperties();
        if (id === 'panel-backup') loadBackups();
        if (id === 'panel-settings') {
            loadChangelog();
            loadSettings();
        }
        closeDrawer();
    }

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    }

    // ── Opening Splash Screen Dismissal (Global Delegate) ───
    function dismissSplashScreen() {
        if (typeof window.dismissSplashScreen === 'function') {
            window.dismissSplashScreen();
        } else {
            const splash = document.getElementById('mobile-splash-screen');
            if (!splash || splash.dataset.dismissed) return;
            splash.dataset.dismissed = 'true';
            splash.classList.add('fade-out');
            setTimeout(() => {
                splash.style.display = 'none';
                try { splash.remove(); } catch (_) {}
            }, 600);
        }
    }

    // Safety fallback: guaranteed dismiss after 2s maximum
    setTimeout(dismissSplashScreen, 2000);

    // ── Title bar ───────────────────────────────────────────
    if ($('#tb-min'))   $('#tb-min').onclick   = () => window.api && window.api.winMinimize && window.api.winMinimize();
    if ($('#tb-max'))   $('#tb-max').onclick   = () => window.api && window.api.winMaximize && window.api.winMaximize();
    if ($('#tb-close')) $('#tb-close').onclick = () => window.api && window.api.winClose && window.api.winClose();

    // ── System info for sliders (Defensive with fallback) ────
    let sldRam = null;
    let sldCpu = null;
    let ramMax = 4096;
    let cpuMax = 4;
    try {
        const sysInfo = (window.api && window.api.getSystemInfo) ? await window.api.getSystemInfo() : { totalRamMB: 4096, cores: 4 };
        const totalRam = (sysInfo && sysInfo.totalRamMB) ? sysInfo.totalRamMB : 4096;
        ramMax = sysInfo.maxRamMB || window.JtgResourcePolicy.resourceLimits(totalRam, sysInfo.cores).maxRamMB;
        cpuMax = (sysInfo && sysInfo.cores) ? sysInfo.cores : 4;

        sldRam = $('#sld-ram');
        sldCpu = $('#sld-cpu');
        if (sldRam) {
            sldRam.min = 512; sldRam.max = ramMax;
            sldRam.value = Math.min(2048, ramMax);
            sldRam.oninput = () => { if ($('#lbl-ram')) $('#lbl-ram').textContent = sldRam.value; };
        }
        if (sldCpu) {
            sldCpu.max = cpuMax;
            sldCpu.value = Math.max(1, Math.floor(cpuMax / 2));
            sldCpu.oninput = () => { if ($('#lbl-cpu')) $('#lbl-cpu').textContent = sldCpu.value; };
        }

        if ($('#lbl-ram')) $('#lbl-ram').textContent = (sldRam ? sldRam.value : 2048);
        if ($('#lbl-cpu')) $('#lbl-cpu').textContent = (sldCpu ? sldCpu.value : 2);
        if ($('#lbl-ram-max')) $('#lbl-ram-max').textContent = (ramMax / 1024).toFixed(0) + ' GB';
        if ($('#lbl-cpu-max')) $('#lbl-cpu-max').textContent = cpuMax;
    } catch (e) {
        console.warn('System info initialization note:', e);
    }

    // ── Saved directory & version state ─────────────────────
    let savedDir = localStorage.getItem('jtg-install-dir') || '';
    let paperVersions = [];
    let pendingCreateAfterPermission = false;

    // ── Storage Permission Check & Banner ───────────────────
    async function checkAndDisplayStorageBanner(dir) {
        const banner = $('#storage-perm-banner');
        if (!banner) return;
        try {
            if (window.api && window.api.checkStoragePermission) {
                const perm = await window.api.checkStoragePermission();
                if (perm && perm.granted) {
                    banner.classList.add('hidden');
                    if (pendingCreateAfterPermission) { pendingCreateAfterPermission = false; setTimeout(()=>$('#btn-create').onclick(),100); }
                    return;
                }
            }
        } catch (_) {}

        // Permission is not granted yet -> check if target path is isolated app storage
        const targetDir = dir || ($('#inp-dir') ? $('#inp-dir').value.trim() : '') || savedDir || '/storage/emulated/0/JtgCraft/server';
        const isIsolated = targetDir.includes('/data/data/') || targetDir.includes('/files/servers/');
        if (isIsolated) {
            banner.classList.add('hidden');
            return;
        }

        // Show banner prominently for Phone Storage & External Storage
        banner.classList.remove('hidden');
    }

    // Proactively verify and display banner immediately on startup
    checkAndDisplayStorageBanner();

    const btnGrantStorage = $('#btn-grant-storage');
    if (btnGrantStorage) {
        btnGrantStorage.onclick = async () => {
            btnGrantStorage.disabled = true;
            btnGrantStorage.textContent = 'Opening Settings...';
            try {
                await window.api.requestStoragePermission();
            } catch (e) {
                toast('Please grant All Files Access: ' + (e.message || e), 'warn');
            }
            setTimeout(() => {
                btnGrantStorage.disabled = false;
                btnGrantStorage.textContent = 'Grant Permission';
                checkAndDisplayStorageBanner();
            }, 1200);
        };
    }

    window.addEventListener('focus', () => checkAndDisplayStorageBanner());
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) checkAndDisplayStorageBanner();
    });

    // ── Setup progress listener ─────────────────────────────
    window.api.onSetupProgress(data => {
        window.JtgUI.operationProgress(data.percent,data.status);
        const statusEl = $('#create-status') || $('#step-java-status');
        const barEl = $('#create-bar') || $('#setup-java-bar');
        if (statusEl && data.status) statusEl.textContent = data.status;
        if (barEl && data.percent !== undefined) barEl.style.width = data.percent + '%';
        if (data.step === 'java' || data.step === 'java21') {
            const sj = $('#step-java-status');
            const sb = $('#setup-java-bar');
            if (sj) sj.textContent = data.status;
            if (sb) sb.style.width = data.percent + '%';
        }
    });

    // ══════════════════════════════════════════════════════════
    //  BOOT SEQUENCE (Direct to Server Menu or Dashboard)
    // ══════════════════════════════════════════════════════════
    async function initAppOnStartup() {
        try {
            // 1. Resolve preferred default storage paths (/storage/emulated/0/JtgCraft/server)
            let storagePaths = null;
            if (window.api && window.api.getDefaultStoragePaths) {
                storagePaths = await window.api.getDefaultStoragePaths().catch(() => null);
            }

            if (!savedDir) {
                savedDir = (storagePaths && storagePaths.phoneStorage) ? storagePaths.phoneStorage : '/storage/emulated/0/JtgCraft/server';
                localStorage.setItem('jtg-install-dir', savedDir);
            }

            if ($('#inp-dir')) {
                $('#inp-dir').value = savedDir;
            }

            // 2. Check if a server already exists
            let check = await window.api.checkExistingServer(savedDir).catch(() => ({ exists: false }));
            if (!check.exists && storagePaths && storagePaths.phoneStorage && savedDir !== storagePaths.phoneStorage) { savedDir = storagePaths.phoneStorage; localStorage.setItem('jtg-install-dir',savedDir); $('#inp-dir').value = savedDir; check = await window.api.checkExistingServer(savedDir); }
            if (check && check.exists) {
                // Existing server detected -> Jump directly to dashboard
                const sName = check.name || 'Jtg Server';
                $('#sidebar-server-name').textContent = sName;
                const drName = $('#drawer-server-name');
                if (drName) drName.textContent = sName;
                initDashboard();
                showScreen('screen-dashboard');
                setTimeout(dismissSplashScreen, 1800);
                return;
            }

            // 3. No server yet -> Show Server Creation menu directly (as requested)
            showScreen('screen-create');
            checkAndDisplayStorageBanner(savedDir);
            setTimeout(dismissSplashScreen, 1800);

            // 4. Background fetch latest Paper versions to enhance version dropdown
            if (window.api && window.api.fetchPaperVersions) {
                window.api.fetchPaperVersions().then(versions => {
                    if (versions && versions.length > 0) {
                        paperVersions = versions;
                        const sel = $('#sel-version');
                        if (sel) {
                            const curVal = sel.value;
                            sel.innerHTML = '';
                            versions.forEach(v => {
                                const opt = document.createElement('option');
                                opt.value = v;
                                opt.textContent = `Paper ${v} (Auto: Java ${window.JtgJavaPolicy.requiredJava(v)})`;
                                sel.appendChild(opt);
                            });
                            if (curVal && versions.includes(curVal)) {
                                sel.value = curVal;
                            }
                        }
                    }
                }).catch(() => {});
            }

        } catch (err) {
            console.error('Startup initialization error:', err);
            showScreen('screen-create');
            setTimeout(dismissSplashScreen, 1800);
        }
    }

    // ══════════════════════════════════════════════════════════
    //  WELCOME & CREATE SCREEN HELPERS
    // ══════════════════════════════════════════════════════════
    function resetCreateScreen() {
        const btn = $('#btn-create');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Create &amp; Launch Server`;
        }
        const progressBox = $('#create-progress');
        if (progressBox) progressBox.classList.add('hidden');
        const barEl = $('#create-bar');
        if (barEl) barEl.style.width = '0%';
        const statusEl = $('#create-status');
        if (statusEl) statusEl.textContent = '';
        if ($('#inp-name') && (!($('#inp-name').value) || !($('#inp-name').value.trim()))) {
            $('#inp-name').value = 'Jtg Server';
        }
    }

    $('#btn-get-started').onclick = async () => {
        resetCreateScreen();
        showScreen('screen-create');
        checkAndDisplayStorageBanner(savedDir);
    };

    // ══════════════════════════════════════════════════════════
    //  CREATE SCREEN
    // ══════════════════════════════════════════════════════════
    const pickDirectoryButton = $('#btn-pick-dir');
    if (pickDirectoryButton) pickDirectoryButton.onclick = async () => {
        const currentVal = $('#inp-dir').value.trim() || savedDir || '/storage/emulated/0/JtgCraft/server';
        const customPrompt = prompt('Enter or edit server install folder path:', currentVal);
        if (customPrompt && customPrompt.trim()) {
            const dir = await window.api.pickDirectory(customPrompt.trim());
            if (dir) {
                savedDir = dir;
                localStorage.setItem('jtg-install-dir', savedDir);
                $('#inp-dir').value = dir;
                checkAndDisplayStorageBanner(savedDir);
            }
        }
    };

    const inpDirEl = $('#inp-dir');
    if (inpDirEl) {
        inpDirEl.oninput = () => {
            const val = inpDirEl.value.trim();
            if (val) {
                savedDir = val;
                localStorage.setItem('jtg-install-dir', val);
                checkAndDisplayStorageBanner(val);
            }
        };
    }

    $$('.dir-preset-chip').forEach(chip => {
        chip.onclick = async () => {
            $$('.dir-preset-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            const chosen = chip.dataset.dir;
            savedDir = chosen;
            localStorage.setItem('jtg-install-dir', chosen);
            $('#inp-dir').value = chosen;
            checkAndDisplayStorageBanner(chosen);
            if (window.api && window.api.pickDirectory) {
                await window.api.pickDirectory(chosen);
            }
        };
    });

    // Download progress listener
    window.api.onDownloadProgress(data => {
        const pct = (typeof data === 'object' && data !== null) ? (data.percent || data.pct || 0) : data;
        const createBar = $('#create-bar');
        const createStatus = $('#create-status');
        if (createBar) createBar.style.width = pct + '%';
        if (createStatus) createStatus.textContent = (typeof data === 'object' && data.status) ? data.status : `Downloading... ${pct}%`;
    });

    // On-demand installation and server creation
    $('#btn-create').onclick = async () => {
        const name = $('#inp-name').value.trim();

        // Validate name
        if (!name || !/^[a-zA-Z0-9_]+$/.test(name)) {
            toast('Invalid server name. Use only letters, numbers, underscores.', 'error');
            return;
        }

        const chosenDir = $('#inp-dir').value.trim() || savedDir || '/storage/emulated/0/JtgCraft/server';
        savedDir = chosenDir;
        localStorage.setItem('jtg-install-dir', savedDir);

        const version = $('#sel-version').value;
        if (!version) { toast('Select a Paper version.', 'error'); return; }

        // Check storage permission if installing to external public storage
        if (chosenDir.startsWith('/storage/emulated/0') || chosenDir.includes('/storage/')) {
            try {
                const perm = await window.api.checkStoragePermission();
                if (perm && !perm.granted) {
                    toast('Storage permission needed to create server in Phone Storage.', 'warn');
                    $('#storage-perm-banner').classList.remove('hidden');
                    pendingCreateAfterPermission = true;
                    await window.api.requestStoragePermission();
                    await checkAndDisplayStorageBanner(savedDir);
                    return;
                }
            } catch (_) {}
        }

        const btn = $('#btn-create');
        btn.disabled = true;

        const progressBox = $('#create-progress');
        const statusEl = $('#create-status');
        const barEl = $('#create-bar');

        if (progressBox) progressBox.classList.remove('hidden');
        if (barEl) barEl.style.width = '0%';

        try {
            const javaVersion = window.JtgJavaPolicy.requiredJava(version);
            if (statusEl) statusEl.textContent = `Checking Java ${javaVersion} for Paper ${version}…`;
            const check = javaVersion === 25 ? await window.api.checkJava25() : javaVersion === 21 ? await window.api.checkJava21() : await window.api.checkJava(savedDir);
            if (!check.found) {
                if (statusEl) statusEl.textContent = `Downloading Java ${javaVersion} ARM64…`;
                await window.api.installJava({version:String(javaVersion)});
            }

            // Download Paper jar directly & initialize server
            if (statusEl) statusEl.textContent = `Downloading Paper ${version}...`;
            if (barEl) barEl.style.width = '30%';

            const ramInput = $('#sld-ram');
            const cpuInput = $('#sld-cpu');
            const ramVal = (ramInput && ramInput.value) ? parseInt(ramInput.value, 10) : (sldRam && sldRam.value ? parseInt(sldRam.value, 10) : 2048);
            const cpuVal = (cpuInput && cpuInput.value) ? parseInt(cpuInput.value, 10) : (sldCpu && sldCpu.value ? parseInt(sldCpu.value, 10) : 2);

            await window.api.createServer({
                dir: savedDir,
                name: name,
                ram: ramVal,
                cpu: cpuVal,
                version: version
            });

            toast('Server created successfully in Phone Storage!');
            $('#sidebar-server-name').textContent = name;
            const drName = $('#drawer-server-name');
            if (drName) drName.textContent = name;
            resetCreateScreen();
            initDashboard();
            showScreen('screen-dashboard');

            // Auto-start server
            setTimeout(() => startServer(), 600);

        } catch (e) {
            toast(e.message || 'Server creation failed', 'error');
            if (statusEl) statusEl.textContent = 'Creation failed: ' + (e.message || 'Unknown error');
            if (btn) btn.disabled = false;
        }
    };

    // ══════════════════════════════════════════════════════════
    //  DASHBOARD
    // ══════════════════════════════════════════════════════════
    let statsInterval = null;

    function initDashboard() {
        // Drawer toggle and close controls
        const btnToggle = $('#btn-sidebar-toggle');
        if (btnToggle) btnToggle.onclick = () => openDrawer();

        const btnClose = $('#btn-drawer-close');
        if (btnClose) btnClose.onclick = () => closeDrawer();

        const backdrop = $('#sidebar-backdrop');
        if (backdrop) backdrop.onclick = () => closeDrawer();

        // Sidebar & Bottom nav
        $$('.nav-item').forEach(item => {
            item.onclick = () => {
                if (item.id === 'btn-bottom-menu' || item.classList.contains('nav-item-drawer')) {
                    openDrawer();
                    return;
                }
                const panel = item.dataset.panel;
                if (!panel) return;
                showPanel(panel);
            };
        });
        
        // Show default panel on init
        showPanel('panel-console');
        loadInstalledPlugins();

        // Start stats polling (every 3s)
        if (statsInterval) clearInterval(statsInterval);
        statsInterval = setInterval(async () => {
            try {
                const s = await window.api.getLiveStats();
                $('#live-cpu').textContent = s.cpuPercent + '%';
                $('#live-ram').textContent = `${s.ramUsedMB} / ${s.ramTotalMB} MB`;
                const ramPct = s.ramTotalMB > 0 ? Math.min(100, Math.round((s.ramUsedMB * 100) / s.ramTotalMB)) : 0;
                $('#cpu-bar').style.width = ramPct + '%';

                const drawerCpu = $('#drawer-live-cpu');
                if (drawerCpu) drawerCpu.textContent = s.cpuPercent + '%';
                const drawerRam = $('#drawer-live-ram');
                if (drawerRam) drawerRam.textContent = `${s.ramUsedMB} / ${s.ramTotalMB} MB`;
            } catch (_) {}
        }, 3000);
    }

    // ── Console ─────────────────────────────────────────────
    const consoleEl = $('#console-log');

    function appendConsole(text) {
        window.JtgUI.appendConsole(text);
    }

    window.api.onConsoleData(data => appendConsole(data));

    // Playit Console listener (kept for future beta re-enable, but no UI target now)
    // window.api.onPlayitConsoleData is still registered in preload but the panel is static

    window.api.onServerState(state => {
        // state comes as { running: true/false } from Java backend
        const running = (typeof state === 'object' && state !== null) ? !!state.running : (state === 'running' || state === true);
        window.JtgUI.setProcessState(running);
        $('#btn-start').disabled = running;
        $('#btn-stop').disabled = !running;
        $('#btn-restart').disabled = !running;
        $('#inp-cmd').disabled = !running;
        $('#btn-cmd').disabled = !running;

        const dot = $('#drawer-status-dot');
        const txt = $('#drawer-status-text');
        if (dot) dot.classList.toggle('online', running);
        if (txt) txt.textContent = running ? 'Server Running' : 'Server Stopped';

        const netCard = $('#server-network-card');
        if (running && window.api && window.api.getNetworkInfo) {
            window.api.getNetworkInfo().then(net => {
                if (net) {
                    const valLocal = $('#val-local-ip');
                    const valLan = $('#val-lan-ip');
                    if (valLocal) valLocal.textContent = net.sameDeviceJoin || '127.0.0.1:25565';
                    if (valLan) valLan.textContent = net.lanJoin || net.hotspotJoin || '127.0.0.1:25565';
                    if (netCard) netCard.classList.remove('hidden');
                }
            }).catch(() => {});
        } else {
            if (netCard) netCard.classList.add('hidden');
        }
    });

    // Copy Join IP handlers
    const btnCopyJoin = $('#btn-copy-join-ip');
    if (btnCopyJoin) {
        btnCopyJoin.onclick = () => {
            const local = $('#val-local-ip') ? $('#val-local-ip').textContent : '127.0.0.1:25565';
            const lan = $('#val-lan-ip') ? $('#val-lan-ip').textContent : '';
            const copyText = (lan && lan !== local) ? `${local} (Same Phone) | ${lan} (Wi-Fi/Hotspot)` : local;
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(copyText).then(() => toast(`Copied join address: ${copyText}`, 'success')).catch(() => {});
            } else {
                toast(`Address: ${copyText}`, 'info');
            }
        };
    }
    const pillLocal = $('#pill-local-ip');
    if (pillLocal) {
        pillLocal.onclick = () => {
            const val = $('#val-local-ip') ? $('#val-local-ip').textContent : '127.0.0.1:25565';
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(val).then(() => toast(`Copied: ${val}`, 'success')).catch(() => {});
            }
        };
    }
    const pillLan = $('#pill-lan-ip');
    if (pillLan) {
        pillLan.onclick = () => {
            const val = $('#val-lan-ip') ? $('#val-lan-ip').textContent : '127.0.0.1:25565';
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(val).then(() => toast(`Copied: ${val}`, 'success')).catch(() => {});
            }
        };
    }

    async function startServer() {
        try {
            window.JtgUI.clearConsole();
            appendConsole('[Jtg-craft] Starting server...\n');
            await window.api.serverStart();
        } catch (e) {
            toast(e.message || 'Failed to start', 'error');
            appendConsole(`[ERROR] ${e.message}\n`);
        }
    }

    $('#btn-start').onclick = startServer;

    $('#btn-stop').onclick = async () => {
        try {
            appendConsole('[Jtg-craft] Stopping server...\n');
            await window.api.serverStop();
        } catch (e) { toast(e.message, 'error'); }
    };

    let isRestarting = false;
    $('#btn-restart').onclick = async () => {
        if (isRestarting) return;
        isRestarting = true;
        const btnRestart = $('#btn-restart');
        const btnStart = $('#btn-start');
        const btnStop = $('#btn-stop');

        btnRestart.disabled = true;
        btnStart.disabled = true;
        btnStop.disabled = true;

        try {
            appendConsole('[Jtg-craft] 🔄 Restarting server safely...\n');
            toast('Restarting server...', 'info');

            if (window.api && window.api.serverRestart) {
                await window.api.serverRestart();
            } else {
                await window.api.serverStop();
                let waited = 0;
                while (waited < 15) {
                    await new Promise(r => setTimeout(r, 1000));
                    waited++;
                    const st = await window.api.serverStatus().catch(() => ({ running: false }));
                    const isRun = (typeof st === 'object' && st !== null) ? !!st.running : !!st;
                    if (!isRun) break;
                }
                await new Promise(r => setTimeout(r, 1500));
                await startServer();
            }
            toast('Server restarted successfully!', 'success');
        } catch (e) {
            toast(e.message || 'Restart failed', 'error');
            appendConsole(`[ERROR] Restart failed: ${e.message}\n`);
        } finally {
            isRestarting = false;
        }
    };

    // Send command
    function sendCmd() {
        const inp = $('#inp-cmd');
        const cmd = inp.value.trim();
        if (!cmd) return;
        try {
            window.api.serverCommand(cmd);
            appendConsole(`> ${cmd}\n`);
            inp.value = '';
        } catch (e) { toast(e.message, 'error'); }
    }
    $('#btn-cmd').onclick = sendCmd;
    $('#inp-cmd').onkeydown = (e) => { if (e.key === 'Enter') sendCmd(); };

    // ══════════════════════════════════════════════════════════
    //  FILE MANAGER
    // ══════════════════════════════════════════════════════════
    let fmCurrentRel = '';

    function updateSelectedState() {
        const allCbs = Array.from(document.querySelectorAll('.fm-item-cb'));
        const checkedCbs = Array.from(document.querySelectorAll('.fm-item-cb:checked'));
        const btnDelete = $('#fm-delete-selected-btn');
        const lblCount = $('#fm-selected-count');
        const selectAllCb = $('#fm-select-all');

        if (checkedCbs.length > 0) {
            if (btnDelete) btnDelete.classList.remove('hidden');
            if (lblCount) lblCount.textContent = checkedCbs.length;
        } else {
            if (btnDelete) btnDelete.classList.add('hidden');
            if (lblCount) lblCount.textContent = '0';
        }

        if (selectAllCb) {
            if (allCbs.length > 0 && checkedCbs.length === allCbs.length) {
                selectAllCb.checked = true;
                selectAllCb.indeterminate = false;
            } else if (checkedCbs.length > 0) {
                selectAllCb.checked = false;
                selectAllCb.indeterminate = true;
            } else {
                selectAllCb.checked = false;
                selectAllCb.indeterminate = false;
            }
        }
    }

    async function loadFileManager(relDir) {
        fmCurrentRel = relDir;
        updateBreadcrumb(relDir);
        const listEl = $('#fm-list');
        listEl.innerHTML = '';
        $('#fm-editor-wrap').classList.add('hidden');

        // Reset multi-select state
        const selectAllCb = $('#fm-select-all');
        if (selectAllCb) {
            selectAllCb.checked = false;
            selectAllCb.indeterminate = false;
        }
        const btnDelete = $('#fm-delete-selected-btn');
        if (btnDelete) btnDelete.classList.add('hidden');

        try {
            const items = await window.api.fmList(relDir || null);

            // Parent directory row
            if (relDir) {
                const parentRel = relDir.includes('/') ? relDir.substring(0, relDir.lastIndexOf('/')) : '';
                const row = document.createElement('div');
                row.className = 'fm-row';
                row.innerHTML = `<span class="fm-cb-wrap"></span><span class="icon">↩</span><span class="name">..</span>`;
                row.onclick = () => loadFileManager(parentRel);
                listEl.appendChild(row);
            }

            if (!items || items.length === 0) {
                const emptyRow = document.createElement('div');
                emptyRow.className = 'fm-row';
                emptyRow.style.color = 'var(--text-3)';
                emptyRow.style.justifyContent = 'center';
                emptyRow.style.padding = '24px';
                emptyRow.innerHTML = '<span>This folder is empty. Upload files or drop archives here.</span>';
                listEl.appendChild(emptyRow);
                return;
            }

            items.forEach(item => {
                const isJar = !item.isDir && item.name.toLowerCase().endsWith('.jar');
                const isArchive = !item.isDir && /\.(zip|rar|tar\.gz|tgz|tar|7z)$/i.test(item.name);
                const isSystemMeta = (item.name === '.mcmeta.json');

                const row = document.createElement('div');
                row.className = 'fm-row' + (isJar ? ' fm-jar' : '') + (isArchive ? ' fm-archive' : '') + (isSystemMeta ? ' fm-system' : '');
                const icon = item.isDir ? '📁' : (isJar ? '☕' : (isArchive ? '📦' : (isSystemMeta ? '⚙️' : '📄')));
                
                let badge = '';
                if (isSystemMeta) {
                    badge = ' <span class="fm-system-badge" title="Protected Server Metadata — Required for server startup">SYSTEM</span>';
                } else if (isJar) {
                    badge = ' <span class="fm-jar-badge" title="Binary JAR archive (cannot open in editor)">JAR</span>';
                } else if (isArchive) {
                    const extMatch = item.name.match(/\.([a-z0-9]+)$/i);
                    const extLabel = extMatch ? extMatch[1].toUpperCase() : 'ARCHIVE';
                    badge = ` <span class="fm-archive-badge" title="Compressed Archive / Backup (${extLabel})">${extLabel}</span>`;
                }

                const extractBtn = isArchive ? `<button class="fm-action ext" title="Extract / Unzip archive into current directory">📦 Extract</button>` : '';

                // Checkbox: protected files cannot be selected for batch deletion
                const cbHtml = isSystemMeta
                    ? `<span class="fm-cb-wrap"><span class="fm-cb-lock" title="System protected file — cannot be deleted">🔒</span></span>`
                    : `<span class="fm-cb-wrap"><input type="checkbox" class="fm-item-cb" data-rel="${item.rel}" data-name="${item.name}"></span>`;

                // Actions: protected files have no delete or rename buttons
                const actionsHtml = isSystemMeta
                    ? `<span class="fm-protected-pill" title="Protected file — deletion & renaming disabled">🔒 Protected</span>`
                    : `
                        ${extractBtn}
                        <button class="fm-action ren" title="Rename">✏</button>
                        <button class="fm-action del" title="Delete">🗑</button>
                    `;

                row.innerHTML = `
                    ${cbHtml}
                    <span class="icon">${icon}</span>
                    <span class="name" title="${item.name}">${item.name}${badge}</span>
                    <span class="size">${item.isDir ? '' : formatSize(item.size)}</span>
                    <span class="actions">
                        ${actionsHtml}
                    </span>
                `;

                // Handle Checkbox selection
                const cbEl = row.querySelector('.fm-item-cb');
                if (cbEl) {
                    cbEl.onchange = (e) => {
                        e.stopPropagation();
                        row.classList.toggle('selected', cbEl.checked);
                        updateSelectedState();
                    };
                    cbEl.onclick = (e) => e.stopPropagation();
                }

                // Extract button click
                if (isArchive) {
                    const extBtnEl = row.querySelector('.ext');
                    if (extBtnEl) {
                        extBtnEl.onclick = async (e) => {
                            e.stopPropagation();
                            if (confirm(`Extract "${item.name}" into current directory?\n(Any files with matching names will be replaced)`)) {
                                try {
                                    toast(`Extracting "${item.name}"... please wait`, 'info');
                                    await window.api.fmExtract(fmCurrentRel, item.name);
                                    toast(`Extracted "${item.name}" successfully!`, 'success');
                                    loadFileManager(fmCurrentRel);
                                } catch (err) {
                                    toast('Extraction failed: ' + err.message, 'error');
                                }
                            }
                        };
                    }
                }

                // Click to navigate or open
                if (isJar) {
                    const notifyJar = (e) => {
                        e.stopPropagation();
                        toast('JAR files cannot be opened in the text editor.', 'warning');
                    };
                    row.querySelector('.name').onclick = notifyJar;
                    row.querySelector('.icon').onclick = notifyJar;
                } else if (isArchive) {
                    const notifyArchive = (e) => {
                        e.stopPropagation();
                        if (confirm(`"${item.name}" is an archive file.\nDo you want to extract it into the current directory?`)) {
                            row.querySelector('.ext')?.click();
                        }
                    };
                    row.querySelector('.name').onclick = notifyArchive;
                    row.querySelector('.icon').onclick = notifyArchive;
                } else {
                    row.querySelector('.name').onclick = () => {
                        if (item.isDir) {
                            loadFileManager(item.rel);
                        } else {
                            openFileEditor(item.rel, item.name, item.size);
                        }
                    };
                    row.querySelector('.icon').onclick = row.querySelector('.name').onclick;
                }

                // Rename (only if not system meta)
                const btnRen = row.querySelector('.ren');
                if (btnRen) {
                    btnRen.onclick = async (e) => {
                        e.stopPropagation();
                        const newName = prompt('Rename to:', item.name);
                        if (newName && newName !== item.name) {
                            try {
                                await window.api.fmRename(item.rel, newName);
                                loadFileManager(fmCurrentRel);
                            } catch (err) { toast(err.message, 'error'); }
                        }
                    };
                }

                // Delete (only if not system meta)
                const btnDel = row.querySelector('.del');
                if (btnDel) {
                    btnDel.onclick = async (e) => {
                        e.stopPropagation();
                        if (confirm(`Delete "${item.name}"?`)) {
                            try {
                                await window.api.fmDelete(item.rel);
                                loadFileManager(fmCurrentRel);
                                toast(`Deleted ${item.name}`);
                            } catch (err) { toast(err.message, 'error'); }
                        }
                    };
                }

                listEl.appendChild(row);
            });
        } catch (e) {
            toast('Failed to list files: ' + e.message, 'error');
        }
    }

    function updateBreadcrumb(relDir) {
        const bc = $('#fm-breadcrumb');
        bc.innerHTML = '';
        const parts = ['root'];
        if (relDir) parts.push(...relDir.split('/'));

        let accumulated = '';
        parts.forEach((part, i) => {
            const crumb = document.createElement('span');
            crumb.className = 'crumb';
            crumb.textContent = part;
            if (i === 0) {
                crumb.dataset.rel = '';
            } else {
                accumulated += (i === 1 ? '' : '/') + part;
                crumb.dataset.rel = accumulated;
            }
            crumb.onclick = () => loadFileManager(crumb.dataset.rel);
            bc.appendChild(crumb);
        });
    }

    async function openFileEditor(relPath, name, size) {
        if (name && name.toLowerCase().endsWith('.jar')) {
            toast('JAR files cannot be opened in the text editor.', 'warning');
            return;
        }
        if (name && /\.(zip|rar|tar\.gz|tgz|tar|7z)$/i.test(name)) {
            toast('Archive files cannot be opened in the text editor. Use the Extract button to unpack.', 'warning');
            return;
        }
        if (size && size > 3 * 1024 * 1024) {
            toast('Files larger than 3MB cannot be opened in the text editor.', 'warning');
            return;
        }
        try {
            const content = await window.api.fmRead(relPath);
            $('#fm-editor-name').textContent = name;
            $('#fm-editor').value = content;
            $('#fm-editor-wrap').classList.remove('hidden');
            $('#fm-editor-wrap').dataset.rel = relPath;
        } catch (e) {
            toast('Cannot open file: ' + e.message, 'error');
        }
    }

    $('#fm-save').onclick = async () => {
        const rel = $('#fm-editor-wrap').dataset.rel;
        try {
            await window.api.fmWrite(rel, $('#fm-editor').value);
            toast('File saved');
        } catch (e) { toast(e.message, 'error'); }
    };

    $('#fm-close').onclick = () => {
        $('#fm-editor-wrap').classList.add('hidden');
    };

    // Select All Checkbox
    const selectAllCb = $('#fm-select-all');
    if (selectAllCb) {
        selectAllCb.onchange = () => {
            const checked = selectAllCb.checked;
            document.querySelectorAll('.fm-item-cb').forEach(cb => {
                cb.checked = checked;
                cb.closest('.fm-row')?.classList.toggle('selected', checked);
            });
            updateSelectedState();
        };
    }

    // Delete Selected (Batch)
    const btnDeleteSelected = $('#fm-delete-selected-btn');
    if (btnDeleteSelected) {
        btnDeleteSelected.onclick = async () => {
            const checkedCbs = Array.from(document.querySelectorAll('.fm-item-cb:checked'));
            if (!checkedCbs.length) return;
            const count = checkedCbs.length;
            if (confirm(`Delete ${count} selected item(s)?\n(Protected system files like .mcmeta.json will be preserved)`)) {
                const paths = checkedCbs.map(cb => cb.dataset.rel).filter(r => !r.endsWith('.mcmeta.json'));
                try {
                    toast(`Deleting ${count} item(s)...`, 'info');
                    const res = await window.api.fmDeleteBatch(paths);
                    toast(`Deleted ${res.count || count} item(s) successfully`, 'success');
                    loadFileManager(fmCurrentRel);
                } catch (err) {
                    toast('Delete failed: ' + err.message, 'error');
                }
            }
        };
    }

    // Refresh Button
    const btnRefresh = $('#fm-refresh-btn');
    if (btnRefresh) {
        btnRefresh.onclick = () => {
            loadFileManager(fmCurrentRel);
            toast('File list refreshed', 'info');
        };
    }

    // Upload via Button
    const fileInput = $('#fm-file-input');
    $('#fm-upload-btn').onclick = async () => {
        if (fileInput) {
            fileInput.click();
        } else {
            try {
                const res = await window.api.fmUploadDialog(fmCurrentRel);
                if (res && res.success) {
                    toast(`Uploaded ${res.count} file(s) successfully`, 'success');
                    loadFileManager(fmCurrentRel);
                }
            } catch (e) {
                toast('Upload failed: ' + e.message, 'error');
            }
        }
    };

    if (fileInput) {
        fileInput.onchange = async () => {
            if (!fileInput.files || !fileInput.files.length) return;
            const files = Array.from(fileInput.files);
            toast(`Uploading ${files.length} file(s)...`, 'info');
            let successCount = 0;
            for (const f of files) {
                try {
                    const base64 = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => {
                            const result = reader.result;
                            const b64 = (typeof result === 'string' && result.includes(',')) ? result.split(',')[1] : result;
                            resolve(b64);
                        };
                        reader.onerror = reject;
                        reader.readAsDataURL(f);
                    });
                    await window.api.fmUploadFile(fmCurrentRel, f.name, base64);
                    successCount++;
                } catch (err) {
                    console.error('Failed to upload file ' + f.name, err);
                }
            }
            if (successCount > 0) {
                toast(`Uploaded ${successCount} file(s) successfully`, 'success');
                loadFileManager(fmCurrentRel);
            } else {
                toast('Upload failed', 'error');
            }
            fileInput.value = ''; // reset
        };
    }

    // Drag & Drop
    const fmList = $('#fm-list');
    fmList.addEventListener('dragover', (e) => {
        e.preventDefault();
        fmList.classList.add('drag-over');
    });
    fmList.addEventListener('dragleave', () => {
        fmList.classList.remove('drag-over');
    });
    fmList.addEventListener('drop', async (e) => {
        e.preventDefault();
        fmList.classList.remove('drag-over');
        if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;

        const paths = [];
        for (const f of e.dataTransfer.files) {
            let p = '';
            try {
                if (window.api && typeof window.api.getPathForFile === 'function') {
                    p = window.api.getPathForFile(f);
                }
            } catch (err) {}
            if (!p && f.path) p = f.path;
            if (p) paths.push(p);
        }

        if (!paths.length) {
            toast('Could not determine file path. Please use "Upload File(s)" button.', 'warning');
            return;
        }

        try {
            toast('Uploading file(s)...', 'info');
            const res = await window.api.fmUpload(fmCurrentRel, paths);
            toast(`Uploaded ${res && res.count ? res.count : paths.length} file(s) successfully`, 'success');
            loadFileManager(fmCurrentRel);
        } catch (err) {
            toast('Upload failed: ' + err.message, 'error');
        }
    });

    // ══════════════════════════════════════════════════════════
    //  WORLD MANAGER
    // ══════════════════════════════════════════════════════════
    async function loadWorlds() {
        const container = $('#world-list');
        container.innerHTML = '<p style="color:var(--text-3)">Loading worlds...</p>';
        try {
            const worlds = await window.api.worldList();
            container.innerHTML = '';
            if (worlds.length === 0) {
                container.innerHTML = '<p style="color:var(--text-3)">No worlds found. Start the server to generate one.</p>';
                return;
            }
            worlds.forEach(w => {
                const card = document.createElement('div');
                card.className = 'world-card';
                card.innerHTML = `
                    <h4>${w.name}</h4>
                    <div class="meta">Size: ${w.sizeMB ? w.sizeMB + ' MB' : (w.size ? formatSize(w.size) : '0 MB')}</div>
                    <button class="btn danger sm" data-world="${w.name}">Delete World</button>
                `;
                card.querySelector('button').onclick = async () => {
                    if (confirm(`Delete world "${w.name}"? This cannot be undone!`)) {
                        try {
                            await window.api.worldDelete(w.name);
                            toast(`World "${w.name}" deleted`);
                            loadWorlds();
                        } catch (e) { toast(e.message, 'error'); }
                    }
                };
                container.appendChild(card);
            });
        } catch (e) {
            container.innerHTML = '';
            toast('Failed to load worlds', 'error');
        }
    }

    $('#btn-world-import').onclick = async () => {
        try {
            const name = await window.api.worldImport();
            if (name) {
                toast(`World "${name}" imported!`);
                loadWorlds();
            }
        } catch (e) { toast(e.message, 'error'); }
    };

    // ══════════════════════════════════════════════════════════
    //  PLAYER MANAGER (Redesigned)
    // ══════════════════════════════════════════════════════════
    async function loadPlayers() {
        const pmList = $('#pm-list');
        pmList.innerHTML = '';
        try {
            const res = await window.api.playersGetCache();
            const players = Array.isArray(res) ? res : (res && Array.isArray(res.players) ? res.players : []);
            if (!players || players.length === 0) {
                pmList.innerHTML = `
                    <div class="pm-empty">
                        <span style="font-size:24px; margin-bottom:8px">👥</span>
                        <span>No players found in cache</span>
                    </div>`;
                return;
            }
            
            players.forEach(p => {
                const card = document.createElement('div');
                card.className = 'pm-card';
                card.innerHTML = `
                    <div class="pm-card-top">
                        <img class="pm-avatar" src="https://minotar.net/avatar/${p.name}/32.png" 
                             onerror="this.src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAAAAABW71eEAAAARElEQVR42mP8/58BDBjhGqgEho+B4aNg+BgYPgYqMECnEQ9s2IDiH2w4j6QY9EEDX8n20AdVDPqggS/4+tEHDXzB1w8AYU7y34W8vU0AAAAASUVORK5CYII='">
                        <span class="pm-name">${p.name}</span>
                    </div>
                    <div class="pm-actions">
                        <button class="pm-action-btn op" data-cmd="op ${p.name}">OP</button>
                        <button class="pm-action-btn kick" data-cmd="kick ${p.name} Kicked by admin.">KICK</button>
                        <button class="pm-action-btn ban" data-cmd="ban ${p.name} Banned by admin.">BAN</button>
                        <button class="pm-action-btn ip" data-cmd="ban-ip ${p.name}">IP</button>
                    </div>
                `;
                
                // Bind buttons
                card.querySelectorAll('.pm-action-btn').forEach(btn => {
                    btn.onclick = async () => {
                        const cmd = btn.dataset.cmd;
                        try {
                            await window.api.serverCommand(cmd);
                            toast(`Sent command: /${cmd.split(' ')[0]}`);
                        } catch (e) { toast('Command failed: ' + e.message, 'error'); }
                    };
                });
                
                pmList.appendChild(card);
            });
        } catch (e) {
            pmList.innerHTML = `<div class="pm-empty"><span>Error loading players</span></div>`;
            toast('Failed to load player data: ' + e.message, 'error');
        }
    }

    $('#pm-refresh-btn').onclick = async () => {
        const btn = $('#pm-refresh-btn');
        btn.classList.add('spinning');
        await loadPlayers();
        setTimeout(() => btn.classList.remove('spinning'), 500);
    };

    $('#pm-add-btn').onclick = () => {
        const input = $('#pm-add-input');
        const name = input.value.trim();
        if (!name) return;
        // Just send a whitelist add or op command? We'll just whitelist by default
        window.api.serverCommand(`whitelist add ${name}`)
            .then(() => toast(`Added ${name} to whitelist`))
            .catch(e => toast(e.message, 'error'));
        input.value = '';
    };

    // ══════════════════════════════════════════════════════════
    //  SERVER PROPERTIES (key-value form)
    // ══════════════════════════════════════════════════════════
    // Properties that have a fixed set of options
    const PROP_OPTIONS = {
        'gamemode':    ['survival', 'creative', 'adventure', 'spectator'],
        'difficulty':  ['peaceful', 'easy', 'normal', 'hard'],
        'level-type':  ['minecraft:normal', 'minecraft:flat', 'minecraft:large_biomes', 'minecraft:amplified'],
    };
    const PROP_BOOL = [
        'online-mode', 'pvp', 'allow-flight', 'allow-nether',
        'white-list', 'enable-command-block', 'spawn-animals',
        'spawn-monsters', 'spawn-npcs', 'force-gamemode',
        'hardcore', 'enable-query', 'enable-rcon'
    ];

    async function loadProperties() {
        const form = $('#props-form');
        form.innerHTML = '';
        try {
            const props = await window.api.propsGet();
            window.JtgUI.renderProperties(props, form, PROP_OPTIONS, PROP_BOOL);
        } catch (e) {
            form.textContent = 'Could not load server properties. Open this page again to retry.';
            toast('Failed to load properties', 'error');
        }
    }

    $('#btn-save-props').onclick = async () => {
        if (!window.JtgUI.validateProperties()) return;
        const inputs = $$('#props-form .prop-input[data-key]');
        const obj = {};
        inputs.forEach(el => { obj[el.dataset.key] = el.value; });
        if (obj['server-port']) {
            const p = parseInt(obj['server-port'], 10);
            if (!p || p <= 0 || p > 65535) {
                toast('Invalid server port. Resetting to 25565.', 'warning');
                obj['server-port'] = '25565';
                const portInput = $(`input[data-key="server-port"]`);
                if (portInput) portInput.value = '25565';
            }
        }
        try {
            await window.JtgUI.runOperation('Saving server properties',()=>window.api.propsSave(obj));
            window.JtgUI.propertiesSaved();
            toast('Properties saved! Restart server to apply.');
        } catch (e) { toast(e.message, 'error'); }
    };

    // ══════════════════════════════════════════════════════════
    //  BACKUPS
    // ══════════════════════════════════════════════════════════
    window.api.onBackupProgress(pct => {
        $('#backup-bar').style.width = pct + '%';
        $('#backup-label').textContent = `Backing up... ${pct}%`;
    });

    let currentBackupsDir = '/storage/emulated/0/JtgCraft/server/backups';

    async function loadBackups() {
        const container = $('#backups-list-container');
        const countBadge = $('#backups-count-badge');
        const pathEl = $('#backup-storage-path');
        if (!container) return;

        try {
            const res = (window.api && window.api.backupsList) ? await window.api.backupsList() : { backups: [], backupsDir: '' };
            const list = (res && Array.isArray(res.backups)) ? res.backups : [];
            if (res && res.backupsDir) currentBackupsDir = res.backupsDir;
            
            if (pathEl) {
                pathEl.textContent = currentBackupsDir;
                pathEl.title = currentBackupsDir;
            }
            if (countBadge) countBadge.textContent = list.length;

            container.innerHTML = '';
            if (list.length === 0) {
                container.innerHTML = `
                    <div class="backups-empty-state">
                        <div class="icon" style="font-size: 2rem; margin-bottom: 8px;">🗄️</div>
                        <h4 style="margin: 0 0 4px; color: var(--text-1);">No Backups Created Yet</h4>
                        <p style="margin: 0; font-size: 0.85rem; color: var(--text-3);">Create a Full Server or Worlds backup above to protect your server.</p>
                    </div>
                `;
                return;
            }

            list.forEach(item => {
                const row = document.createElement('div');
                row.className = 'backup-item-row';
                const isWorlds = item.type === 'worlds' || item.fileName.startsWith('worlds_');
                const icon = isWorlds ? '🌍' : '📦';
                const typeName = isWorlds ? 'Worlds Only' : 'Full Server';
                const typeBadgeClass = isWorlds ? 'badge-worlds' : 'badge-full';

                row.innerHTML = `
                    <div class="backup-item-info">
                        <div class="backup-item-icon ${isWorlds ? 'is-worlds' : 'is-full'}">
                            ${icon}
                        </div>
                        <div class="backup-item-meta">
                            <span class="backup-item-name" title="${item.fileName}">${item.fileName}</span>
                            <div class="backup-item-details">
                                <span class="backup-badge ${typeBadgeClass}">${typeName}</span>
                                <span>•</span>
                                <span>${item.sizeMB || '0.0'} MB</span>
                                <span>•</span>
                                <span>${item.dateStr || ''}</span>
                            </div>
                        </div>
                    </div>
                    <div class="backup-item-actions">
                        <button class="btn-backup-restore btn secondary btn-sm" type="button" title="Restore this backup">♻️ Restore</button>
                        <button class="btn-backup-delete btn danger btn-sm" type="button" title="Delete backup">🗑️ Delete</button>
                    </div>
                `;

                // Restore button handler
                const btnRestore = row.querySelector('.btn-backup-restore');
                if (btnRestore) {
                    btnRestore.onclick = async () => {
                        if (!confirm(`Are you sure you want to RESTORE "${item.fileName}"?\n\nWarning: This will extract and overwrite server files with the contents of this backup!`)) {
                            return;
                        }
                        btnRestore.disabled = true;
                        btnRestore.textContent = '⏳ Restoring...';
                        try {
                            const r = await window.api.backupRestore(item.fileName);
                            if (r && r.error) {
                                toast('Restore failed: ' + r.error, 'error');
                            } else {
                                toast(`Backup "${item.fileName}" successfully restored! Please restart the server.`, 'success');
                            }
                        } catch (e) {
                            toast('Restore failed: ' + e.message, 'error');
                        } finally {
                            btnRestore.disabled = false;
                            btnRestore.textContent = '♻️ Restore';
                        }
                    };
                }

                // Delete button handler
                const btnDel = row.querySelector('.btn-backup-delete');
                if (btnDel) {
                    btnDel.onclick = async () => {
                        if (!confirm(`Are you sure you want to permanently delete backup "${item.fileName}"?`)) {
                            return;
                        }
                        btnDel.disabled = true;
                        try {
                            await window.api.backupDelete(item.fileName);
                            toast(`Backup "${item.fileName}" deleted.`, 'info');
                            await loadBackups();
                        } catch (e) {
                            toast('Delete failed: ' + e.message, 'error');
                            btnDel.disabled = false;
                        }
                    };
                }

                container.appendChild(row);
            });
        } catch (e) {
            if (container) {
                container.innerHTML = `
                    <div class="backups-empty-state">
                        <div class="icon">⚠️</div>
                        <h4 style="color: var(--text-1);">Failed to load backups</h4>
                        <p style="color: var(--text-3); font-size: 0.85rem;">${e.message}</p>
                    </div>
                `;
            }
        }
    }

    async function doBackup(mode) {
        const btnFull = $('#btn-backup-full');
        const btnWorlds = $('#btn-backup-worlds');
        if (btnFull) btnFull.disabled = true;
        if (btnWorlds) btnWorlds.disabled = true;
        const progressWrap = $('#backup-progress');
        if (progressWrap) progressWrap.classList.remove('hidden');
        const bar = $('#backup-bar');
        if (bar) bar.style.width = '0%';
        const label = $('#backup-label');
        if (label) label.textContent = 'Preparing backup...';

        try {
            const result = await window.api.createBackup(mode);
            toast(`Backup complete! (${result.sizeMB} MB)`);
            if (label) label.textContent = `Done — saved to backups folder`;
            await loadBackups();
        } catch (e) {
            toast('Backup failed: ' + e.message, 'error');
            if (label) label.textContent = 'Backup failed.';
        } finally {
            if (btnFull) btnFull.disabled = false;
            if (btnWorlds) btnWorlds.disabled = false;
        }
    }

    const btnBackupFull = $('#btn-backup-full');
    if (btnBackupFull) btnBackupFull.onclick = () => doBackup('full');

    const btnBackupWorlds = $('#btn-backup-worlds');
    if (btnBackupWorlds) btnBackupWorlds.onclick = () => doBackup('worlds');

    const btnRefreshBackups = $('#btn-refresh-backups');
    if (btnRefreshBackups) btnRefreshBackups.onclick = () => loadBackups();

    const btnCopyBackupPath = $('#btn-copy-backup-path');
    if (btnCopyBackupPath) {
        btnCopyBackupPath.onclick = () => {
            if (currentBackupsDir) {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(currentBackupsDir);
                }
                toast('Storage directory copied: ' + currentBackupsDir, 'success');
            }
        };
    }

    // ══════════════════════════════════════════════════════════
    //  SETTINGS
    // ══════════════════════════════════════════════════════════
    async function loadSettings() {
        if (!paperVersions || paperVersions.length === 0) {
            try { paperVersions = await window.api.fetchPaperVersions(); } catch (e) {}
        }
        const sel = $('#settings-version-select');
        if (sel) {
            sel.innerHTML = '';
            (paperVersions || []).forEach(v => {
                const opt = document.createElement('option');
                opt.value = v; opt.textContent = `${v} · Auto: Java ${window.JtgJavaPolicy.requiredJava(v)}`;
                sel.appendChild(opt);
            });
        }

        // Load Server Resources Config (.mcmeta.json)
        try {
            const cfg = await window.api.getServerConfig();
            if (cfg) {
                const inpName = $('#settings-inp-name');
                const sldRam = $('#settings-sld-ram');
                const lblRam = $('#settings-lbl-ram');
                const sldCpu = $('#settings-sld-cpu');
                const lblCpu = $('#settings-lbl-cpu');
                const inpPath = $('#settings-inp-path');

                if (inpName && cfg.name) inpName.value = cfg.name;
                const ramVal = cfg.ramMB || cfg.ram || 2048;
                if (sldRam) {
                    sldRam.value = ramVal;
                    if (lblRam) lblRam.textContent = ramVal;
                }
                const cpuVal = cfg.cpuCores || cfg.cpu || 2;
                if (sldCpu) {
                    sldCpu.value = cpuVal;
                    if (lblCpu) lblCpu.textContent = cpuVal;
                }
                if (inpPath) {
                    inpPath.value = cfg.path || savedDir || '';
                }
            }
        } catch (_) {}

        // Load Java Settings
        try {
            const javaSettings = await window.api.getJavaSettings();
            const selJava = $('#settings-java-select');
            const lblActive = $('#lbl-active-java');
            if (selJava && javaSettings) {
                selJava.value = javaSettings.configuredSetting || 'auto';
                if (lblActive) {
                    const isAuto = javaSettings.configuredSetting === 'auto';
                    lblActive.textContent = `Java ${javaSettings.activeVersion} ${isAuto ? `(Auto for MC ${javaSettings.serverVersion})` : '(Manual Override)'}`;
                }
            }
        } catch (_) {}

        await window.JtgUI.loadResources().catch(error => toast(error.message,'error'));
        // Load changelog
        loadChangelog();
    }

    window.api.onDownloadProgress(pct => window.JtgUI.operationProgress(pct,'Downloading…'));
    if (window.api.onJavaDownloadProgress) window.api.onJavaDownloadProgress(data => window.JtgUI.operationProgress(data.percent,data.status));
    const btnSettingsReinstall = $('#btn-settings-reinstall');
    if (btnSettingsReinstall) btnSettingsReinstall.onclick = async () => {
        try { await window.JtgUI.runOperation('Reinstalling server',()=>window.api.serverReinstall()); toast('Reinstall complete!'); }
        catch (error) { toast(error.message,'error'); }
    };
    const btnSettingsVersion = $('#btn-settings-version');
    if (btnSettingsVersion) btnSettingsVersion.onclick = async () => {
        const version = $('#settings-version-select').value;
        if (!version || !confirm(`Change server version to ${version}? This will download the new jar.`)) return;
        try { await window.JtgUI.runOperation(`Installing Paper ${version}`,()=>window.api.serverChangeVersion(version)); await loadSettings(); toast(`Version changed to ${version}`); }
        catch (error) { toast(error.message,'error'); }
    };
    const btnSettingsJava = $('#btn-settings-java');
    if (btnSettingsJava) btnSettingsJava.onclick = async () => {
        const selection = $('#settings-java-select').value;
        try { await window.JtgUI.runOperation('Applying Java '+selection,()=>window.api.setJavaVersion(selection)); await loadSettings(); toast('Java configured. Restart the server to apply.'); }
        catch (error) { toast(error.message,'error'); }
    };

    const btnBatteryOpt = $('#btn-battery-opt');
    if (btnBatteryOpt) {
        btnBatteryOpt.onclick = async () => {
            try {
                if (window.api && window.api.requestBatteryOptimization) {
                    const res = await window.api.requestBatteryOptimization();
                    if (res && res.isIgnoring) {
                        toast('Unrestricted background running is already active!', 'success');
                    } else {
                        toast('Prompted for Unrestricted Battery permission.', 'info');
                    }
                }
            } catch (e) {
                toast(e.message || 'Could not open battery settings', 'error');
            }
        };
    }

    const btnSettingsDelete = $('#btn-settings-delete');
    if (btnSettingsDelete) {
        btnSettingsDelete.onclick = async () => {
            if (!confirm('Are you absolutely sure you want to DELETE this server and all its files? This CANNOT be undone!')) return;
            try {
                await window.JtgUI.runOperation('Deleting server',()=>window.api.serverDelete());
                toast('Server deleted.');
                if (statsInterval) { clearInterval(statsInterval); statsInterval = null; }
                const sbName = $('#sidebar-server-name');
                if (sbName) sbName.textContent = 'Server';
                const drName = $('#drawer-server-name');
                if (drName) drName.textContent = 'Server';

                // Cleanly reset create screen so it is never stuck or disabled
                resetCreateScreen();
                showScreen('screen-create');
                checkAndDisplayStorageBanner(savedDir);
            } catch (e) {
                toast(e.message, 'error');
            }
        };
    };

    // ══════════════════════════════════════════════════════════
    //  PLUGIN MANAGER
    // ══════════════════════════════════════════════════════════
    let currentPluginQuery = '';
    let currentPluginCat = 'all';
    let searchDebounceTimer = null;

    // Tab switching: Browse vs Installed
    function switchPluginTab(tab) {
        const btnBrowse = $('#btn-plugin-tab-browse');
        const btnInstalled = $('#btn-plugin-tab-installed');
        const viewBrowse = $('#plugins-view-browse');
        const viewInstalled = $('#plugins-view-installed');

        if (!btnBrowse || !btnInstalled || !viewBrowse || !viewInstalled) return;

        if (tab === 'browse') {
            btnBrowse.className = 'btn primary sm active';
            btnInstalled.className = 'btn secondary sm';
            viewBrowse.classList.remove('hidden');
            viewInstalled.classList.add('hidden');
        } else {
            btnBrowse.className = 'btn secondary sm';
            btnInstalled.className = 'btn primary sm active';
            viewBrowse.classList.add('hidden');
            viewInstalled.classList.remove('hidden');
            loadInstalledPlugins();
        }
    }

    if ($('#btn-plugin-tab-browse')) {
        $('#btn-plugin-tab-browse').onclick = () => switchPluginTab('browse');
    }
    if ($('#btn-plugin-tab-installed')) {
        $('#btn-plugin-tab-installed').onclick = () => switchPluginTab('installed');
    }

    // Search input with debounce and clear button
    const inpSearch = $('#plugin-search-input');
    const btnClearSearch = $('#plugin-search-clear');

    if (inpSearch) {
        inpSearch.oninput = () => {
            const val = inpSearch.value.trim();
            if (btnClearSearch) btnClearSearch.classList.toggle('hidden', val.length === 0);
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
                currentPluginQuery = val;
                loadPlugins(currentPluginQuery, currentPluginCat);
            }, 350);
        };
    }

    if (btnClearSearch && inpSearch) {
        btnClearSearch.onclick = () => {
            inpSearch.value = '';
            btnClearSearch.classList.add('hidden');
            currentPluginQuery = '';
            loadPlugins('', currentPluginCat);
        };
    }

    // Category filter chips
    $$('.plugin-chips .chip').forEach(chip => {
        chip.onclick = () => {
            $$('.plugin-chips .chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentPluginCat = chip.dataset.cat || 'all';
            loadPlugins(currentPluginQuery, currentPluginCat);
        };
    });

    // Upload local .jar button
    const btnPluginUpload = $('#btn-plugin-upload');
    if (btnPluginUpload) {
        btnPluginUpload.onclick = async () => {
            try {
                const res = await window.api.pluginUploadLocal();
                if (res && res.success && res.installed && res.installed.length > 0) {
                    toast(`Installed ${res.installed.length} plugin(s) successfully!`);
                    switchPluginTab('installed');
                    await loadInstalledPlugins();
                    await loadPlugins();
                }
            } catch (err) {
                toast(err.message || 'Plugin upload failed', 'error');
            }
        };
    }

    // Load and render browse store plugins
    async function loadPlugins(query = currentPluginQuery, category = currentPluginCat) {
        const grid = $('#plugin-grid');
        if (!grid) return;

        grid.innerHTML = `
            <div class="plugins-loading-state" style="grid-column: 1 / -1;">
                <div style="font-size: 32px; margin-bottom: 8px;">⏳</div>
                <p>Searching plugins...</p>
            </div>
        `;

        try {
            const res = await window.api.pluginSearch(query, category);
            const plugins = Array.isArray(res) ? res : (res && Array.isArray(res.hits) ? res.hits : []);
            grid.innerHTML = '';

            if (!plugins || plugins.length === 0) {
                grid.innerHTML = `
                    <div class="plugins-empty-state" style="grid-column: 1 / -1;">
                        <div class="icon">🔍</div>
                        <h4>No plugins found</h4>
                        <p>Try searching for a different keyword like "ViaVersion", "LuckPerms", or "Essentials".</p>
                    </div>
                `;
                return;
            }

            plugins.forEach(p => {
                const card = document.createElement('div');
                card.className = 'plugin-card';

                // Format downloads (e.g. 1.2M, 45.3K)
                let dlsFormatted = '0';
                if (p.downloads >= 1000000) dlsFormatted = (p.downloads / 1000000).toFixed(1) + 'M';
                else if (p.downloads >= 1000) dlsFormatted = (p.downloads / 1000).toFixed(1) + 'K';
                else dlsFormatted = String(p.downloads || 0);

                const iconSrc = p.icon_url || p.iconUrl;
                const iconHtml = iconSrc
                    ? `<img class="plugin-card-icon" src="${iconSrc}" onerror="this.outerHTML='<div class=\\'plugin-card-icon\\'>🧩</div>'">`
                    : `<div class="plugin-card-icon">🧩</div>`;

                const isInstalled = p.isInstalled;
                const btnLabel = isInstalled ? '✅ Installed' : '📥 Install';
                const btnClass = isInstalled ? 'plugin-btn-install installed' : 'plugin-btn-install ready';
                const catLabel = (p.categories && p.categories[0]) ? p.categories[0] : 'Plugin';

                card.innerHTML = `
                    <div>
                        <div class="plugin-card-header">
                            ${iconHtml}
                            <div class="plugin-card-info">
                                <div class="plugin-card-title" title="${p.title}">${p.title}</div>
                                <div class="plugin-card-author">by ${p.author || 'Community'}</div>
                                <div class="plugin-card-meta">
                                    <span class="plugin-badge-dl">⬇ ${dlsFormatted}</span>
                                    <span class="plugin-badge-cat">${catLabel}</span>
                                </div>
                            </div>
                        </div>
                        <div class="plugin-card-desc" title="${p.description || ''}">${p.description || 'No description provided.'}</div>
                    </div>
                    <div class="plugin-card-footer">
                        <span style="font-size: 11px; color: var(--text-3);">${p.isCurated ? '★ Curated' : 'Modrinth'}</span>
                        <button class="${btnClass}" ${isInstalled ? 'disabled' : ''} data-id="${p.id || p.slug}">${btnLabel}</button>
                    </div>
                `;

                const btnInstall = card.querySelector('.plugin-btn-install');
                if (!isInstalled && btnInstall) {
                    btnInstall.onclick = async () => {
                        await installPluginFromCard(p, btnInstall);
                    };
                }

                grid.appendChild(card);
            });
        } catch (err) {
            grid.innerHTML = `
                <div class="plugins-empty-state" style="grid-column: 1 / -1;">
                    <div class="icon">⚠️</div>
                    <h4>Failed to load plugins</h4>
                    <p>${err.message || 'Check your internet connection and try again.'}</p>
                </div>
            `;
        }
    }

    // Install a plugin from card with progress feedback
    async function installPluginFromCard(p, btn) {
        btn.disabled = true;
        btn.className = 'plugin-btn-install downloading';
        btn.innerHTML = '⏳ Resolving...';

        try {
            const verInfo = await window.api.pluginGetVersion(p.slug || p.id);
            const downloadUrl = verInfo.downloadUrl;
            const fileName = verInfo.fileName || p.defaultFileName;

            btn.innerHTML = '⬇ Downloading...';

            await window.api.pluginInstall({
                projectId: p.slug || p.id,
                downloadUrl: downloadUrl,
                fileName: fileName
            });

            btn.className = 'plugin-btn-install installed';
            btn.innerHTML = '✅ Installed';
            p.isInstalled = true;

            toast(`Plugin "${p.title}" installed successfully! Restart server to activate.`);
            await loadInstalledPlugins();
        } catch (err) {
            btn.disabled = false;
            btn.className = 'plugin-btn-install ready';
            btn.innerHTML = '📥 Install';
            toast(`Failed to install ${p.title}: ${err.message}`, 'error');
        }
    }

    // Live download progress hook
    if (window.api.onPluginDownloadProgress) {
        window.api.onPluginDownloadProgress(({ fileName, pct }) => {
            const downloadingBtns = $$('.plugin-btn-install.downloading');
            downloadingBtns.forEach(b => {
                b.innerHTML = `⬇ ${pct}%`;
            });
        });
    }

    // Load and render installed plugins list
    async function loadInstalledPlugins() {
        const container = $('#installed-plugins-list');
        const countBadge = $('#installed-plugins-count');

        try {
            const list = await window.api.pluginsGetInstalled();
            if (countBadge) countBadge.textContent = list.length;

            if (!container) return;
            container.innerHTML = '';

            if (list.length === 0) {
                container.innerHTML = `
                    <div class="plugins-empty-state">
                        <div class="icon">📦</div>
                        <h4>No plugins installed yet</h4>
                        <p>Browse the plugin store or click "Upload .jar" to add plugins to your server.</p>
                    </div>
                `;
                return;
            }

            list.forEach(item => {
                const row = document.createElement('div');
                row.className = `installed-plugin-row ${item.enabled ? '' : 'is-disabled'}`;

                row.innerHTML = `
                    <div class="installed-info">
                        <div class="installed-icon ${item.enabled ? '' : 'disabled'}">
                            ${item.enabled ? '🧩' : '💤'}
                        </div>
                        <div class="installed-meta">
                            <span class="installed-name" title="${item.fileName}">${item.name}</span>
                            <div class="installed-details">
                                <span>${item.sizeMB ? item.sizeMB + ' MB' : (item.size ? formatSize(item.size) : '0 MB')}</span>
                                <span>•</span>
                                <span class="status-label" style="color: ${item.enabled ? 'var(--green-400)' : 'var(--text-3)'}">
                                    ${item.enabled ? 'Enabled' : 'Disabled'}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div class="installed-actions">
                        <label class="plugin-switch" title="${item.enabled ? 'Disable plugin' : 'Enable plugin'}">
                            <input type="checkbox" ${item.enabled ? 'checked' : ''}>
                            <span class="plugin-slider"></span>
                        </label>
                        <button class="btn-plugin-delete" title="Delete plugin">🗑</button>
                    </div>
                `;

                // Toggle enabled/disabled switch
                const chk = row.querySelector('input[type="checkbox"]');
                chk.onchange = async () => {
                    chk.disabled = true;
                    try {
                        await window.api.pluginToggle(item.fileName);
                        toast(`Plugin "${item.name}" ${chk.checked ? 'enabled' : 'disabled'}. Server restart required.`);
                        await loadInstalledPlugins();
                    } catch (err) {
                        chk.checked = !chk.checked;
                        chk.disabled = false;
                        toast(err.message, 'error');
                    }
                };

                // Delete plugin button
                const btnDel = row.querySelector('.btn-plugin-delete');
                btnDel.onclick = async () => {
                    if (confirm(`Are you sure you want to delete "${item.fileName}"?`)) {
                        try {
                            await window.api.pluginDelete(item.fileName);
                            toast(`Plugin "${item.name}" deleted.`);
                            await loadInstalledPlugins();
                            loadPlugins(); // refresh installed status in store
                        } catch (err) {
                            toast(err.message, 'error');
                        }
                    }
                };

                container.appendChild(row);
            });
        } catch (err) {
            if (container) {
                container.innerHTML = `
                    <div class="plugins-empty-state">
                        <div class="icon">⚠️</div>
                        <h4>Could not load installed plugins</h4>
                        <p>${err.message}</p>
                    </div>
                `;
            }
        }
    }

    // ══════════════════════════════════════════════════════════
    //  UPDATE SYSTEM, GITHUB HOT-PATCH & CHANGELOG
    // ══════════════════════════════════════════════════════════
    let activeUpdateInfo = null;
    let pendingNativeUpdate = false;
    const autoDownloadUpdates = $('#auto-download-updates');
    if (autoDownloadUpdates) {
        autoDownloadUpdates.checked = localStorage.getItem('jtg-auto-download') !== 'false';
        autoDownloadUpdates.onchange = () => localStorage.setItem('jtg-auto-download', String(autoDownloadUpdates.checked));
    }

    async function loadChangelog() {
        const display = $('#update-changelog-display');
        const lblVersion = $('#lbl-installed-version');

        try {
            const currentAppVer = await window.api.getAppVersion();
            const data = await window.api.getUpdateChangelog();
            const installed = window.api.getInstalledUpdateInfo ? await window.api.getInstalledUpdateInfo() : null;
            const versionCode = installed?.versionCode || (data?.version === currentAppVer ? data.versionCode : '?');
            if (lblVersion) {
                lblVersion.textContent = `v${currentAppVer} (Build #${versionCode})`;
            }
            const sidebarVer = document.querySelector('.sidebar-version span:not(.dot)');
            if (sidebarVer) {
                sidebarVer.textContent = `v${currentAppVer}`;
            }

            if (display && data && data.changelog && data.changelog.length > 0) {
                const latest = data.changelog[0];
                let html = `<div style="margin-top: 4px;">`;
                html += `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">`;
                html += `<span style="font-size: 13px; color: var(--text-1); font-weight: 600;">${latest.title}</span>`;
                html += `<span class="changelog-version-tag">v${latest.version}</span>`;
                html += `</div><ul class="changelog-list">`;
                const maxItems = Math.min(latest.changes.length, 5);
                for (let i = 0; i < maxItems; i++) {
                    html += `<li>${latest.changes[i]}</li>`;
                }
                if (latest.changes.length > 5) {
                    html += `<li style="color: var(--text-3);">+${latest.changes.length - 5} more updates...</li>`;
                }
                html += `</ul></div>`;
                display.innerHTML = html;
            }
        } catch (_) {}
    }

    // Call once on startup
    loadChangelog();

    // Manual update check button
    const btnCheckUpdates = $('#btn-check-updates');
    const btnDownloadUpdate = $('#btn-download-update');
    const btnRelaunchUpdate = $('#btn-relaunch-update');
    const statusEl = $('#update-check-status');
    const badgePill = $('#update-badge-pill');
    const progressBox = $('#hot-update-progress-container');
    const barProgress = $('#hot-update-bar');
    const lblPct = $('#hot-update-pct-label');
    const lblFile = $('#hot-update-file-label');

    if (btnCheckUpdates) {
        btnCheckUpdates.onclick = async () => {
            btnCheckUpdates.disabled = true;
            statusEl.textContent = 'Analyzing GitHub repository for updates...';
            statusEl.style.color = 'var(--text-2)';

            try {
                const result = await window.api.checkForUpdatesManual();
                if (result.updateAvailable) {
                    activeUpdateInfo = result;
                    if (badgePill) {
                        badgePill.className = 'badge-pill update-ready';
                        badgePill.textContent = `● Update Available: v${result.version}`;
                    }
                    statusEl.textContent = `🚀 Update v${result.version} (Build #${result.versionCode}) is ready! ${result.nativeUpdate ? 'Full app upgrade available.' : 'Web update available.'}`;
                    statusEl.style.color = 'var(--green-400)';
                    
                    if (btnDownloadUpdate) btnDownloadUpdate.classList.remove('hidden');
                    if (btnRelaunchUpdate) btnRelaunchUpdate.classList.add('hidden');

                    toast(`New version v${result.version} found! Click 'Download & Apply' to update.`);
                } else if (result.error) {
                    statusEl.textContent = `Update check note: ${result.error}`;
                    statusEl.style.color = 'var(--yellow-500)';
                } else {
                    if (badgePill) {
                        badgePill.className = 'badge-pill up-to-date';
                        badgePill.textContent = `● Up to Date`;
                    }
                    statusEl.textContent = result.message || `You're up to date! Jtg-Craft v${result.version} is running.`;
                    statusEl.style.color = 'var(--green-400)';
                    if (btnDownloadUpdate) btnDownloadUpdate.classList.add('hidden');
                    if (btnRelaunchUpdate) btnRelaunchUpdate.classList.add('hidden');
                    toast('Your Jtg-Craft is running the latest version!');
                }
            } catch (e) {
                statusEl.textContent = 'Could not complete update check. Please verify internet connection.';
                statusEl.style.color = 'var(--red-500)';
            }

            btnCheckUpdates.disabled = false;
        };
    }

    // 1-Click Hot-Update Download Button (No .exe needed!)
    if (btnDownloadUpdate) {
        btnDownloadUpdate.onclick = async () => {
            btnDownloadUpdate.disabled = true;
            btnDownloadUpdate.innerHTML = '⏳ Downloading from GitHub...';
            if (btnCheckUpdates) btnCheckUpdates.disabled = true;
            if (progressBox) progressBox.classList.remove('hidden');

            try {
                const res = await window.api.applyGithubHotUpdate();
                if (res && res.success) {
                    pendingNativeUpdate = !!res.nativeUpdate;
                    statusEl.textContent = pendingNativeUpdate ? 'App update downloaded and verified. Tap Install App Update to continue.' : `Update v${res.version} downloaded and verified. Relaunch to activate.`;
                    statusEl.style.color = 'var(--green-400)';
                    btnDownloadUpdate.classList.add('hidden');
                    if (btnRelaunchUpdate) {
                        btnRelaunchUpdate.innerHTML = pendingNativeUpdate ? 'Install App Update' : 'Relaunch to Apply Update';
                        btnRelaunchUpdate.classList.remove('hidden');
                    }
                    if (progressBox) progressBox.classList.add('hidden');
                    toast('Update downloaded and verified. Activate it using the button below.', 'success');
                }
            } catch (err) {
                btnDownloadUpdate.disabled = false;
                btnDownloadUpdate.innerHTML = '⚡ Download & Apply Update';
                statusEl.textContent = `Failed to apply update: ${err.message}`;
                statusEl.style.color = 'var(--red-500)';
                toast(`Update failed: ${err.message}`, 'error');
            }

            if (btnCheckUpdates) btnCheckUpdates.disabled = false;
        };
    }

    // Safely save server and relaunch app to apply changes (PC parity)
    if (btnRelaunchUpdate) {
        btnRelaunchUpdate.onclick = async () => {
            if (pendingNativeUpdate) {
                btnRelaunchUpdate.disabled = true;
                try {
                    const result = await window.api.installNativeUpdate();
                    statusEl.textContent = result.permissionRequired
                        ? 'Allow app installs in Android Settings, then tap Install App Update again.'
                        : 'Confirm the app upgrade in the Android installer.';
                } catch (error) { toast(error.message, 'error'); }
                finally { btnRelaunchUpdate.disabled = false; }
                return;
            }
            btnRelaunchUpdate.disabled = true;
            btnRelaunchUpdate.innerHTML = '⏳ Saving World & Relaunching...';
            toast('Safely saving world & relaunching Jtg-Craft...', 'info');

            try {
                if (window.api && window.api.relaunchApp) {
                    await window.api.relaunchApp();
                } else {
                    window.location.reload();
                }
            } catch (error) {
                toast(error.message || 'Update activation failed. Retry after the server stops.', 'error');
                btnRelaunchUpdate.disabled = false;
                btnRelaunchUpdate.innerHTML = 'Relaunch to Apply Update';
            }
        };
    }

    // Live Hot-Update Download Progress listener
    if (window.api.onHotUpdateProgress) {
        window.api.onHotUpdateProgress(({ current, total, file, pct }) => {
            const percent = pct !== undefined ? pct : (total > 0 ? Math.round((current * 100) / total) : 0);
            if (barProgress) barProgress.style.width = `${percent}%`;
            if (lblPct) lblPct.textContent = `${percent}%`;
            if (lblFile) lblFile.textContent = `Syncing ${file} (${current}/${total})...`;
        });
    }

    // Startup background update detection
    if (window.api.onHotUpdateAvailable) {
        window.api.onHotUpdateAvailable((updateInfo) => {
            activeUpdateInfo = updateInfo;
            if (updateInfo.prepared) {
                pendingNativeUpdate = !!updateInfo.nativeUpdate;
                if (btnDownloadUpdate) btnDownloadUpdate.classList.add('hidden');
                if (btnRelaunchUpdate) {
                    btnRelaunchUpdate.classList.remove('hidden');
                    btnRelaunchUpdate.innerHTML = pendingNativeUpdate ? 'Install App Update' : 'Relaunch to Apply Update';
                }
                if (progressBox) progressBox.classList.add('hidden');
                if (statusEl) statusEl.textContent = pendingNativeUpdate ? 'App update downloaded and verified. Tap Install App Update to continue.' : 'Update downloaded and verified. Relaunch when ready.';
                toast('Update downloaded. Open Settings to activate it.');
                return;
            }
            if (badgePill) {
                badgePill.className = 'badge-pill update-ready';
                badgePill.textContent = `● Update Available: v${updateInfo.version}`;
            }
            if (btnDownloadUpdate) btnDownloadUpdate.classList.remove('hidden');
            if (statusEl) {
                statusEl.textContent = `New update v${updateInfo.version} detected on GitHub! Click 'Download & Apply Update' to sync.`;
                statusEl.style.color = 'var(--green-400)';
            }
            toast(`Jtg-Craft v${updateInfo.version} is available! Open Settings to update.`);
        });
    }

    // Automatic background update check on app launch
    setTimeout(async () => {
        try {
            if (window.api && window.api.checkForUpdatesManual) {
                const res = await window.api.checkForUpdatesManual();
                if (res && res.updateAvailable) {
                    activeUpdateInfo = res;
                    if (badgePill) {
                        badgePill.className = 'badge-pill update-ready';
                        badgePill.textContent = `● Update Available: v${res.version}`;
                    }
                    if (btnDownloadUpdate) btnDownloadUpdate.classList.remove('hidden');
                    toast(`Update v${res.version} is available! Go to Settings to install.`);
                }
            }
        } catch (_) {}
    }, 2500);

    // Initialize mobile app boot flow (storage, splash, direct-to-create or dashboard)
    initAppOnStartup();
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
