// ============================================================
//  Jtg-craft — Renderer (all UI logic)
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {

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

    function showPanel(id) {
        $$('.panel').forEach(p => { p.classList.add('hidden'); p.classList.remove('active'); });
        $$('.nav-item').forEach(n => n.classList.remove('active'));
        const panel = document.getElementById(id);
        panel.classList.remove('hidden');
        panel.classList.add('active');
        const nav = $(`.nav-item[data-panel="${id}"]`);
        if (nav) nav.classList.add('active');
    }

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    }

    // ── Title bar ───────────────────────────────────────────
    $('#tb-min').onclick  = () => window.api.winMinimize();
    $('#tb-max').onclick  = () => window.api.winMaximize();
    $('#tb-close').onclick = () => window.api.winClose();

    // ── System info for sliders ─────────────────────────────
    const sysInfo = await window.api.getSystemInfo();
    const ramMax = Math.max(2048, sysInfo.totalRamMB - 2048); // leave 2GB for OS
    const cpuMax = sysInfo.cores;

    const sldRam = $('#sld-ram');
    const sldCpu = $('#sld-cpu');
    sldRam.max = ramMax;
    sldRam.value = Math.min(2048, ramMax);
    sldCpu.max = cpuMax;
    sldCpu.value = Math.max(1, Math.floor(cpuMax / 2));

    $('#lbl-ram').textContent = sldRam.value;
    $('#lbl-cpu').textContent = sldCpu.value;
    $('#lbl-ram-max').textContent = (ramMax / 1024).toFixed(0) + ' GB';
    $('#lbl-cpu-max').textContent = cpuMax;

    sldRam.oninput = () => { $('#lbl-ram').textContent = sldRam.value; };
    sldCpu.oninput = () => { $('#lbl-cpu').textContent = sldCpu.value; };

    // ── Saved directory (localStorage) ──────────────────────
    let savedDir = localStorage.getItem('jtg-install-dir') || '';
    let paperVersions = [];

    // ── Setup progress listener ─────────────────────────────
    window.api.onSetupProgress(data => {
        if (data.step === 'java') {
            $('#step-java-status').textContent = data.status;
            $('#setup-java-bar').style.width = data.percent + '%';
        }
    });

    // ══════════════════════════════════════════════════════════
    //  WELCOME SCREEN
    // ══════════════════════════════════════════════════════════
    $('#btn-get-started').onclick = async () => {
        // If no dir saved, ask user to pick
        if (!savedDir) {
            savedDir = await window.api.pickDirectory();
            if (!savedDir) return;
            localStorage.setItem('jtg-install-dir', savedDir);
        }

        // Check disk space
        const disk = await window.api.checkDiskSpace(savedDir);
        if (!disk.ok) {
            toast(`Low disk space (${disk.freeGB} GB free). Need at least 2 GB.`, 'error');
            return;
        }

        // Check if server already exists
        const check = await window.api.checkExistingServer(savedDir);
        if (check.exists) {
            // Jump straight to dashboard
            $('#sidebar-server-name').textContent = check.name;
            initDashboard();
            showScreen('screen-dashboard');
        } else {
            // Run automated setup
            showScreen('screen-setup');
            await runAutoSetup();
        }
    };

    // ══════════════════════════════════════════════════════════
    //  AUTO SETUP FLOW
    // ══════════════════════════════════════════════════════════
    async function runAutoSetup() {
        const stepJava = $('#step-java');
        const stepPaper = $('#step-paper');

        // ── Step 1: Java ──────────────────────────
        stepJava.classList.add('active');
        $('#step-java-icon').textContent = '⏳';
        $('#step-java-icon').classList.add('spinning');
        $('#step-java-status').textContent = 'Checking Java...';
        $('#setup-overall-label').textContent = 'Checking Java installation...';

        try {
            const javaCheck = await window.api.checkJava(savedDir);

            if (javaCheck.found) {
                // Java already available
                $('#step-java-icon').textContent = '✅';
                $('#step-java-icon').classList.remove('spinning');
                $('#step-java-status').textContent = javaCheck.portable ? 'Portable Java found' : `System Java ${javaCheck.version}`;
                $('#setup-java-bar').style.width = '100%';
                stepJava.classList.remove('active');
                stepJava.classList.add('done');
            } else {
                // Need to download Java
                $('#step-java-status').textContent = 'Downloading...';
                $('#setup-overall-label').textContent = 'Downloading Java 21 JRE (this may take a few minutes)...';

                const result = await window.api.installJava(savedDir);

                $('#step-java-icon').textContent = '✅';
                $('#step-java-icon').classList.remove('spinning');
                $('#step-java-status').textContent = result.alreadyInstalled ? 'Already installed' : 'Installed successfully';
                $('#setup-java-bar').style.width = '100%';
                stepJava.classList.remove('active');
                stepJava.classList.add('done');
            }
        } catch (e) {
            $('#step-java-icon').textContent = '❌';
            $('#step-java-icon').classList.remove('spinning');
            $('#step-java-status').textContent = 'Failed';
            stepJava.classList.remove('active');
            stepJava.classList.add('error');
            toast('Java installation failed: ' + e.message, 'error');
            $('#setup-overall-label').textContent = 'Setup failed. Please try again.';
            return;
        }

        // ── Step 2: Fetch Paper versions ──────────
        stepPaper.classList.add('active');
        $('#step-paper-icon').textContent = '⏳';
        $('#step-paper-icon').classList.add('spinning');
        $('#step-paper-status').textContent = 'Fetching...';
        $('#setup-overall-label').textContent = 'Fetching Paper server versions...';

        try {
            paperVersions = await window.api.fetchPaperVersions();

            $('#step-paper-icon').textContent = '✅';
            $('#step-paper-icon').classList.remove('spinning');
            $('#step-paper-status').textContent = `${paperVersions.length} versions found`;
            $('#setup-paper-bar').style.width = '100%';
            stepPaper.classList.remove('active');
            stepPaper.classList.add('done');
        } catch (e) {
            $('#step-paper-icon').textContent = '❌';
            $('#step-paper-icon').classList.remove('spinning');
            $('#step-paper-status').textContent = 'Failed';
            stepPaper.classList.remove('active');
            stepPaper.classList.add('error');
            toast('Failed to fetch Paper versions: ' + e.message, 'error');
            $('#setup-overall-label').textContent = 'Setup failed. Please try again.';
            return;
        }

        // ── All done → go to create screen ────────
        $('#setup-overall-label').textContent = 'All set! Proceeding to server creation...';

        setTimeout(() => {
            // Populate versions in create screen
            const sel = $('#sel-version');
            sel.innerHTML = '';
            paperVersions.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v; opt.textContent = v;
                sel.appendChild(opt);
            });
            sel.disabled = false;

            $('#inp-dir').value = savedDir;
            showScreen('screen-create');
        }, 800);
    }

    // ══════════════════════════════════════════════════════════
    //  CREATE SCREEN
    // ══════════════════════════════════════════════════════════
    $('#btn-pick-dir').onclick = async () => {
        const dir = await window.api.pickDirectory();
        if (dir) {
            savedDir = dir;
            localStorage.setItem('jtg-install-dir', savedDir);
            $('#inp-dir').value = dir;
        }
    };

    // Download progress
    window.api.onDownloadProgress(pct => {
        $('#create-bar').style.width = pct + '%';
        $('#create-status').textContent = `Downloading... ${pct}%`;
    });

    $('#btn-create').onclick = async () => {
        const name = $('#inp-name').value.trim();

        // Validate name
        if (!name || !/^[a-zA-Z0-9_]+$/.test(name)) {
            toast('Invalid server name. Use only letters, numbers, underscores.', 'error');
            return;
        }

        if (!savedDir) {
            toast('Please choose an install directory first.', 'error');
            return;
        }

        const version = $('#sel-version').value;
        if (!version) { toast('Select a Paper version.', 'error'); return; }

        const btn = $('#btn-create');
        btn.disabled = true;

        try {
            // Download Paper jar directly
            $('#create-progress').classList.remove('hidden');
            $('#create-status').textContent = `Downloading Paper ${version}...`;

            await window.api.createServer({
                dir: savedDir,
                name: name,
                ram: parseInt(sldRam.value),
                cpu: parseInt(sldCpu.value),
                version: version
            });

            toast('Server created successfully!');
            $('#sidebar-server-name').textContent = name;
            initDashboard();
            showScreen('screen-dashboard');

            // Auto-start
            setTimeout(() => startServer(), 500);

        } catch (e) {
            toast(e.message || 'Server creation failed', 'error');
            btn.disabled = false;
        }
    };

    // ══════════════════════════════════════════════════════════
    //  DASHBOARD
    // ══════════════════════════════════════════════════════════
    let statsInterval = null;

    function initDashboard() {
        // Sidebar nav
        $$('.nav-item').forEach(item => {
            item.onclick = () => {
                const panel = item.dataset.panel;
                showPanel(panel);
                // Lazy-load panel data
                if (panel === 'panel-files')   loadFileManager('');
                if (panel === 'panel-plugins') { loadPlugins(); loadInstalledPlugins(); }
                if (panel === 'panel-worlds')  loadWorlds();
                if (panel === 'panel-players') loadPlayers();
                if (panel === 'panel-props')   loadProperties();
                if (panel === 'panel-settings') loadSettings();
                // panel-playit is now a static "Coming Soon" page, no loading needed
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
                $('#cpu-bar').style.width = s.cpuPercent + '%';
            } catch (_) {}
        }, 3000);
    }

    // ── Console ─────────────────────────────────────────────
    const consoleEl = $('#console-log');

    function appendConsole(text) {
        consoleEl.textContent += text;
        consoleEl.scrollTop = consoleEl.scrollHeight;
    }

    window.api.onConsoleData(data => appendConsole(data));

    // Playit Console listener (kept for future beta re-enable, but no UI target now)
    // window.api.onPlayitConsoleData is still registered in preload but the panel is static

    window.api.onServerState(state => {
        const running = state === 'running';
        $('#btn-start').disabled = running;
        $('#btn-stop').disabled = !running;
        $('#btn-restart').disabled = !running;
        $('#inp-cmd').disabled = !running;
        $('#btn-cmd').disabled = !running;
    });

    async function startServer() {
        try {
            consoleEl.textContent = '';
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

    $('#btn-restart').onclick = async () => {
        try {
            appendConsole('[Jtg-craft] Restarting server...\n');
            await window.api.serverStop();
            // Wait for process to end, then restart
            const waitForStop = setInterval(async () => {
                const running = await window.api.serverStatus();
                if (!running) {
                    clearInterval(waitForStop);
                    setTimeout(startServer, 1000);
                }
            }, 1000);
        } catch (e) { toast(e.message, 'error'); }
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

    async function loadFileManager(relDir) {
        fmCurrentRel = relDir;
        updateBreadcrumb(relDir);
        const listEl = $('#fm-list');
        listEl.innerHTML = '';
        $('#fm-editor-wrap').classList.add('hidden');

        try {
            const items = await window.api.fmList(relDir || null);

            // Parent directory row
            if (relDir) {
                const parentRel = relDir.includes('/') ? relDir.substring(0, relDir.lastIndexOf('/')) : '';
                const row = document.createElement('div');
                row.className = 'fm-row';
                row.innerHTML = `<span class="icon">↩</span><span class="name">..</span>`;
                row.onclick = () => loadFileManager(parentRel);
                listEl.appendChild(row);
            }

            items.forEach(item => {
                const isJar = !item.isDir && item.name.toLowerCase().endsWith('.jar');
                const row = document.createElement('div');
                row.className = 'fm-row' + (isJar ? ' fm-jar' : '');
                const icon = item.isDir ? '📁' : (isJar ? '☕' : '📄');
                const badge = isJar ? ' <span class="fm-jar-badge" title="Binary JAR archive (cannot open in editor)">JAR</span>' : '';

                row.innerHTML = `
                    <span class="icon">${icon}</span>
                    <span class="name" title="${isJar ? 'JAR archive cannot be opened in text editor' : item.name}">${item.name}${badge}</span>
                    <span class="size">${item.isDir ? '' : formatSize(item.size)}</span>
                    <span class="actions">
                        <button class="fm-action ren" title="Rename">✏</button>
                        <button class="fm-action del" title="Delete">🗑</button>
                    </span>
                `;

                // Click to navigate or open
                if (isJar) {
                    const notifyJar = (e) => {
                        e.stopPropagation();
                        toast('JAR files cannot be opened in the text editor.', 'warning');
                    };
                    row.querySelector('.name').onclick = notifyJar;
                    row.querySelector('.icon').onclick = notifyJar;
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

                // Rename
                row.querySelector('.ren').onclick = async (e) => {
                    e.stopPropagation();
                    const newName = prompt('Rename to:', item.name);
                    if (newName && newName !== item.name) {
                        try {
                            await window.api.fmRename(item.rel, newName);
                            loadFileManager(fmCurrentRel);
                        } catch (err) { toast(err.message, 'error'); }
                    }
                };

                // Delete
                row.querySelector('.del').onclick = async (e) => {
                    e.stopPropagation();
                    if (confirm(`Delete "${item.name}"?`)) {
                        try {
                            await window.api.fmDelete(item.rel);
                            loadFileManager(fmCurrentRel);
                            toast(`Deleted ${item.name}`);
                        } catch (err) { toast(err.message, 'error'); }
                    }
                };

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

    // Upload via Button
    const fileInput = $('#fm-file-input');
    $('#fm-upload-btn').onclick = () => fileInput.click();
    fileInput.onchange = async () => {
        if (!fileInput.files.length) return;
        const paths = Array.from(fileInput.files).map(f => f.path);
        try {
            await window.api.fmUpload(fmCurrentRel, paths);
            toast('Files uploaded successfully');
            loadFileManager(fmCurrentRel);
        } catch (e) { toast('Upload failed: ' + e.message, 'error'); }
        fileInput.value = ''; // reset
    };

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
        if (!e.dataTransfer.files.length) return;
        const paths = Array.from(e.dataTransfer.files).map(f => f.path);
        try {
            await window.api.fmUpload(fmCurrentRel, paths);
            toast('Files uploaded successfully');
            loadFileManager(fmCurrentRel);
        } catch (err) { toast('Upload failed: ' + err.message, 'error'); }
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
                    <div class="meta">Size: ${w.sizeMB} MB</div>
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
            const players = await window.api.playersGetCache();
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
            for (const [key, val] of Object.entries(props)) {
                const div = document.createElement('div');
                div.className = 'prop-field';

                const label = document.createElement('label');
                label.textContent = key;
                div.appendChild(label);

                if (PROP_OPTIONS[key]) {
                    const sel = document.createElement('select');
                    sel.dataset.key = key;
                    sel.className = 'prop-input';
                    PROP_OPTIONS[key].forEach(o => {
                        const opt = document.createElement('option');
                        opt.value = o; opt.textContent = o;
                        if (o === val) opt.selected = true;
                        sel.appendChild(opt);
                    });
                    div.appendChild(sel);
                } else if (PROP_BOOL.includes(key)) {
                    const sel = document.createElement('select');
                    sel.dataset.key = key;
                    sel.className = 'prop-input';
                    ['true', 'false'].forEach(o => {
                        const opt = document.createElement('option');
                        opt.value = o; opt.textContent = o;
                        if (o === val) opt.selected = true;
                        sel.appendChild(opt);
                    });
                    div.appendChild(sel);
                } else {
                    const inp = document.createElement('input');
                    inp.type = 'text';
                    inp.dataset.key = key;
                    inp.className = 'prop-input';
                    inp.value = val;
                    div.appendChild(inp);
                }

                form.appendChild(div);
            }
        } catch (e) {
            toast('Failed to load properties', 'error');
        }
    }

    $('#btn-save-props').onclick = async () => {
        const inputs = $$('.prop-input');
        const obj = {};
        inputs.forEach(el => { obj[el.dataset.key] = el.value; });
        try {
            await window.api.propsSave(obj);
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

    async function doBackup(mode) {
        $('#backup-progress').classList.remove('hidden');
        $('#backup-bar').style.width = '0%';
        $('#backup-label').textContent = 'Preparing backup...';
        try {
            const result = await window.api.createBackup(mode);
            toast(`Backup complete! (${result.sizeMB} MB)`);
            $('#backup-label').textContent = `Done — saved to backups folder`;
        } catch (e) {
            toast('Backup failed: ' + e.message, 'error');
            $('#backup-label').textContent = 'Backup failed.';
        }
    }

    $('#btn-backup-full').onclick = () => doBackup('full');
    $('#btn-backup-worlds').onclick = () => doBackup('worlds');

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
                opt.value = v; opt.textContent = v;
                sel.appendChild(opt);
            });
        }

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

        // Load changelog
        loadChangelog();
    }

    function showSettingsProgress(label) {
        $('#settings-progress').classList.remove('hidden');
        $('#settings-progress-bar').style.width = '0%';
        $('#settings-progress-label').textContent = label;
    }

    // Reuse the same download event
    window.api.onDownloadProgress(pct => {
        const bar = $('#settings-progress-bar');
        if (bar) {
            bar.style.width = pct + '%';
            $('#settings-progress-label').textContent = `Downloading... ${pct}%`;
        }
    });

    if (window.api.onJavaDownloadProgress) {
        window.api.onJavaDownloadProgress(data => {
            const bar = $('#settings-progress-bar');
            const label = $('#settings-progress-label');
            const wrap = $('#settings-progress');
            if (wrap) wrap.classList.remove('hidden');
            if (bar) bar.style.width = (data.percent || 0) + '%';
            if (label) label.textContent = data.status || `Downloading Java ${data.version}...`;
        });
    }

    $('#btn-settings-reinstall').onclick = async () => {
        showSettingsProgress('Reinstalling server jar...');
        try {
            await window.api.serverReinstall();
            toast('Reinstall complete!');
        } catch (e) {
            toast(e.message, 'error');
        }
        $('#settings-progress').classList.add('hidden');
    };

    $('#btn-settings-version').onclick = async () => {
        const ver = $('#settings-version-select').value;
        if (!ver) return;
        if (!confirm(`Change server version to ${ver}? This will download the new jar.`)) return;
        
        showSettingsProgress(`Downloading version ${ver}...`);
        try {
            await window.api.serverChangeVersion(ver);
            toast(`Version successfully changed to ${ver}`);
            loadSettings(); // refresh java active status
        } catch (e) {
            toast(e.message, 'error');
        }
        $('#settings-progress').classList.add('hidden');
    };

    const btnSettingsJava = $('#btn-settings-java');
    if (btnSettingsJava) {
        btnSettingsJava.onclick = async () => {
            const sel = $('#settings-java-select');
            const val = sel ? sel.value : 'auto';
            btnSettingsJava.disabled = true;

            showSettingsProgress(`Applying Java ${val === 'auto' ? 'Auto Mode' : val}...`);
            try {
                const res = await window.api.setJavaVersion(val);
                const lblActive = $('#lbl-active-java');
                if (lblActive && res) {
                    const isAuto = res.configuredSetting === 'auto';
                    lblActive.textContent = `Java ${res.activeVersion} ${isAuto ? '(Auto)' : '(Manual Override)'}`;
                }
                toast(`Java ${res.activeVersion} successfully configured! Restart server to apply.`);
            } catch (e) {
                toast(e.message || 'Failed to update Java version', 'error');
            } finally {
                $('#settings-progress').classList.add('hidden');
                btnSettingsJava.disabled = false;
            }
        };
    }

    $('#btn-settings-delete').onclick = async () => {
        if (!confirm('Are you absolutely sure you want to DELETE this server and all its files? This CANNOT be undone!')) return;
        try {
            await window.api.serverDelete();
            toast('Server deleted.');
            // Reset to welcome
            showScreen('screen-welcome');
            if (statsInterval) { clearInterval(statsInterval); statsInterval = null; }
            $('#sidebar-server-name').textContent = 'Server';
        } catch (e) {
            toast(e.message, 'error');
        }
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
            const plugins = await window.api.pluginSearch(query, category);
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

                const iconHtml = p.iconUrl
                    ? `<img class="plugin-card-icon" src="${p.iconUrl}" onerror="this.outerHTML='<div class=\\'plugin-card-icon\\'>🧩</div>'">`
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
        btn.innerHTML = '⏳ Fetching...';

        try {
            let downloadUrl = p.directDownload;
            let fileName = p.defaultFileName;

            if (!downloadUrl) {
                btn.innerHTML = '⏳ Resolving...';
                const verInfo = await window.api.pluginGetVersion(p.slug || p.id);
                downloadUrl = verInfo.downloadUrl;
                fileName = verInfo.fileName;
            }

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
                                <span>${item.sizeMB} MB</span>
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
    //  UPDATE SYSTEM & CHANGELOG
    // ══════════════════════════════════════════════════════════
    async function loadChangelog() {
        const display = $('#update-changelog-display');
        if (!display) return;

        try {
            const data = await window.api.getUpdateChangelog();
            if (data && data.changelog && data.changelog.length > 0) {
                const latest = data.changelog[0];
                let html = `<div style="margin-top: 4px;">`;
                html += `<span style="font-size: 12px; color: var(--text-1); font-weight: 600;">${latest.title}</span>`;
                html += `<span class="changelog-version-tag">v${latest.version}</span>`;
                html += `<ul class="changelog-list">`;
                const maxItems = Math.min(latest.changes.length, 4);
                for (let i = 0; i < maxItems; i++) {
                    html += `<li>${latest.changes[i]}</li>`;
                }
                if (latest.changes.length > 4) {
                    html += `<li style="color: var(--text-3);">+${latest.changes.length - 4} more...</li>`;
                }
                html += `</ul></div>`;
                display.innerHTML = html;
            }
        } catch (e) {
            // Silent fail — changelog is optional
        }
    }

    // Manual update check button
    const btnCheckUpdates = $('#btn-check-updates');
    if (btnCheckUpdates) {
        btnCheckUpdates.onclick = async () => {
            const statusEl = $('#update-check-status');
            btnCheckUpdates.disabled = true;
            statusEl.textContent = 'Checking for updates...';
            statusEl.style.color = 'var(--text-2)';

            try {
                const result = await window.api.checkForUpdatesManual();
                if (result.updateAvailable) {
                    statusEl.textContent = `Update available: v${result.version}`;
                    statusEl.style.color = 'var(--green-400)';
                    toast(`Update available: v${result.version}! It will download automatically.`);
                } else if (result.error) {
                    statusEl.textContent = `Check failed: ${result.error}`;
                    statusEl.style.color = 'var(--yellow-500)';
                } else {
                    statusEl.textContent = `You're up to date! (v${result.version})`;
                    statusEl.style.color = 'var(--green-400)';
                }
            } catch (e) {
                statusEl.textContent = 'Update check failed.';
                statusEl.style.color = 'var(--red-500)';
            }

            btnCheckUpdates.disabled = false;
        };
    }

    // ══════════════════════════════════════════════════════════
    //  UPDATER (sidebar notification)
    // ══════════════════════════════════════════════════════════
    if (window.api.onUpdateAvailable) {
        window.api.onUpdateAvailable(version => {
            $('#updater-ui').classList.remove('hidden');
            $('#updater-status').textContent = `Downloading v${version}...`;
            $('#updater-progress-track').style.display = 'block';
            $('#btn-install-update').style.display = 'none';
        });

        window.api.onUpdateProgress(pct => {
            $('#updater-bar').style.width = pct + '%';
        });

        window.api.onUpdateDownloaded(() => {
            $('#updater-status').textContent = 'Update Ready to Install!';
            $('#updater-progress-track').style.display = 'none';
            $('#btn-install-update').style.display = 'block';
        });

        $('#btn-install-update').onclick = () => {
            window.api.installUpdate();
        };
    }
});
