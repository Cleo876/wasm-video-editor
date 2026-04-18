/**
 * @name Undo & Redo Engine
 * @version 1.4.0
 * @developer Forge™
 * @description Advanced history tracking utilizing IndexedDB. Features explicit 'Commit-Capture', GitHub Auto-Sync, and a Per-Project Storage Manager to prevent memory bloat.
 */
(function() {
    const MODULE_ID = 'undo_redo_engine';
    const CURRENT_VERSION = '1.4.0';

    if (typeof Store === 'undefined' || typeof Player === 'undefined' || typeof DB === 'undefined') {
        console.error(`❌ [${MODULE_ID}] Core environment not found. Ensure editor is fully loaded.`);
        return;
    }

    const MAX_HISTORY_STATES = 1500; 
    const WARNING_THRESHOLD = 1000; // Trigger warning icon if a project exceeds this

    const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

    const serializeAssets = (assets) => {
        return assets.map(a => ({
            id: a.id, 
            projectId: a.projectId, 
            type: a.type, 
            name: a.name, 
            duration: a.duration, 
            color: a.color
        }));
    };

    const UndoRedoEngine = {
        isActive: true,
        past: [],
        future: [],
        isNavigating: false,
        elements: [], 
        captureTimeout: null, 
        
        // Commit-Capture State
        isInteracting: false,
        pendingCapture: false,
        interactionListeners: {},
        
        originalSaveState: null,
        originalLoadProject: null,
        originalCreateProject: null,
        keydownHandler: null,

        async init() {
            console.log(`[${MODULE_ID}] Booting Engine...`);
            
            this.checkForUpdates(); 
            
            this.injectUI();
            this.injectStorageUI(); // Inject Warning Icon & Modal
            this.bindHotkeys();
            this.bindInteractionTracker();
            this.hijackStore();

            if (Store.projectId) {
                await this.loadHistoryFromDB();
            }
            
            this.checkStorageHealth();
        },

        async checkForUpdates() {
            try {
                const repoUrl = 'https://api.github.com/repos/Cleo876/wasm-video-editor/contents/Extensions';
                const response = await fetch(repoUrl);
                if (!response.ok) return;
                const files = await response.json();
                
                const fileInfo = files.find(f => f.name === 'undo_redo_engine.js');
                if (!fileInfo) return;

                const rawRes = await fetch(fileInfo.download_url);
                const scriptStr = await rawRes.text();
                
                const versionMatch = scriptStr.match(/@version\s+([\d\.]+)/);
                if (versionMatch) {
                    const fetchedVersion = versionMatch[1].trim();
                    
                    if (this.compareVersions(fetchedVersion, CURRENT_VERSION) > 0) {
                        if (typeof DB !== 'undefined') {
                            const modules = await DB.getAll('modules');
                            const myModule = modules.find(m => m.name === 'Undo & Redo Engine' || m.name === 'undo_redo_engine');
                            
                            if (myModule) {
                                myModule.content = scriptStr;
                                myModule.version = fetchedVersion;
                                await DB.put('modules', myModule);
                                if(typeof Notify !== 'undefined') {
                                    Notify.show(`Undo/Redo Engine updated to v${fetchedVersion}. Reload page to apply.`, 'fa-cloud-arrow-up');
                                }
                            }
                        }
                    }
                }
            } catch(e) {
                console.log(`[${MODULE_ID}] Auto-update check skipped or repository unavailable.`);
            }
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

        injectUI() {
            const controlBar = document.querySelector('.control-bar');
            if (!controlBar || document.getElementById('ur-container')) return;

            const container = document.createElement('div');
            container.id = 'ur-container';
            container.className = 'absolute left-[130px] flex items-center gap-3 z-50';

            container.innerHTML = `
                <div class="h-6 w-px bg-[#333] mx-1"></div>
                <button id="btnUndo" class="text-gray-500 hover:text-white disabled:opacity-30 disabled:hover:text-gray-500 transition transform active:scale-95 text-lg disabled:cursor-not-allowed" title="Undo (Ctrl+Z)" disabled>
                    <i class="fa-solid fa-rotate-left"></i>
                </button>
                <button id="btnRedo" class="text-gray-500 hover:text-white disabled:opacity-30 disabled:hover:text-gray-500 transition transform active:scale-95 text-lg disabled:cursor-not-allowed" title="Redo (Ctrl+Y)" disabled>
                    <i class="fa-solid fa-rotate-right"></i>
                </button>
            `;

            controlBar.appendChild(container);
            this.elements.push(container);

            document.getElementById('btnUndo').addEventListener('click', () => this.undo());
            document.getElementById('btnRedo').addEventListener('click', () => this.redo());
        },

        // --- STORAGE MANAGER INTEGRATION ---
        injectStorageUI() {
            // Inject Warning Icon next to WASM Status
            const wasmStatus = document.getElementById('wasmStatus');
            if (wasmStatus && !document.getElementById('ur-warning-icon')) {
                const warnBtn = document.createElement('div');
                warnBtn.id = 'ur-warning-icon';
                warnBtn.className = 'text-xs ml-4 cursor-pointer text-yellow-500 hover:text-yellow-400 transition items-center hidden';
                warnBtn.title = 'High Memory Usage: Manage Undo History';
                warnBtn.innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-1"></i> Storage Warning';
                warnBtn.onclick = () => this.openStorageManager();
                
                // Insert right after the wasmStatus
                wasmStatus.parentNode.insertBefore(warnBtn, wasmStatus.nextSibling);
                this.elements.push(warnBtn);
            }

            // Inject the Modal Shell
            if (!document.getElementById('urStorageModal')) {
                const modal = document.createElement('div');
                modal.id = 'urStorageModal';
                modal.className = 'fixed inset-0 bg-black/80 z-[100000] flex items-center justify-center hidden';
                modal.innerHTML = `
                    <div class="bg-[#1e1e1e] border border-[#333] p-6 rounded-xl max-w-lg w-full shadow-2xl flex flex-col max-h-[80vh]">
                        <div class="flex justify-between items-center mb-4 border-b border-[#333] pb-3">
                            <h2 class="text-lg font-bold text-white flex items-center"><i class="fa-solid fa-database text-teal-400 mr-2"></i> History Storage Manager</h2>
                            <button onclick="document.getElementById('urStorageModal').classList.add('hidden')" class="text-gray-500 hover:text-white"><i class="fa-solid fa-xmark"></i></button>
                        </div>
                        <p class="text-xs text-gray-400 mb-4">Excessive undo states can consume system RAM and degrade performance. Purge oldest states to restore speed.</p>
                        
                        <div id="urStorageList" class="flex-1 overflow-y-auto custom-scroll pr-2">
                            <!-- Populated Dynamically -->
                        </div>
                        
                        <div class="mt-4 pt-3 border-t border-[#333] text-right">
                            <button onclick="document.getElementById('urStorageModal').classList.add('hidden')" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold rounded transition">Close</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);
                this.elements.push(modal);
            }
        },

        async checkStorageHealth() {
            try {
                const allSystem = await DB.getAll('system');
                let warning = false;
                
                for (let item of allSystem) {
                    if (item.id.startsWith('history_')) {
                        const count = (item.past ? item.past.length : 0) + (item.future ? item.future.length : 0);
                        if (count > WARNING_THRESHOLD) {
                            warning = true;
                            break;
                        }
                    }
                }
                
                const warnIcon = document.getElementById('ur-warning-icon');
                if (warnIcon) warnIcon.style.display = warning ? 'flex' : 'none';
            } catch(e) {
                console.warn("Storage health check failed", e);
            }
        },

        async openStorageManager() {
            const listContainer = document.getElementById('urStorageList');
            listContainer.innerHTML = '<div class="text-center text-gray-500 py-4"><i class="fa-solid fa-circle-notch fa-spin"></i> Scanning Database...</div>';
            document.getElementById('urStorageModal').classList.remove('hidden');

            try {
                const allProjects = await DB.getAll('projects');
                const allSystem = await DB.getAll('system');
                const histories = allSystem.filter(item => item.id.startsWith('history_'));
                
                if (histories.length === 0) {
                    listContainer.innerHTML = '<div class="text-center text-gray-500 py-4">No history data found.</div>';
                    return;
                }

                let html = '';
                histories.forEach(hist => {
                    const pid = hist.id.replace('history_', '');
                    const proj = allProjects.find(p => p.id === pid) || { name: 'Deleted/Unknown Project' };
                    const count = (hist.past ? hist.past.length : 0) + (hist.future ? hist.future.length : 0);
                    const isWarning = count > WARNING_THRESHOLD;

                    html += `
                    <div class="mb-4 bg-[#111] p-4 rounded border ${isWarning ? 'border-yellow-900/50' : 'border-[#333]'}">
                        <div class="flex justify-between items-center mb-2">
                            <div class="font-bold text-white text-sm">${proj.name} ${pid === Store.projectId ? '<span class="text-[9px] bg-teal-900 text-teal-200 px-1 rounded ml-2">Active</span>' : ''}</div>
                            <div class="${isWarning ? 'text-yellow-500 font-bold' : 'text-gray-400'} text-xs">${count} States</div>
                        </div>
                        <input type="range" id="ur_slider_${pid}" min="0" max="${count}" value="0" class="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-red-500 mb-2" oninput="document.getElementById('ur_val_${pid}').innerText = this.value">
                        <div class="flex justify-between items-center">
                            <span class="text-xs text-gray-500">Purge Oldest: <span id="ur_val_${pid}" class="text-red-400 font-bold">0</span></span>
                            <button onclick="window.UNDO_REDO_ENGINE.purgeHistory('${pid}')" class="bg-red-900/30 hover:bg-red-800 border border-red-900 text-red-300 py-1 px-3 rounded text-xs font-bold transition">Delete</button>
                        </div>
                    </div>
                    `;
                });
                
                listContainer.innerHTML = html;
            } catch(e) {
                listContainer.innerHTML = '<div class="text-center text-red-500 py-4">Failed to load storage data.</div>';
            }
        },

        async purgeHistory(pid) {
            const slider = document.getElementById(`ur_slider_${pid}`);
            if (!slider) return;
            const amount = parseInt(slider.value);
            
            if (amount <= 0) return;

            try {
                if (pid === Store.projectId) {
                    // Purging currently active project
                    // Prioritize killing Redo (future) first if needed, otherwise kill from oldest past
                    if (this.past.length >= amount) {
                        this.past.splice(0, amount);
                    } else {
                        const remainder = amount - this.past.length;
                        this.past = [];
                        this.future.splice(0, remainder); // Though usually we only care about past
                    }
                    await this.persistToDB();
                    this.updateUI();
                } else {
                    // Purging an inactive project directly in DB
                    const histData = await DB.get('system', 'history_' + pid);
                    if (histData && histData.past) {
                        histData.past.splice(0, amount);
                        await DB.put('system', histData);
                    }
                }
                
                if (typeof Notify !== 'undefined') Notify.show(`Purged ${amount} states`, 'fa-broom');
                this.checkStorageHealth();
                this.openStorageManager(); // Refresh the modal UI
                
            } catch(e) {
                console.error("Purge failed", e);
                alert("Failed to purge history.");
            }
        },
        // --- END STORAGE MANAGER ---

        bindHotkeys() {
            this.keydownHandler = (e) => {
                if (!this.isActive) return;
                
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

                if (e.ctrlKey || e.metaKey) {
                    if (e.key.toLowerCase() === 'z') {
                        e.preventDefault();
                        if (e.shiftKey) this.redo();
                        else this.undo();
                    }
                    if (e.key.toLowerCase() === 'y') {
                        e.preventDefault();
                        this.redo();
                    }
                }
            };
            document.addEventListener('keydown', this.keydownHandler);
        },

        // --- THE MASTERSTROKE: Commit-Capture Tracker ---
        bindInteractionTracker() {
            const downHandler = () => {
                this.isInteracting = true;
            };
            
            const upHandler = () => {
                this.isInteracting = false;
                // The exact millisecond the user lets go of the slider/clip, if a save is pending, capture it!
                if (this.pendingCapture && !this.isNavigating && this.isActive) {
                    this.pendingCapture = false;
                    this.captureState();
                }
            };

            document.addEventListener('mousedown', downHandler);
            document.addEventListener('touchstart', downHandler);
            document.addEventListener('mouseup', upHandler);
            document.addEventListener('touchend', upHandler);

            this.interactionListeners = { down: downHandler, up: upHandler };
        },

        hijackStore() {
            this.originalSaveState = Store.saveState;
            Store.saveState = async () => {
                const result = await this.originalSaveState.call(Store);
                
                if (this.isActive && !this.isNavigating) {
                    if (this.isInteracting) {
                        // User is currently dragging a slider or clip. Put the capture on hold!
                        this.pendingCapture = true;
                    } else {
                        // User used a hotkey or clicked a button (no drag involved). Capture with a tiny safety debounce.
                        if (this.captureTimeout) clearTimeout(this.captureTimeout);
                        this.captureTimeout = setTimeout(() => {
                            this.captureState();
                        }, 50);
                    }
                }
                
                return result;
            };

            this.originalLoadProject = Store.loadProject;
            Store.loadProject = async (pid) => {
                await this.originalLoadProject.call(Store, pid);
                if (this.isActive) await this.loadHistoryFromDB();
            };

            this.originalCreateProject = Store.createProject;
            Store.createProject = async (name) => {
                await this.originalCreateProject.call(Store, name);
                if (this.isActive) await this.loadHistoryFromDB();
            };
        },

        async captureState() {
            const currentState = deepClone({
                tracks: Store.tracks,
                trackConfig: Store.trackConfig,
                effects: typeof VideoEffects !== 'undefined' ? VideoEffects.values : {},
                assets: serializeAssets(Store.assets) 
            });

            if (this.past.length > 0) {
                const lastState = this.past[this.past.length - 1];
                if (JSON.stringify(currentState) === JSON.stringify(lastState)) return;
            }

            this.past.push(currentState);
            
            if (this.past.length > MAX_HISTORY_STATES) {
                this.past.shift(); 
            }
            
            this.future = []; 
            this.updateUI();
            await this.persistToDB();
        },

        async undo() {
            if (this.past.length <= 1) return; 
            
            this.isNavigating = true;
            this.pendingCapture = false; // Purge any hovering captures
            
            const currentState = this.past.pop();
            this.future.push(currentState);
            
            const previousState = this.past[this.past.length - 1];
            await this.applyState(previousState);
            
            this.updateUI();
            await this.persistToDB();
            
            this.isNavigating = false;
            if(typeof Notify !== 'undefined') Notify.show('Undo', 'fa-rotate-left');
        },

        async redo() {
            if (this.future.length === 0) return;
            
            this.isNavigating = true;
            this.pendingCapture = false;
            
            const nextState = this.future.pop();
            this.past.push(nextState);
            await this.applyState(nextState);
            
            this.updateUI();
            await this.persistToDB();
            
            this.isNavigating = false;
            if(typeof Notify !== 'undefined') Notify.show('Redo', 'fa-rotate-right');
        },

        async applyState(state) {
            Store.tracks = deepClone(state.tracks);
            Store.trackConfig = deepClone(state.trackConfig);
            
            if (state.effects && typeof VideoEffects !== 'undefined') {
                VideoEffects.values = deepClone(state.effects);
                
                const brightSlider = document.querySelector('input[oninput*="brightness"]');
                const contrastSlider = document.querySelector('input[oninput*="contrast"]');
                const satSlider = document.querySelector('input[oninput*="saturate"]');
                
                if (brightSlider && document.getElementById('valBright')) { 
                    brightSlider.value = VideoEffects.values.brightness; 
                    document.getElementById('valBright').innerText = (VideoEffects.values.brightness/100).toFixed(1); 
                }
                if (contrastSlider && document.getElementById('valContrast')) { 
                    contrastSlider.value = VideoEffects.values.contrast; 
                    document.getElementById('valContrast').innerText = (VideoEffects.values.contrast/100).toFixed(1); 
                }
                if (satSlider && document.getElementById('valSat')) { 
                    satSlider.value = VideoEffects.values.saturate; 
                    document.getElementById('valSat').innerText = (VideoEffects.values.saturate/100).toFixed(1); 
                }
            }

            if (state.assets) {
                for (const savedAsset of state.assets) {
                    const liveAsset = Store.assets.find(a => a.id === savedAsset.id);
                    if (liveAsset && (liveAsset.name !== savedAsset.name || liveAsset.color !== savedAsset.color)) {
                        liveAsset.name = savedAsset.name;
                        liveAsset.color = savedAsset.color;
                        liveAsset.duration = savedAsset.duration;
                        await Store.updateAssetMeta(liveAsset.id, { 
                            name: liveAsset.name, 
                            color: liveAsset.color, 
                            duration: liveAsset.duration 
                        });
                    }
                }
            }

            if(typeof UI !== 'undefined') UI.refreshTimeline();
            if(typeof Player !== 'undefined') Player.renderFrame();
            
            if(typeof NativeInspector !== 'undefined') {
                let validSelection = false;
                for (let t in Store.tracks) {
                    if (Store.tracks[t].find(c => c.id === Store.selectedClipId)) validSelection = true;
                }
                if (!validSelection) Store.selectedClipId = null;
                NativeInspector.render();
            }
        },

        async loadHistoryFromDB() {
            if (!Store.projectId) return;
            try {
                const data = await DB.get('system', 'history_' + Store.projectId);
                if (data) {
                    this.past = data.past || [];
                    this.future = data.future || [];
                } else {
                    this.past = [];
                    this.future = [];
                    await this.captureState(); 
                }
                this.updateUI();
            } catch (e) {
                console.warn(`[${MODULE_ID}] Failed to load history`, e);
            }
        },

        async persistToDB() {
            if (!Store.projectId) return;
            try {
                await DB.put('system', {
                    id: 'history_' + Store.projectId,
                    past: this.past,
                    future: this.future
                });
                this.checkStorageHealth(); // Re-evaluate health after saving
            } catch (e) {
                console.warn(`[${MODULE_ID}] Failed to persist history`, e);
            }
        },

        updateUI() {
            const undoBtn = document.getElementById('btnUndo');
            const redoBtn = document.getElementById('btnRedo');
            
            if(undoBtn) undoBtn.disabled = this.past.length <= 1;
            if(redoBtn) redoBtn.disabled = this.future.length === 0;
        },

        cleanup() {
            console.log(`[${MODULE_ID}] Executing secure shutdown & uninstallation...`);
            this.isActive = false;
            
            this.elements.forEach(el => el.remove());
            this.elements = [];

            document.removeEventListener('keydown', this.keydownHandler);
            if (this.interactionListeners.down) {
                document.removeEventListener('mousedown', this.interactionListeners.down);
                document.removeEventListener('touchstart', this.interactionListeners.down);
                document.removeEventListener('mouseup', this.interactionListeners.up);
                document.removeEventListener('touchend', this.interactionListeners.up);
            }
            if (this.captureTimeout) clearTimeout(this.captureTimeout);

            if (this.originalSaveState) Store.saveState = this.originalSaveState;
            if (this.originalLoadProject) Store.loadProject = this.originalLoadProject;
            if (this.originalCreateProject) Store.createProject = this.originalCreateProject;

            delete window.UNDO_REDO_ENGINE;
        }
    };

    window.UNDO_REDO_ENGINE = UndoRedoEngine;
    UndoRedoEngine.init();

})();
