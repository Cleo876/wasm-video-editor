/**
 * @name Advanced Transitions Engine
 * @version 7.2.5
 * @developer Forge™
 * @description The Definitive Ecosystem. Restores the pristine UX of v5.0.2 (Drag-to-Snap & Double-Click) paired with True-Facilitator rendering, dynamic scaling, Z-index fortifications, and a refined single‑button Add/Edit UI. Now with Rubicon awareness.
 */
(function() {
    const MODULE_ID = 'advanced_transitions_engine';

    if (typeof Store === 'undefined' || typeof Player === 'undefined' || typeof TimelineModule === 'undefined') {
        console.error(`❌ [${MODULE_ID}] Core environment not found. Ensure editor is fully loaded.`);
        return;
    }

    // --- THE TRANSITION ECOSYSTEM REGISTRY (UNCHANGED) ---
    window.TRANSITION_REGISTRY = {
        'dissolve': {
            name: 'Cross Dissolve',
            description: 'Smoothly blends the transparency of the clip from 0% to 100%.',
            defaultDuration: 1.0,
            autoReverse: true,
            getUI: (params) => `<div class="text-xs text-gray-500 italic mt-2">Smoothly blends transparency.</div>`,
            getParams: () => ({}),
            onRender: null, 
            getFFmpeg: (edge, duration, params, align) => `fade=t=${edge}:st=0:d=${duration}:alpha=1`
        },
        'fade': {
            name: 'Fade to Color',
            description: 'Fades the video into a solid color block. Great for fading to black or white.',
            defaultDuration: 1.0,
            maxDuration: 10.0,
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
            getFFmpeg: (edge, duration, params, align) => {
                const c = (params.color || '#000000').replace('#', '0x');
                return `fade=t=${edge}:st=0:d=${duration}:c=${c}`;
            }
        }
    };

    const TransitionsEngine = {
        isActive: true,
        panel: null,
        activeSelection: null, 
        panelClipId: null,
        previewTimer: null,
        
        // Native Host Hooks
        originalDrawToCanvas: null,
        originalRenderTrack: null,
        originalSelectClip: null,
        originalStartDrag: null,
        globalClickHandler: null,
        globalDblClickHandler: null,

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
Add your logic to the global registry object. You can dynamically restrict the scaling using \`maxDuration\`.
\`\`\`javascript
window.TRANSITION_REGISTRY['color_wipe'] = {
    name: 'Color Wipe',
    description: 'Swipes a solid color block across the screen.',
    defaultDuration: 1.0,
    maxDuration: 3.0,
    
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
    getParams: () => ({ color: document.getElementById('wipe_color').value }),
\`\`\`

### Step 4: The Canvas Render (Preview)
This is the visual magic! It runs 60 times a second during preview playback. 
The Editor handles dynamic time scaling for you: \`progress\` is a decimal that always goes from \`0.0\` (start) to \`1.0\` (end) exactly over the uninterrupted duration of the transition block.
\`\`\`javascript
    onRender: (ctx, canvas, progress, params) => {
        ctx.fillStyle = params.color || '#ffffff';
        ctx.fillRect(0, 0, canvas.width * progress, canvas.height);
    },
\`\`\`

### Step 5: FFmpeg Export
Translate your effect into FFmpeg string format for the final MP4 render.
\`\`\`javascript
    getFFmpeg: (edge, duration, params, alignment) => {
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

        async loadPersistentTransitions() {
            try {
                const saved = await DB.get('system', 'custom_transitions_registry');
                if (saved && saved.scripts) {
                    saved.scripts.forEach(script => {
                        try { eval(script); } catch(e) {}
                    });
                }
            } catch (e) {}
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

        injectStyles() {
            const style = document.createElement('style');
            style.id = `${MODULE_ID}_styles`;
            style.innerHTML = `
                .t-clip { overflow: visible !important; }
                .t-clip > span { overflow: hidden; text-overflow: ellipsis; width: 100%; text-align: center; }
                
                .trans-block {
                    position: absolute;
                    top: 0; bottom: 0;
                    background: repeating-linear-gradient(45deg, rgba(0,210,190,0.2), rgba(0,210,190,0.2) 5px, rgba(0,0,0,0.5) 5px, rgba(0,0,0,0.5) 10px);
                    border: 1px solid rgba(0,210,190,0.8);
                    z-index: 8;
                    cursor: grab;
                    transition: background 0.2s, border-color 0.2s;
                    pointer-events: auto;
                }
                .trans-block:active { cursor: grabbing; }
                .trans-block:hover { background: rgba(0,210,190,0.4); }
                .trans-block.active-edit { background: rgba(0,210,190,0.6); border-color: #fff; z-index: 9; }
                
                .trans-block.in.align-edge { left: 0; border-left: none; border-top-right-radius: 4px; border-bottom-right-radius: 4px; }
                .trans-block.out.align-edge { right: 0; border-right: none; border-top-left-radius: 4px; border-bottom-left-radius: 4px; }
                .trans-block.in.align-center { left: 0; transform: translateX(-50%); border-radius: 4px; }
                .trans-block.out.align-center { right: 0; transform: translateX(50%); border-radius: 4px; }
                
                .trans-edit-btn {
                    position: absolute;
                    top: 50%;
                    right: 4px;
                    transform: translateY(-50%);
                    width: 18px; height: 18px;
                    background: rgba(0,0,0,0.7);
                    color: #00d2be;
                    border: 1px solid #00d2be;
                    border-radius: 3px;
                    font-size: 10px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    opacity: 0;
                    transition: opacity 0.2s;
                    z-index: 10;
                    pointer-events: auto;
                }
                .trans-block:hover .trans-edit-btn { opacity: 1; }
                
                #teEdgeTabs { display: flex; border-bottom: 1px solid #333; background: #111; }
                #teEdgeTabs button {
                    flex: 1; padding: 6px 0; font-size: 11px; font-weight: bold;
                    background: transparent; border: none; border-bottom: 2px solid transparent;
                    color: #aaa; cursor: pointer; transition: all 0.2s;
                }
                #teEdgeTabs button.active { color: #00d2be; border-bottom-color: #00d2be; background: #1a1a1a; }
                #teAddMissingEdge {
                    display: block; width: 100%; margin-top: 12px; background: #00d2be20;
                    border: 1px dashed #00d2be; color: #00d2be; padding: 6px;
                    border-radius: 4px; font-size: 12px; font-weight: bold; cursor: pointer;
                }
                #teAddMissingEdge:hover { background: #00d2be40; }
                
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

        // ---------- MENU BUTTON with Rubicon awareness ----------
        injectMenuButton() {
            const header = document.querySelector('header .flex-1');
            if (!header) return;

            const menuWrapper = document.createElement('div');
            menuWrapper.className = 'menu-wrapper relative h-full flex-shrink-0';
            menuWrapper.id = 'transitions_menu_btn';
            menuWrapper.innerHTML = `
                <div class="menu-btn" id="teMainBtn"><i class="fa-solid fa-shuffle mr-1"></i> Add Transition</div>
                <div class="dropdown">
                    <div class="dropdown-item" id="btnImportTrans">Import Custom Transition (.js)...</div>
                </div>
            `;
            
            const projStatus = document.getElementById('projectStatus');
            header.insertBefore(menuWrapper, projStatus);

            this.mainButton = document.getElementById('teMainBtn');
            document.getElementById('btnImportTrans').onclick = () => this.triggerImport();

            this.mainButton.addEventListener('click', (e) => {
                e.stopPropagation();
                const clipId = Store.selectedClipId;
                if (!clipId) {
                    alert("Please select a video or image clip first.");
                    return;
                }
                const clip = this.getClipById(clipId);
                if (!clip) return;

                // --- RUBICON GUARD ---
                if (this.clipHasActiveGraph(clip)) {
                    this.showRubiconNotice();
                    return;
                }

                // Toggle panel close if already open for this clip
                if (this.panel.style.display === 'block' && this.panelClipId === clipId) {
                    this.closeEditor();
                    return;
                }

                this.panelClipId = clipId;

                if (clip.transitions && (clip.transitions.in || clip.transitions.out)) {
                    this.activeSelection = { clipId, edge: clip.transitions.in ? 'in' : 'out' };
                } else {
                    this.activeSelection = null;
                }
                this.openEditor(clipId, this.activeSelection ? this.activeSelection.edge : undefined);
                this.updatePanelUI();
            });

            this.updateMenuItems();
        },

        // Helper: determine if clip has an active Rubicon graph
        clipHasActiveGraph(clip) {
            // Grab the global Rubicon engine instance if available
            const rubicon = window.GRAPH_ENGINE;
            // A clip is considered "graph‑active" if it has graphData with nodes/wires beyond the default
            // (the same logic the Rubicon inspector uses to show "EDIT GRAPH")
            if (clip.graphData) {
                const nodes = clip.graphData.nodes || [];
                const wires = clip.graphData.wires || [];
                // If there are more than 2 nodes (media_in, media_out) or any wires, the graph is active
                if (nodes.length > 2 || wires.length > 0) return true;
                // Even just having graphData at all could be considered active, but we'll be lenient
                // and treat any graphData as active if it exists (the user might have saved a default graph)
                return true; // uncomment for strictness: /* true */ 
            }
            return false;
        },

        // Show an inline notification (using Notify) to bake first
        showRubiconNotice() {
            if (typeof Notify !== 'undefined') {
                Notify.show("Bake Rubicon effects first before adding transitions", "fa-triangle-exclamation");
            } else {
                alert("This clip has Rubicon Graph effects applied.\nPlease use the 'EDIT GRAPH' inspector button and bake the clip before adding transitions.");
            }
        },

        updateMenuItems() {
            if (!this.mainButton) return;
            const clipId = Store.selectedClipId;
            const clip = clipId ? this.getClipById(clipId) : null;
            const hasAny = clip && clip.transitions && (clip.transitions.in || clip.transitions.out);
            if (hasAny) {
                this.mainButton.innerHTML = '<i class="fa-solid fa-pen-to-square mr-1"></i> Edit Transition';
            } else {
                this.mainButton.innerHTML = '<i class="fa-solid fa-shuffle mr-1"></i> Add Transition';
            }
        },

        addTransitionToSelected(edge) {
            // Kept for programmatic use, but also guarded
            const clipId = Store.selectedClipId;
            if (!clipId) {
                alert("Please select a video or image clip first.");
                return;
            }
            const clip = this.getClipById(clipId);
            if (!clip) return;
            
            if (this.clipHasActiveGraph(clip)) {
                this.showRubiconNotice();
                return;
            }
            
            if (!clip.transitions) clip.transitions = {};
            clip.transitions[edge] = { 
                type: 'dissolve', 
                duration: window.TRANSITION_REGISTRY['dissolve'].defaultDuration, 
                alignment: 'edge', 
                params: {} 
            };
            
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

        // ---------- EDITOR PANEL (unchanged except for minor guard in openEditor) ----------
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
                    <div id="teEdgeTabs">
                        <button id="teEdgeTabStart" class="active">START</button>
                        <button id="teEdgeTabEnd">END</button>
                    </div>

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
                    
                    <div class="mt-2 flex gap-2">
                        <div class="flex-1">
                            <label class="block text-[10px] uppercase text-gray-500 font-bold mb-1">Duration (s)</label>
                            <input type="number" id="teTransDuration" step="0.1" min="0.1" class="w-full bg-[#111] border border-[#333] text-white p-2 text-sm rounded outline-none focus:border-teal-500">
                        </div>
                        <div class="flex-1">
                            <label class="block text-[10px] uppercase text-gray-500 font-bold mb-1">Position</label>
                            <select id="teTransAlignment" class="w-full bg-[#111] border border-[#333] text-white p-2 text-sm rounded outline-none focus:border-teal-500">
                                <option value="edge">Edge Snap</option>
                                <option value="center">Half-n-Half</option>
                            </select>
                        </div>
                    </div>
                    
                    <div id="teTransDynamicUI" class="border-t border-[#333] mt-1 pt-1 empty:hidden"></div>
                    
                    <button id="teAddMissingEdge" style="display:none;"><i class="fa-solid fa-plus mr-1"></i> Add Other Transition</button>
                    
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
            document.getElementById('teTransAlignment').onchange = () => this.commitModifications();
            
            const displayBtn = document.getElementById('teTransTypeDisplay');
            const typeList = document.getElementById('teTransTypeList');
            displayBtn.onclick = () => typeList.classList.toggle('hidden');

            document.getElementById('teEdgeTabStart').onclick = () => {
                if (!this.panelClipId) return;
                const clip = this.getClipById(this.panelClipId);
                if (!clip) return;
                this.activeSelection = { clipId: this.panelClipId, edge: 'in' };
                this.updatePanelUI();
            };
            document.getElementById('teEdgeTabEnd').onclick = () => {
                if (!this.panelClipId) return;
                const clip = this.getClipById(this.panelClipId);
                if (!clip) return;
                this.activeSelection = { clipId: this.panelClipId, edge: 'out' };
                this.updatePanelUI();
            };

            document.getElementById('teAddMissingEdge').onclick = () => {
                if (!this.panelClipId) return;
                const clip = this.getClipById(this.panelClipId);
                if (!clip) return;
                const currentEdge = this.activeSelection.edge;
                const otherEdge = this.getOtherEdge(currentEdge);
                if (!clip.transitions) clip.transitions = {};
                if (!clip.transitions[otherEdge]) {
                    clip.transitions[otherEdge] = {
                        type: 'dissolve',
                        duration: window.TRANSITION_REGISTRY['dissolve'].defaultDuration,
                        alignment: 'edge',
                        params: {}
                    };
                    Store.saveState();
                    UI.refreshTimeline();
                    this.activeSelection = { clipId: this.panelClipId, edge: otherEdge };
                    this.updatePanelUI();
                    this.updateMenuItems();
                }
            };

            this.makeDraggable(p, document.getElementById('teTransHeader'));
        },

        getOtherEdge(edge) { return edge === 'in' ? 'out' : 'in'; },

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

        handleTypeChange(type) {
            document.getElementById('teTransTypeList').classList.add('hidden');
            const reg = window.TRANSITION_REGISTRY[type];
            const clip = this.getClipById(this.activeSelection.clipId);
            
            clip.transitions[this.activeSelection.edge] = {
                type: type,
                duration: reg.defaultDuration || 1.0,
                alignment: clip.transitions[this.activeSelection.edge].alignment || 'edge',
                params: {}
            };
            
            this.updatePanelUI();
            this.commitModifications();
        },

        createNewTransition(type) {
            if (!this.panelClipId || !this.activeSelection) return;
            const clip = this.getClipById(this.panelClipId);
            if (!clip) return;
            if (!clip.transitions) clip.transitions = {};
            const reg = window.TRANSITION_REGISTRY[type];
            clip.transitions[this.activeSelection.edge] = {
                type: type,
                duration: reg?.defaultDuration || 1.0,
                alignment: 'edge',
                params: {}
            };
            Store.saveState();
            UI.refreshTimeline();
            this.updatePanelUI();
            this.updateMenuItems();
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

            // Double-click guard: if clip has Rubicon graph, show notice and don't open editor
            this.globalDblClickHandler = (e) => {
                const block = e.target.closest('.trans-block');
                if (block && this.isActive) {
                    e.preventDefault(); e.stopPropagation();
                    
                    // Forcefully terminate any dragging sequences
                    document.dispatchEvent(new MouseEvent('mouseup')); 
                    
                    const clipId = block.dataset.clipId;
                    const clip = clipId ? this.getClipById(clipId) : null;
                    if (clip && this.clipHasActiveGraph(clip)) {
                        this.showRubiconNotice();
                        return;
                    }
                    
                    this.openEditor(block.dataset.clipId, block.dataset.edge);
                }
            };
            document.addEventListener('dblclick', this.globalDblClickHandler);
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
            this.panelClipId = clipId;
            this.activeSelection = edge ? { clipId, edge } : null;
            this.switchTab('settings'); 
            this.updatePanelUI();
            this.panel.style.display = 'block';
            this.updateMenuItems();
            if (typeof UI !== 'undefined') UI.refreshTimeline();
        },

        closeEditor() {
            this.panel.style.display = 'none';
            this.panelClipId = null;
            this.activeSelection = null;
            if (this.previewTimer) clearInterval(this.previewTimer);
            this.updateMenuItems();
            if (typeof UI !== 'undefined') UI.refreshTimeline();
        },

        updatePanelUI() {
            if (!this.panelClipId) return;
            const clip = this.getClipById(this.panelClipId);
            if (!clip) return;

            const edge = this.activeSelection ? this.activeSelection.edge : null;

            document.getElementById('teEdgeTabStart').className = (edge === 'in') ? 'active' : '';
            document.getElementById('teEdgeTabEnd').className = (edge === 'out') ? 'active' : '';

            if (edge && clip.transitions && clip.transitions[edge]) {
                const trans = clip.transitions[edge];
                const asset = Store.assets.find(a => a.id === clip.assetId);

                document.getElementById('teTransEdgeBadge').innerText = edge === 'in' ? 'START' : 'END';
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
                document.getElementById('teTransAlignment').value = trans.alignment || 'edge';

                this.renderDynamicUI(trans);
            } else if (edge) {
                document.getElementById('teTransEdgeBadge').innerText = edge === 'in' ? 'START' : 'END';
                document.getElementById('teTransClipName').innerText = 'No transition';
                document.getElementById('teTransTypeName').innerText = 'None';
                document.getElementById('teTransDuration').value = '';
                document.getElementById('teTransAlignment').value = 'edge';
                document.getElementById('teTransDynamicUI').innerHTML = '<div class="text-xs text-gray-500 italic">Select a transition type above.</div>';
                document.getElementById('teTransTypeList').innerHTML = Object.keys(window.TRANSITION_REGISTRY).map(key => {
                    const reg = window.TRANSITION_REGISTRY[key];
                    return `<div class="p-2 border-b border-[#222] hover:bg-[#00d2be]/20 cursor-pointer" onclick="window.TRANSITIONS_ENGINE.createNewTransition('${key}')">
                                <div class="text-xs font-bold text-white">${reg.name}</div>
                            </div>`;
                }).join('');
                document.getElementById('teAddMissingEdge').style.display = 'none';
                document.getElementById('teTransRemove').disabled = true;
                document.getElementById('teTransRemove').style.opacity = '0.5';
            } else {
                document.getElementById('teTransEdgeBadge').innerText = '–';
                document.getElementById('teTransClipName').innerText = 'Choose an edge';
                document.getElementById('teTransTypeName').innerText = 'Select START or END';
                document.getElementById('teTransDuration').value = '';
                document.getElementById('teTransAlignment').value = 'edge';
                document.getElementById('teTransDynamicUI').innerHTML = '<div class="text-xs text-gray-500 italic">Use the tabs above to add a start/end transition.</div>';
                document.getElementById('teTransTypeList').innerHTML = '';
                document.getElementById('teAddMissingEdge').style.display = 'none';
                document.getElementById('teTransRemove').disabled = true;
                document.getElementById('teTransRemove').style.opacity = '0.5';
            }

            const otherEdge = edge ? this.getOtherEdge(edge) : null;
            const otherMissing = edge && clip.transitions && !clip.transitions[otherEdge];
            document.getElementById('teAddMissingEdge').style.display = otherMissing ? 'block' : 'none';
            if (otherMissing) {
                document.getElementById('teAddMissingEdge').innerHTML =
                    `<i class="fa-solid fa-plus mr-1"></i> Add ${otherEdge === 'in' ? 'Start' : 'End'} Transition`;
            }

            const removeBtn = document.getElementById('teTransRemove');
            const edgeExists = edge && clip.transitions && clip.transitions[edge];
            removeBtn.disabled = !edgeExists;
            removeBtn.style.opacity = removeBtn.disabled ? '0.5' : '1';
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
            if (!trans) return;
            const reg = window.TRANSITION_REGISTRY[trans.type];

            let dur = parseFloat(document.getElementById('teTransDuration').value);
            
            let maxAllowed = reg.maxDuration ? Math.min(clip.duration, reg.maxDuration) : clip.duration;
            dur = Math.max(0.1, Math.min(dur, maxAllowed)); 
            
            document.getElementById('teTransDuration').value = dur.toFixed(2);

            trans.duration = dur;
            trans.alignment = document.getElementById('teTransAlignment').value;
            
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
            if (!clip || !clip.transitions) return;
            delete clip.transitions[this.activeSelection.edge];
            Store.saveState();
            const otherEdge = this.getOtherEdge(this.activeSelection.edge);
            if (clip.transitions && clip.transitions[otherEdge]) {
                this.activeSelection = { clipId: this.panelClipId, edge: otherEdge };
                this.updatePanelUI();
            } else {
                this.closeEditor();
            }
            UI.refreshTimeline();
            Player.safeRenderFrame();
        },

        playSmartPreview() {
            if (!this.activeSelection) return;
            if (this.previewTimer) clearInterval(this.previewTimer);

            const clip = this.getClipById(this.activeSelection.clipId);
            const trans = clip.transitions[this.activeSelection.edge];
            if (!trans) return;
            const alignment = trans.alignment || 'edge';

            let startTime = clip.start;
            if (this.activeSelection.edge === 'in') {
                startTime = alignment === 'center' ? clip.start - (trans.duration / 2) : clip.start;
            } else {
                startTime = alignment === 'center' ? (clip.start + clip.duration) - (trans.duration / 2) : (clip.start + clip.duration - trans.duration);
            }
            
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
                            const dur = clip.transitions.in.duration;
                            const align = clip.transitions.in.alignment || 'edge';
                            const start = align === 'center' ? clip.start - dur/2 : clip.start;
                            
                            if (t >= start && t <= start + dur) {
                                const prog = (t - start) / dur;
                                currentOpacity *= prog;
                            }
                        }
                        if (clip.transitions.out && clip.transitions.out.type === 'dissolve') {
                            const dur = clip.transitions.out.duration;
                            const align = clip.transitions.out.alignment || 'edge';
                            const start = align === 'center' ? (clip.start + clip.duration) - dur/2 : clip.start + clip.duration - dur;
                            
                            if (t >= start && t <= start + dur) {
                                const prog = (start + dur - t) / dur;
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
                
                let activeTrans = [];
                Store.trackConfig.forEach(track => {
                    (Store.tracks[track.id] || []).forEach(clip => {
                        if (!clip.transitions) return;
                        
                        if (clip.transitions.in) {
                            const dur = clip.transitions.in.duration;
                            const align = clip.transitions.in.alignment || 'edge';
                            const start = align === 'center' ? clip.start - dur/2 : clip.start;
                            if (t >= start && t <= start + dur) {
                                activeTrans.push({ clip, edge: 'in', trans: clip.transitions.in, start, dur });
                            }
                        }
                        if (clip.transitions.out) {
                            const dur = clip.transitions.out.duration;
                            const align = clip.transitions.out.alignment || 'edge';
                            const start = align === 'center' ? (clip.start + clip.duration) - dur/2 : clip.start + clip.duration - dur;
                            if (t >= start && t <= start + dur) {
                                activeTrans.push({ clip, edge: 'out', trans: clip.transitions.out, start, dur });
                            }
                        }
                    });
                });

                activeTrans.forEach(item => {
                    const reg = window.TRANSITION_REGISTRY[item.trans.type];
                    if (reg && reg.onRender) {
                        let prog = (t - item.start) / item.dur; 
                        
                        if (item.edge === 'out' && reg.autoReverse !== false) {
                            prog = 1.0 - prog; 
                        }
                        
                        if (prog >= 0 && prog <= 1) {
                            ctx.save();
                            reg.onRender(ctx, canvas, prog, item.trans.params || {});
                            ctx.restore();
                        }
                    }
                });
            };

            this.originalRenderTrack = TimelineModule.renderTrack.bind(TimelineModule);
            TimelineModule.renderTrack = (trackId) => {
                this.originalRenderTrack(trackId);
                if (this.isActive) this.injectTimelineBlocks(trackId);
            };

            this.originalStartDrag = TimelineModule.startDrag.bind(TimelineModule);
            TimelineModule.startDrag = (e, clip, trackId) => {
                if (!this.isActive) return this.originalStartDrag(e, clip, trackId);
                
                const transBlock = e.target.closest('.trans-block');
                if (transBlock) {
                    e.preventDefault(); 
                    e.stopPropagation();
                    
                    TimelineModule.selectClip(clip.id, trackId);
                    
                    let startX = e.clientX;
                    let edge = transBlock.dataset.edge;
                    let trans = clip.transitions[edge];
                    let initialAlign = trans.alignment || 'edge';
                    let hasDragged = false;
                    
                    const onMove = (ev) => {
                        let deltaX = ev.clientX - startX;
                        if (Math.abs(deltaX) > 5) {
                            hasDragged = true;
                            let newAlign = initialAlign;
                            
                            if (edge === 'out') {
                                newAlign = deltaX > 0 ? 'center' : 'edge';
                            } else {
                                newAlign = deltaX < 0 ? 'center' : 'edge';
                            }
                            
                            if (newAlign !== trans.alignment) {
                                trans.alignment = newAlign;
                                UI.refreshTimeline();
                                this.updatePanelUI();
                            }
                        }
                    };
                    
                    const onUp = () => {
                        document.removeEventListener('mousemove', onMove);
                        document.removeEventListener('mouseup', onUp);
                        
                        if (hasDragged) {
                            Store.saveState();
                        }
                    };
                    
                    document.addEventListener('mousemove', onMove);
                    document.addEventListener('mouseup', onUp);
                    
                    return;
                }
                
                this.originalStartDrag(e, clip, trackId);
            };

            this.originalSelectClip = TimelineModule.selectClip.bind(TimelineModule);
            TimelineModule.selectClip = (clipId, trackId) => {
                this.originalSelectClip(clipId, trackId);
                
                this.updateMenuItems();
                
                if (this.isActive && this.panel && this.panel.style.display !== 'none' && this.panelClipId !== clipId) {
                    this.closeEditor();
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
                    const align = transObj.alignment || 'edge';
                    block.className = `trans-block ${edge} align-${align}`;
                    
                    if (this.activeSelection && this.activeSelection.clipId === clipData.id && this.activeSelection.edge === edge) {
                        block.classList.add('active-edit');
                    }
                    
                    block.dataset.clipId = clipData.id;
                    block.dataset.edge = edge;
                    block.style.width = `${transObj.duration * Store.zoom}px`;
                    block.title = `Drag to snap. Dbl-Click to edit ${window.TRANSITION_REGISTRY[transObj.type]?.name || 'Transition'}.`;
                    
                    const editBtn = document.createElement('div');
                    editBtn.className = 'trans-edit-btn';
                    editBtn.innerHTML = '<i class="fa-solid fa-pen-to-square" style="font-size: 8px;"></i>';
                    editBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.openEditor(clipData.id, edge);
                    });
                    block.appendChild(editBtn);
                    
                    clipEl.appendChild(block);
                };

                if (clipData.transitions.in) renderBlock(clipData.transitions.in, 'in');
                if (clipData.transitions.out) renderBlock(clipData.transitions.out, 'out');
            });
        },

        registerExportMiddleware() {
            if (typeof Store !== 'undefined' && Store.middleware) {
                Store.middleware.push((clip) => {
                    if (!this.isActive || !clip.transitions) return '';
                    
                    let filters = [];
                    
                    const processEdge = (transObj, edge) => {
                        const reg = window.TRANSITION_REGISTRY[transObj.type];
                        if (reg && reg.getFFmpeg) {
                            const align = transObj.alignment || 'edge';
                            filters.push(reg.getFFmpeg(edge, transObj.duration, transObj.params || {}, align));
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
            if (this.globalDblClickHandler) document.removeEventListener('dblclick', this.globalDblClickHandler);
            
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
