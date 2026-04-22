/**
 * @name Hotkey Master & Command Palette
 * @version 2.7.8
 * @developer Forge™
 * @description Ensures all extensions receive keyboard input through a unified, user‑customizable system. Blocks rogue listeners that bypass the central mapper.
 */
(function() {
    const MODULE_ID = 'hotkey_master';

    if (typeof DB === 'undefined') {
        console.error(`❌ [${MODULE_ID}] IndexedDB environment not found.`);
        return;
    }

    const HotkeyMaster = {
        name: "Hotkey Master & Command Palette",
        version: "2.7.8",
        
        contexts: {},     
        commands: {},     
        keymaps: { 'global': {} },
        
        modal: null,
        selectedKey: null, 
        activeUiContext: 'global', 

        rogueQueue: [],
        isRogueBannerVisible: false,
        warnedExtensions: new Set(),

        defaultKeymaps: {
            'global': { 
                'KeyS': 'core.split', 'KeyC': 'core.split', 'KeyX': 'core.delete', 
                'Delete': 'core.delete', 'Backspace': 'core.delete', 'KeyF': 'core.fullscreen', 
                'Space': 'core.play_pause', 'KeyL': 'core.fast_forward', 'KeyK': 'core.pause', 'KeyJ': 'core.rewind'
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
            this.watchForExtensionManagerModal();
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

        watchForExtensionManagerModal() {
            // Inject the Rescan button whenever the modal becomes visible
            const observer = new MutationObserver(() => {
                const modal = document.getElementById('modulesModal');
                if (modal && !modal.classList.contains('hidden') && !document.getElementById('hk-rescan-btn')) {
                    this.injectRescanButton();
                }
            });
            observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
        },

        injectRescanButton() {
            const modalFooter = document.querySelector('#modulesModal .flex.justify-between.items-center');
            if (!modalFooter) return;
            
            // Remove any existing button to avoid duplicates
            document.getElementById('hk-rescan-btn')?.remove();
            
            const rescanBtn = document.createElement('button');
            rescanBtn.id = 'hk-rescan-btn';
            rescanBtn.className = 'px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-black font-bold text-xs rounded transition shadow-lg ml-2';
            rescanBtn.innerHTML = '<i class="fa-solid fa-shield-halved mr-1"></i> Rescan Extensions';
            rescanBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (typeof Notify !== 'undefined') Notify.show('Scanning extensions...', 'fa-search');
                HotkeyMaster.scanExistingModules().catch(err => console.warn('Rescan failed:', err));
            };
            
            const doneBtn = modalFooter.querySelector('button:last-child');
            modalFooter.insertBefore(rescanBtn, doneBtn);
        },

        monitorModuleInstallation() {
            const origLoadFolder = ModuleManager.loadFolder;
            const origInstallDefaults = ModuleManager.installDefaults;

            ModuleManager.loadFolder = function(...args) {
                const result = origLoadFolder.apply(this, args);
                // Wait longer for folder processing and DB writes
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
            this.warnedExtensions.delete(extName); // Allow re‑flagging if reinstalled
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
                // Remove old button listener before updating content
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
                    Please refer to the <a href="https://github.com/Cleo876/wasm-video-editor/blob/main/Extensions/Modules%20Developer%20Guide.md" target="_blank" class="text-teal-400 hover:text-teal-300 underline font-bold transition">Modules Developer Guide</a> for integration instructions.
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
                
                // Animate out, then show next or hide
                banner.style.transform = 'translate(-50%, -5px) scale(0.98)';
                banner.style.opacity = '0';
                setTimeout(() => {
                    if (this.rogueQueue.length > 0) {
                        this.showNextRogue(); // Reuse same banner element
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

        // --- CORE SHORTCUT API & UI (unchanged) ---
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
                if (typeof Player !== 'undefined') Player.togglePlay();
            });
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
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
                if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
                if (['Space', 'Delete', 'Backspace'].includes(e.code)) e.stopPropagation();

                let activeContext = 'global';
                for (const [id, ctx] of Object.entries(this.contexts)) {
                    if (id !== 'global' && ctx.isActive()) { activeContext = id; break; }
                }
                let mappedCommandId = this.keymaps[activeContext]?.[e.code] || this.keymaps['global'][e.code];
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
        injectStyles() { /* unchanged */ },
        injectMenuButton() { /* unchanged */ },
        buildModalUI() { /* unchanged */ },
        updateContextDropdown() { /* unchanged */ },
        renderKeyboard() { /* unchanged */ },
        renderCommandList() { /* unchanged */ },
        updateKeyInspector() { /* unchanged */ },
        openModal() { /* unchanged */ },
        closeModal() { /* unchanged */ },
        cleanup() {
            this.isActive = false;
            if (this.origAppend) document.body.appendChild = this.origAppend;
            if (this.origHeadAppend) document.head.appendChild = this.origHeadAppend;
            if (this.origModuleRemove && typeof ModuleManager !== 'undefined') ModuleManager.remove = this.origModuleRemove;
            if (this.keydownHandler) window.removeEventListener('keydown', this.keydownHandler, true);
            document.getElementById('hk-mapper-modal')?.remove();
            document.getElementById('hk-pin-modal')?.remove();
            document.getElementById('hk-rogue-inline-banner')?.remove();
            document.getElementById(`${MODULE_ID}_styles`)?.remove();
            document.getElementById('hk_menu_btn')?.remove();
            document.getElementById('hk_menu_divider')?.remove();
            delete window.HOTKEY_MASTER;
        }
    };

    window[MODULE_ID.toUpperCase()] = HotkeyMaster;
    HotkeyMaster.init();
})();
