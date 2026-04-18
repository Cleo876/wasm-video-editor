/**
 * @name Advanced Transitions Engine
 * @version 3.5.0
 * @developer Forge™
 * @description A highly scalable ecosystem for transitions. Features reactive single-click inspector routing, drag interception, Filmora-style blocks, and automated GitHub syncing.
 */
(function() {
    const MODULE_ID = 'advanced_transitions_engine';

    if (typeof Store === 'undefined' || typeof Player === 'undefined' || typeof TimelineModule === 'undefined') {
        console.error(`❌ [${MODULE_ID}] Core environment not found. Ensure editor is fully loaded.`);
        return;
    }

    // --- THE TRANSITION ECOSYSTEM REGISTRY ---
    window.TRANSITION_REGISTRY = {
        'dissolve': {
            name: 'Cross Dissolve',
            description: 'Smoothly blends the transparency of the clip from 0% to 100%.',
            defaultDuration: 1.0,
            autoReverse: true,
            getUI: (params) => `<div class="text-xs text-gray-500 italic mt-2">Smoothly blends transparency.</div>`,
            getParams: () => ({}),
            onRender: null, 
            getFFmpeg: (edge, duration, params) => `fade=t=${edge}:st=0:d=${duration}:alpha=1`
        },
        'fade': {
            name: 'Fade to Color',
            description: 'Fades the video into a solid color block. Great for fading to black or white.',
            defaultDuration: 1.0,
            autoReverse: true, 
            getUI: (params) => `
                <div class="mt-3">
                    <label class="block text-[10px] text-gray-500 font-bold mb-1 uppercase">Fade Color</label>
                    <input type="color" id="trans_color_picker" value="${params.color || '#000000'}" class="w-full h-8 bg-transparent cursor-pointer rounded border border-[#333]">
                </div>
            `,
            getParams: () => ({ color: document.getElementById('trans_color_picker').value }),
            onRender: (ctx, canvas, progress, params) => {
                ctx.fillStyle = params.color || '#000000';
                ctx.globalAlpha = 1 - progress; 
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.globalAlpha = 1.0;
            },
            getFFmpeg: (edge, duration, params) => {
                const c = (params.color || '#000000').replace('#', '0x');
                return `fade=t=${edge}:st=0:d=${duration}:c=${c}`;
            }
        }
    };

    const TransitionsEngine = {
        isActive: true,
        panel: null,
        activeSelection: null, 
        previewTimer: null,
        
        // Native Host Hooks
        originalDrawToCanvas: null,
        originalRenderTrack: null,
        originalStartDrag: null,
        originalSelectClip: null,
        globalClickHandler: null,

        guideMarkdown: `# The Transition Creator Guide

Welcome to the Transition Ecosystem! You can easily add custom transitions to the editor by uploading a \`.js\` file.

Here is the exact step-by-step blueprint to create your own:

### Step 1: The File Setup
Create a new \`.js\` file and include these mandatory headers at the top so the automated GitHub updater can track versions:
\`\`\`javascript
/**
 * @name Color Wipe
 * @version 1.0.0
 * @developer Your Name
 * @description Swipes a solid color block across the screen.
 */
\`\`\`

### Step 2: Register the Engine
Add your logic to the global registry object.
\`\`\`javascript
window.TRANSITION_REGISTRY['color_wipe'] = {
    name: 'Color Wipe',
    description: 'Swipes a solid color block across the screen.',
    defaultDuration: 1.0,
    
    // Auto-Reverse Magic:
    // By default, the engine runs your animation backward if placed at the END of a clip.
    // Set to false if your transition should always play the exact same way.
    autoReverse: true, 
\`\`\`

### Step 3: Build the UI (Optional)
Let users customize it in the inspector!
\`\`\`javascript
    getUI: (params) => \`
        <div class="mt-3">
            <label style="font-size: 10px; color: gray; font-weight: bold;">WIPE COLOR</label>
            <input type="color" id="wipe_color" value="\${params.color || '#ffffff'}" style="width: 100%; height: 32px; background: transparent; cursor: pointer; border-radius: 4px; border: 1px solid #333;">
        </div>
    \`,
    // Extract the values when the user makes changes
    getParams: () => ({ color: document.getElementById('wipe_color').value }),
\`\`\`

### Step 4: The Canvas Render (Preview)
This is the visual magic! It runs 60 times a second during preview playback. 
\`progress\` is a decimal that goes from \`0.0\` (start) to \`1.0\` (end).
\`\`\`javascript
    onRender: (ctx, canvas, progress, params) => {
        ctx.fillStyle = params.color || '#ffffff';
        // Draws a rectangle growing from width 0 to full width
        ctx.fillRect(0, 0, canvas.width * progress, canvas.height);
    },
\`\`\`

### Step 5: FFmpeg Export
Translate your effect into FFmpeg string format for the final MP4 render.
\`\`\`javascript
    getFFmpeg: (edge, duration, params) => {
        // Example: Using standard fade as a fallback
        const hexColor = (params.color || '#ffffff').replace('#', '0x');
        return "fade=t=" + edge + ":st=0:d=" + duration + ":c=" + hexColor; 
    }
}; // Close the registry object
\`\`\`
`,
        
        async init() {
            console.log(`[${MODULE_ID}] Booting Advanced Ecosystem...`);
            
            await this.loadPersistentTransitions();
            this.checkForUpdates(); 
            
            this.injectStyles();
            this.injectMenuButton();
            this.createEditorPanel();
            this.hijackCoreLifecycles();
            this.bindGlobalEvents();
            this.registerExportMiddleware();
            
            if (typeof UI !== 'undefined') UI.refreshTimeline();
        },

        // --- 1. PERSISTENCE & GITHUB SYNC ENGINE ---
        async loadPersistentTransitions() {
            try {
                const saved = await DB.get('system', 'custom_transitions_registry');
                if (saved && saved.scripts) {
                    saved.scripts.forEach(script => {
                        try { eval(script); } catch(e) {}
                    });
                }
            } catch (e) {
                console.warn("Could not load persistent transitions.");
            }
        },

        async saveCustomTransition(scriptString) {
            try {
                let saved = await DB.get('system', 'custom_transitions_registry');
                if (!saved) saved = { id: 'custom_transitions_registry', scripts: [] };
                saved.scripts.push(scriptString);
                await DB.put('system', saved);
                eval(scriptString); 
                Notify.show("Custom Transition Installed", "fa-puzzle-piece");
                this.updatePanelUI(); 
            } catch (e) {
                alert("Failed to install transition script.");
            }
        },

        async checkForUpdates() {
            try {
                const repoUrl = 'https://api.github.com/repos/Cleo876/wasm-video-editor/contents/Transitions';
                const response = await fetch(repoUrl);
                if (!response.ok) return;
                const files = await response.json();
                
                let updatedCount = 0;
                let saved = await DB.get('system', 'custom_transitions_registry');
                if (!saved) saved = { id: 'custom_transitions_registry', scripts: [] };

                for (const file of files) {
                    if (file.name.endsWith('.js')) {
                        const rawRes = await fetch(file.download_url);
                        const scriptStr = await rawRes.text();
                        
                        const nameMatch = scriptStr.match(/@name\s+(.+)/);
                        const versionMatch = scriptStr.match(/@version\s+([\d\.]+)/);
                        
                        if (nameMatch && versionMatch) {
                            const name = nameMatch[1].trim();
                            const version = versionMatch[1].trim();
                            
                            let existingIdx = -1;
                            let shouldUpdate = true;
                            
                            for (let i = 0; i < saved.scripts.length; i++) {
                                const exNameMatch = saved.scripts[i].match(/@name\s+(.+)/);
                                const exVerMatch = saved.scripts[i].match(/@version\s+([\d\.]+)/);
                                if (exNameMatch && exNameMatch[1].trim() === name) {
                                    existingIdx = i;
                                    if (exVerMatch && this.compareVersions(version, exVerMatch[1].trim()) <= 0) {
                                        shouldUpdate = false; 
                                    }
                                    break;
                                }
                            }
                            
                            if (shouldUpdate) {
                                if (existingIdx > -1) {
                                    saved.scripts[existingIdx] = scriptStr;
                                } else {
                                    saved.scripts.push(scriptStr); 
                                }
                                eval(scriptStr); 
                                updatedCount++;
                            }
                        }
                    }
                }

                if (updatedCount > 0) {
                    await DB.put('system', saved);
                    Notify.show(`Synced ${updatedCount} Transitions`, 'fa-cloud-arrow-down');
                    if (this.panel && this.panel.style.display === 'block') this.updatePanelUI();
                }
            } catch(e) {}
        },

        compareVersions(v1, v2) {
            const p1 = v1.split('.').map(Number);
            const p2 = v2.split('.').map(Number);
            for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
                const n1 = p1[i] || 0;
                const n2 = p2[i] || 0;
                if (n1 > n2) return 1;
                if (n1 < n2) return -1;
            }
            return 0;
        },

        // --- 2. UI & PANEL ENGINE ---
        injectStyles() {
            const style = document.createElement('style');
            style.id = `${MODULE_ID}_styles`;
            style.innerHTML = `
                .t-clip { position: relative; overflow: hidden; }
                .trans-block {
                    position: absolute;
                    top: 0; bottom: 0;
                    background: repeating-linear-gradient(45deg, rgba(0,210,190,0.2), rgba(0,210,190,0.2) 5px, rgba(0,0,0,0.5) 5px, rgba(0,0,0,0.5) 10px);
                    border: 1px solid rgba(0,210,190,0.8);
                    z-index: 5; /* Sat safely below resize handles (z-index: 10) */
                    cursor: pointer;
                    transition: background 0.2s, border-color 0.2s;
                    pointer-events: auto;
                }
                .trans-block:hover { background: rgba(0,210,190,0.4); }
                .trans-block.active-edit { background: rgba(0,210,190,0.6); border-color: #fff; z-index: 6; }
                
                .trans-block.in { left: 0; border-left: none; border-top-right-radius: 4px; border-bottom-right-radius: 4px; }
                .trans-block.out { right: 0; border-right: none; border-top-left-radius: 4px; border-bottom-left-radius: 4px; }
                
                #teTransTypeDisplay { transition: all 0.2s; }
                #teTransTypeDisplay:hover { border-color: #00d2be; }
                
                .markdown-body h1 { font-size: 1.4em; font-weight: bold; color: #fff; margin-bottom: 0.5em; border-bottom: 1px solid #333; padding-bottom: 4px; }
                .markdown-body h3 { font-size: 1.1em; font-weight: bold; color: #00d2be; margin-top: 1.2em; margin-bottom: 0.5em; }
                .markdown-body p { margin-bottom: 1em; line-height: 1.5; font-size: 0.8rem; }
                .markdown-body pre { background: #0a0a0a; padding: 10px; border-radius: 6px; overflow-x: auto; margin-bottom: 1em; border: 1px solid #333; }
                .markdown-body code { font-family: monospace; font-size: 0.75rem; color: #a5b4fc; }
                .markdown-body p > code { background: #0a0a0a; padding: 2px 4px; border-radius: 4px; border: 1px solid #333; color: #fca5a5; }
                .markdown-body ol { list-style-type: decimal; padding-left: 20px; margin-bottom: 1em; font-size: 0.8rem; }
                .markdown-body li { margin-bottom: 0.25em; }
                .markdown-body strong { color: #fff; }
            `;
            document.head.appendChild(style);
        },

        injectMenuButton() {
            const header = document.querySelector('header .flex-1');
            if (!header) return;

            const menuWrapper = document.createElement('div');
            menuWrapper.className = 'menu-wrapper relative h-full flex-shrink-0';
            menuWrapper.id = 'transitions_menu_btn';
            menuWrapper.innerHTML = `
                <div class="menu-btn"><i class="fa-solid fa-shuffle mr-1"></i> Transitions</div>
                <div class="dropdown">
                    <div class="dropdown-item" id="btnAddTransIn">Add Start Transition</div>
                    <div class="dropdown-item" id="btnAddTransOut">Add End Transition</div>
                    <div class="dropdown-item border-t border-gray-700" id="btnImportTrans">Import Custom Transition (.js)...</div>
                </div>
            `;
            
            const projStatus = document.getElementById('projectStatus');
            header.insertBefore(menuWrapper, projStatus);

            document.getElementById('btnAddTransIn').onclick = () => this.addTransitionToSelected('in');
            document.getElementById('btnAddTransOut').onclick = () => this.addTransitionToSelected('out');
            document.getElementById('btnImportTrans').onclick = () => this.triggerImport();
        },

        addTransitionToSelected(edge) {
            if (!Store.selectedClipId) {
                alert("Please select a video or image clip first.");
                return;
            }
            const clip = this.getClipById(Store.selectedClipId);
            if (!clip) return;
            
            if (!clip.transitions) clip.transitions = {};
            clip.transitions[edge] = { type: 'dissolve', duration: window.TRANSITION_REGISTRY['dissolve'].defaultDuration, params: {} };
            
            Store.saveState();
            UI.refreshTimeline();
            this.openEditor(clip.id, edge);
        },

        triggerImport() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.js';
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const scriptStr = await file.text();
                this.saveCustomTransition(scriptStr);
            };
            input.click();
        },

        createEditorPanel() {
            const p = document.createElement('div');
            p.id = 'transitionEditorPanel';
            p.style.cssText = `
                position: fixed; top: 100px; right: 50px; width: 340px;
                background: #1a1a1a; border: 1px solid #333; border-radius: 8px;
                box-shadow: 0 20px 50px rgba(0,0,0,0.9); z-index: 99999;
                display: none; font-family: 'Inter', sans-serif; overflow: hidden;
            `;
            
            p.innerHTML = `
                <div id="teTransHeader" class="bg-[#222] p-3 border-b border-[#333] flex justify-between items-center cursor-move select-none">
                    <span class="text-xs font-bold text-white"><i class="fa-solid fa-shuffle text-teal-400 mr-2"></i>TRANSITION EDITOR</span>
                    <button id="teTransClose" class="text-gray-500 hover:text-white"><i class="fa-solid fa-xmark"></i></button>
                </div>
                
                <div class="flex border-b border-[#333] bg-[#111]">
                    <button id="teTabSettings" class="flex-1 py-2 text-xs font-bold text-teal-400 border-b-2 border-teal-400 transition">Settings</button>
                    <button id="teTabGuide" class="flex-1 py-2 text-xs font-bold text-gray-500 border-b-2 border-transparent hover:text-gray-300 transition">Dev Guide</button>
                </div>

                <div id="teSettingsView" class="p-4 flex flex-col gap-3">
                    <div class="flex items-center gap-2 mb-2">
                        <span class="text-[10px] font-bold text-gray-500 uppercase bg-[#111] px-2 py-1 rounded border border-[#333]" id="teTransEdgeBadge">START</span>
                        <span class="text-xs text-gray-400 truncate flex-1" id="teTransClipName">Clip Name</span>
                    </div>

                    <div>
                        <label class="block text-[10px] uppercase text-gray-500 font-bold mb-1">Transition Type</label>
                        <div class="relative">
                            <div id="teTransTypeDisplay" class="w-full bg-[#111] border border-[#333] text-white p-2 text-sm rounded cursor-pointer flex justify-between items-center">
                                <span id="teTransTypeName" class="font-bold text-teal-400">Select...</span>
                                <i class="fa-solid fa-chevron-down text-[10px]"></i>
                            </div>
                            <div id="teTransTypeList" class="absolute top-full left-0 right-0 bg-[#1a1a1a] border border-[#333] mt-1 rounded shadow-xl z-50 hidden max-h-56 overflow-y-auto custom-scroll"></div>
                        </div>
                    </div>
                    
                    <div class="mt-2">
                        <label class="block text-[10px] uppercase text-gray-500 font-bold mb-1">Duration (Seconds)</label>
                        <input type="number" id="teTransDuration" step="0.1" min="0.1" class="w-full bg-[#111] border border-[#333] text-white p-2 text-sm rounded outline-none focus:border-teal-500">
                    </div>
                    
                    <div id="teTransDynamicUI" class="border-t border-[#333] mt-1 pt-1 empty:hidden"></div>
                    
                    <div class="grid grid-cols-2 gap-2 mt-3">
                        <button id="teTransPreview" class="bg-[#333] hover:bg-[#444] border border-[#555] text-white py-2 rounded text-xs font-bold flex items-center justify-center transition">
                            <i class="fa-solid fa-play mr-2"></i> PREVIEW
                        </button>
                        <button id="teTransRemove" class="bg-red-900/30 hover:bg-red-800 border border-red-900 text-red-300 py-2 rounded text-xs font-bold transition">
                            REMOVE
                        </button>
                    </div>
                </div>

                <div id="teGuideView" class="hidden flex-col h-[380px] bg-[#121212]">
                    <div id="teGuideContent" class="flex-1 p-4 overflow-y-auto custom-scroll text-gray-300">
                        ${this.parseMarkdown(this.guideMarkdown)}
                    </div>
                    <div class="p-3 border-t border-[#333] bg-[#1a1a1a]">
                        <button id="teDownloadGuide" class="w-full bg-teal-600 hover:bg-teal-500 text-white py-2 rounded text-xs font-bold transition flex items-center justify-center shadow-lg shadow-teal-900/20">
                            <i class="fa-solid fa-download mr-2"></i> DOWNLOAD .MD
                        </button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(p);
            this.panel = p;
            
            document.getElementById('teTabSettings').onclick = () => this.switchTab('settings');
            document.getElementById('teTabGuide').onclick = () => this.switchTab('guide');
            document.getElementById('teTransClose').onclick = () => this.closeEditor();
            document.getElementById('teTransRemove').onclick = () => this.removeTransition();
            document.getElementById('teTransPreview').onclick = () => this.playSmartPreview();
            document.getElementById('teDownloadGuide').onclick = () => this.downloadGuide();
            document.getElementById('teTransDuration').onchange = () => this.commitModifications();
            
            const displayBtn = document.getElementById('teTransTypeDisplay');
            const typeList = document.getElementById('teTransTypeList');
            displayBtn.onclick = () => typeList.classList.toggle('hidden');

            this.makeDraggable(p, document.getElementById('teTransHeader'));
        },

        handleTypeChange(type) {
            document.getElementById('teTransTypeList').classList.add('hidden');
            const reg = window.TRANSITION_REGISTRY[type];
            const clip = this.getClipById(this.activeSelection.clipId);
            
            clip.transitions[this.activeSelection.edge] = {
                type: type,
                duration: reg.defaultDuration || 1.0,
                params: {}
            };
            
            this.updatePanelUI();
            this.commitModifications();
        },

        bindGlobalEvents() {
            this.globalClickHandler = (e) => {
                const list = document.getElementById('teTransTypeList');
                const display = document.getElementById('teTransTypeDisplay');
                if (list && !list.classList.contains('hidden')) {
                    if (!list.contains(e.target) && !display.contains(e.target)) {
                        list.classList.add('hidden');
                    }
                }
            };
            document.addEventListener('click', this.globalClickHandler);
        },

        switchTab(tab) {
            const tSettings = document.getElementById('teTabSettings');
            const tGuide = document.getElementById('teTabGuide');
            const vSettings = document.getElementById('teSettingsView');
            const vGuide = document.getElementById('teGuideView');
            
            if (tab === 'settings') {
                tSettings.className = 'flex-1 py-2 text-xs font-bold text-teal-400 border-b-2 border-teal-400 transition';
                tGuide.className = 'flex-1 py-2 text-xs font-bold text-gray-500 border-b-2 border-transparent hover:text-gray-300 transition';
                vSettings.style.display = 'flex';
                vGuide.style.display = 'none';
                
                this.panel.style.resize = 'none';
                this.panel.style.width = '340px';
            } else {
                tGuide.className = 'flex-1 py-2 text-xs font-bold text-teal-400 border-b-2 border-teal-400 transition';
                tSettings.className = 'flex-1 py-2 text-xs font-bold text-gray-500 border-b-2 border-transparent hover:text-gray-300 transition';
                vSettings.style.display = 'none';
                vGuide.style.display = 'flex';

                this.panel.style.resize = 'horizontal';
                this.panel.style.minWidth = '340px';
                this.panel.style.maxWidth = '800px';
            }
        },

        parseMarkdown(md) {
            let html = md;
            html = html.replace(/```javascript\n([\s\S]*?)```/gim, '<pre><code>$1</code></pre>');
            html = html.replace(/```\n([\s\S]*?)```/gim, '<pre><code>$1</code></pre>');
            html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
            html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
            html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
            html = html.replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>');
            html = html.replace(/`([^`]*)`/gim, '<code>$1</code>');
            html = html.replace(/^\d+\.\s(.*$)/gim, '<ol><li>$1</li></ol>');
            html = html.replace(/<\/ol>\n<ol>/gim, '');
            html = html.replace(/\n\n/gim, '<br><br>');
            return `<div class="markdown-body">${html}</div>`;
        },

        downloadGuide() {
            const blob = new Blob([this.guideMarkdown], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'Transition_Creator_Guide.md';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            Notify.show("Guide Downloaded", "fa-download");
        },

        openEditor(clipId, edge) {
            this.activeSelection = { clipId, edge };
            this.switchTab('settings'); 
            this.updatePanelUI();
            this.panel.style.display = 'block';
            
            // Highlight the block structurally
            if (typeof UI !== 'undefined') UI.refreshTimeline();
        },

        closeEditor() {
            this.panel.style.display = 'none';
            this.activeSelection = null;
            if (this.previewTimer) clearInterval(this.previewTimer);
            if (typeof UI !== 'undefined') UI.refreshTimeline();
        },

        updatePanelUI() {
            if (!this.activeSelection) return;
            const clip = this.getClipById(this.activeSelection.clipId);
            const trans = clip.transitions[this.activeSelection.edge];
            const asset = Store.assets.find(a => a.id === clip.assetId);

            document.getElementById('teTransEdgeBadge').innerText = this.activeSelection.edge === 'in' ? 'START' : 'END';
            document.getElementById('teTransClipName').innerText = asset ? asset.name : 'Unknown Clip';

            const typeList = document.getElementById('teTransTypeList');
            typeList.innerHTML = Object.keys(window.TRANSITION_REGISTRY).map(key => {
                const reg = window.TRANSITION_REGISTRY[key];
                const isSelected = trans.type === key;
                return `
                    <div class="p-2 border-b border-[#222] hover:bg-[#00d2be]/20 cursor-pointer group transition-colors ${isSelected ? 'bg-[#00d2be]/10' : ''}" 
                         onclick="window.TRANSITIONS_ENGINE.handleTypeChange('${key}')">
                        <div class="text-xs font-bold text-white group-hover:text-teal-400 flex items-center">
                            ${isSelected ? '<i class="fa-solid fa-check text-teal-400 mr-2"></i>' : ''} ${reg.name}
                        </div>
                        <div class="text-[9px] text-gray-500 mt-1 leading-tight">${reg.description || 'Custom transition effect.'}</div>
                    </div>
                `;
            }).join('');

            const currentReg = window.TRANSITION_REGISTRY[trans.type];
            document.getElementById('teTransTypeName').innerText = currentReg ? currentReg.name : 'Select...';

            document.getElementById('teTransDuration').value = trans.duration.toFixed(2);

            this.renderDynamicUI(trans);
        },

        renderDynamicUI(trans) {
            const container = document.getElementById('teTransDynamicUI');
            const registryEntry = window.TRANSITION_REGISTRY[trans.type];
            
            if (registryEntry && registryEntry.getUI) {
                container.innerHTML = registryEntry.getUI(trans.params || {});
                container.querySelectorAll('input, select').forEach(el => {
                    el.onchange = () => this.commitModifications();
                    el.addEventListener('keydown', e => e.stopPropagation());
                });
            } else {
                container.innerHTML = '';
            }
        },

        commitModifications() {
            if (!this.activeSelection) return;
            const clip = this.getClipById(this.activeSelection.clipId);
            const trans = clip.transitions[this.activeSelection.edge];
            const reg = window.TRANSITION_REGISTRY[trans.type];

            let dur = parseFloat(document.getElementById('teTransDuration').value);
            dur = Math.max(0.1, Math.min(dur, clip.duration)); 
            document.getElementById('teTransDuration').value = dur.toFixed(2);

            trans.duration = dur;
            
            if (reg && reg.getParams) {
                trans.params = reg.getParams();
            }

            Store.saveState();
            UI.refreshTimeline();
            Player.safeRenderFrame();
        },

        removeTransition() {
            if (!this.activeSelection) return;
            const clip = this.getClipById(this.activeSelection.clipId);
            delete clip.transitions[this.activeSelection.edge];
            
            Store.saveState();
            this.closeEditor();
            UI.refreshTimeline();
            Player.safeRenderFrame();
        },

        playSmartPreview() {
            if (!this.activeSelection) return;
            if (this.previewTimer) clearInterval(this.previewTimer);

            const clip = this.getClipById(this.activeSelection.clipId);
            const trans = clip.transitions[this.activeSelection.edge];

            const startTime = this.activeSelection.edge === 'in' ? clip.start : (clip.start + clip.duration - trans.duration);
            const stopTime = startTime + trans.duration + 0.5;

            Store.currentTime = startTime;
            Player.safeRenderFrame();
            if (!Player.playing) Player.togglePlay();

            this.previewTimer = setInterval(() => {
                if (Store.currentTime >= stopTime || !Player.playing) {
                    if (Player.playing) Player.togglePlay();
                    clearInterval(this.previewTimer);
                }
            }, 50);
        },

        makeDraggable(elm, handle) {
            let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
            handle.onmousedown = (e) => {
                e.preventDefault();
                pos3 = e.clientX; pos4 = e.clientY;
                document.onmouseup = () => { document.onmouseup = null; document.onmousemove = null; };
                document.onmousemove = (e) => {
                    e.preventDefault();
                    pos1 = pos3 - e.clientX; pos2 = pos4 - e.clientY;
                    pos3 = e.clientX; pos4 = e.clientY;
                    elm.style.top = (elm.offsetTop - pos2) + "px";
                    elm.style.left = (elm.offsetLeft - pos1) + "px";
                };
            };
        },

        // --- 3. CORE LIFECYCLE HOOKS ---
        hijackCoreLifecycles() {
            this.originalDrawToCanvas = Player.drawToCanvas.bind(Player);
            
            Player.drawToCanvas = (vClips, tClips) => {
                if (!this.isActive) return this.originalDrawToCanvas(vClips, tClips);
                
                const t = Store.currentTime;
                const opacityBackups = new Map();
                
                vClips.forEach(clip => {
                    opacityBackups.set(clip.id, clip.opacity);
                    if (clip.transitions) {
                        let currentOpacity = clip.opacity !== undefined ? clip.opacity : 100;
                        
                        if (clip.transitions.in && clip.transitions.in.type === 'dissolve') {
                            if (t >= clip.start && t <= clip.start + clip.transitions.in.duration) {
                                const prog = (t - clip.start) / clip.transitions.in.duration;
                                currentOpacity *= prog;
                            }
                        }
                        if (clip.transitions.out && clip.transitions.out.type === 'dissolve') {
                            const outStart = clip.start + clip.duration - clip.transitions.out.duration;
                            if (t >= outStart && t <= clip.start + clip.duration) {
                                const prog = (clip.start + clip.duration - t) / clip.transitions.out.duration;
                                currentOpacity *= prog;
                            }
                        }
                        clip.opacity = currentOpacity;
                    }
                });
                
                this.originalDrawToCanvas(vClips, tClips);
                
                vClips.forEach(clip => clip.opacity = opacityBackups.get(clip.id));
                
                const ctx = Player.compositorCanvas.getContext('2d');
                const canvas = Player.compositorCanvas;
                
                vClips.forEach(clip => {
                    if (!clip.transitions) return;
                    
                    const drawOverlay = (transObj, edge) => {
                        const reg = window.TRANSITION_REGISTRY[transObj.type];
                        if (reg && reg.onRender) {
                            let prog = 0;
                            if (edge === 'in' && t >= clip.start && t <= clip.start + transObj.duration) {
                                prog = (t - clip.start) / transObj.duration; 
                            } else if (edge === 'out') {
                                const outStart = clip.start + clip.duration - transObj.duration;
                                if (t >= outStart && t <= clip.start + clip.duration) {
                                    prog = (t - outStart) / transObj.duration; 
                                    
                                    if (reg.autoReverse !== false) {
                                        prog = 1.0 - prog; 
                                    }
                                }
                            }
                            
                            if (prog > 0 && prog <= 1) {
                                ctx.save();
                                reg.onRender(ctx, canvas, prog, transObj.params || {});
                                ctx.restore();
                            }
                        }
                    };

                    if (clip.transitions.in) drawOverlay(clip.transitions.in, 'in');
                    if (clip.transitions.out) drawOverlay(clip.transitions.out, 'out');
                });
            };

            this.originalRenderTrack = TimelineModule.renderTrack.bind(TimelineModule);
            TimelineModule.renderTrack = (trackId) => {
                this.originalRenderTrack(trackId);
                if (this.isActive) this.injectTimelineBlocks(trackId);
            };

            // CRITICAL INTERCEPT: "Either Or" Logic for Drag vs Select
            this.originalStartDrag = TimelineModule.startDrag.bind(TimelineModule);
            TimelineModule.startDrag = (e, clip, trackId) => {
                if (!this.isActive) return this.originalStartDrag(e, clip, trackId);
                
                const transBlock = e.target.closest('.trans-block');
                if (transBlock) {
                    // It's a transition block! Cancel normal clip dragging.
                    e.preventDefault();
                    e.stopPropagation();
                    
                    // Select the underlying clip in the editor
                    TimelineModule.selectClip(clip.id, trackId);
                    
                    // Open the specific transition editor
                    const edge = transBlock.dataset.edge;
                    this.openEditor(clip.id, edge);
                    return; // "Either or, never both"
                }
                
                // Normal drag
                this.originalStartDrag(e, clip, trackId);
            };

            // CRITICAL INTERCEPT: Sync Panel when a clip is selected natively
            this.originalSelectClip = TimelineModule.selectClip.bind(TimelineModule);
            TimelineModule.selectClip = (clipId, trackId) => {
                this.originalSelectClip(clipId, trackId);
                
                if (this.isActive && this.panel && this.panel.style.display !== 'none') {
                    const clip = this.getClipById(clipId);
                    if (clip && clip.transitions) {
                        // Prioritize 'in', fallback to 'out'
                        const edge = clip.transitions.in ? 'in' : (clip.transitions.out ? 'out' : null);
                        if (edge) {
                            this.activeSelection = { clipId, edge };
                            this.updatePanelUI();
                        }
                    }
                }
            };
        },

        injectTimelineBlocks(trackId) {
            const lane = document.getElementById(`track-${trackId}`);
            if (!lane) return;

            const clips = Store.tracks[trackId] || [];
            
            clips.forEach((clipData, index) => {
                const clipEl = lane.children[index];
                if (!clipEl || !clipData.transitions) return;

                const renderBlock = (transObj, edge) => {
                    const block = document.createElement('div');
                    block.className = `trans-block ${edge}`;
                    
                    // Add active highlight if this transition is currently open in the editor
                    if (this.activeSelection && this.activeSelection.clipId === clipData.id && this.activeSelection.edge === edge) {
                        block.classList.add('active-edit');
                    }
                    
                    block.dataset.clipId = clipData.id;
                    block.dataset.edge = edge;
                    block.style.width = `${transObj.duration * Store.zoom}px`;
                    block.title = `Click to Edit ${window.TRANSITION_REGISTRY[transObj.type]?.name || 'Transition'}`;
                    
                    // No event bindings here! The startDrag interceptor handles it flawlessly at the parent level.
                    clipEl.appendChild(block);
                };

                if (clipData.transitions.in) renderBlock(clipData.transitions.in, 'in');
                if (clipData.transitions.out) renderBlock(clipData.transitions.out, 'out');
            });
        },

        // --- 4. FFMPEG EXPORT INTEGRATION ---
        registerExportMiddleware() {
            if (typeof Store !== 'undefined' && Store.middleware) {
                Store.middleware.push((clip) => {
                    if (!this.isActive || !clip.transitions) return '';
                    
                    let filters = [];
                    
                    const processEdge = (transObj, edge) => {
                        const reg = window.TRANSITION_REGISTRY[transObj.type];
                        if (reg && reg.getFFmpeg) {
                            filters.push(reg.getFFmpeg(edge, transObj.duration, transObj.params || {}));
                        }
                    };

                    if (clip.transitions.in) processEdge(clip.transitions.in, 'in');
                    if (clip.transitions.out) processEdge(clip.transitions.out, 'out');
                    
                    return filters.join(',');
                });
            }
        },

        getClipById(id) {
            for (let tid in Store.tracks) {
                const trackData = Store.tracks[tid] || [];
                const f = trackData.find(c => c.id === id);
                if (f) return f;
            }
            return null;
        },

        cleanup() {
            console.log(`[${MODULE_ID}] Uninstalling Advanced Transitions Engine...`);
            this.isActive = false;
            
            if (this.originalDrawToCanvas) Player.drawToCanvas = this.originalDrawToCanvas;
            if (this.originalRenderTrack) TimelineModule.renderTrack = this.originalRenderTrack;
            if (this.originalStartDrag) TimelineModule.startDrag = this.originalStartDrag;
            if (this.originalSelectClip) TimelineModule.selectClip = this.originalSelectClip;
            
            if (this.globalClickHandler) document.removeEventListener('click', this.globalClickHandler);
            
            document.getElementById(`${MODULE_ID}_styles`)?.remove();
            document.getElementById('transitions_menu_btn')?.remove();
            document.getElementById('transitionEditorPanel')?.remove();
            document.querySelectorAll('.trans-block').forEach(el => el.remove());
            
            if (Store.middleware) {
                Store.middleware = Store.middleware.filter(m => !m.toString().includes('TRANSITION_REGISTRY'));
            }
            
            delete window.TRANSITIONS_ENGINE;
            delete window.TRANSITION_REGISTRY;
            
            if(typeof UI !== 'undefined') UI.refreshTimeline();
            Player.safeRenderFrame(); 
        }
    };

    window.TRANSITIONS_ENGINE = TransitionsEngine;
    TransitionsEngine.init();

})();
