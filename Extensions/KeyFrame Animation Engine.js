/**
 * @name KeyFrame Animation Engine
 * @version 3.12.0
 * @developer Forge™
 * @description Professional Node-Based Animation System. Features True-Live Inspector Rendering, Precision Navigation, Global Integrity Hooks, and Safe DOM Preservation for Cross-Extension Compatibility.
 */
(function() {
    const MODULE_ID = 'keyframe_engine';

    if (typeof Store === 'undefined' || typeof Player === 'undefined' || typeof NativeInspector === 'undefined') {
        console.error(`❌ [${MODULE_ID}] Core environment not found. Ensure editor is fully loaded.`);
        return;
    }

    // --- BEZIER MATH SOLVER ---
    const Bezier = {
        solve(x, x1, y1, x2, y2) {
            if (x === 0 || x === 1) return x === 0 ? 0 : 1;
            let t = this.findTForX(x, x1, x2);
            return this.calcBezier(t, y1, y2);
        },
        calcBezier(t, p1, p2) { return 3 * Math.pow(1 - t, 2) * t * p1 + 3 * (1 - t) * Math.pow(t, 2) * p2 + Math.pow(t, 3); },
        findTForX(x, x1, x2) {
            let t = 0.5, lower = 0, upper = 1;
            for (let i = 0; i < 15; i++) {
                let currentX = this.calcBezier(t, x1, x2);
                if (Math.abs(currentX - x) < 0.001) break;
                if (currentX < x) lower = t; else upper = t;
                t = (upper + lower) / 2;
            }
            return t;
        }
    };

    // Upgraded DOM structure for the Morphing UX
    const SparkleSVG = `
        <div class="kf-sparkle-container absolute inset-0 flex items-center justify-center pointer-events-none">
            <svg viewBox="0 0 100 100" class="w-full h-full fill-current kf-sparkle-icon transition-all duration-300 ease-out">
                <path d="M50 0 C50 40 60 50 100 50 C60 50 50 60 50 100 C50 60 40 50 0 50 C40 50 50 40 50 0 Z"/>
            </svg>
            <i class="fa-solid fa-xmark absolute text-[12px] kf-x-icon transition-all duration-300 ease-out opacity-0 scale-50 rotate-[-90deg]"></i>
        </div>
    `;

    const KeyFrameEngine = {
        isActive: true,
        fps: 24,
        hotkeyHandshake: null,
        pendingTimelineRefresh: false,
        
        // Event-Driven Interaction State
        isInteracting: false,
        pendingCapture: false,
        interactionListeners: {},
        interactionSnapshot: new Map(),
        lastInterpTime: -1, 
        
        // Bezier Editor State
        activeBezNode: null,
        activeBezHandles: [0.25, 0.1, 0.25, 1.0],

        // Native Hooks
        originalInspectorRender: null,
        originalRenderFrame: null,
        originalDrawToCanvas: null,
        originalRenderTrack: null,
        originalSaveState: null,
        originalRefreshTimeline: null,

        init() {
            console.log(`[${MODULE_ID}] Booting Node-Based KeyFrame Engine v3.12.0...`);
            
            this.injectStyles();
            this.buildBezierEditor();
            this.registerHotkeys();
            this.bindInteractionTracker();
            this.hijackStore();
            this.hijackRenderer();
            this.hijackInspector();
            this.hijackTimeline();
            this.hijackUI(); // GLOBAL INTEGRITY HOOK (Undo/Redo Fix)
            this.bindGlobalEvents();

            window.KEYFRAME_API = this;
        },

        // --- DATA MIGRATION & QUANTIZATION ---
        snapToFrame(time) {
            // Absolute float-drift protection
            return Math.round(time * this.fps) / this.fps;
        },

        getNormalizedTime(localTime, clipDuration) {
            if (clipDuration <= 0) return 0;
            let norm = localTime / clipDuration;
            return parseFloat(Math.max(0, Math.min(1, norm)).toFixed(4));
        },

        migrateToNodes(clip) {
            if (!clip.keyframeNodes) clip.keyframeNodes = [];
            
            let needsSort = false;
            // Legacy Migration (From Absolute Seconds)
            if (clip.keyframes) {
                console.log(`[${MODULE_ID}] Upgrading legacy keyframes to Unified Nodes for clip ${clip.id}`);
                Object.keys(clip.keyframes).forEach(prop => {
                    clip.keyframes[prop].forEach(oldK => {
                        const tNorm = this.getNormalizedTime(oldK.time, clip.duration);
                        let node = clip.keyframeNodes.find(n => Math.abs(n.tNorm - tNorm) < 0.001);
                        if (!node) {
                            node = { 
                                id: 'kf_' + Date.now() + Math.random().toString(36).substr(2,5), 
                                tNorm: tNorm, 
                                props: {}, 
                                easings: {} 
                            };
                            clip.keyframeNodes.push(node);
                        }
                        node.props[prop] = oldK.val;
                        node.easings[prop] = oldK.handles || [0.25, 0.1, 0.25, 1.0];
                    });
                });
                delete clip.keyframes;
                needsSort = true;
            }

            // Legacy Migration (From v3.0 Nodes)
            clip.keyframeNodes.forEach(node => {
                if (node.tNorm === undefined && node.time !== undefined) {
                    node.tNorm = this.getNormalizedTime(node.time, clip.duration);
                    delete node.time;
                    needsSort = true;
                }
            });

            if (needsSort) clip.keyframeNodes.sort((a, b) => a.tNorm - b.tNorm);
        },

        // --- GLOBAL INTEGRITY HOOK (The Undo/Redo Fix) ---
        hijackUI() {
            if (typeof UI === 'undefined') return;
            this.originalRefreshTimeline = UI.refreshTimeline.bind(UI);
            
            UI.refreshTimeline = () => {
                if (this.isActive) {
                    this.lastInterpTime = -1;
                }
                this.originalRefreshTimeline();
            };
        },

        // --- HOTKEY MASTER COMPLIANCE ---
        registerHotkeys() {
            const contextArgs = ['keyframe', 'Keyframe Engine', () => document.querySelectorAll('.kf-node.selected').length > 0];
            
            const deleteCmd = [
                'keyframe', 'kf.delete', 'Delete Selected Keyframes', 'Animation', 
                () => this.deleteSelectedKeyframes(), 
                "Deletes the actively selected keyframe nodes from the timeline ribbon.",
                ["Delete", "Backspace"]
            ];

            if (window.HOTKEY_MASTER && window.HOTKEY_MASTER.registerContext) {
                window.HOTKEY_MASTER.registerContext(...contextArgs);
                window.HOTKEY_MASTER.registerCommand(...deleteCmd);
            } else {
                const attemptRegistration = () => {
                    window.HOTKEY_QUEUE = window.HOTKEY_QUEUE || [];
                    if (Array.isArray(window.HOTKEY_QUEUE)) {
                        const alreadyQueued = window.HOTKEY_QUEUE.some(t => t.type === 'context' && t.args[0] === 'keyframe');
                        if (!alreadyQueued) {
                            window.HOTKEY_QUEUE.push({ type: 'context', args: contextArgs });
                            window.HOTKEY_QUEUE.push({ type: 'command', args: deleteCmd });
                        }
                    } else {
                        window.HOTKEY_QUEUE.push({ type: 'context', args: contextArgs });
                        window.HOTKEY_QUEUE.push({ type: 'command', args: deleteCmd });
                    }
                };
                
                attemptRegistration();

                let attempts = 0;
                this.hotkeyHandshake = setInterval(() => {
                    attempts++;
                    if (window.HOTKEY_RECEIPTS && window.HOTKEY_RECEIPTS['kf.delete']) {
                        clearInterval(this.hotkeyHandshake);
                    } else if (attempts > 20) {
                        clearInterval(this.hotkeyHandshake);
                    } else {
                        attemptRegistration();
                    }
                }, 500);
            }
        },

        deleteSelectedKeyframes() {
            const selectedKeys = document.querySelectorAll('.kf-node.selected');
            if (selectedKeys.length > 0) {
                selectedKeys.forEach(el => {
                    const cid = el.dataset.clipId;
                    const nodeId = el.dataset.nodeId;
                    const clip = this.getClipById(cid);
                    if (clip && clip.keyframeNodes) {
                        clip.keyframeNodes = clip.keyframeNodes.filter(n => n.id !== nodeId);
                    }
                });
                Store.saveState();
                if (typeof UI !== 'undefined') UI.refreshTimeline();
                NativeInspector.render();
                if(typeof Notify !== 'undefined') Notify.show("Keyframes Deleted", "fa-trash");
            }
        },

        injectStyles() {
            const style = document.createElement('style');
            style.id = `${MODULE_ID}_styles`;
            style.innerHTML = `
                /* Morphing Sparkle UX */
                .kf-sparkle-btn {
                    width: 20px; height: 20px;
                    display: flex; align-items: center; justify-content: center;
                    cursor: pointer; position: relative;
                }
                .kf-sparkle-btn.unarmed { color: #555; }
                .kf-sparkle-btn.armed { color: #00d2be; }
                .kf-sparkle-btn.active { color: #ff5252; }
                
                .kf-sparkle-btn:hover .kf-sparkle-icon { transform: scale(1.2); }
                
                /* The Morphing Hover Magic */
                .kf-sparkle-btn.active:hover .kf-sparkle-icon { opacity: 0; transform: scale(0) rotate(90deg); }
                .kf-sparkle-btn.active:hover .kf-x-icon { opacity: 1; transform: scale(1) rotate(0deg); color: #ff5252; }

                /* Ribbon UX */
                .keyframe-ribbon {
                    position: absolute; bottom: 0; left: 0; right: 0; height: 14px;
                    background: rgba(0,0,0,0.6); z-index: 15; pointer-events: auto;
                    border-top: 1px solid rgba(255,255,255,0.1);
                    border-radius: 0 0 4px 4px;
                }
                
                .kf-node {
                    position: absolute; top: 50%; transform: translate(-50%, -50%);
                    width: 12px; height: 12px; color: #aaa; cursor: ew-resize;
                    transition: color 0.2s, transform 0.1s; pointer-events: auto;
                }
                .kf-node:hover { color: #fff; transform: translate(-50%, -50%) scale(1.4); z-index: 20; }
                .kf-node.selected { color: #eab308; filter: drop-shadow(0 0 4px #eab308); }

                /* Live Bind UI */
                .kf-live-val { color: #00d2be !important; font-weight: bold; text-shadow: 0 0 8px rgba(0,210,190,0.5); }
                
                /* Keyframe Navigation Buttons */
                .kf-nav-btn { font-size: 10px; color: #444; cursor: default; transition: color 0.2s; padding: 0 4px; background: transparent; border: none; outline: none; display: flex; align-items: center; justify-content: center; height: 16px; width: 16px; border-radius: 3px; }
                .kf-nav-btn.active { color: #888; cursor: pointer; }
                .kf-nav-btn.active:hover { color: #00d2be; background: rgba(0,210,190,0.1); }
                .kf-nav-btn.disabled { pointer-events: none; opacity: 0.3; }
            `;
            document.head.appendChild(style);
        },

        // --- MATH & NODE INTERPOLATION ---
        getInterpolatedValue(clip, prop, localTime) {
            this.migrateToNodes(clip);
            if (!clip.keyframeNodes || clip.keyframeNodes.length === 0) return null;
            
            const currentNorm = this.getNormalizedTime(localTime, clip.duration);
            
            const relevantNodes = clip.keyframeNodes
                .filter(n => n.props && n.props[prop] !== undefined)
                .sort((a, b) => a.tNorm - b.tNorm);
            
            if (relevantNodes.length === 0) return null;
            if (relevantNodes.length === 1) return relevantNodes[0].props[prop];
            
            if (currentNorm <= relevantNodes[0].tNorm) return relevantNodes[0].props[prop];
            if (currentNorm >= relevantNodes[relevantNodes.length - 1].tNorm) return relevantNodes[relevantNodes.length - 1].props[prop];

            let k1 = relevantNodes[0], k2 = relevantNodes[1];
            for (let i = 0; i < relevantNodes.length - 1; i++) {
                if (currentNorm >= relevantNodes[i].tNorm && currentNorm < relevantNodes[i + 1].tNorm) {
                    k1 = relevantNodes[i]; k2 = relevantNodes[i + 1]; break;
                }
            }

            if (k2.tNorm === k1.tNorm) return k2.props[prop]; 

            const rawProgress = (currentNorm - k1.tNorm) / (k2.tNorm - k1.tNorm);
            const handles = (k1.easings && k1.easings[prop]) ? k1.easings[prop] : [0.25, 0.1, 0.25, 1.0];
            const easedProgress = Bezier.solve(rawProgress, handles[0], handles[1], handles[2], handles[3]);

            return k1.props[prop] + ((k2.props[prop] - k1.props[prop]) * easedProgress);
        },

        setKeyframe(clip, prop, value, localTime) {
            if (localTime < 0 || localTime > clip.duration) return; // Out of bounds protection
            this.setKeyframeInMemory(clip, prop, value, localTime);
            Store.saveState();
            if (typeof UI !== 'undefined') UI.refreshTimeline();
            NativeInspector.render();
        },

        setKeyframeInMemory(clip, prop, value, localTime) {
            if (localTime < 0 || localTime > clip.duration) return;
            
            this.migrateToNodes(clip);
            const currentNorm = this.getNormalizedTime(localTime, clip.duration);
            
            let node = clip.keyframeNodes.find(n => Math.abs(n.tNorm - currentNorm) <= 0.001);

            if (!node) {
                node = { 
                    id: 'kf_' + Date.now() + Math.random().toString(36).substr(2,5), 
                    tNorm: currentNorm, 
                    props: {}, 
                    easings: {} 
                };
                clip.keyframeNodes.push(node);
            }

            node.props[prop] = parseFloat(value);
            if (!node.easings[prop]) {
                node.easings[prop] = [0.25, 0.1, 0.25, 1.0];
            }
            
            clip.keyframeNodes.sort((a, b) => a.tNorm - b.tNorm);
        },

        deleteKeyframePropInMemory(clip, prop, localTime) {
            this.migrateToNodes(clip);
            const currentNorm = this.getNormalizedTime(localTime, clip.duration);
            const nodeIdx = clip.keyframeNodes.findIndex(n => Math.abs(n.tNorm - currentNorm) <= 0.001);
            
            if (nodeIdx > -1) {
                const node = clip.keyframeNodes[nodeIdx];
                delete node.props[prop];
                delete node.easings[prop];
                
                if (Object.keys(node.props).length === 0) {
                    clip.keyframeNodes.splice(nodeIdx, 1);
                }
            }
        },

        // --- EVENT-DRIVEN INTERACTION TRACKING (O(1) PERFORMANCE) ---
        bindInteractionTracker() {
            const downHandler = () => {
                this.isInteracting = true;
                this.interactionSnapshot.clear();
                // Cache the true, physical base state of all objects immediately!
                Store.trackConfig.forEach(t => {
                    (Store.tracks[t.id] || []).forEach(c => {
                        this.interactionSnapshot.set(c.id, {
                            x: c.x, y: c.y, scale: c.scale, rotation: c.rotation,
                            opacity: c.opacity, brightness: c.brightness, contrast: c.contrast, saturate: c.saturate
                        });
                    });
                });
            };
            
            const upHandler = () => {
                this.isInteracting = false;
                if (this.pendingCapture && this.isActive) {
                    this.pendingCapture = false;
                    this.detectAndKeyMutations();
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
                if (this.isActive) {
                    if (this.isInteracting) {
                        this.pendingCapture = true;
                    } else {
                        this.detectAndKeyMutations();
                    }
                }
                return this.originalSaveState.call(Store);
            };
        },

        detectAndKeyMutations() {
            const t = Store.currentTime;
            let timelineNeedsRefresh = false;

            Store.trackConfig.forEach(track => {
                (Store.tracks[track.id] || []).forEach(clip => {
                    this.migrateToNodes(clip);
                    if (!clip.keyframeNodes || clip.keyframeNodes.length === 0) return;
                    
                    const localTime = t - clip.start;
                    if (localTime < 0 || localTime > clip.duration) return;

                    let changed = false;
                    const snap = this.interactionSnapshot.get(clip.id);
                    if (!snap) return;
                    
                    const activeProps = new Set();
                    clip.keyframeNodes.forEach(n => Object.keys(n.props).forEach(p => activeProps.add(p)));

                    activeProps.forEach(prop => {
                        if (Math.abs(clip[prop] - snap[prop]) > 0.001) {
                            this.setKeyframeInMemory(clip, prop, clip[prop], localTime);
                            changed = true;
                            snap[prop] = clip[prop]; 
                        }
                    });

                    if (changed) timelineNeedsRefresh = true;
                });
            });
            
            if (timelineNeedsRefresh) {
                if (typeof UI !== 'undefined') UI.refreshTimeline();
                if (NativeInspector.currentClipId) NativeInspector.render();
            }
        },

        // --- NON-DESTRUCTIVE MIDDLEWARE RENDERER ---
        hijackRenderer() {
            this.originalRenderFrame = Player.renderFrame.bind(Player);
            this.originalDrawToCanvas = Player.drawToCanvas.bind(Player);
            
            Player.drawToCanvas = (vClips, tClips) => {
                if (!this.isActive) return this.originalDrawToCanvas(vClips, tClips);
                
                const t = Store.currentTime;
                
                let skipInterpolation = false;
                if (!Player.playing && t === this.lastInterpTime) {
                    skipInterpolation = true;
                }
                this.lastInterpTime = t;

                const backups = new Map();

                if (!skipInterpolation) {
                    const applyInterpolation = (clips) => {
                        clips.forEach(clip => {
                            this.migrateToNodes(clip);
                            if (clip && clip.keyframeNodes && clip.keyframeNodes.length > 0) {
                                const localTime = t - clip.start;
                                const backup = {};
                                let hasInterpolation = false;
                                
                                const activeProps = new Set();
                                clip.keyframeNodes.forEach(n => Object.keys(n.props).forEach(p => activeProps.add(p)));

                                activeProps.forEach(prop => {
                                    const interpolated = this.getInterpolatedValue(clip, prop, localTime);
                                    if (interpolated !== null) {
                                        backup[prop] = clip[prop];
                                        clip[prop] = interpolated;
                                        hasInterpolation = true;
                                    }
                                });
                                
                                if (hasInterpolation) {
                                    backups.set(clip.id, backup);
                                }
                            }
                        });
                    };

                    applyInterpolation(vClips);
                    applyInterpolation(tClips);
                }

                this.originalDrawToCanvas(vClips, tClips);

                if (!skipInterpolation) {
                    const restoreInterpolation = (clips) => {
                        clips.forEach(clip => {
                            if (backups.has(clip.id)) {
                                const backup = backups.get(clip.id);
                                Object.keys(backup).forEach(prop => {
                                    clip[prop] = backup[prop];
                                });
                            }
                        });
                    };
                    
                    restoreInterpolation(vClips);
                    restoreInterpolation(tClips);
                }
            };

            Player.renderFrame = () => {
                if (!this.isActive) return this.originalRenderFrame();
                this.originalRenderFrame();

                if (NativeInspector.currentClipId && (Player.playing || Store.currentTime === this.lastInterpTime)) {
                    const clip = this.getClipById(NativeInspector.currentClipId);
                    this.migrateToNodes(clip);
                    if (clip && clip.keyframeNodes && clip.keyframeNodes.length > 0) {
                        const localTime = Store.currentTime - clip.start;
                        
                        const activeProps = new Set();
                        clip.keyframeNodes.forEach(n => Object.keys(n.props).forEach(p => activeProps.add(p)));
                        
                        activeProps.forEach(prop => {
                            if (!this.isUserDraggingProperty(prop)) {
                                const interpolated = this.getInterpolatedValue(clip, prop, localTime);
                                if (interpolated !== null) {
                                    const valEl = document.getElementById(`kf_val_${prop}`);
                                    const inputEl = document.querySelector(`input[data-kfprop="${prop}"]`);
                                    if (valEl && inputEl) {
                                        // Robust unit formatting for all possible property types
                                        const unit = (prop === 'rotation' || prop === 'hue') ? '°' : 
                                                     (['opacity', 'scale', 'x', 'y', 'brightness', 'contrast', 'saturate', 'posX', 'posY', 'mix', 'radius', 'softness', 'maskWidth', 'maskHeight', 'centerX', 'centerY'].includes(prop) ? '%' : '');
                                        
                                        valEl.innerText = interpolated.toFixed(1) + unit;
                                        valEl.classList.add('kf-live-val');
                                        inputEl.value = interpolated;
                                    }
                                }
                            }
                        });
                    }
                }
            };
        },

        // FOCUS STICKINESS FIX: Ensures the slider resumes animating the moment the user lets go of the mouse button!
        isUserDraggingProperty(prop) {
            if (!this.isInteracting) return false;
            const activeEl = document.activeElement;
            return (activeEl && activeEl.dataset && activeEl.dataset.kfprop === prop);
        },

        // --- TRUE LIVE INSPECTOR REBUILD (SAFE DOM PRESERVATION METHOD) ---
        hijackInspector() {
            this.originalInspectorRender = NativeInspector.render.bind(NativeInspector);
            
            NativeInspector.render = () => {
                // 1. Let the native inspector and other extensions build their UI first!
                // This ensures the Audio Mixing Engine injects the L-Cut button with all event listeners intact.
                this.originalInspectorRender();

                if (!this.isActive) return;

                const container = document.getElementById('nativeInspectorContent');
                if (!container || !NativeInspector.currentClipId) return;
                
                const clip = this.getClipById(NativeInspector.currentClipId);
                if (!clip) return;
                this.migrateToNodes(clip);
                
                const trackType = Store.trackConfig.find(t => t.id === this.findTrackId(clip.id))?.type;
                if (trackType !== 'video' && trackType !== 'image') {
                    return; // Base render is enough for audio/text tracks
                }

                // 2. K.I.S.S. DOM Extraction: Save all original nodes to preserve their event bindings natively
                const preservedNodes = Array.from(container.childNodes);
                container.innerHTML = ''; // Safely clear container without destroying node references in memory

                if (clip.x === undefined) clip.x = 50;
                if (clip.y === undefined) clip.y = 50;
                if (clip.scale === undefined) clip.scale = 100;
                if (clip.rotation === undefined) clip.rotation = 0;
                if (clip.opacity === undefined) clip.opacity = 100;
                if (clip.brightness === undefined) clip.brightness = 100;
                if (clip.contrast === undefined) clip.contrast = 100;
                if (clip.saturate === undefined) clip.saturate = 100;

                const asset = Store.assets.find(a => a.id === clip.assetId);

                let html = `
                    <div class="mb-4">
                        <label class="text-[10px] uppercase text-gray-500 font-bold block mb-1">Clip Name</label>
                        <div class="text-sm text-white truncate bg-[#1a1a1a] p-2 rounded border border-[#333]" title="${asset.name}">${asset.name}</div>
                    </div>
                `;

                const localTime = Store.currentTime - clip.start;
                const snappedTime = this.snapToFrame(localTime);

                const getSparkleState = (prop) => {
                    if (!clip.keyframeNodes || clip.keyframeNodes.length === 0) return 'unarmed';
                    
                    const hasAnyKeyForProp = clip.keyframeNodes.some(n => n.props[prop] !== undefined);
                    if (!hasAnyKeyForProp) return 'unarmed';
                    
                    const nodeAtTime = clip.keyframeNodes.find(n => Math.abs(n.tNorm - this.getNormalizedTime(localTime, clip.duration)) <= 0.001);
                    if (nodeAtTime && nodeAtTime.props[prop] !== undefined) return 'active';
                    
                    return 'armed';
                };

                const getDisplayVal = (prop) => {
                    const interp = this.getInterpolatedValue(clip, prop, localTime);
                    return interp !== null ? interp : clip[prop];
                };

                // PRECISION KEYFRAME NAVIGATORS
                const getNavButtons = (prop) => {
                    let hasPrev = false, hasNext = false;
                    const currentNorm = this.getNormalizedTime(localTime, clip.duration);
                    if (clip.keyframeNodes) {
                        const nodes = clip.keyframeNodes.filter(n => n.props[prop] !== undefined).sort((a,b) => a.tNorm - b.tNorm);
                        if (nodes.length > 0) {
                            hasPrev = nodes.some(n => n.tNorm < currentNorm - 0.001);
                            hasNext = nodes.some(n => n.tNorm > currentNorm + 0.001);
                        }
                    }
                    return `
                        <div class="flex items-center gap-0.5 ml-1">
                            <button class="kf-nav-btn ${hasPrev ? 'active' : 'disabled'}" data-nav="prev" data-prop="${prop}" title="Previous Keyframe">
                                <i class="fa-solid fa-caret-left pointer-events-none"></i>
                            </button>
                            <button class="kf-nav-btn ${hasNext ? 'active' : 'disabled'}" data-nav="next" data-prop="${prop}" title="Next Keyframe">
                                <i class="fa-solid fa-caret-right pointer-events-none"></i>
                            </button>
                        </div>
                    `;
                };

                const buildRow = (label, prop, min, max, step, unit) => {
                    const state = getSparkleState(prop);
                    const displayVal = getDisplayVal(prop);
                    const isLive = (state === 'armed' || state === 'active') && clip.keyframeNodes && clip.keyframeNodes.some(n => n.props[prop] !== undefined);
                    const valClass = isLive ? 'kf-live-val text-teal-400' : 'text-white';
                    const navBtns = getNavButtons(prop);
                    
                    return `
                        <div class="mb-3">
                            <div class="flex justify-between items-center mb-1">
                                <span class="text-xs text-gray-400 flex items-center gap-1.5">
                                    <div class="kf-sparkle-btn ${state}" data-prop="${prop}">${SparkleSVG}</div>
                                    ${navBtns}
                                    <span class="ml-1">${label}</span>
                                </span> 
                                <span id="kf_val_${prop}" class="text-xs ${valClass}">${displayVal.toFixed(1)}${unit}</span>
                            </div>
                            <input type="range" data-kfprop="${prop}" min="${min}" max="${max}" step="${step}" value="${displayVal}" class="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-teal-500 te-safe-input">
                        </div>
                    `;
                };

                const tGroupState = ['x', 'y', 'scale', 'rotation'].every(p => getSparkleState(p) === 'active') ? 'active' : 
                                  (['x', 'y', 'scale', 'rotation'].some(p => getSparkleState(p) !== 'unarmed') ? 'armed' : 'unarmed');

                html += `
                    <div class="border-t border-[#222] pt-4 mt-2">
                        <div class="flex items-center gap-2 mb-3">
                            <div class="kf-sparkle-btn ${tGroupState}" data-group="transform" title="Keyframe All Transform">${SparkleSVG}</div>
                            <h4 class="text-[10px] uppercase text-teal-400 font-bold tracking-wider">Transform</h4>
                        </div>
                        ${buildRow('Position X', 'x', -50, 150, 0.5, '%')}
                        ${buildRow('Position Y', 'y', -50, 150, 0.5, '%')}
                        ${buildRow('Scale', 'scale', 0, 300, 1, '%')}
                        ${buildRow('Rotation', 'rotation', -180, 180, 1, '°')}
                    </div>
                `;

                const cGroupState = getSparkleState('opacity');
                html += `
                    <div class="border-t border-[#222] pt-4 mt-2">
                        <div class="flex items-center gap-2 mb-3">
                            <div class="kf-sparkle-btn ${cGroupState}" data-group="composite" title="Keyframe Opacity">${SparkleSVG}</div>
                            <h4 class="text-[10px] uppercase text-teal-400 font-bold tracking-wider">Compositing</h4>
                        </div>
                        ${buildRow('Opacity', 'opacity', 0, 100, 1, '%')}
                    </div>
                `;

                const cgGroupState = ['brightness', 'contrast', 'saturate'].every(p => getSparkleState(p) === 'active') ? 'active' : 
                                  (['brightness', 'contrast', 'saturate'].some(p => getSparkleState(p) !== 'unarmed') ? 'armed' : 'unarmed');
                html += `
                    <div class="border-t border-[#222] pt-4 mt-2">
                        <div class="flex items-center gap-2 mb-3">
                            <div class="kf-sparkle-btn ${cgGroupState}" data-group="color" title="Keyframe All Color">${SparkleSVG}</div>
                            <h4 class="text-[10px] uppercase text-teal-400 font-bold tracking-wider">Color Grade</h4>
                        </div>
                        ${buildRow('Brightness', 'brightness', 0, 200, 1, '%')}
                        ${buildRow('Contrast', 'contrast', 0, 200, 1, '%')}
                        ${buildRow('Saturation', 'saturate', 0, 200, 1, '%')}
                    </div>
                `;

                // Wrap KeyFrame UI
                const kfWrapper = document.createElement('div');
                kfWrapper.innerHTML = html;
                container.appendChild(kfWrapper);

                // 3. Append Preserved Nodes Below!
                preservedNodes.forEach(node => {
                    if (node.nodeType === 1) { // Element Node
                        // Hide redundant Native Sliders so they don't duplicate our new Keyframe ones
                        const nativeInputs = node.querySelectorAll('input[oninput*="NativeInspector.updateProp"]');
                        nativeInputs.forEach(input => {
                            const prop = input.getAttribute('oninput');
                            if (prop.includes("'scale'") || prop.includes("'opacity'") || prop.includes("'rotation'")) {
                                if (input.parentElement) input.parentElement.style.display = 'none';
                            }
                        });

                        // Hide redundant Native Top-Level Labels (Clip Name, Duration)
                        const labels = node.querySelectorAll('label');
                        labels.forEach(lbl => {
                            if (lbl.innerText.includes('Clip Name') || lbl.innerText.includes('Duration')) {
                                if (lbl.parentElement) lbl.parentElement.style.display = 'none';
                            }
                        });
                    }
                    container.appendChild(node);
                });

                // Attach Exact 1:1 v3.7.0 Event Bindings
                container.querySelectorAll('.kf-sparkle-btn').forEach(btn => {
                    btn.onclick = (e) => {
                        e.stopPropagation();
                        if (localTime < 0 || localTime > clip.duration) return; // Prevent out-of-bounds keys

                        const isMaster = btn.dataset.group;
                        let propsToArm = [];
                        
                        if (isMaster === 'transform') propsToArm = ['x', 'y', 'scale', 'rotation'];
                        else if (isMaster === 'composite') propsToArm = ['opacity'];
                        else if (isMaster === 'color') propsToArm = ['brightness', 'contrast', 'saturate'];
                        else propsToArm = [btn.dataset.prop];

                        const isActive = btn.classList.contains('active');
                        let needsUpdate = false;
                        
                        propsToArm.forEach(p => {
                            if (isActive) {
                                this.deleteKeyframePropInMemory(clip, p, localTime);
                            } else {
                                const currentValue = this.getInterpolatedValue(clip, p, localTime) ?? clip[p];
                                this.setKeyframeInMemory(clip, p, currentValue, localTime);
                                
                                clip[p] = currentValue; 
                                if (this.interactionSnapshot.has(clip.id)) {
                                    this.interactionSnapshot.get(clip.id)[p] = currentValue;
                                }
                            }
                            needsUpdate = true;
                        });

                        if (needsUpdate) {
                            Store.saveState();
                            NativeInspector.render();
                            if (typeof UI !== 'undefined') UI.refreshTimeline();
                            Player.safeRenderFrame();
                        }
                    };
                });

                // Keyframe Navigation Listeners
                container.querySelectorAll('.kf-nav-btn.active').forEach(btn => {
                    btn.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const prop = btn.dataset.prop;
                        const dir = btn.dataset.nav;
                        
                        const currentNorm = this.getNormalizedTime(localTime, clip.duration);
                        const nodes = clip.keyframeNodes.filter(n => n.props[prop] !== undefined).sort((a,b) => a.tNorm - b.tNorm);
                        
                        let targetNorm = null;
                        if (dir === 'prev') {
                            const prevNodes = nodes.filter(n => n.tNorm < currentNorm - 0.001);
                            if (prevNodes.length) targetNorm = prevNodes[prevNodes.length - 1].tNorm;
                        } else {
                            const nextNodes = nodes.filter(n => n.tNorm > currentNorm + 0.001);
                            if (nextNodes.length) targetNorm = nextNodes[0].tNorm;
                        }
                        
                        if (targetNorm !== null) {
                            Store.currentTime = clip.start + (targetNorm * clip.duration);
                            Player.safeRenderFrame();
                            NativeInspector.render(); 
                            if (typeof UI !== 'undefined') UI.refreshTimeline();
                        }
                    }
                });

                container.querySelectorAll('.te-safe-input[data-kfprop]').forEach(input => {
                    input.addEventListener('keydown', e => e.stopPropagation());
                    
                    input.oninput = (e) => {
                        const prop = e.target.dataset.kfprop;
                        const val = parseFloat(e.target.value);
                        clip[prop] = val; 
                        
                        const valEl = document.getElementById(`kf_val_${prop}`);
                        if (valEl) {
                            // Robust unit formatting for all possible property types
                            const unit = (prop === 'rotation' || prop === 'hue') ? '°' : 
                                         (['opacity', 'scale', 'x', 'y', 'brightness', 'contrast', 'saturate', 'posX', 'posY', 'mix', 'radius', 'softness', 'maskWidth', 'maskHeight', 'centerX', 'centerY'].includes(prop) ? '%' : '');
                            
                            valEl.innerText = val.toFixed(1) + unit;
                            valEl.classList.remove('kf-live-val'); 
                        }
                        Player.safeRenderFrame();
                    };
                    
                    input.onchange = () => {
                        Store.saveState();
                    };
                });
            };
        },

        // --- TIMELINE RIBBON INJECTION ---
        hijackTimeline() {
            this.originalRenderTrack = TimelineModule.renderTrack.bind(TimelineModule);
            
            TimelineModule.renderTrack = (trackId) => {
                this.originalRenderTrack(trackId);
                if (!this.isActive) return;

                const lane = document.getElementById(`track-${trackId}`);
                if (!lane) return;

                const clips = Store.tracks[trackId] || [];
                clips.forEach((clip, index) => {
                    this.migrateToNodes(clip);
                    if (!clip || !clip.keyframeNodes || clip.keyframeNodes.length === 0) return;
                    const clipEl = lane.children[index];
                    if (!clipEl) return;

                    const ribbon = document.createElement('div');
                    ribbon.className = 'keyframe-ribbon';
                    
                    ribbon.onmousedown = (e) => {
                        if (!e.target.classList.contains('kf-node')) {
                            e.stopPropagation(); 
                        }
                    };

                    clip.keyframeNodes.forEach(nodeObj => {
                        const t = nodeObj.time;
                        const node = document.createElement('div');
                        node.className = 'kf-node';
                        node.dataset.time = t;
                        node.dataset.clipId = clip.id;
                        node.dataset.nodeId = nodeObj.id;
                        node.style.left = `${nodeObj.tNorm * 100}%`;
                        node.innerHTML = SparkleSVG;
                        
                        // 🔥 UNIFIED CLUSTER DRAGGING (Moves all selected nodes together)
                        node.onmousedown = (e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            
                            this.isInteracting = true;
                            let startX = e.clientX;
                            
                            if (!node.classList.contains('selected') && !e.shiftKey) {
                                document.querySelectorAll('.kf-node.selected').forEach(n => n.classList.remove('selected'));
                            }
                            node.classList.add('selected');

                            const selectedNodes = Array.from(document.querySelectorAll('.kf-node.selected'));
                            const dragData = selectedNodes.map(selEl => {
                                const cId = selEl.dataset.clipId;
                                const nId = selEl.dataset.nodeId;
                                const cObj = this.getClipById(cId);
                                if (!cObj || !cObj.keyframeNodes) return null;
                                const nObj = cObj.keyframeNodes.find(n => n.id === nId);
                                return nObj ? { clip: cObj, node: nObj, el: selEl, origNorm: nObj.tNorm } : null;
                            }).filter(Boolean);

                            const onMove = (ev) => {
                                const deltaSec = (ev.clientX - startX) / Store.zoom;
                                const deltaNorm = clip.duration > 0 ? deltaSec / clip.duration : 0;
                                
                                // Prevent dragging any node in the cluster out of bounds
                                let validDeltaNorm = deltaNorm;
                                dragData.forEach(d => {
                                    if (d.origNorm + validDeltaNorm < 0) validDeltaNorm = -d.origNorm;
                                    if (d.origNorm + validDeltaNorm > 1) validDeltaNorm = 1 - d.origNorm;
                                });
                                
                                dragData.forEach(d => {
                                    const newNorm = parseFloat((d.origNorm + validDeltaNorm).toFixed(4));
                                    d.node.tNorm = newNorm;
                                    d.el.style.left = `${newNorm * 100}%`;
                                });
                                
                                Player.safeRenderFrame();
                            };

                            const onUp = () => {
                                document.removeEventListener('mousemove', onMove);
                                document.removeEventListener('mouseup', onUp);
                                
                                // Handle collision fusions for all dragged nodes
                                dragData.forEach(d => {
                                    d.clip.keyframeNodes.sort((a, b) => a.tNorm - b.tNorm);
                                    const collidingNode = d.clip.keyframeNodes.find(n => n.id !== d.node.id && Math.abs(n.tNorm - d.node.tNorm) <= 0.001);
                                    if (collidingNode) {
                                        Object.assign(collidingNode.props, d.node.props);
                                        Object.assign(collidingNode.easings, d.node.easings);
                                        d.clip.keyframeNodes = d.clip.keyframeNodes.filter(n => n.id !== d.node.id);
                                    }
                                });
                                
                                this.isInteracting = false;
                                Store.saveState();
                                if (typeof UI !== 'undefined') UI.refreshTimeline();
                            };
                            
                            document.addEventListener('mousemove', onMove);
                            document.addEventListener('mouseup', onUp);
                        };
                        
                        node.ondblclick = (e) => {
                            e.stopPropagation();
                            this.openBezierEditor(clip, nodeObj, e.clientX, e.clientY);
                        };

                        ribbon.appendChild(node);
                    });

                    clipEl.appendChild(ribbon);
                });
            };
        },

        // --- GLOBAL MARQUEE SELECTION ---
        bindGlobalEvents() {
            window.addEventListener('mouseup', () => {
                if (!this.isActive) return;

                if (this.pendingTimelineRefresh) {
                    this.pendingTimelineRefresh = false;
                    if (typeof UI !== 'undefined') UI.refreshTimeline();
                    NativeInspector.render();
                }

                const selBox = document.getElementById('tl-selection-box');
                if (selBox && selBox.style.display !== 'none') {
                    const boxRect = selBox.getBoundingClientRect();
                    document.querySelectorAll('.kf-node').forEach(sparkle => {
                        const spRect = sparkle.getBoundingClientRect();
                        if (boxRect.left < spRect.right && boxRect.right > spRect.left &&
                            boxRect.top < spRect.bottom && boxRect.bottom > spRect.top) {
                            sparkle.classList.add('selected');
                        }
                    });
                }
            });
        },

        // --- BEZIER EDITOR MODAL ---
        buildBezierEditor() {
            const modal = document.createElement('div');
            modal.id = 'kfBezierModal';
            modal.className = 'fixed bg-[#1a1a1a] border border-[#333] rounded-lg shadow-[0_10px_40px_rgba(0,0,0,0.9)] z-[100000] hidden flex-col p-4 w-64';
            
            modal.innerHTML = `
                <div class="flex justify-between items-center mb-3">
                    <span class="text-xs font-bold text-teal-400"><i class="fa-solid fa-bezier-curve mr-1"></i> Interpolation Node</span>
                    <button id="kfBezClose" class="text-gray-500 hover:text-white"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="relative w-full h-32 bg-[#111] border border-[#333] rounded mb-3 overflow-hidden" id="kfBezArea">
                    <canvas id="kfBezCanvas" class="absolute inset-0 w-full h-full pointer-events-none"></canvas>
                    <div id="kfBezH1" class="absolute w-3 h-3 bg-teal-400 rounded-full border border-white cursor-pointer transform -translate-x-1/2 -translate-y-1/2 shadow-md"></div>
                    <div id="kfBezH2" class="absolute w-3 h-3 bg-teal-400 rounded-full border border-white cursor-pointer transform -translate-x-1/2 -translate-y-1/2 shadow-md"></div>
                </div>
                <div class="grid grid-cols-3 gap-2">
                    <button class="bg-[#222] hover:bg-[#333] border border-[#444] text-[9px] text-white py-1 rounded" onclick="window.KEYFRAME_API.applyPreset([0,0,1,1])">Linear</button>
                    <button class="bg-[#222] hover:bg-[#333] border border-[#444] text-[9px] text-white py-1 rounded" onclick="window.KEYFRAME_API.applyPreset([0.25,0.1,0.25,1])">Ease</button>
                    <button class="bg-[#222] hover:bg-[#333] border border-[#444] text-[9px] text-white py-1 rounded" onclick="window.KEYFRAME_API.applyPreset([0.8,0,0.2,1])">Whip</button>
                </div>
            `;
            document.body.appendChild(modal);

            document.getElementById('kfBezClose').onclick = () => modal.classList.add('hidden');
            
            const area = document.getElementById('kfBezArea');
            const h1 = document.getElementById('kfBezH1');
            const h2 = document.getElementById('kfBezH2');
            
            const handleDrag = (handleEl, index) => {
                handleEl.onmousedown = (e) => {
                    e.preventDefault();
                    const rect = area.getBoundingClientRect();
                    const onMove = (ev) => {
                        let nx = (ev.clientX - rect.left) / rect.width;
                        let ny = 1 - ((ev.clientY - rect.top) / rect.height);
                        nx = Math.max(0, Math.min(1, nx)); 
                        
                        this.activeBezHandles[index*2] = nx;
                        this.activeBezHandles[index*2 + 1] = ny; 
                        
                        this.renderBezierCanvas();
                        this.saveActiveBezier();
                    };
                    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
                    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
                };
            };
            handleDrag(h1, 0);
            handleDrag(h2, 1);
        },

        openBezierEditor(clip, nodeObj, x, y) {
            this.activeBezClip = clip;
            this.activeBezNode = nodeObj;
            
            let handles = [0.25, 0.1, 0.25, 1.0];
            const firstProp = Object.keys(nodeObj.easings)[0];
            if (firstProp && nodeObj.easings[firstProp]) {
                handles = [...nodeObj.easings[firstProp]];
            }
            this.activeBezHandles = handles;

            const modal = document.getElementById('kfBezierModal');
            modal.style.display = 'flex';
            
            let targetX = x - 128;
            let targetY = y - 200;
            if (targetY < 0) targetY = y + 20;
            
            modal.style.left = `${targetX}px`;
            modal.style.top = `${targetY}px`;

            this.renderBezierCanvas();
        },

        renderBezierCanvas() {
            const canvas = document.getElementById('kfBezCanvas');
            const area = document.getElementById('kfBezArea');
            canvas.width = area.clientWidth; canvas.height = area.clientHeight;
            const ctx = canvas.getContext('2d');
            const w = canvas.width; const h = canvas.height;

            const hx1 = this.activeBezHandles[0] * w; const hy1 = h - (this.activeBezHandles[1] * h);
            const hx2 = this.activeBezHandles[2] * w; const hy2 = h - (this.activeBezHandles[3] * h);

            document.getElementById('kfBezH1').style.left = `${hx1}px`; document.getElementById('kfBezH1').style.top = `${hy1}px`;
            document.getElementById('kfBezH2').style.left = `${hx2}px`; document.getElementById('kfBezH2').style.top = `${hy2}px`;

            ctx.clearRect(0, 0, w, h);
            ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(0, h/2); ctx.lineTo(w, h/2); ctx.stroke();
            
            ctx.strokeStyle = '#555'; ctx.beginPath();
            ctx.moveTo(0, h); ctx.lineTo(hx1, hy1);
            ctx.moveTo(w, 0); ctx.lineTo(hx2, hy2);
            ctx.stroke();

            ctx.strokeStyle = '#00d2be'; ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(0, h);
            ctx.bezierCurveTo(hx1, hy1, hx2, hy2, w, 0);
            ctx.stroke();
        },

        applyPreset(handles) {
            this.activeBezHandles = [...handles];
            this.renderBezierCanvas();
            this.saveActiveBezier();
        },

        saveActiveBezier() {
            if (!this.activeBezNode) return;
            Object.keys(this.activeBezNode.easings).forEach(prop => {
                this.activeBezNode.easings[prop] = [...this.activeBezHandles];
            });
            Store.saveState();
            this.onPlayheadMoved(Store.currentTime);
            Player.safeRenderFrame();
        },

        getClipById(id) {
            for (let tid in Store.tracks) {
                const c = Store.tracks[tid].find(x => x.id === id);
                if (c) return c;
            }
            return null;
        },

        findTrackId(clipId) {
            for (let tid in Store.tracks) {
                if (Store.tracks[tid].find(c => c.id === clipId)) return tid;
            }
            return null;
        },

        cleanup() {
            console.log(`[${MODULE_ID}] Uninstalling...`);
            this.isActive = false;
            
            if (this.hotkeyHandshake) clearInterval(this.hotkeyHandshake);
            if (this.originalInspectorRender) NativeInspector.render = this.originalInspectorRender;
            if (this.originalDrawToCanvas) Player.drawToCanvas = this.originalDrawToCanvas;
            if (this.originalRenderTrack) TimelineModule.renderTrack = this.originalRenderTrack;
            if (this.originalSaveState) Store.saveState = this.originalSaveState;
            if (this.originalRefreshTimeline && typeof UI !== 'undefined') UI.refreshTimeline = this.originalRefreshTimeline;
            
            if (this.interactionListeners.down) {
                document.removeEventListener('mousedown', this.interactionListeners.down);
                document.removeEventListener('touchstart', this.interactionListeners.down);
                document.removeEventListener('mouseup', this.interactionListeners.up);
                document.removeEventListener('touchend', this.interactionListeners.up);
            }

            document.getElementById(`${MODULE_ID}_styles`)?.remove();
            document.getElementById('kfBezierModal')?.remove();
            
            delete window.KEYFRAME_API;
            if(typeof UI !== 'undefined') UI.refreshTimeline();
            if (NativeInspector.currentClipId) NativeInspector.render();
        }
    };

    KeyFrameEngine.init();
})();
