/**
 * @name Timeline Pro Engine
 * @version 1.2.2
 * @developer Forge™
 * @description Advanced timeline operations. Adds Alt+Drag Panning, Shift+Scroll Horizontal Navigation, Marquee Box Selection, Shift-Click Multi-Select, Group Dragging, Playhead-Relative Paste/Duplicate, and Mass Deletion.
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
        
        // Native Host Hooks
        originalRenderTrack: null,
        originalStartDrag: null,
        originalDeleteSelected: null,
        globalMousedownHandler: null,
        globalWheelHandler: null,

        init() {
            console.log(`[${MODULE_ID}] Booting Timeline Pro Engine v1.2.2...`);
            
            this.injectStyles();
            this.registerWithHotkeyMaster();
            this.hijackTimeline();
            this.bindGlobalEvents();
            
            if (typeof UI !== 'undefined') UI.refreshTimeline();
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
            `;
            document.head.appendChild(style);
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

            if (window.HOTKEY_MASTER && window.HOTKEY_MASTER.registerCommand) {
                window.HOTKEY_MASTER.registerCommand(...copyCommand);
                window.HOTKEY_MASTER.registerCommand(...pasteCommand);
                window.HOTKEY_MASTER.registerCommand(...duplicateCommand);
                console.log(`[${MODULE_ID}] ✅ Direct API Hotkey Registration Successful.`);
            } else {
                window.HOTKEY_QUEUE = window.HOTKEY_QUEUE || [];
                window.HOTKEY_QUEUE.push({ type: 'command', args: copyCommand });
                window.HOTKEY_QUEUE.push({ type: 'command', args: pasteCommand });
                window.HOTKEY_QUEUE.push({ type: 'command', args: duplicateCommand });
            }
        },

        // 🔥 CROSS-EXTENSION COMMUNICATION: Smart Collision Bridge
        smartResolveCollision(trackId, clip) {
            // Check if Media Manager Pro is installed and active to sync collision logic
            const useAggressiveCollision = window.MEDIA_MANAGER_PRO && window.MEDIA_MANAGER_PRO.isActive;
            
            if (useAggressiveCollision) {
                const track = Store.tracks[trackId] || [];
                let hasOverlap = true;
                let sanityCounter = 0;
                
                while (hasOverlap && sanityCounter < 100) {
                    hasOverlap = false;
                    for (let i = 0; i < track.length; i++) {
                        const other = track[i];
                        if (other && other.id !== clip.id) {
                            if (clip.start < other.start + other.duration && clip.start + clip.duration > other.start) {
                                // Forcefully bump the clip to the end of the overlapping clip
                                clip.start = other.start + other.duration;
                                hasOverlap = true;
                            }
                        }
                    }
                    sanityCounter++;
                }
            } else {
                // Fallback to the base editor's primitive collision if the Pro extension isn't active
                Store.resolveDragCollision(trackId, clip, clip.start);
            }
        },

        copyClips() {
            // Failsafe: Sync native selection if it was made before selecting multiple
            if (this.selectedClips.size === 0 && Store.selectedClipId) {
                this.selectedClips.add(Store.selectedClipId);
            }

            if (this.selectedClips.size === 0) return;

            this.clipboard = [];
            this.selectedClips.forEach(cid => {
                const trackId = this.findTrackId(cid);
                const clip = this.findClip(cid);
                if (clip && trackId) {
                    // Deep clone to sever object references immediately
                    this.clipboard.push({ trackId, clip: JSON.parse(JSON.stringify(clip)) });
                }
            });

            if (typeof Notify !== 'undefined') Notify.show(`Copied ${this.clipboard.length} Clip(s)`, 'fa-copy');
        },

        pasteClips() {
            if (!this.clipboard || this.clipboard.length === 0) return;

            const pasteTime = Store.currentTime;
            
            // 1. Find the earliest start time to calculate relative spacing
            let earliestStart = Infinity;
            this.clipboard.forEach(item => {
                if (item.clip.start < earliestStart) earliestStart = item.clip.start;
            });

            this.selectedClips.clear(); // Clear so we can highlight the newly pasted ones

            this.clipboard.forEach(item => {
                const offsetFromFirst = item.clip.start - earliestStart;
                const newClip = JSON.parse(JSON.stringify(item.clip));
                
                // 2. Assign a completely unique ID so it is an independent entity
                newClip.id = 'clip_' + Date.now() + Math.random().toString(36).substr(2, 5);
                newClip.start = pasteTime + offsetFromFirst; // Playhead + Relative Spacing

                // 3. Track resolution: Paste onto the same track if possible
                let targetTrackId = item.trackId;
                if (!Store.tracks[targetTrackId]) {
                    // If the track was deleted, find a matching type
                    const asset = Store.assets.find(a => a.id === newClip.assetId);
                    const fallbackTrack = Store.trackConfig.find(t => asset && (t.type === asset.type || (asset.type==='image' && t.type==='video')));
                    if (fallbackTrack) targetTrackId = fallbackTrack.id;
                }

                if (targetTrackId) {
                    // Resolve collisions seamlessly communicating with Media Manager Pro!
                    this.smartResolveCollision(targetTrackId, newClip);
                    Store.tracks[targetTrackId].push(newClip);
                    this.selectedClips.add(newClip.id);
                }
            });

            if (this.selectedClips.size > 0) {
                Store.selectedClipId = Array.from(this.selectedClips)[0]; // Update Inspector
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

                    // Expose the clip ID to the DOM for global click interception
                    clipEl.dataset.clipId = clip.id;
                    clipEl.dataset.trackId = trackId;

                    // Apply multi-select styling
                    if (this.selectedClips.has(clip.id)) {
                        clipEl.classList.add('selected');
                        clipEl.style.boxShadow = '0 0 0 2px #00d2be, 0 10px 30px rgba(0,210,190,0.5)';
                        clipEl.style.borderColor = '#00d2be';
                    }
                });
            };

            // 🔥 MASS DELETION HIJACK
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

            // 🔥 GROUP DRAGGING HIJACK
            this.originalStartDrag = TimelineModule.startDrag.bind(TimelineModule);
            TimelineModule.startDrag = (e, clip, trackId) => {
                // If only 1 clip is selected, defer to the normal core dragging
                if (!this.isActive || !this.selectedClips.has(clip.id) || this.selectedClips.size <= 1) {
                    return this.originalStartDrag(e, clip, trackId);
                }

                e.stopPropagation();
                e.preventDefault();

                TimelineModule.selectClip(clip.id, trackId); 
                
                const startX = e.clientX;
                const dragGroup = [];
                
                // Snapshot original states of all selected clips
                this.selectedClips.forEach(cid => {
                    const tId = this.findTrackId(cid);
                    const c = this.findClip(cid);
                    if (c && tId) dragGroup.push({ clip: c, trackId: tId, originalStart: c.start });
                });

                document.body.style.cursor = 'grabbing';
                TimelineModule.triggerMinimap();

                const groupIds = dragGroup.map(g => g.clip.id);

                const onMove = (ev) => {
                    const diffSec = (ev.clientX - startX) / Store.zoom;

                    // 1. Propose new times for all clips simultaneously
                    dragGroup.forEach(item => {
                        let proposedStart = item.originalStart + diffSec;
                        if (proposedStart < 0) proposedStart = 0;
                        item.clip.start = proposedStart;
                    });

                    // 2. Custom Collision Resolution (Ignores other clips within the same drag group!)
                    dragGroup.forEach(item => {
                        const track = Store.tracks[item.trackId] || [];
                        let newStart = item.clip.start;
                        const newEnd = newStart + item.clip.duration;
                        
                        const overlaps = track.filter(c => !groupIds.includes(c.id) && c.start < newEnd && (c.start + c.duration) > newStart);
                        
                        if (overlaps.length > 0) {
                            const collider = overlaps[0];
                            if (item.originalStart > collider.start) {
                                newStart = collider.start + collider.duration;
                            } else {
                                newStart = collider.start - item.clip.duration;
                            }
                            item.clip.start = Math.max(0, newStart);
                        }
                    });

                    if (typeof UI !== 'undefined') UI.refreshTimeline();
                    Player.safeRenderFrame();
                };

                const onUp = () => {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                    document.body.style.cursor = 'default';
                    Store.saveState();
                };

                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            };
        },

        bindGlobalEvents() {
            // Capture phase handles SHIFT + WHEEL for optimal horizontal timeline navigation
            this.globalWheelHandler = (e) => {
                if (!this.isActive) return;
                const timelineContainer = e.target.closest('.timeline-container');
                if (timelineContainer && e.shiftKey) {
                    e.preventDefault(); 
                    e.stopPropagation(); 
                    const scrollArea = document.getElementById('tracksScrollArea');
                    if (scrollArea) {
                        // DeltaY outputs negative when scrolling up (desired left), positive for down (desired right)
                        scrollArea.scrollLeft += e.deltaY * 2.5; 
                    }
                }
            };
            window.addEventListener('wheel', this.globalWheelHandler, { capture: true, passive: false });

            // Using capture phase to hit the event BEFORE the inline TimelineModule select triggers
            this.globalMousedownHandler = (e) => {
                if (!this.isActive) return;

                // 🔥 ALT + DRAG TIMELINE PANNING
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
                        // Direct DOM manipulation prevents heavy redraw throttling
                        scrollArea.scrollLeft = startScrollL - (ev.clientX - startX);
                        scrollArea.scrollTop = startScrollT - (ev.clientY - startY);
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

                // If we clicked a clip (but not a resize handle or a transition block)
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
                            Store.selectedClipId = clipId; // Pass to core inspector
                            Store.selectedTrackId = clipEl.dataset.trackId;
                        }
                        if (typeof UI !== 'undefined') UI.refreshTimeline();
                        
                    } else {
                        // Regular click. Do not wipe the selection if they click a currently selected clip
                        // This allows them to click the group to begin a Multi-Drag!
                        if (!this.selectedClips.has(clipId)) {
                            this.selectedClips.clear();
                            this.selectedClips.add(clipId);
                        }
                    }
                } 
                else if (!clipEl && !e.target.closest('.control-bar') && e.target.closest('.timeline-container')) {
                    // 🔥 CLICK AND DRAG MARQUEE SELECTION
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

                        // Sub-frame hit testing via absolute spatial alignment
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
                        
                        // Direct DOM bypass styling to prevent UI framework bottlenecks
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
            
            if (this.originalRenderTrack) TimelineModule.renderTrack = this.originalRenderTrack;
            if (this.originalStartDrag) TimelineModule.startDrag = this.originalStartDrag;
            if (this.originalDeleteSelected) TimelineModule.deleteSelected = this.originalDeleteSelected;
            
            if (this.globalMousedownHandler) {
                document.removeEventListener('mousedown', this.globalMousedownHandler, true);
            }
            if (this.globalWheelHandler) {
                window.removeEventListener('wheel', this.globalWheelHandler, { capture: true });
            }
            
            document.getElementById(`${MODULE_ID}_styles`)?.remove();
            document.getElementById('tl-selection-box')?.remove();
            
            delete window.TIMELINE_PRO_ENGINE;
            if(typeof UI !== 'undefined') UI.refreshTimeline();
            Player.safeRenderFrame(); 
        }
    };

    window.TIMELINE_PRO_ENGINE = TimelineProEngine;
    TimelineProEngine.init();

})();
