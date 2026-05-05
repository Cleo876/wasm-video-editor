/**
 * @name Timeline Pro Engine
 * @version 1.6.0
 * @developer Forge™
 * @description Advanced timeline operations. Adds Magnetic Playhead Snapping (Drag & Resize), Alt+Drag Panning, Shift+Scroll Navigation, Marquee Box Selection, Shift-Click Multi-Select, Group Dragging, Playhead-Relative Paste/Duplicate, Mass Deletion, Timeline Preferences, and Empty-State UX Guides.
 */
(function() {
    const MODULE_ID = 'timeline_pro_engine';

    if (typeof Store === 'undefined' || typeof TimelineModule === 'undefined' || typeof Player === 'undefined') {
        console.error(`❌ [${MODULE_ID}] Core environment not found. Ensure editor is fully loaded.`);
        return;
    }

    const TimelineProEngine = {
        isActive: true,
        selectedClips: new Set(),
        clipboard: [],
        
        // Configurable Speeds
        scrollSpeedX: 2.5,
        scrollSpeedY: 1.0,
        
        // Native Host Hooks
        originalRenderTrack: null,
        originalStartDrag: null,
        originalStartResize: null,
        originalDeleteSelected: null,
        globalMousedownHandler: null,
        globalWheelHandler: null,

        async init() {
            console.log(`[${MODULE_ID}] Booting Timeline Pro Engine v1.6.0...`);
            
            await this.loadPreferences();
            
            this.injectStyles();
            this.injectMenuButton();
            this.injectPreferencesModal();
            this.injectWatermark();
            this.registerWithHotkeyMaster();
            this.hijackTimeline();
            this.bindGlobalEvents();
            
            if (typeof UI !== 'undefined') UI.refreshTimeline();
            this.updateWatermark();
        },

        async loadPreferences() {
            try {
                if (typeof DB !== 'undefined') {
                    const saved = await DB.get('system', 'timeline_pro_prefs');
                    if (saved) {
                        if (saved.scrollSpeedX !== undefined) this.scrollSpeedX = saved.scrollSpeedX;
                        if (saved.scrollSpeedY !== undefined) this.scrollSpeedY = saved.scrollSpeedY;
                    }
                }
            } catch(e) {}
        },

        async savePreferences() {
            try {
                if (typeof DB !== 'undefined') {
                    await DB.put('system', {
                        id: 'timeline_pro_prefs',
                        scrollSpeedX: this.scrollSpeedX,
                        scrollSpeedY: this.scrollSpeedY
                    });
                }
            } catch(e) {}
        },

        resetPreferences() {
            this.scrollSpeedX = 2.5;
            this.scrollSpeedY = 1.0;
            document.getElementById('tl_speedX').value = this.scrollSpeedX;
            document.getElementById('tl_speedY').value = this.scrollSpeedY;
            document.getElementById('tl_val_speedX').innerText = this.scrollSpeedX.toFixed(1) + 'x';
            document.getElementById('tl_val_speedY').innerText = this.scrollSpeedY.toFixed(1) + 'x';
            this.savePreferences();
        },

        injectStyles() {
            const style = document.createElement('style');
            style.id = `${MODULE_ID}_styles`;
            style.innerHTML = `
                .tl-selection-box {
                    position: absolute;
                    border: 1px dashed #00d2be;
                    background: rgba(0, 210, 190, 0.15);
                    z-index: 9999;
                    pointer-events: none;
                    display: none;
                }
                .playhead-marker.snapped-active { 
                    background: #00d2be !important; 
                    box-shadow: 0 0 10px #00d2be, 0 0 20px #00d2be;
                    z-index: 1000;
                }
                .playhead-marker.snapped-active .playhead-head { 
                    background: #00d2be !important; 
                }
                #tl-pro-watermark {
                    position: absolute;
                    inset: 0;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    pointer-events: none;
                    z-index: 0;
                    opacity: 0.25;
                    user-select: none;
                }
                .tl-wm-key {
                    color: #00d2be;
                    font-family: monospace;
                    padding: 2px 6px;
                    background: rgba(0, 210, 190, 0.1);
                    border-radius: 4px;
                    border: 1px solid rgba(0, 210, 190, 0.3);
                    margin: 0 2px;
                }
            `;
            document.head.appendChild(style);
        },

        injectWatermark() {
            const scrollArea = document.getElementById('tracksScrollArea');
            if (scrollArea && !document.getElementById('tl-pro-watermark')) {
                const wm = document.createElement('div');
                wm.id = 'tl-pro-watermark';
                wm.innerHTML = `
                    <div class="text-center">
                        <i class="fa-solid fa-timeline text-5xl mb-4 opacity-50 drop-shadow-md"></i>
                        <h3 class="text-lg font-bold text-white mb-3 tracking-widest uppercase">Timeline Ready</h3>
                        <p class="text-sm text-gray-400 mb-2"><span class="tl-wm-key">Shift + Wheel</span> to Scroll &nbsp;&nbsp; <span class="tl-wm-key">Alt + Drag</span> to Pan</p>
                        <p class="text-sm text-gray-400"><span class="tl-wm-key">Left Drag Empty Space</span> to Marquee Select</p>
                    </div>
                `;
                // Appending to scrollArea keeps it perfectly centered regardless of horizontal scroll position!
                scrollArea.appendChild(wm);
            }
        },

        updateWatermark() {
            const wm = document.getElementById('tl-pro-watermark');
            if (!wm) return;
            let hasClips = false;
            for (let tid in Store.tracks) {
                if (Store.tracks[tid] && Store.tracks[tid].length > 0) {
                    hasClips = true;
                    break;
                }
            }
            wm.style.display = hasClips ? 'none' : 'flex';
        },

        injectMenuButton() {
            // Find the previously unused spacer above the track headers
            const spacer = document.querySelector('.ruler-spacer');
            
            if (spacer && !document.getElementById('tl-prefs-btn-new')) {
                // Completely block click and mousedown events so the user can't accidentally warp their playhead
                spacer.addEventListener('click', (e) => e.stopPropagation());
                spacer.addEventListener('mousedown', (e) => e.stopPropagation());

                // Style the spacer to hold our button perfectly
                spacer.style.display = 'flex';
                spacer.style.alignItems = 'center';
                spacer.style.justifyContent = 'center';
                spacer.style.padding = '0'; // Ensure edge-to-edge
                
                const btn = document.createElement('button');
                btn.id = 'tl-prefs-btn-new';
                btn.className = 'w-full h-full flex items-center justify-center gap-2 text-[10px] uppercase font-bold text-gray-500 hover:text-teal-400 hover:bg-[#333] transition-colors border-none outline-none';
                btn.title = 'Timeline Preferences';
                btn.innerHTML = `<i class="fa-solid fa-sliders"></i> PREFS`;
                
                btn.onclick = (e) => {
                    e.stopPropagation();
                    this.openPreferences();
                };
                
                spacer.innerHTML = ''; // Wipe anything that might be there natively
                spacer.appendChild(btn);
            }

            // Cleanup any old dropdown buttons if the user is upgrading from v1.5.1
            document.getElementById('tl-prefs-divider')?.remove();
            document.getElementById('tl-prefs-btn')?.remove();
        },

        injectPreferencesModal() {
            if (document.getElementById('tl-prefs-modal')) return;
            const modal = document.createElement('div');
            modal.id = 'tl-prefs-modal';
            modal.className = 'fixed inset-0 bg-black/80 z-[100000] flex items-center justify-center hidden backdrop-blur-sm';
            modal.innerHTML = `
                <div class="bg-[#1e1e1e] border border-[#333] p-6 rounded-xl w-[400px] shadow-2xl flex flex-col" onclick="event.stopPropagation()">
                    <div class="flex justify-between items-center mb-4 border-b border-[#333] pb-3">
                        <h2 class="text-lg font-bold text-white flex items-center"><i class="fa-solid fa-gears text-teal-400 mr-2"></i> Timeline Preferences</h2>
                        <button onclick="document.getElementById('tl-prefs-modal').classList.add('hidden')" class="text-gray-500 hover:text-white transition"><i class="fa-solid fa-xmark text-lg"></i></button>
                    </div>
                    
                    <div class="space-y-4 mb-5">
                        <div>
                            <div class="flex justify-between text-xs text-gray-400 mb-1">
                                <span>Horizontal Scroll Speed (Shift+Wheel)</span> 
                                <span id="tl_val_speedX" class="font-bold text-white">${this.scrollSpeedX.toFixed(1)}x</span>
                            </div>
                            <input type="range" id="tl_speedX" min="0.1" max="10" step="0.1" value="${this.scrollSpeedX}" class="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-teal-500">
                        </div>
                        <div>
                            <div class="flex justify-between text-xs text-gray-400 mb-1">
                                <span>Pan Sensitivity (Alt+Drag)</span> 
                                <span id="tl_val_speedY" class="font-bold text-white">${this.scrollSpeedY.toFixed(1)}x</span>
                            </div>
                            <input type="range" id="tl_speedY" min="0.1" max="5" step="0.1" value="${this.scrollSpeedY}" class="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-teal-500">
                        </div>
                    </div>

                    <div class="bg-[#111] border border-[#333] rounded p-3 mb-5">
                        <h3 class="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2"><i class="fa-solid fa-keyboard mr-1"></i> Pro Mouse Controls</h3>
                        <ul class="text-xs text-gray-400 space-y-2">
                            <li><kbd class="bg-[#222] text-teal-400 px-1.5 py-0.5 rounded border border-[#333] font-mono">Shift</kbd> + <kbd class="bg-[#222] text-teal-400 px-1.5 py-0.5 rounded border border-[#333] font-mono">Wheel</kbd> <span class="text-gray-500 mx-1">➔</span> Horizontal Scroll</li>
                            <li><kbd class="bg-[#222] text-teal-400 px-1.5 py-0.5 rounded border border-[#333] font-mono">Alt</kbd> + <kbd class="bg-[#222] text-teal-400 px-1.5 py-0.5 rounded border border-[#333] font-mono">Drag</kbd> <span class="text-gray-500 mx-1">➔</span> Hand-Tool Pan</li>
                            <li><kbd class="bg-[#222] text-teal-400 px-1.5 py-0.5 rounded border border-[#333] font-mono">Drag Empty</kbd> <span class="text-gray-500 mx-1">➔</span> Marquee Select</li>
                            <li><kbd class="bg-[#222] text-teal-400 px-1.5 py-0.5 rounded border border-[#333] font-mono">Shift</kbd> + <kbd class="bg-[#222] text-teal-400 px-1.5 py-0.5 rounded border border-[#333] font-mono">Click</kbd> <span class="text-gray-500 mx-1">➔</span> Multi-Select Clips</li>
                        </ul>
                    </div>
                    
                    <div class="flex justify-end gap-2 border-t border-[#333] pt-4">
                        <button onclick="window.TIMELINE_PRO_ENGINE.resetPreferences()" class="px-4 py-2 text-gray-400 hover:text-white text-xs font-bold transition">Reset Defaults</button>
                        <button onclick="document.getElementById('tl-prefs-modal').classList.add('hidden')" class="bg-teal-600 hover:bg-teal-500 text-white text-sm font-bold px-5 py-2 rounded transition shadow-lg shadow-teal-900/20">Done</button>
                    </div>
                </div>
            `;
            
            modal.onclick = () => modal.classList.add('hidden');
            document.body.appendChild(modal);

            document.getElementById('tl_speedX').oninput = (e) => {
                this.scrollSpeedX = parseFloat(e.target.value);
                document.getElementById('tl_val_speedX').innerText = this.scrollSpeedX.toFixed(1) + 'x';
                this.savePreferences();
            };
            document.getElementById('tl_speedY').oninput = (e) => {
                this.scrollSpeedY = parseFloat(e.target.value);
                document.getElementById('tl_val_speedY').innerText = this.scrollSpeedY.toFixed(1) + 'x';
                this.savePreferences();
            };
        },

        openPreferences() {
            const modal = document.getElementById('tl-prefs-modal');
            if (modal) {
                document.getElementById('tl_speedX').value = this.scrollSpeedX;
                document.getElementById('tl_val_speedX').innerText = this.scrollSpeedX.toFixed(1) + 'x';
                document.getElementById('tl_speedY').value = this.scrollSpeedY;
                document.getElementById('tl_val_speedY').innerText = this.scrollSpeedY.toFixed(1) + 'x';
                modal.classList.remove('hidden');
            }
        },

        registerWithHotkeyMaster() {
            const copyCommand = [
                'global', 'timeline.copy', 'Copy Selected Clips', 'Editing', 
                () => this.copyClips(), 
                "Deep clones all selected clips into the clipboard.",
                "Ctrl+KeyC" 
            ];

            const pasteCommand = [
                'global', 'timeline.paste', 'Paste Clips', 'Editing', 
                () => this.pasteClips(), 
                "Pastes copied clips preserving relative spacing, starting at the Playhead.",
                "Ctrl+KeyV" 
            ];

            const duplicateCommand = [
                'global', 'timeline.duplicate', 'Duplicate Clips', 'Editing', 
                () => this.duplicateClips(), 
                "Duplicates selected clips immediately at the playhead without overwriting the clipboard.",
                "Ctrl+KeyD" 
            ];

            const attemptRegistration = () => {
                window.HOTKEY_QUEUE = window.HOTKEY_QUEUE || [];
                if (Array.isArray(window.HOTKEY_QUEUE)) {
                    const alreadyQueued = window.HOTKEY_QUEUE.some(t => t.type === 'command' && t.args[1] === 'timeline.copy');
                    if (!alreadyQueued) {
                        window.HOTKEY_QUEUE.push({ type: 'command', args: copyCommand });
                        window.HOTKEY_QUEUE.push({ type: 'command', args: pasteCommand });
                        window.HOTKEY_QUEUE.push({ type: 'command', args: duplicateCommand });
                    }
                } else {
                    window.HOTKEY_QUEUE.push({ type: 'command', args: copyCommand });
                    window.HOTKEY_QUEUE.push({ type: 'command', args: pasteCommand });
                    window.HOTKEY_QUEUE.push({ type: 'command', args: duplicateCommand });
                }
            };

            // Initial Attempt
            attemptRegistration();

            // Handshake Protocol Loop
            let attempts = 0;
            this.hotkeyHandshake = setInterval(() => {
                attempts++;
                if (window.HOTKEY_RECEIPTS && window.HOTKEY_RECEIPTS['timeline.copy']) {
                    console.log(`[${MODULE_ID}] ✅ Handshake Verified: Hotkeys successfully acknowledged by Master.`);
                    clearInterval(this.hotkeyHandshake);
                } else if (attempts > 20) {
                    console.warn(`[${MODULE_ID}] ⚠️ Hotkey Master handshake timeout. Auto-mapping aborted.`);
                    clearInterval(this.hotkeyHandshake);
                } else {
                    attemptRegistration();
                }
            }, 500);
        },

        // 🔥 CROSS-EXTENSION COMMUNICATION: Smart Collision Bridge
        smartResolveCollision(trackId, clip, ignoreIds = [], originalStart = null) {
            const useAggressiveCollision = window.MEDIA_MANAGER_PRO && window.MEDIA_MANAGER_PRO.isActive;
            const track = Store.tracks[trackId] || [];
            
            if (useAggressiveCollision) {
                let hasOverlap = true;
                let sanityCounter = 0;
                while (hasOverlap && sanityCounter < 100) {
                    hasOverlap = false;
                    for (let i = 0; i < track.length; i++) {
                        const other = track[i];
                        if (other && other.id !== clip.id && !ignoreIds.includes(other.id)) {
                            if (clip.start < other.start + other.duration && clip.start + clip.duration > other.start) {
                                clip.start = other.start + other.duration;
                                hasOverlap = true;
                            }
                        }
                    }
                    sanityCounter++;
                }
            } else {
                // Fallback to base editor collision
                let newStart = clip.start;
                const newEnd = newStart + clip.duration;
                const overlaps = track.filter(c => c && c.id !== clip.id && !ignoreIds.includes(c.id) && c.start < newEnd && (c.start + c.duration) > newStart);
                if (overlaps.length > 0) {
                    const collider = overlaps[0];
                    if (originalStart !== null && originalStart > collider.start) {
                        newStart = collider.start + collider.duration;
                    } else {
                        newStart = collider.start - clip.duration;
                    }
                    clip.start = Math.max(0, newStart);
                }
            }
        },

        copyClips() {
            if (this.selectedClips.size === 0 && Store.selectedClipId) {
                this.selectedClips.add(Store.selectedClipId);
            }

            if (this.selectedClips.size === 0) return;

            this.clipboard = [];
            this.selectedClips.forEach(cid => {
                const trackId = this.findTrackId(cid);
                const clip = this.findClip(cid);
                if (clip && trackId) {
                    this.clipboard.push({ trackId, clip: JSON.parse(JSON.stringify(clip)) });
                }
            });

            if (typeof Notify !== 'undefined') Notify.show(`Copied ${this.clipboard.length} Clip(s)`, 'fa-copy');
        },

        pasteClips() {
            if (!this.clipboard || this.clipboard.length === 0) return;

            const pasteTime = Store.currentTime;
            
            let earliestStart = Infinity;
            this.clipboard.forEach(item => {
                if (item.clip.start < earliestStart) earliestStart = item.clip.start;
            });

            this.selectedClips.clear(); 

            this.clipboard.forEach(item => {
                const offsetFromFirst = item.clip.start - earliestStart;
                const newClip = JSON.parse(JSON.stringify(item.clip));
                
                newClip.id = 'clip_' + Date.now() + Math.random().toString(36).substr(2, 5);
                newClip.start = pasteTime + offsetFromFirst; 

                let targetTrackId = item.trackId;
                if (!Store.tracks[targetTrackId]) {
                    const asset = Store.assets.find(a => a.id === newClip.assetId);
                    const fallbackTrack = Store.trackConfig.find(t => asset && (t.type === asset.type || (asset.type==='image' && t.type==='video')));
                    if (fallbackTrack) targetTrackId = fallbackTrack.id;
                }

                if (targetTrackId) {
                    this.smartResolveCollision(targetTrackId, newClip);
                    Store.tracks[targetTrackId].push(newClip);
                    this.selectedClips.add(newClip.id);
                }
            });

            if (this.selectedClips.size > 0) {
                Store.selectedClipId = Array.from(this.selectedClips)[0];
            }

            Store.saveState();
            if (typeof UI !== 'undefined') UI.refreshTimeline();
            Player.safeRenderFrame();
            if (typeof Notify !== 'undefined') Notify.show(`Pasted ${this.clipboard.length} Clip(s)`, 'fa-paste');
        },

        duplicateClips() {
            if (this.selectedClips.size === 0 && Store.selectedClipId) {
                this.selectedClips.add(Store.selectedClipId);
            }

            if (this.selectedClips.size === 0) return;

            const toDuplicate = [];
            this.selectedClips.forEach(cid => {
                const trackId = this.findTrackId(cid);
                const clip = this.findClip(cid);
                if (clip && trackId) {
                    toDuplicate.push({ trackId, clip: JSON.parse(JSON.stringify(clip)) });
                }
            });

            if (toDuplicate.length === 0) return;

            const duplicateTime = Store.currentTime;
            
            let earliestStart = Infinity;
            toDuplicate.forEach(item => {
                if (item.clip.start < earliestStart) earliestStart = item.clip.start;
            });

            this.selectedClips.clear(); 

            toDuplicate.forEach(item => {
                const offsetFromFirst = item.clip.start - earliestStart;
                const newClip = JSON.parse(JSON.stringify(item.clip));
                
                newClip.id = 'clip_' + Date.now() + Math.random().toString(36).substr(2, 5);
                newClip.start = duplicateTime + offsetFromFirst; 

                let targetTrackId = item.trackId;
                if (!Store.tracks[targetTrackId]) {
                    const asset = Store.assets.find(a => a.id === newClip.assetId);
                    const fallbackTrack = Store.trackConfig.find(t => asset && (t.type === asset.type || (asset.type==='image' && t.type==='video')));
                    if (fallbackTrack) targetTrackId = fallbackTrack.id;
                }

                if (targetTrackId) {
                    this.smartResolveCollision(targetTrackId, newClip);
                    Store.tracks[targetTrackId].push(newClip);
                    this.selectedClips.add(newClip.id);
                }
            });

            if (this.selectedClips.size > 0) {
                Store.selectedClipId = Array.from(this.selectedClips)[0];
            }

            Store.saveState();
            if (typeof UI !== 'undefined') UI.refreshTimeline();
            Player.safeRenderFrame();
            if (typeof Notify !== 'undefined') Notify.show(`Duplicated ${toDuplicate.length} Clip(s)`, 'fa-clone');
        },

        hijackTimeline() {
            this.originalRenderTrack = TimelineModule.renderTrack.bind(TimelineModule);
            TimelineModule.renderTrack = (trackId) => {
                this.originalRenderTrack(trackId);
                if (!this.isActive) return;

                const lane = document.getElementById(`track-${trackId}`);
                if (!lane) return;

                const clips = Store.tracks[trackId] || [];
                clips.forEach((clip, index) => {
                    const clipEl = lane.children[index];
                    if (!clipEl) return;

                    clipEl.dataset.clipId = clip.id;
                    clipEl.dataset.trackId = trackId;

                    if (this.selectedClips.has(clip.id)) {
                        clipEl.classList.add('selected');
                        clipEl.style.boxShadow = '0 0 0 2px #00d2be, 0 10px 30px rgba(0,210,190,0.5)';
                        clipEl.style.borderColor = '#00d2be';
                    }
                });
                
                // Update watermark visibility after rendering tracks
                this.updateWatermark();
            };

            this.originalDeleteSelected = TimelineModule.deleteSelected.bind(TimelineModule);
            TimelineModule.deleteSelected = () => {
                if (!this.isActive || this.selectedClips.size <= 1) {
                    return this.originalDeleteSelected();
                }

                let deletedCount = 0;
                this.selectedClips.forEach(cid => {
                    const trackId = this.findTrackId(cid);
                    if (trackId) {
                        Store.tracks[trackId] = Store.tracks[trackId].filter(c => c.id !== cid);
                        deletedCount++;
                    }
                });

                if (deletedCount > 0) {
                    this.selectedClips.clear();
                    Store.selectedClipId = null;
                    Store.saveState();
                    if (typeof UI !== 'undefined') {
                        UI.checkExportButton();
                        UI.refreshTimeline();
                    }
                    if (typeof Player !== 'undefined') Player.safeRenderFrame();
                    if (typeof Notify !== 'undefined') Notify.show(`Deleted ${deletedCount} Clips`, 'fa-trash');
                }
            };

            // 🔥 UNIFIED DRAGGING HIJACK (Group, Snapping & Tracks)
            this.originalStartDrag = TimelineModule.startDrag.bind(TimelineModule);
            TimelineModule.startDrag = (e, clip, trackId) => {
                if (!this.isActive) return this.originalStartDrag(e, clip, trackId);

                e.stopPropagation();
                e.preventDefault();

                // 1. Selection handling
                if (!this.selectedClips.has(clip.id)) {
                    if (!e.shiftKey) {
                        this.selectedClips.clear();
                    }
                    this.selectedClips.add(clip.id);
                }
                TimelineModule.selectClip(clip.id, trackId); 
                
                const startX = e.clientX;
                const dragGroup = [];
                
                // 2. Snapshot original states
                this.selectedClips.forEach(cid => {
                    const tId = this.findTrackId(cid);
                    const c = this.findClip(cid);
                    if (c && tId) dragGroup.push({ clip: c, trackId: tId, originalStart: c.start });
                });

                document.body.style.cursor = 'grabbing';
                TimelineModule.triggerMinimap();

                const groupIds = dragGroup.map(g => g.clip.id);
                const tracksContainer = document.getElementById('tracksContainer');
                const primaryItem = dragGroup.find(g => g.clip.id === clip.id);
                let currentPrimaryTrackId = trackId;

                const onMove = (ev) => {
                    let diffSec = (ev.clientX - startX) / Store.zoom;

                    // --- PLAYHEAD MAGNETIC SNAPPING ---
                    let snapOffsetSec = 0;
                    const snapThresholdSec = 12 / Store.zoom; // ~12px of screen magnetism
                    const playhead = Store.currentTime;

                    if (primaryItem) {
                        let proposedStart = primaryItem.originalStart + diffSec;
                        let proposedEnd = proposedStart + primaryItem.clip.duration;
                        
                        // Snap Start to Playhead
                        if (Math.abs(proposedStart - playhead) < snapThresholdSec) {
                            snapOffsetSec = playhead - proposedStart;
                        } 
                        // Snap End to Playhead (If start didn't snap)
                        else if (Math.abs(proposedEnd - playhead) < snapThresholdSec) {
                            snapOffsetSec = playhead - proposedEnd;
                        }
                    }

                    // Apply magnetism perfectly to the calculation offset
                    const finalDiffSec = diffSec + snapOffsetSec;
                    
                    // Visual Playhead Glow Indicator
                    const phEl = document.getElementById('playhead');
                    if (phEl) {
                        if (snapOffsetSec !== 0) phEl.classList.add('snapped-active');
                        else phEl.classList.remove('snapped-active');
                    }

                    // --- VERTICAL TRACK CHANGING ---
                    if (dragGroup.length === 1 && primaryItem) {
                        const tracksRect = tracksContainer.getBoundingClientRect();
                        const relativeY = ev.clientY - tracksRect.top;
                        
                        let yOffset = 0;
                        let trackIndex = -1;
                        const trackRows = document.querySelectorAll('.track-row');
                        for (let i = 0; i < trackRows.length; i++) {
                            yOffset += trackRows[i].offsetHeight;
                            const mt = window.getComputedStyle(trackRows[i]).marginTop;
                            if (mt) yOffset += parseFloat(mt);
                            if (relativeY <= yOffset) { trackIndex = i; break; }
                        }

                        if (trackIndex >= 0 && trackIndex < Store.trackConfig.length) {
                            const targetTrack = Store.trackConfig[trackIndex];
                            const asset = Store.assets.find(a => a.id === primaryItem.clip.assetId);
                            if (targetTrack && asset) {
                                let compatible = false;
                                if ((asset.type === 'video' || asset.type === 'image') && (targetTrack.type === 'video' || targetTrack.type === 'fx')) compatible = true;
                                if (asset.type === 'audio' && targetTrack.type === 'audio') compatible = true;
                                if (asset.type === 'title' && targetTrack.type === 'text') compatible = true;
                                
                                if (compatible && targetTrack.id !== currentPrimaryTrackId) {
                                    Store.moveClip(primaryItem.clip.id, currentPrimaryTrackId, targetTrack.id);
                                    primaryItem.trackId = targetTrack.id;
                                    currentPrimaryTrackId = targetTrack.id;
                                }
                            }
                        }
                    }

                    // --- APPLY MOVEMENT & COLLISIONS ---
                    dragGroup.forEach(item => {
                        let proposedStart = item.originalStart + finalDiffSec;
                        if (proposedStart < 0) proposedStart = 0;
                        item.clip.start = proposedStart;
                    });

                    dragGroup.forEach(item => {
                        this.smartResolveCollision(item.trackId, item.clip, groupIds, item.originalStart);
                    });

                    if (typeof UI !== 'undefined') UI.refreshTimeline();
                    Player.safeRenderFrame();
                };

                const onUp = () => {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                    document.body.style.cursor = 'default';
                    const phEl = document.getElementById('playhead');
                    if (phEl) phEl.classList.remove('snapped-active');
                    Store.saveState();
                };

                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            };

            // 🔥 MAGNETIC RESIZING HIJACK
            this.originalStartResize = TimelineModule.startResize.bind(TimelineModule);
            TimelineModule.startResize = (e, clip, trackId, side) => {
                if (!this.isActive) return this.originalStartResize(e, clip, trackId, side);

                e.stopPropagation(); 
                e.preventDefault();
                const startX = e.clientX; 
                const originalStart = clip.start; 
                const originalDuration = clip.duration; 
                const originalOffset = clip.offset;
                const asset = Store.assets.find(a => a && a.id === clip.assetId); 
                if (!asset) return; 
                
                const isMedia = asset.type === 'video' || asset.type === 'audio';
                document.body.style.cursor = 'col-resize';
                TimelineModule.triggerMinimap();
                
                const onMove = (ev) => {
                    const diffSec = (ev.clientX - startX) / Store.zoom;
                    
                    const snapThresholdSec = 12 / Store.zoom;
                    const playhead = Store.currentTime;
                    let snapOffsetSec = 0;

                    if (side === 'right') {
                        let proposedDur = Math.max(0.5, originalDuration + diffSec);
                        let proposedEnd = originalStart + proposedDur;

                        if (Math.abs(proposedEnd - playhead) < snapThresholdSec) {
                            snapOffsetSec = playhead - proposedEnd;
                            proposedDur += snapOffsetSec;
                        }

                        let newDur = proposedDur;
                        if (isMedia && (originalOffset + newDur) > asset.duration) {
                            newDur = asset.duration - originalOffset;
                            if (proposedDur > newDur) snapOffsetSec = 0; 
                        }
                        
                        clip.duration = newDur; 
                        Store.resolveResizeCollision(trackId, clip, clip.id);
                        
                    } else {
                        let proposedStart = originalStart + diffSec;

                        if (Math.abs(proposedStart - playhead) < snapThresholdSec) {
                            snapOffsetSec = playhead - proposedStart;
                        }

                        let effectiveDiffSec = diffSec + snapOffsetSec;
                        let newStart = originalStart + effectiveDiffSec; 
                        let newDur = originalDuration - effectiveDiffSec; 
                        let newOffset = originalOffset + effectiveDiffSec;
                        
                        if (newOffset < 0) { 
                            newOffset = 0; 
                            const delta = 0 - originalOffset; 
                            newStart = originalStart + delta; 
                            newDur = originalDuration - delta; 
                            snapOffsetSec = 0; 
                        }
                        if (newDur < 0.5) { 
                            newDur = 0.5; 
                            newStart = (originalStart + originalDuration) - 0.5; 
                            newOffset = (originalOffset + originalDuration) - 0.5; 
                            snapOffsetSec = 0; 
                        }
                        if (newStart < 0) { 
                            const overshot = 0 - newStart; 
                            newStart = 0; 
                            newDur -= overshot; 
                            newOffset += overshot; 
                            snapOffsetSec = 0; 
                        }
                        
                        clip.start = newStart; 
                        clip.duration = newDur; 
                        clip.offset = newOffset;
                    }
                    
                    const phEl = document.getElementById('playhead');
                    if (phEl) {
                        if (snapOffsetSec !== 0) phEl.classList.add('snapped-active');
                        else phEl.classList.remove('snapped-active');
                    }

                    TimelineModule.renderTrack(trackId);
                };
                
                const onUp = () => { 
                    document.removeEventListener('mousemove', onMove); 
                    document.removeEventListener('mouseup', onUp); 
                    document.body.style.cursor = 'default';
                    const phEl = document.getElementById('playhead');
                    if (phEl) phEl.classList.remove('snapped-active');
                    Store.saveState(); 
                };
                
                document.addEventListener('mousemove', onMove); 
                document.addEventListener('mouseup', onUp);
            };
        },

        bindGlobalEvents() {
            this.globalWheelHandler = (e) => {
                if (!this.isActive) return;
                const timelineContainer = e.target.closest('.timeline-container');
                if (timelineContainer && e.shiftKey) {
                    e.preventDefault(); 
                    e.stopPropagation(); 
                    const scrollArea = document.getElementById('tracksScrollArea');
                    if (scrollArea) {
                        scrollArea.scrollLeft += e.deltaY * this.scrollSpeedX; 
                    }
                }
            };
            window.addEventListener('wheel', this.globalWheelHandler, { capture: true, passive: false });

            this.globalMousedownHandler = (e) => {
                if (!this.isActive) return;

                if (e.altKey && e.button === 0 && e.target.closest('.timeline-container')) {
                    e.preventDefault();
                    e.stopPropagation();
                    const scrollArea = document.getElementById('tracksScrollArea');
                    if (!scrollArea) return;

                    let startX = e.clientX;
                    let startY = e.clientY;
                    let startScrollL = scrollArea.scrollLeft;
                    let startScrollT = scrollArea.scrollTop;

                    scrollArea.style.cursor = 'grabbing';

                    const onMove = (ev) => {
                        scrollArea.scrollLeft = startScrollL - ((ev.clientX - startX) * this.scrollSpeedY);
                        scrollArea.scrollTop = startScrollT - ((ev.clientY - startY) * this.scrollSpeedY);
                    };

                    const onUp = () => {
                        scrollArea.style.cursor = '';
                        document.removeEventListener('mousemove', onMove);
                        document.removeEventListener('mouseup', onUp);
                    };

                    document.addEventListener('mousemove', onMove);
                    document.addEventListener('mouseup', onUp);
                    return;
                }

                const clipEl = e.target.closest('.t-clip');
                const resizeHandle = e.target.closest('.resize-handle');
                const transBlock = e.target.closest('.trans-block');

                if (clipEl && !resizeHandle && !transBlock) {
                    const clipId = clipEl.dataset.clipId;
                    
                    if (e.shiftKey) {
                        e.stopPropagation(); 
                        e.preventDefault();

                        if (this.selectedClips.has(clipId)) {
                            this.selectedClips.delete(clipId);
                            if (Store.selectedClipId === clipId) Store.selectedClipId = null;
                        } else {
                            this.selectedClips.add(clipId);
                            Store.selectedClipId = clipId;
                            Store.selectedTrackId = clipEl.dataset.trackId;
                        }
                        if (typeof UI !== 'undefined') UI.refreshTimeline();
                        
                    } else {
                        if (!this.selectedClips.has(clipId)) {
                            this.selectedClips.clear();
                            this.selectedClips.add(clipId);
                        }
                    }
                } 
                else if (!clipEl && !e.target.closest('.control-bar') && e.target.closest('.timeline-container')) {
                    if (e.button !== 0 || e.altKey) return; 

                    if (!e.shiftKey) {
                        this.selectedClips.clear();
                        if (typeof UI !== 'undefined') UI.refreshTimeline();
                    }

                    const scrollArea = document.getElementById('tracksScrollArea');
                    const tracksContainer = document.getElementById('tracksContainer');
                    if (!scrollArea || !tracksContainer) return;

                    const rect = tracksContainer.getBoundingClientRect();
                    let startX = e.clientX - rect.left;
                    let startY = e.clientY - rect.top;

                    let selBox = document.getElementById('tl-selection-box');
                    if (!selBox) {
                        selBox = document.createElement('div');
                        selBox.id = 'tl-selection-box';
                        selBox.className = 'tl-selection-box';
                        tracksContainer.appendChild(selBox);
                    }

                    selBox.style.display = 'block';
                    selBox.style.left = startX + 'px';
                    selBox.style.top = startY + 'px';
                    selBox.style.width = '0px';
                    selBox.style.height = '0px';

                    const initialSelected = new Set(this.selectedClips);

                    const onMove = (ev) => {
                        const currentX = ev.clientX - rect.left;
                        const currentY = ev.clientY - rect.top;

                        const left = Math.min(startX, currentX);
                        const top = Math.min(startY, currentY);
                        const width = Math.abs(currentX - startX);
                        const height = Math.abs(currentY - startY);

                        selBox.style.left = left + 'px';
                        selBox.style.top = top + 'px';
                        selBox.style.width = width + 'px';
                        selBox.style.height = height + 'px';

                        const boxRect = selBox.getBoundingClientRect();
                        const allClips = tracksContainer.querySelectorAll('.t-clip');
                        
                        const newlySelected = new Set(initialSelected);

                        allClips.forEach(el => {
                            const cRect = el.getBoundingClientRect();
                            if (boxRect.left < cRect.right && boxRect.right > cRect.left &&
                                boxRect.top < cRect.bottom && boxRect.bottom > cRect.top) {
                                newlySelected.add(el.dataset.clipId);
                            }
                        });

                        this.selectedClips = newlySelected;
                        
                        allClips.forEach(el => {
                            const cid = el.dataset.clipId;
                            if (this.selectedClips.has(cid)) {
                                if (!el.classList.contains('selected')) {
                                    el.classList.add('selected');
                                    el.style.boxShadow = '0 0 0 2px #00d2be, 0 10px 30px rgba(0,210,190,0.5)';
                                    el.style.borderColor = '#00d2be';
                                }
                            } else {
                                if (el.classList.contains('selected')) {
                                    el.classList.remove('selected');
                                    el.style.boxShadow = '';
                                    el.style.borderColor = '';
                                }
                            }
                        });
                    };

                    const onUp = () => {
                        selBox.style.display = 'none';
                        document.removeEventListener('mousemove', onMove);
                        document.removeEventListener('mouseup', onUp);
                        
                        if (this.selectedClips.size > 0) {
                            Store.selectedClipId = Array.from(this.selectedClips)[0];
                            const firstClipEl = document.querySelector(`.t-clip[data-clip-id="${Store.selectedClipId}"]`);
                            if (firstClipEl) Store.selectedTrackId = firstClipEl.dataset.trackId;
                        } else {
                            Store.selectedClipId = null;
                        }
                    };

                    document.addEventListener('mousemove', onMove);
                    document.addEventListener('mouseup', onUp);
                }
            };
            
            document.addEventListener('mousedown', this.globalMousedownHandler, true);
        },

        findTrackId(clipId) {
            for (let tid in Store.tracks) {
                if (Store.tracks[tid].find(c => c.id === clipId)) return tid;
            }
            return null;
        },

        findClip(clipId) {
            for (let tid in Store.tracks) {
                const c = Store.tracks[tid].find(x => x.id === clipId);
                if (c) return c;
            }
            return null;
        },

        cleanup() {
            console.log(`[${MODULE_ID}] Uninstalling Timeline Pro Engine...`);
            this.isActive = false;
            
            if (this.hotkeyHandshake) clearInterval(this.hotkeyHandshake);
            
            if (this.originalRenderTrack) TimelineModule.renderTrack = this.originalRenderTrack;
            if (this.originalStartDrag) TimelineModule.startDrag = this.originalStartDrag;
            if (this.originalStartResize) TimelineModule.startResize = this.originalStartResize;
            if (this.originalDeleteSelected) TimelineModule.deleteSelected = this.originalDeleteSelected;
            
            if (this.globalMousedownHandler) {
                document.removeEventListener('mousedown', this.globalMousedownHandler, true);
            }
            if (this.globalWheelHandler) {
                window.removeEventListener('wheel', this.globalWheelHandler, { capture: true });
            }
            
            document.getElementById(`${MODULE_ID}_styles`)?.remove();
            document.getElementById('tl-selection-box')?.remove();
            document.getElementById('tl-prefs-btn-new')?.remove();
            document.getElementById('tl-prefs-modal')?.remove();
            document.getElementById('tl-pro-watermark')?.remove();
            
            delete window.TIMELINE_PRO_ENGINE;
            if(typeof UI !== 'undefined') UI.refreshTimeline();
            Player.safeRenderFrame(); 
        }
    };

    window.TIMELINE_PRO_ENGINE = TimelineProEngine;
    TimelineProEngine.init();

})();
