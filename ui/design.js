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
    window.JtgUI = { appendConsole, clearConsole, renderProperties, validateProperties, propertiesSaved, applyTheme, setProcessState };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
