/**
 * @name Hotkey Master & Command Palette
 * @version 2.9.0
 * @developer Forge™
 * @description The absolute sovereign of keyboard inputs. Features Virtual Modifier Toggles (Ctrl/Alt/Shift combos), Docked Inspector UX, Numpad support, and the Execution-Level Rogue Shield.
 */
(function() {
    const MODULE_ID = 'hotkey_master';

    if (typeof DB === 'undefined') {
        console.error(`❌ [${MODULE_ID}] IndexedDB environment not found.`);
        return;
    }

    const HotkeyMaster = {
        name: "Hotkey Master & Command Palette",
        version: "2.9.0",
        
        contexts: {},     
        commands: {},     
        keymaps: { 'global': {} },
        
        modal: null,
        selectedKey: null, 
        activeUiContext: 'global', 

        // Modifier State Toggles for the UI
        modCtrl: false,
        modAlt: false,
        modShift: false,

        rogueQueue: [],
        isRogueBannerVisible: false,
        warnedExtensions: new Set(),

        defaultKeymaps: {
            'global': { 
                'KeyS': 'core.split', 
                'KeyC': 'core.split', 
                'KeyX': 'core.delete', 
                'Delete': 'core.delete', 
                'Backspace': 'core.delete', 
                'KeyF': 'core.fullscreen', 
                'Space': 'core.play_pause', 
                'KeyL': 'core.fast_forward', 
                'KeyK': 'core.pause', 
                'KeyJ': 'core.rewind',
                'Ctrl+KeyZ': 'ur.undo',
                'Ctrl+KeyY': 'ur.redo'
            }
        },

        async init() {
            console.log(`⌨️ Booting ${this.name} v${this.version} – Centralized keyboard governance.`);
            
            this.rogueQueue = [];
            this.isRogueBannerVisible = false;
            this.warnedExtensions.clear();

            this.hijackSecurity(); 
            this.hijackModuleManager(); 
            
            await this.scanExistingModulesWithRetry(5);
            
            [3000, 8000, 15000, 30000].forEach(delay => {
                setTimeout(() => this.scanExistingModules(), delay);
            });

            this.observeScriptInjections();

            this.registerContext('global', 'Main Editor', () => true); 
            this.registerBuiltInCommands();
            await this.loadPreferences();

            this.injectStyles();
            this.injectSecurityModals();
            this.injectMenuButton();
            this.buildModalUI();
            this.bindSovereignListener();

            window.HOTKEY_MASTER = {
                registerContext: this.registerContext.bind(this),
                registerCommand: this.registerCommand.bind(this),
                openMapper: () => this.openModal(),
                closeModal: () => this.closeModal(),
                isActive: true,
                rescan: () => this.scanExistingModules()
            };

            this.processQueue();
            this.waitForModuleManager();
        },

        processQueue() {
            if (window.HOTKEY_QUEUE && Array.isArray(window.HOTKEY_QUEUE)) {
                window.HOTKEY_QUEUE.forEach(task => {
                    if (task.type === 'context') this.registerContext(...task.args);
                    if (task.type === 'command') this.registerCommand(...task.args);
                });
                window.HOTKEY_QUEUE = []; 
            }
        },
        
        // --- SECURITY & STATIC ANALYSIS MODULES ---

        detectIllegalBindings(text) {
            if (!text) return null;
            if (text.includes("MODULE_ID = 'hotkey_master'") || text.includes('window.HOTKEY_MASTER =')) return null;

            const isOnlyStopPropagation = (handlerBody) => {
                const clean = handlerBody.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '').trim();
                return /^(?:e|evt|event)\.stopPropagation\(\);?$/.test(clean) ||
                       /^{?\s*(?:e|evt|event)\.stopPropagation\(\);?\s*}?$/.test(clean);
            };

            if (/(?:document|window)\.addEventListener\s*\(\s*['"`](keydown|keyup|keypress)['"`]\s*,[\s\S]*?,\s*true\s*\)/i.test(text)) {
                return `Global event listener with capture phase (blocks host shortcuts)`;
            }

            const globalListenerPattern = /(?:document|window)\.addEventListener\s*\(\s*['"`](keydown|keyup|keypress)['"`]\s*,/gi;
            let match;
            while ((match = globalListenerPattern.exec(text)) !== null) {
                const afterComma = text.substring(match.index + match[0].length);
                const handlerMatch = afterComma.match(/(?:\(?[a-zA-Z_$][\w$]*\)?\s*=>\s*\{?[\s\S]*?)?\}/);
                if (handlerMatch) {
                    if (!isOnlyStopPropagation(handlerMatch[0])) {
                        return `Global '${match[1]}' listener with active logic`;
                    }
                } else {
                    return `Global '${match[1]}' listener detected`;
                }
            }

            if (/window\.on(keydown|keyup|keypress)\s*=/i.test(text) ||
                /document\.on(keydown|keyup|keypress)\s*=/i.test(text)) {
                return `Native DOM property assignment on global object`;
            }

            if (/\$\s*\(\s*(?:document|window)\s*\)\s*\.\s*(?:on|bind)\s*\(\s*['"`](keydown|keyup|keypress)['"`]/i.test(text)) {
                return `Library event binder on global object`;
            }

            const reactPattern = /useEffect\s*\(\s*\(\)\s*=>\s*\{\s*(?:window|document)\.addEventListener\s*\(\s*['"`](keydown|keyup|keypress)['"`]\s*,[\s\S]*?\}\s*,\s*\[\s*\]\s*\)/gi;
            while ((match = reactPattern.exec(text)) !== null) {
                if (!isOnlyStopPropagation(match[0])) {
                    return `React hook with global '${match[1]}' listener`;
                }
            }

            return null;
        },

        async scanExistingModulesWithRetry(retries = 5) {
            for (let i = 0; i < retries; i++) {
                try {
                    await this.scanExistingModules();
                    return;
                } catch (e) {
                    console.warn(`[${MODULE_ID}] DB scan attempt ${i+1} failed, retrying...`);
                    await new Promise(r => setTimeout(r, 500));
                }
            }
        },

        async scanExistingModules() {
            if (typeof DB === 'undefined' || !DB.db) throw new Error('Database not ready');

            const modules = await DB.getAll('modules');
            console.log(`[${MODULE_ID}] Scanning ${modules.length} installed modules for rogue listeners...`);

            for (let m of modules) {
                if (m.name.includes('Hotkey Master') || m.name === MODULE_ID) continue;
                if (this.warnedExtensions.has(m.name)) continue;

                const violation = this.detectIllegalBindings(m.content);
                if (violation) {
                    console.warn(`🛡️ SHIELD: "${m.name}" contains ${violation} – blocking to protect shortcut system.`);
                    this.queueRogueWarning(m.name, m.developer || 'Unknown Developer', violation);
                }
            }
        },

        observeScriptInjections() {
            const observer = new MutationObserver(mutations => {
                mutations.forEach(mut => {
                    mut.addedNodes.forEach(node => {
                        if (node.tagName === 'SCRIPT' && node.textContent) {
                            const violation = this.detectIllegalBindings(node.textContent);
                            if (violation) {
                                const nameMatch = node.textContent.match(/@name\s+(.+)/);
                                const devMatch = node.textContent.match(/@developer\s+(.+)/);
                                const extName = nameMatch ? nameMatch[1].trim() : 'Unknown Extension';
                                const devName = devMatch ? devMatch[1].trim() : 'Unknown Developer';
                                
                                console.warn(`🛡️ SHIELD: Live injection blocked for "${extName}" – ${violation}`);
                                this.queueRogueWarning(extName, devName, violation);
                                node.remove();
                            }
                        }
                    });
                });
            });
            observer.observe(document.head, { childList: true, subtree: true });
            observer.observe(document.body, { childList: true, subtree: true });
        },

        waitForModuleManager() {
            const hook = () => {
                if (typeof ModuleManager !== 'undefined') {
                    this.monitorModuleInstallation();
                } else {
                    setTimeout(hook, 200);
                }
            };
            hook();
        },

        monitorModuleInstallation() {
            const origLoadFolder = ModuleManager.loadFolder;
            const origInstallDefaults = ModuleManager.installDefaults;

            ModuleManager.loadFolder = function(...args) {
                const result = origLoadFolder.apply(this, args);
                setTimeout(() => {
                    console.log(`[${MODULE_ID}] Folder load complete – scanning.`);
                    HotkeyMaster.scanExistingModules();
                }, 800);
                return result;
            };

            ModuleManager.installDefaults = async function(...args) {
                const result = await origInstallDefaults.apply(this, args);
                setTimeout(() => {
                    console.log(`[${MODULE_ID}] Defaults installed – scanning.`);
                    HotkeyMaster.scanExistingModules();
                }, 500);
                return result;
            };

            const origDBPut = DB.put;
            DB.put = async function(store, data) {
                const result = await origDBPut.call(this, store, data);
                if (store === 'modules') {
                    setTimeout(() => HotkeyMaster.scanExistingModules(), 400);
                }
                return result;
            };
        },

        hijackSecurity() {
            this.origAppend = document.body.appendChild;
            this.origHeadAppend = document.head.appendChild;
            const _this = this;

            const secureAppend = function(originalMethod) {
                return function(el) {
                    if (el.tagName === 'SCRIPT' && el.textContent) {
                        const violation = _this.detectIllegalBindings(el.textContent);
                        if (violation) {
                            const nameMatch = el.textContent.match(/@name\s+(.+)/);
                            const devMatch = el.textContent.match(/@developer\s+(.+)/);
                            const extName = nameMatch ? nameMatch[1].trim() : 'Unknown Extension';
                            const devName = devMatch ? devMatch[1].trim() : 'Unknown Developer';
                            
                            console.warn(`🛡️ SHIELD: Load‑time block of "${extName}" – ${violation}`);
                            _this.queueRogueWarning(extName, devName, violation);
                            return;
                        }
                    }
                    return originalMethod.apply(this, arguments);
                };
            };

            document.body.appendChild = secureAppend(this.origAppend);
            document.head.appendChild = secureAppend(this.origHeadAppend);
        },

        async purgeRogueModule(extName) {
            this.warnedExtensions.delete(extName);
            if (typeof ModuleManager !== 'undefined') {
                ModuleManager.modules = ModuleManager.modules.filter(m => m.name !== extName);
                if (typeof DB !== 'undefined') await DB.delete('modules', extName);
                if (typeof ModuleManager.render === 'function') ModuleManager.render();
            }
        },

        hijackModuleManager() {
            if (typeof ModuleManager !== 'undefined') {
                this.origModuleRemove = ModuleManager.remove;
                ModuleManager.remove = async (name) => {
                    if (name === this.name || name === MODULE_ID) {
                        this.showPinPrompt(async (pin) => {
                            if (pin === '1234') {
                                ModuleManager.modules = ModuleManager.modules.filter(m => m.name !== name);
                                await DB.delete('modules', name);
                                if (typeof ModuleManager.render === 'function') ModuleManager.render();
                                this.cleanup();
                                if(typeof Notify !== 'undefined') Notify.show("Hotkey Master Uninstalled", "fa-unlock");
                            } else {
                                if(typeof Notify !== 'undefined') Notify.show("Access Denied: Incorrect PIN", "fa-lock");
                            }
                        });
                        return;
                    }
                    return this.origModuleRemove.call(ModuleManager, name);
                };
            }
        },

        // --- UI MODALS & UNIFIED CAROUSEL QUEUE ---
        injectSecurityModals() {
            const pinModal = document.createElement('div');
            pinModal.id = 'hk-pin-modal';
            pinModal.className = 'fixed inset-0 bg-black/90 z-[100000] flex items-center justify-center hidden backdrop-blur-sm';
            pinModal.innerHTML = `
                <div class="bg-[#151515] border border-[#333] rounded-xl w-[400px] shadow-2xl flex flex-col overflow-hidden text-center p-6">
                    <div class="text-teal-500 mb-4"><i class="fa-solid fa-lock text-4xl drop-shadow-[0_0_10px_rgba(0,210,190,0.3)]"></i></div>
                    <h2 class="text-lg font-bold text-white mb-2">System Override Required</h2>
                    <p class="text-xs text-gray-400 mb-6">Hotkey Master is a core dependency. Enter the override PIN to force uninstallation.</p>
                    <input type="password" id="hk-pin-input" placeholder="****" class="bg-[#111] border border-[#444] text-white p-3 text-center tracking-[1em] text-2xl rounded outline-none focus:border-teal-500 transition mb-4 font-mono">
                    <div class="flex gap-2">
                        <button id="hk-pin-cancel" class="flex-1 bg-[#333] hover:bg-[#444] text-white py-2 rounded text-sm font-bold transition">Cancel</button>
                        <button id="hk-pin-confirm" class="flex-1 bg-red-600 hover:bg-red-500 text-white py-2 rounded text-sm font-bold transition shadow-lg shadow-red-900/20">Authorize</button>
                    </div>
                </div>
            `;
            document.body.appendChild(pinModal);
        },

        queueRogueWarning(extName, devName, violationDetails) {
            if (this.warnedExtensions.has(extName)) return;
            this.warnedExtensions.add(extName);

            this.rogueQueue.push({ extName, devName, violationDetails });
            if (!this.isRogueBannerVisible) this.showNextRogue();
        },

        showNextRogue() {
            if (this.rogueQueue.length === 0) {
                this.isRogueBannerVisible = false;
                const banner = document.getElementById('hk-rogue-inline-banner');
                if (banner) {
                    banner.style.opacity = '0';
                    banner.style.transform = 'translate(-50%, -20px)';
                    setTimeout(() => banner?.remove(), 300);
                }
                return;
            }

            this.isRogueBannerVisible = true;
            const current = this.rogueQueue[0];
            const total = this.rogueQueue.length;

            let banner = document.getElementById('hk-rogue-inline-banner');
            if (!banner) {
                banner = document.createElement('div');
                banner.id = 'hk-rogue-inline-banner';
                banner.className = 'fixed top-6 left-1/2 transform -translate-x-1/2 z-[2147483647] bg-[#1a1a1a] border-2 border-red-600 text-white p-6 rounded-lg shadow-[0_30px_60px_rgba(0,0,0,0.9)] flex flex-col items-center text-center opacity-0 transition-all duration-300 translate-y-[-30px] w-[550px] pointer-events-auto';
                document.body.appendChild(banner);
            } else {
                const oldBtn = banner.querySelector('#hk-rogue-ack-btn');
                if (oldBtn) {
                    const newBtn = oldBtn.cloneNode(true);
                    oldBtn.parentNode.replaceChild(newBtn, oldBtn);
                }
            }

            const counterBadge = total > 1 ? `<div class="absolute top-3 right-3 bg-red-900/50 text-red-300 border border-red-800 text-[10px] font-bold px-2 py-1 rounded">1 of ${total}</div>` : '';

            banner.innerHTML = `
                ${counterBadge}
                <div class="font-black text-red-500 text-base uppercase tracking-widest mb-3 flex items-center">
                    <i class="fa-solid fa-shield-halved mr-2 text-xl"></i> Incompatible Keyboard Binding Detected
                </div>
                <div class="text-sm text-gray-300 px-2 leading-relaxed">
                    <strong class="text-white">${current.extName}</strong> (by ${current.devName}) uses its own keyboard listeners instead of the central Hotkey API. This will cause shortcut conflicts and prevent you from remapping keys.
                </div>
                <div class="text-xs text-gray-400 mt-4 bg-[#111] px-4 py-3 rounded border border-[#333] w-full text-left leading-relaxed">
                    <span class="text-red-400 font-bold uppercase tracking-wider text-[10px] block mb-1">Technical Reason:</span>
                    ${current.violationDetails}.<br><br>
                    Please refer to the <a href="https://github.com/Cleo876/wasm-video-editor/blob/main/Extensions/Modules%20Developer%20Guide.md#hotkey-master-extension-support" target="_blank" class="text-teal-400 hover:text-teal-300 underline font-bold transition">Modules Developer Guide</a> for integration instructions.
                </div>
                <button id="hk-rogue-ack-btn" class="mt-5 w-full bg-red-600 hover:bg-red-500 text-white py-3 rounded font-bold shadow-lg transition-transform transform active:scale-95 flex items-center justify-center gap-2">
                    <i class="fa-solid fa-trash mr-1"></i> Uninstall Extension
                </button>
            `;
            
            requestAnimationFrame(() => {
                banner.style.opacity = '1';
                banner.style.transform = 'translate(-50%, 0)';
            });
            
            document.getElementById('hk-rogue-ack-btn').onclick = async () => {
                await this.purgeRogueModule(current.extName);
                if(typeof Notify !== 'undefined') Notify.show(`${current.extName} removed`, "fa-trash");
                this.rogueQueue.shift();
                
                banner.style.transform = 'translate(-50%, -5px) scale(0.98)';
                banner.style.opacity = '0';
                setTimeout(() => {
                    if (this.rogueQueue.length > 0) {
                        this.showNextRogue();
                    } else {
                        this.isRogueBannerVisible = false;
                        banner.remove();
                    }
                }, 150);
            };
        },

        showPinPrompt(callback) {
            const modal = document.getElementById('hk-pin-modal');
            const input = document.getElementById('hk-pin-input');
            if (modal && input) {
                input.value = '';
                modal.classList.remove('hidden');
                const cancelBtn = document.getElementById('hk-pin-cancel');
                const confirmBtn = document.getElementById('hk-pin-confirm');
                const cleanup = () => {
                    cancelBtn.removeEventListener('click', onCancel);
                    confirmBtn.removeEventListener('click', onConfirm);
                };
                const onCancel = () => { modal.classList.add('hidden'); cleanup(); };
                const onConfirm = () => { modal.classList.add('hidden'); callback(input.value); cleanup(); };
                cancelBtn.addEventListener('click', onCancel);
                confirmBtn.addEventListener('click', onConfirm);
                input.focus();
            }
        },

        // --- CORE SHORTCUT API & UI ---
        registerContext(id, name, evaluatorFn) {
            this.contexts[id] = { name, isActive: evaluatorFn };
            if (!this.keymaps[id]) this.keymaps[id] = {};
            this.updateContextDropdown();
        },
        
        registerCommand(contextId, commandId, name, category, executeFn, description = "") {
            this.commands[commandId] = { contextId, id: commandId, name, category, execute: executeFn, description };
            if (this.modal && this.modal.style.display !== 'none') this.renderCommandList();
        },
        
        registerBuiltInCommands() {
            this.registerCommand('global', 'core.play_pause', 'Play / Pause', 'Playback', () => {
                if (typeof Player !== 'undefined') {
                    Player.togglePlay();
                    const playBtn = document.getElementById('playPauseBtn');
                    if (playBtn) playBtn.innerHTML = Player.playing ? '<i class="fa-solid fa-circle-pause"></i>' : '<i class="fa-solid fa-circle-play"></i>';
                }
            }, "Toggles timeline video playback.");
            
            this.registerCommand('global', 'core.fast_forward', 'Play Forward / Fast', 'Playback', () => {
                if (typeof Player !== 'undefined') Player.playing ? Player.seekRelative(2) : Player.togglePlay();
            });
            this.registerCommand('global', 'core.pause', 'Pause', 'Playback', () => {
                if (typeof Player !== 'undefined' && Player.playing) Player.togglePlay();
            });
            this.registerCommand('global', 'core.rewind', 'Rewind / Back', 'Playback', () => {
                if (typeof Player !== 'undefined') Player.seekRelative(-2);
            });
            this.registerCommand('global', 'core.split', 'Split Clip (Razor)', 'Editing', () => {
                if (typeof TimelineModule !== 'undefined') TimelineModule.splitClip();
            });
            this.registerCommand('global', 'core.delete', 'Delete Selected', 'Editing', () => {
                if (typeof TimelineModule !== 'undefined' && Store.selectedClipId) TimelineModule.deleteSelected();
            });
            this.registerCommand('global', 'core.fullscreen', 'Toggle Fullscreen', 'View', () => {
                const viewport = document.getElementById('viewportContainer');
                if (viewport) document.fullscreenElement ? document.exitFullscreen() : viewport.requestFullscreen();
            });
        },

        bindSovereignListener() {
            this.keydownHandler = (e) => {
                // Ignore inputs into text fields
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
                
                // Modifiers are completely ignored when pressed by themselves!
                // They can only be used in combination with other keys.
                if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
                
                // Base Editor Neutralization
                if (['Space', 'Delete', 'Backspace'].includes(e.code)) e.stopPropagation();

                let activeContext = 'global';
                for (const [id, ctx] of Object.entries(this.contexts)) {
                    if (id !== 'global' && ctx.isActive()) { activeContext = id; break; }
                }
                
                // Compile the precise modifier string combination
                let prefix = '';
                if (e.ctrlKey || e.metaKey) prefix += 'Ctrl+';
                if (e.altKey) prefix += 'Alt+';
                if (e.shiftKey) prefix += 'Shift+';
                
                let fullCode = prefix + e.code;

                // Look for an exact match including modifiers
                let mappedCommandId = this.keymaps[activeContext]?.[fullCode] || this.keymaps['global'][fullCode];
                
                if (mappedCommandId && this.commands[mappedCommandId]) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    try { this.commands[mappedCommandId].execute(); } catch (err) {}
                }
            };
            window.addEventListener('keydown', this.keydownHandler, true);
        },

        async loadPreferences() {
            try {
                const data = await DB.get('system', 'hotkey_preferences');
                this.keymaps = data?.keymaps ? { ...this.defaultKeymaps, ...data.keymaps } : JSON.parse(JSON.stringify(this.defaultKeymaps));
            } catch { this.keymaps = JSON.parse(JSON.stringify(this.defaultKeymaps)); }
        },

        async savePreferences() {
            try { await DB.put('system', { id: 'hotkey_preferences', keymaps: this.keymaps }); } catch {}
        },

        injectStyles() {
            const style = document.createElement('style');
            style.id = `${MODULE_ID}_styles`;
            style.innerHTML = `
                .hk-kbd-row { display: flex; gap: clamp(2px, 0.5vw, 6px); margin-bottom: clamp(2px, 0.5vw, 6px); width: 100%; justify-content: center; }
                .hk-key { 
                    height: clamp(32px, 4.5vh, 48px); min-width: 0; padding: 0 4px; flex: 1; display: flex; align-items: center; justify-content: center; 
                    background: #222; border: 1px solid #333; border-radius: 6px; border-bottom-width: 3px;
                    color: #888; cursor: pointer; user-select: none; transition: all 0.15s; font-size: clamp(9px, 1.1vw, 12px); font-weight: bold; 
                    box-shadow: 0 4px 6px rgba(0,0,0,0.3); position: relative; overflow: hidden; white-space: nowrap;
                }
                .hk-key:hover { background: #2a2a2a; color: #fff; transform: translateY(1px); border-bottom-width: 2px; }
                .hk-key:active { transform: translateY(3px); border-bottom-width: 0px; background: #333; }
                
                .hk-key.mapped { color: #fff; border-color: #008f82; border-bottom-color: #00d2be; }
                .hk-key.mapped::after { content: ''; position: absolute; top: 4px; right: 4px; width: 6px; height: 6px; background: #00d2be; border-radius: 50%; box-shadow: 0 0 5px #00d2be; }
                
                .hk-key.selected { background: rgba(0, 210, 190, 0.2); border-color: #00d2be; color: #00d2be; box-shadow: 0 0 15px rgba(0, 210, 190, 0.3); }
                .hk-key.hover-highlight { background: rgba(0, 210, 190, 0.4) !important; color: #fff !important; transform: scale(1.05); z-index: 10; border-color: #00d2be; }
                
                .hk-key.active-mod { background: #00d2be; color: #000; border-color: #00a896; box-shadow: inset 0 0 10px rgba(0,0,0,0.2); transform: translateY(2px); border-bottom-width: 1px; }

                .hk-k-tab { flex: 1.5; }
                .hk-k-caps { flex: 1.8; }
                .hk-k-shift-l { flex: 2.2; }
                .hk-k-shift-r { flex: 2.8; }
                .hk-k-ctrl { flex: 1.2; }
                .hk-k-space { flex: 6; }
                .hk-k-enter { flex: 2; }
                .hk-k-backspace { flex: 2; }
                .hk-numpad-wide { flex: 2; }

                .hk-cmd-item { transition: all 0.1s; border-left: 3px solid transparent; }
                .hk-cmd-item:hover { background: rgba(255,255,255,0.05); }
                .hk-cmd-item.active { background: rgba(0, 210, 190, 0.1); border-left-color: #00d2be; }
                .hk-cmd-item.highlight { background: rgba(0, 210, 190, 0.2); border-left-color: #00d2be; }
            `;
            document.head.appendChild(style);
        },

        injectMenuButton() {
            const fileDropdown = document.querySelector('.menu-wrapper .dropdown');
            if (fileDropdown) {
                const divider = document.createElement('div');
                divider.className = 'border-t border-gray-700 my-1';
                divider.id = 'hk_menu_divider';
                
                const btn = document.createElement('div');
                btn.id = 'hk_menu_btn';
                btn.className = 'dropdown-item flex items-center justify-between group';
                btn.innerHTML = `<span><i class="fa-solid fa-keyboard mr-2 text-gray-500 group-hover:text-teal-400"></i> Keyboard Shortcuts...</span>`;
                btn.onclick = () => this.openModal();
                
                fileDropdown.appendChild(divider);
                fileDropdown.appendChild(btn);
            }
        },

        buildModalUI() {
            if (document.getElementById('hk-mapper-modal')) return;

            this.modal = document.createElement('div');
            this.modal.id = 'hk-mapper-modal';
            this.modal.className = 'fixed inset-0 bg-black/90 z-[100000] flex items-center justify-center hidden backdrop-blur-sm';
            
            // Note the structurally redefined layout to ensure the Inspector is permanently visible
            this.modal.innerHTML = `
                <div class="bg-[#151515] border border-[#333] rounded-xl w-[95vw] max-w-[1250px] h-[85vh] max-h-[850px] shadow-2xl flex flex-col overflow-hidden" onclick="event.stopPropagation()">
                    
                    <div class="flex justify-between items-center px-6 py-4 border-b border-[#333] bg-[#1a1a1a]">
                        <div class="flex items-center gap-6">
                            
                            <!-- THE PROFESSIONAL FLAT LOGO -->
                            <div class="relative flex items-center select-none pointer-events-none py-1 px-2">
                                <i class="fa-solid fa-fire absolute text-teal-500/20 text-4xl left-0 z-0"></i>
                                <h2 class="text-2xl font-bold tracking-widest text-teal-400 uppercase relative z-10 ml-3">HOTKEY</h2>
                            </div>
                            
                            <div class="h-8 w-px bg-[#333]"></div>

                            <div class="flex items-center gap-2">
                                <span class="text-[10px] text-gray-500 uppercase font-bold tracking-widest mt-1">Context:</span>
                                <select id="hk-context-select" class="bg-[#111] border border-[#444] text-teal-400 font-bold text-xs py-1 px-2 rounded outline-none cursor-pointer focus:border-teal-500 transition-colors">
                                </select>
                            </div>
                        </div>
                        <button onclick="window.HOTKEY_MASTER.closeModal()" class="text-gray-500 hover:text-white w-8 h-8 rounded flex items-center justify-center hover:bg-[#333] transition"><i class="fa-solid fa-xmark text-lg"></i></button>
                    </div>

                    <div class="flex flex-1 overflow-hidden">
                        
                        <!-- LEFT: Unified Keyboard & Inspector Pane -->
                        <div class="flex-[3] flex flex-col bg-[#0a0a0a] relative min-w-0 border-r border-[#333]">
                            
                            <!-- Static Header -->
                            <div class="p-6 pb-2 text-center flex-shrink-0">
                                <p class="text-sm text-gray-400">Click a modifier toggle, then a key to map a shortcut.</p>
                            </div>
                            
                            <!-- Scrollable Keyboard Canvas -->
                            <div class="flex-1 overflow-y-auto custom-scroll px-6 pb-6">
                                <div id="hk-keyboard-render" class="max-w-full w-full mx-auto flex flex-col items-center">
                                    <!-- Keyboard generated by JS -->
                                </div>
                            </div>
                            
                            <!-- Fixed Bottom Inspector Panel -->
                            <div id="hk-key-inspector" class="bg-[#151515] border-t border-[#333] p-4 flex items-center gap-4 opacity-0 transition-opacity shadow-[0_-10px_30px_rgba(0,0,0,0.5)] flex-shrink-0 z-20">
                                <button id="hk-ins-close" class="absolute top-2 right-2 text-gray-500 hover:text-white w-6 h-6 flex items-center justify-center rounded transition"><i class="fa-solid fa-xmark"></i></button>
                                
                                <div id="hk-ins-key" class="text-2xl font-mono text-teal-400 font-bold bg-[#111] px-4 py-2 rounded border border-[#222] min-w-[60px] text-center">X</div>
                                <div class="flex-1 pr-6 min-w-0">
                                    <div class="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Currently Assigned To</div>
                                    <div id="hk-ins-cmd" class="text-white font-bold text-lg truncate">Split Clip</div>
                                    <div id="hk-ins-desc" class="text-xs text-gray-400 truncate">Cuts the selected clip at the playhead.</div>
                                </div>
                                <button id="hk-btn-unassign" class="bg-red-900/30 hover:bg-red-800 text-red-400 border border-red-900 px-4 py-2 rounded text-xs font-bold transition flex-shrink-0">Unassign Key</button>
                            </div>

                        </div>

                        <!-- RIGHT: Command Legend -->
                        <div class="flex-[2] bg-[#151515] flex flex-col min-w-0">
                            <div class="p-4 border-b border-[#333] bg-[#1a1a1a]">
                                <input type="text" id="hk-cmd-search" placeholder="Search commands..." class="w-full bg-[#111] border border-[#444] text-white p-2 text-sm rounded outline-none focus:border-teal-500 transition">
                            </div>
                            <div id="hk-cmd-list" class="flex-1 overflow-y-auto custom-scroll p-2">
                                <!-- Commands generated by JS -->
                            </div>
                        </div>

                    </div>
                </div>
            `;
            
            this.modal.onclick = () => this.closeModal();
            document.body.appendChild(this.modal);

            document.getElementById('hk-context-select').onchange = (e) => {
                this.activeUiContext = e.target.value;
                this.selectedKey = null;
                this.renderKeyboard();
                this.renderCommandList();
                this.updateKeyInspector();
            };

            document.getElementById('hk-cmd-search').oninput = (e) => {
                this.renderCommandList(e.target.value);
            };

            document.getElementById('hk-btn-unassign').onclick = () => {
                if (this.selectedKey && this.keymaps[this.activeUiContext][this.selectedKey]) {
                    delete this.keymaps[this.activeUiContext][this.selectedKey];
                    this.savePreferences();
                    this.renderKeyboard();
                    this.renderCommandList();
                    this.updateKeyInspector();
                }
            };

            document.getElementById('hk-ins-close').onclick = () => {
                this.selectedKey = null;
                this.renderKeyboard();
                this.updateKeyInspector();
            };
        },

        updateContextDropdown() {
            const select = document.getElementById('hk-context-select');
            if (!select) return;
            select.innerHTML = '';
            Object.entries(this.contexts).forEach(([id, ctx]) => {
                const opt = document.createElement('option');
                opt.value = id;
                opt.innerText = ctx.name;
                if (id === this.activeUiContext) opt.selected = true;
                select.appendChild(opt);
            });
        },

        getCurrentModifierPrefix() {
            let prefix = '';
            if (this.modCtrl) prefix += 'Ctrl+';
            if (this.modAlt) prefix += 'Alt+';
            if (this.modShift) prefix += 'Shift+';
            return prefix;
        },

        formatKeyDisplay(keyString) {
            return keyString.replace(/Key/g, '').replace(/Digit/g, '').replace(/Numpad/g, 'Num ').replace(/\+/g, ' + ');
        },

        renderKeyboard() {
            const kbd = document.getElementById('hk-keyboard-render');
            if (!kbd) return;

            const prefix = this.getCurrentModifierPrefix();

            const mainLayout = [
                [{c:'Backquote', l:'~'}, {c:'Digit1', l:'1'}, {c:'Digit2', l:'2'}, {c:'Digit3', l:'3'}, {c:'Digit4', l:'4'}, {c:'Digit5', l:'5'}, {c:'Digit6', l:'6'}, {c:'Digit7', l:'7'}, {c:'Digit8', l:'8'}, {c:'Digit9', l:'9'}, {c:'Digit0', l:'0'}, {c:'Minus', l:'-'}, {c:'Equal', l:'='}, {c:'Backspace', l:'Bksp', cls:'hk-k-backspace'}],
                [{c:'Tab', l:'Tab', cls:'hk-k-tab'}, {c:'KeyQ', l:'Q'}, {c:'KeyW', l:'W'}, {c:'KeyE', l:'E'}, {c:'KeyR', l:'R'}, {c:'KeyT', l:'T'}, {c:'KeyY', l:'Y'}, {c:'KeyU', l:'U'}, {c:'KeyI', l:'I'}, {c:'KeyO', l:'O'}, {c:'KeyP', l:'P'}, {c:'BracketLeft', l:'['}, {c:'BracketRight', l:']'}, {c:'Backslash', l:'\\'}],
                [{c:'CapsLock', l:'Caps', cls:'hk-k-caps'}, {c:'KeyA', l:'A'}, {c:'KeyS', l:'S'}, {c:'KeyD', l:'D'}, {c:'KeyF', l:'F'}, {c:'KeyG', l:'G'}, {c:'KeyH', l:'H'}, {c:'KeyJ', l:'J'}, {c:'KeyK', l:'K'}, {c:'KeyL', l:'L'}, {c:'Semicolon', l:';'}, {c:'Quote', l:"'"}, {c:'Enter', l:'Enter', cls:'hk-k-enter'}],
                [{c:'ShiftLeft', l:'Shift', cls:'hk-k-shift-l'}, {c:'KeyZ', l:'Z'}, {c:'KeyX', l:'X'}, {c:'KeyC', l:'C'}, {c:'KeyV', l:'V'}, {c:'KeyB', l:'B'}, {c:'KeyN', l:'N'}, {c:'KeyM', l:'M'}, {c:'Comma', l:','}, {c:'Period', l:'.'}, {c:'Slash', l:'/'}, {c:'ShiftRight', l:'Shift', cls:'hk-k-shift-r'}],
                [{c:'ControlLeft', l:'Ctrl', cls:'hk-k-ctrl'}, {c:'AltLeft', l:'Alt', cls:'hk-k-ctrl'}, {c:'Space', l:'Space', cls:'hk-k-space'}, {c:'AltRight', l:'Alt', cls:'hk-k-ctrl'}, {c:'ControlRight', l:'Ctrl', cls:'hk-k-ctrl'}]
            ];

            const numpadLayout = [
                [{c:'NumLock', l:'Num'}, {c:'NumpadDivide', l:'/'}, {c:'NumpadMultiply', l:'*'}, {c:'NumpadSubtract', l:'-'}],
                [{c:'Numpad7', l:'7'}, {c:'Numpad8', l:'8'}, {c:'Numpad9', l:'9'}, {c:'NumpadAdd', l:'+'}],
                [{c:'Numpad4', l:'4'}, {c:'Numpad5', l:'5'}, {c:'Numpad6', l:'6'}, {c:'NumpadEnter', l:'Ent'}],
                [{c:'Numpad1', l:'1'}, {c:'Numpad2', l:'2'}, {c:'Numpad3', l:'3'}, {c:'NumpadDecimal', l:'.'}],
                [{c:'Numpad0', l:'0', cls:'hk-numpad-wide'}, {c:'NumpadComma', l:',', cls:'flex-1'}]
            ];

            const buildRowHtml = (row) => {
                let html = `<div class="hk-kbd-row">`;
                row.forEach(key => {
                    const isModKey = key.c.includes('Control') || key.c.includes('Alt') || key.c.includes('Shift') || key.c === 'CapsLock' || key.c === 'NumLock';
                    
                    const fullCode = isModKey ? key.c : prefix + key.c;
                    const mappedCmd = !isModKey && this.keymaps[this.activeUiContext] ? this.keymaps[this.activeUiContext][fullCode] : null;
                    const isMapped = !!mappedCmd;
                    const isSelected = this.selectedKey === fullCode && !isModKey;
                    
                    let classes = `hk-key ${key.cls || ''}`;
                    if (isMapped) classes += ' mapped';
                    if (isSelected) classes += ' selected';
                    
                    // Highlight modifier keys if their global state is toggled
                    if ((key.c.includes('Control') && this.modCtrl) ||
                        (key.c.includes('Alt') && this.modAlt) ||
                        (key.c.includes('Shift') && this.modShift)) {
                        classes += ' active-mod';
                    }

                    html += `
                        <div class="hk-key-el ${classes}" data-code="${key.c}" data-fullcode="${fullCode}" title="${mappedCmd ? this.commands[mappedCmd]?.name : (isModKey ? 'Modifier Toggle' : 'Unassigned')}">
                            ${key.l}
                        </div>
                    `;
                });
                html += `</div>`;
                return html;
            };

            let html = `
                <div class="flex justify-center gap-3 mb-6">
                    <button id="hk-mod-ctrl" class="px-5 py-1.5 rounded border text-xs font-bold transition-all shadow ${this.modCtrl ? 'bg-teal-600 text-white border-teal-500' : 'bg-[#111] text-gray-500 border-[#333] hover:text-gray-300'}">CTRL</button>
                    <button id="hk-mod-alt" class="px-5 py-1.5 rounded border text-xs font-bold transition-all shadow ${this.modAlt ? 'bg-teal-600 text-white border-teal-500' : 'bg-[#111] text-gray-500 border-[#333] hover:text-gray-300'}">ALT</button>
                    <button id="hk-mod-shift" class="px-5 py-1.5 rounded border text-xs font-bold transition-all shadow ${this.modShift ? 'bg-teal-600 text-white border-teal-500' : 'bg-[#111] text-gray-500 border-[#333] hover:text-gray-300'}">SHIFT</button>
                </div>
                
                <div class="flex flex-col xl:flex-row gap-6 items-center xl:items-end justify-center w-full">
                    <div class="main-kbd w-full max-w-[800px] flex-1 flex flex-col gap-[4px]">
                        ${mainLayout.map(buildRowHtml).join('')}
                    </div>
                    <div class="numpad-kbd w-full max-w-[300px] xl:max-w-[260px] flex-shrink-0 bg-[#111] border border-[#222] p-2 rounded-lg flex flex-col gap-[4px] shadow-inner mt-4 xl:mt-0">
                        ${numpadLayout.map(buildRowHtml).join('')}
                    </div>
                </div>
            `;
            
            kbd.innerHTML = html;

            document.getElementById('hk-mod-ctrl').onclick = () => { this.modCtrl = !this.modCtrl; this.selectedKey = null; this.renderKeyboard(); this.renderCommandList(); this.updateKeyInspector(); };
            document.getElementById('hk-mod-alt').onclick = () => { this.modAlt = !this.modAlt; this.selectedKey = null; this.renderKeyboard(); this.renderCommandList(); this.updateKeyInspector(); };
            document.getElementById('hk-mod-shift').onclick = () => { this.modShift = !this.modShift; this.selectedKey = null; this.renderKeyboard(); this.renderCommandList(); this.updateKeyInspector(); };

            kbd.querySelectorAll('.hk-key-el').forEach(el => {
                const fullCode = el.dataset.fullcode;
                const baseCode = el.dataset.code;
                
                el.onclick = () => {
                    // Clicking modifiers on the keyboard visually toggles the exact same state as the top buttons
                    if (baseCode.includes('Control')) { document.getElementById('hk-mod-ctrl').click(); return; }
                    if (baseCode.includes('Alt')) { document.getElementById('hk-mod-alt').click(); return; }
                    if (baseCode.includes('Shift')) { document.getElementById('hk-mod-shift').click(); return; }
                    if (baseCode === 'CapsLock' || baseCode === 'NumLock') return; // Cannot be assigned

                    this.selectedKey = fullCode;
                    this.renderKeyboard(); 
                    this.updateKeyInspector();
                };

                el.onmouseenter = () => {
                    // Do not highlight modifier keys in the list
                    if (['ControlLeft','ControlRight','AltLeft','AltRight','ShiftLeft','ShiftRight', 'CapsLock', 'NumLock'].includes(baseCode)) return;

                    const cmdId = this.keymaps[this.activeUiContext] ? this.keymaps[this.activeUiContext][fullCode] : null;
                    if (cmdId) {
                        const cmdRow = document.getElementById(`hk-cmd-row-${cmdId}`);
                        if (cmdRow) {
                            cmdRow.classList.add('highlight');
                            cmdRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        }
                    }
                };
                el.onmouseleave = () => {
                    document.querySelectorAll('.hk-cmd-item.highlight').forEach(n => n.classList.remove('highlight'));
                };
            });
        },

        renderCommandList(filter = '') {
            const listEl = document.getElementById('hk-cmd-list');
            if (!listEl) return;

            const grouped = {};
            Object.values(this.commands).forEach(cmd => {
                if (cmd.contextId !== this.activeUiContext) return;
                if (filter && !cmd.name.toLowerCase().includes(filter.toLowerCase()) && !cmd.description.toLowerCase().includes(filter.toLowerCase())) return;

                if (!grouped[cmd.category]) grouped[cmd.category] = [];
                grouped[cmd.category].push(cmd);
            });

            if (Object.keys(grouped).length === 0) {
                listEl.innerHTML = `<div class="p-4 text-center text-gray-600 text-xs">No commands found for this context.</div>`;
                return;
            }

            let html = '';
            
            if (this.selectedKey) {
                const friendlyName = this.formatKeyDisplay(this.selectedKey);
                html += `
                    <div class="bg-teal-900/30 border border-teal-500/50 rounded p-3 mb-4 text-center animate-pulse mx-2 mt-2">
                        <span class="text-teal-400 font-bold text-xs"><i class="fa-solid fa-link mr-2"></i>Assigning to [ ${friendlyName} ]</span>
                        <div class="text-[10px] text-gray-400 mt-1">Click a command below to assign it.</div>
                    </div>
                `;
            }

            Object.keys(grouped).sort().forEach(category => {
                html += `
                    <div class="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-2 mt-4 px-2">${category}</div>
                `;
                
                grouped[category].forEach(cmd => {
                    const mappedKeys = Object.keys(this.keymaps[this.activeUiContext] || {}).filter(k => this.keymaps[this.activeUiContext][k] === cmd.id);
                    
                    let keyBadges = '';
                    mappedKeys.forEach(k => {
                        const label = this.formatKeyDisplay(k);
                        keyBadges += `<span class="bg-[#333] border border-[#555] text-white px-1.5 py-0.5 rounded text-[9px] font-mono ml-1 inline-flex items-center" data-link-key="${k}">
                            ${label}
                            <i class="fa-solid fa-xmark ml-1.5 text-gray-500 hover:text-red-400 cursor-pointer transition-colors" data-unassign-key="${k}" title="Unassign ${label}"></i>
                        </span>`;
                    });

                    const isActive = this.selectedKey && mappedKeys.includes(this.selectedKey);

                    html += `
                        <div id="hk-cmd-row-${cmd.id}" class="hk-cmd-item p-3 mb-1 cursor-pointer rounded flex justify-between items-center ${isActive ? 'active' : ''}" data-cmd-id="${cmd.id}">
                            <div class="flex-1 min-w-0 pr-2">
                                <div class="text-sm font-bold text-gray-200 truncate">${cmd.name}</div>
                                <div class="text-[10px] text-gray-500 mt-0.5 truncate">${cmd.description}</div>
                            </div>
                            <div class="flex items-center whitespace-nowrap">
                                ${keyBadges}
                                ${this.selectedKey && !isActive ? `<i class="fa-solid fa-plus text-teal-400 opacity-0 group-hover:opacity-100 ml-3 transition"></i>` : ''}
                            </div>
                        </div>
                    `;
                });
            });

            listEl.innerHTML = html;

            listEl.querySelectorAll('[data-unassign-key]').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const k = btn.dataset.unassignKey;
                    delete this.keymaps[this.activeUiContext][k];
                    this.savePreferences();
                    this.renderKeyboard();
                    this.renderCommandList(document.getElementById('hk-cmd-search').value);
                    this.updateKeyInspector();
                    if(typeof Notify !== 'undefined') Notify.show("Shortcut Removed", "fa-unlink");
                };
            });

            listEl.querySelectorAll('.hk-cmd-item').forEach(el => {
                const cmdId = el.dataset.cmdId;
                
                el.onclick = () => {
                    if (!this.selectedKey) {
                        if(typeof Notify !== 'undefined') Notify.show("Select a key on the left first", "fa-hand-pointer");
                        return;
                    }

                    if (!this.keymaps[this.activeUiContext]) this.keymaps[this.activeUiContext] = {};
                    this.keymaps[this.activeUiContext][this.selectedKey] = cmdId;
                    this.savePreferences();
                    
                    this.renderKeyboard();
                    this.renderCommandList(document.getElementById('hk-cmd-search').value);
                    this.updateKeyInspector();
                    
                    if(typeof Notify !== 'undefined') Notify.show("Shortcut Assigned", "fa-link");
                };

                el.onmouseenter = () => {
                    el.querySelectorAll('[data-link-key]').forEach(badge => {
                        const code = badge.dataset.linkKey;
                        const keyEl = document.querySelector(`.hk-key-el[data-fullcode="${code}"]`);
                        if (keyEl) keyEl.classList.add('hover-highlight');
                    });
                };
                el.onmouseleave = () => {
                    document.querySelectorAll('.hk-key-el.hover-highlight').forEach(n => n.classList.remove('hover-highlight'));
                };
            });
        },

        updateKeyInspector() {
            const inspector = document.getElementById('hk-key-inspector');
            if (!inspector) return;

            if (!this.selectedKey) {
                inspector.style.opacity = '0';
                inspector.style.pointerEvents = 'none';
                return;
            }

            inspector.style.opacity = '1';
            inspector.style.pointerEvents = 'auto';

            const friendlyName = this.formatKeyDisplay(this.selectedKey);
            document.getElementById('hk-ins-key').innerText = friendlyName;

            const mappedCmdId = this.keymaps[this.activeUiContext] ? this.keymaps[this.activeUiContext][this.selectedKey] : null;
            if (mappedCmdId && this.commands[mappedCmdId]) {
                const cmd = this.commands[mappedCmdId];
                document.getElementById('hk-ins-cmd').innerText = cmd.name;
                document.getElementById('hk-ins-cmd').className = 'text-white font-bold text-lg truncate';
                document.getElementById('hk-ins-desc').innerText = cmd.description || 'No description provided.';
                document.getElementById('hk-btn-unassign').style.display = 'block';
            } else {
                document.getElementById('hk-ins-cmd').innerText = "Unassigned";
                document.getElementById('hk-ins-cmd').className = 'text-gray-500 font-bold text-lg italic';
                document.getElementById('hk-ins-desc').innerText = "Click a command from the list on the right to assign it to this key.";
                document.getElementById('hk-btn-unassign').style.display = 'none';
            }
        },

        openModal() {
            if (this.modal) {
                let activeCtx = 'global';
                for (const [id, ctx] of Object.entries(this.contexts)) {
                    if (id !== 'global' && ctx.isActive()) {
                        activeCtx = id;
                        break;
                    }
                }
                this.activeUiContext = activeCtx;
                
                this.updateContextDropdown();
                document.getElementById('hk-context-select').value = this.activeUiContext;
                
                this.selectedKey = null;
                this.renderKeyboard();
                this.renderCommandList();
                this.updateKeyInspector();
                this.modal.classList.remove('hidden');
            }
        },

        closeModal() {
            if (this.modal) this.modal.classList.add('hidden');
        },

        cleanup() {
            console.log(`[${MODULE_ID}] Executing secure shutdown & uninstallation...`);
            
            this.isActive = false;
            if (window.HOTKEY_MASTER) window.HOTKEY_MASTER.isActive = false;
            
            if (this.origAppend) document.body.appendChild = this.origAppend;
            if (this.origHeadAppend) document.head.appendChild = this.origHeadAppend;
            if (this.origModuleRemove && typeof ModuleManager !== 'undefined') ModuleManager.remove = this.origModuleRemove;
            
            if (this.keydownHandler) {
                window.removeEventListener('keydown', this.keydownHandler, true);
            }
            
            document.getElementById('hk-mapper-modal')?.remove();
            document.getElementById('hk-pin-modal')?.remove();
            document.getElementById('hk-rogue-inline-banner')?.remove();
            document.getElementById(`${MODULE_ID}_styles`)?.remove();
            document.getElementById('hk_menu_btn')?.remove();
            document.getElementById('hk_menu_divider')?.remove();
            
            try {
                delete document.onkeydown;
                delete document.onkeyup;
                delete window.onkeydown;
                delete window.onkeyup;
                delete HTMLElement.prototype.onkeydown;
                delete HTMLElement.prototype.onkeyup;
            } catch(e) {}
            
            delete window.HOTKEY_MASTER;
            delete window.__HK_INTERNAL;
        }
    };

    window[MODULE_ID.toUpperCase()] = HotkeyMaster;
    HotkeyMaster.init();

})();
