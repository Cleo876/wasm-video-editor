/**
 * @name Undo & Redo Engine
 * @version 1.1.1
 * @developer Forge™
 * @description Advanced history tracking utilizing IndexedDB. Supports Ctrl+Z / Ctrl+Y and tracks clip positions, splits, and custom module states with rapid-action batching.
 */
(function() {
    const MODULE_ID = 'undo_redo_engine';

    // 1. Core Environment Check
    if (typeof Store === 'undefined' || typeof Player === 'undefined' || typeof DB === 'undefined') {
        console.error(`❌ [${MODULE_ID}] Core environment not found. Ensure editor is fully loaded.`);
        return;
    }

    const MAX_HISTORY_STATES = 250; // Massively expanded limit. Safe due to metadata-only serialization.

    const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

    // Strip heavy Blobs, only keep metadata required for state restoration (Text changes, colors, duration)
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
        elements: [], // UI Elements for cleanup
        captureTimeout: null, // Debounce timer for rapid action batching
        
        // Host hook references
        originalSaveState: null,
        originalLoadProject: null,
        originalCreateProject: null,
        keydownHandler: null,

        async init() {
            console.log(`[${MODULE_ID}] Booting Engine...`);
            
            this.injectUI();
            this.bindHotkeys();
            this.hijackStore();

            // If a project is already loaded during module injection, load its history
            if (Store.projectId) {
                await this.loadHistoryFromDB();
            }
        },

        injectUI() {
            const controlBar = document.querySelector('.control-bar');
            if (!controlBar || document.getElementById('ur-container')) return;

            const container = document.createElement('div');
            container.id = 'ur-container';
            // Absolute positioning neatly places it next to the timecode without disrupting centered playback controls
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

        bindHotkeys() {
            this.keydownHandler = (e) => {
                if (!this.isActive) return;
                
                // Prevent intercepting hotkeys when typing in Inspector or Text Modals
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

        hijackStore() {
            // Hook into project state saves to autonomously capture history
            this.originalSaveState = Store.saveState;
            Store.saveState = async () => {
                const result = await this.originalSaveState.call(Store);
                
                if (this.isActive && !this.isNavigating) {
                    // Action Batching Safeguard: 
                    // Debounces rapid continuous states (like dragging a slider or text clip) 
                    // to prevent eating up the 250 limit in a few seconds.
                    if (this.captureTimeout) clearTimeout(this.captureTimeout);
                    this.captureTimeout = setTimeout(() => {
                        this.captureState();
                    }, 250);
                }
                
                return result;
            };

            // Hook project loading to switch history context
            this.originalLoadProject = Store.loadProject;
            Store.loadProject = async (pid) => {
                await this.originalLoadProject.call(Store, pid);
                if (this.isActive) await this.loadHistoryFromDB();
            };

            // Hook project creation to start fresh history
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
                assets: serializeAssets(Store.assets) // Captures text/color modifications natively
            });

            // Prevent capturing identical redundant states
            if (this.past.length > 0) {
                const lastState = this.past[this.past.length - 1];
                if (JSON.stringify(currentState) === JSON.stringify(lastState)) return;
            }

            this.past.push(currentState);
            
            // Protect IndexedDB performance by enforcing stack limits
            if (this.past.length > MAX_HISTORY_STATES) {
                this.past.shift(); 
            }
            
            this.future = []; // Destroy redo timeline on a new action
            this.updateUI();
            await this.persistToDB();
        },

        async undo() {
            if (this.past.length <= 1) return; // Cannot undo past the foundational state
            
            this.isNavigating = true;
            
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
            
            const nextState = this.future.pop();
            this.past.push(nextState);
            await this.applyState(nextState);
            
            this.updateUI();
            await this.persistToDB();
            
            this.isNavigating = false;
            if(typeof Notify !== 'undefined') Notify.show('Redo', 'fa-rotate-right');
        },

        async applyState(state) {
            // Restore Layouts and Configurations
            Store.tracks = deepClone(state.tracks);
            Store.trackConfig = deepClone(state.trackConfig);
            
            // Restore Global FX and update UI sliders without calling deprecated applyToPreview
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

            // Target injected metadata restores (like Text string changes or color formatting)
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

            // Force robust UI Regeneration
            if(typeof UI !== 'undefined') UI.refreshTimeline();
            if(typeof Player !== 'undefined') Player.renderFrame();
            
            // Sync Native Inspector if open
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
                    await this.captureState(); // Initialize foundational state
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
            
            // 1. Purge UI
            this.elements.forEach(el => el.remove());
            this.elements = [];

            // 2. Kill Listeners
            document.removeEventListener('keydown', this.keydownHandler);
            if (this.captureTimeout) clearTimeout(this.captureTimeout);

            // 3. Restore Application Original Architecture Hooks
            if (this.originalSaveState) Store.saveState = this.originalSaveState;
            if (this.originalLoadProject) Store.loadProject = this.originalLoadProject;
            if (this.originalCreateProject) Store.createProject = this.originalCreateProject;

            delete window.UNDO_REDO_ENGINE;
        }
    };

    // Broadcast globally for architecture integration
    window.UNDO_REDO_ENGINE = UndoRedoEngine;
    UndoRedoEngine.init();

})();
