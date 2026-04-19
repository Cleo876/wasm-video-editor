/**
 * @name Audio Mixing & Fades Engine
 * @version 1.1.0
 * @developer Forge™
 * @description Advanced audio bus routing. Adds volume mixing, visual timeline fade handles, independent L-Cut audio extraction, and buttery smooth slider UX.
 */
(function() {
    const MODULE_ID = 'audio_mixing_engine';

    if (typeof Store === 'undefined' || typeof Player === 'undefined' || typeof TimelineModule === 'undefined' || typeof NativeInspector === 'undefined') {
        console.error(`❌ [${MODULE_ID}] Core environment not found. Ensure editor is fully loaded.`);
        return;
    }

    const AudioMixingEngine = {
        isActive: true,
        
        // Native Host Hooks
        originalGetVideoSource: null,
        originalGetAudioSource: null,
        originalRenderFrame: null,
        originalRenderTrack: null,
        originalInspectorRender: null,

        init() {
            console.log(`[${MODULE_ID}] Booting Audio Engine...`);
            
            this.injectStyles();
            this.hijackAudioBus();
            this.hijackRenderer();
            this.hijackTimeline();
            this.hijackInspector();
            this.registerExportMiddleware();
            
            if (typeof UI !== 'undefined') UI.refreshTimeline();
            if (NativeInspector.currentClipId) NativeInspector.render();
        },

        injectStyles() {
            const style = document.createElement('style');
            style.id = `${MODULE_ID}_styles`;
            style.innerHTML = `
                .audio-fade-overlay { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 5; }
                
                .fade-handle { 
                    position: absolute; top: 0; width: 10px; height: 10px; 
                    background: #fff; border-radius: 50%; 
                    cursor: ew-resize; z-index: 25; shadow-md; 
                    opacity: 0; transition: opacity 0.2s, transform 0.1s; 
                    border: 1px solid rgba(0,0,0,0.5);
                }
                
                .t-clip:hover .fade-handle { opacity: 1; }
                .fade-handle:hover { transform: scale(1.3); }
                .fade-handle:active { transform: scale(1.1); cursor: grabbing; background: #00d2be; }
                
                .fade-handle.in { left: 0; transform: translate(-50%, -50%); }
                .fade-handle.out { right: 0; transform: translate(50%, -50%); }
                
                /* T-clip overflow needs to be visible to show handles bleeding over the top edge */
                .t-clip { overflow: visible !important; }
            `;
            document.head.appendChild(style);
        },

        // --- AUDIO BUS HIJACKING ---
        // We must override the core media getters to inject a GainNode per clip
        hijackAudioBus() {
            this.originalGetVideoSource = Player.getVideoSource.bind(Player);
            Player.getVideoSource = (clipId, url) => {
                if(Player.videoPool[clipId]) return Player.videoPool[clipId];
                if(!url) return null;
                
                const el = document.createElement('video');
                el.src = url; el.playsInline = true;
                
                let mc = document.getElementById('hiddenMediaContainer');
                if(!mc) {
                    mc = document.createElement('div');
                    mc.id = 'hiddenMediaContainer';
                    mc.style.display = 'none';
                    document.body.appendChild(mc);
                }
                mc.appendChild(el);

                if(!Player.actx) Player.initAudio();
                if(Player.actx) {
                    try {
                        const source = Player.actx.createMediaElementSource(el);
                        const clipGain = Player.actx.createGain();
                        source.connect(clipGain);
                        clipGain.connect(Player.gainNode);
                        el._clipGain = clipGain; // Attach dedicated mixer node
                    } catch(e) {}
                }
                Player.videoPool[clipId] = el;
                return el;
            };

            this.originalGetAudioSource = Player.getAudioSource.bind(Player);
            Player.getAudioSource = (clipId, url) => {
                if(Player.audioPool[clipId]) return Player.audioPool[clipId];
                if(!url) return null;
                
                if(!Player.actx) Player.initAudio();
                if(!Player.actx) return null;
                
                const el = new Audio(url);
                el.loop = false;
                
                let mc = document.getElementById('hiddenMediaContainer');
                if(!mc) {
                    mc = document.createElement('div');
                    mc.id = 'hiddenMediaContainer';
                    mc.style.display = 'none';
                    document.body.appendChild(mc);
                }
                mc.appendChild(el);

                let source = null;
                try {
                    source = Player.actx.createMediaElementSource(el);
                    const clipGain = Player.actx.createGain();
                    source.connect(clipGain);
                    clipGain.connect(Player.gainNode);
                    el._clipGain = clipGain; // Attach dedicated mixer node
                } catch(e) {}
                
                Player.audioPool[clipId] = { el, source, url };
                return Player.audioPool[clipId];
            };
        },

        // --- REAL-TIME MIXING RENDERER ---
        hijackRenderer() {
            this.originalRenderFrame = Player.renderFrame.bind(Player);
            Player.renderFrame = () => {
                this.originalRenderFrame();
                if (!this.isActive) return;

                const t = Store.currentTime;

                // Modulate Video Track Volumes
                Store.trackConfig.filter(tr => tr.type === 'video' || tr.type === 'fx').forEach(track => {
                    (Store.tracks[track.id] || []).forEach(clip => {
                        const vEl = Player.videoPool[clip.id];
                        if (vEl && vEl._clipGain) {
                            this.applyDynamicVolume(vEl._clipGain, clip, t);
                        }
                    });
                });

                // Modulate Audio Track Volumes
                Store.trackConfig.filter(tr => tr.type === 'audio').forEach(track => {
                    (Store.tracks[track.id] || []).forEach(clip => {
                        const aItem = Player.audioPool[clip.id];
                        if (aItem && aItem.el._clipGain) {
                            this.applyDynamicVolume(aItem.el._clipGain, clip, t);
                        }
                    });
                });
            };
        },

        applyDynamicVolume(gainNode, clip, currentTime) {
            let targetVol = (clip.volume !== undefined ? clip.volume : 100) / 100;
            if (clip.muted) targetVol = 0;

            const elapsed = currentTime - clip.start;
            const fadeIn = clip.fadeIn || 0;
            const fadeOut = clip.fadeOut || 0;

            // Apply Math for Fade In
            if (fadeIn > 0 && elapsed < fadeIn) {
                targetVol *= (elapsed / fadeIn);
            }
            
            // Apply Math for Fade Out
            if (fadeOut > 0 && elapsed > (clip.duration - fadeOut)) {
                const remaining = clip.duration - elapsed;
                targetVol *= Math.max(0, remaining / fadeOut);
            }

            // Smooth interpolation to prevent audio cracking
            if (Player.actx) {
                gainNode.gain.setTargetAtTime(targetVol, Player.actx.currentTime, 0.05);
            }
        },

        // --- TIMELINE VISUALS & DRAG HANDLES ---
        hijackTimeline() {
            this.originalRenderTrack = TimelineModule.renderTrack.bind(TimelineModule);
            TimelineModule.renderTrack = (trackId) => {
                this.originalRenderTrack(trackId);
                if (!this.isActive) return;

                const lane = document.getElementById(`track-${trackId}`);
                if (!lane) return;

                const clips = Store.tracks[trackId] || [];
                const trackType = Store.trackConfig.find(t => t.id === trackId)?.type;
                
                // Only inject audio fade handles on media tracks
                if (trackType !== 'audio' && trackType !== 'video') return;

                clips.forEach((clip, index) => {
                    const clipEl = lane.children[index];
                    if (!clipEl) return;

                    const w = clip.duration * Store.zoom;
                    const inPx = (clip.fadeIn || 0) * Store.zoom;
                    const outPx = (clip.fadeOut || 0) * Store.zoom;

                    // Inject Visual Shading SVG
                    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                    svg.setAttribute("class", "audio-fade-vis absolute inset-0 w-full h-full pointer-events-none z-10");
                    svg.setAttribute("preserveAspectRatio", "none");
                    
                    let polys = '';
                    if (inPx > 0) {
                        // Triangle representing the muted area during fade in
                        polys += `<polygon points="0,0 0,40 ${inPx},0" fill="rgba(0,0,0,0.5)"/>`;
                    }
                    if (outPx > 0) {
                        // Triangle representing the muted area during fade out
                        polys += `<polygon points="${w - outPx},0 ${w},40 ${w},0" fill="rgba(0,0,0,0.5)"/>`;
                    }
                    svg.innerHTML = polys;
                    clipEl.appendChild(svg);

                    // Inject Draggable Handles
                    const handleIn = document.createElement('div');
                    handleIn.className = 'fade-handle in';
                    handleIn.style.left = `${inPx}px`;
                    handleIn.title = `Fade In: ${clip.fadeIn || 0}s`;
                    
                    const handleOut = document.createElement('div');
                    handleOut.className = 'fade-handle out';
                    handleOut.style.right = `${outPx}px`;
                    handleOut.title = `Fade Out: ${clip.fadeOut || 0}s`;

                    this.makeFadeDraggable(handleIn, clip, 'in', clipEl, trackId);
                    this.makeFadeDraggable(handleOut, clip, 'out', clipEl, trackId);

                    clipEl.appendChild(handleIn);
                    clipEl.appendChild(handleOut);
                });
            };
        },

        makeFadeDraggable(handle, clip, type, clipEl, trackId) {
            handle.onmousedown = (e) => {
                e.stopPropagation();
                e.preventDefault();
                
                let startX = e.clientX;
                let startFade = type === 'in' ? (clip.fadeIn || 0) : (clip.fadeOut || 0);
                let otherFade = type === 'in' ? (clip.fadeOut || 0) : (clip.fadeIn || 0);
                
                TimelineModule.selectClip(clip.id, trackId);

                const onMove = (ev) => {
                    const deltaX = ev.clientX - startX;
                    const deltaSec = deltaX / Store.zoom;
                    
                    let newFade;
                    if (type === 'in') {
                        newFade = Math.max(0, startFade + deltaSec);
                        newFade = Math.min(newFade, clip.duration - otherFade); // Prevent overlapping fades
                        clip.fadeIn = newFade;
                    } else {
                        newFade = Math.max(0, startFade - deltaSec); // Drag left increases fade out
                        newFade = Math.min(newFade, clip.duration - otherFade);
                        clip.fadeOut = newFade;
                    }
                    
                    if (typeof NativeInspector !== 'undefined') NativeInspector.render();
                    TimelineModule.renderTrack(trackId);
                };

                const onUp = () => {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                    Store.saveState();
                };

                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            };
        },

        // --- NATIVE INSPECTOR INJECTION ---
        hijackInspector() {
            this.originalInspectorRender = NativeInspector.render.bind(NativeInspector);
            NativeInspector.render = () => {
                this.originalInspectorRender();
                if (!this.isActive) return;

                const container = document.getElementById('nativeInspectorContent');
                if (!container || !NativeInspector.currentClipId) return;
                
                const clip = this.findClip(NativeInspector.currentClipId);
                if (!clip) return;
                
                const trackType = Store.trackConfig.find(t => t.id === this.findTrackId(clip.id))?.type;
                if (trackType !== 'audio' && trackType !== 'video') return;

                const extBox = document.getElementById('nativeInspectorExtensions');
                if (extBox) {
                    const vol = clip.volume !== undefined ? clip.volume : 100;
                    const fIn = clip.fadeIn || 0;
                    const fOut = clip.fadeOut || 0;

                    let html = `
                        <div class="mb-4 relative border-t border-[#222] pt-4 mt-2">
                            <h4 class="text-[10px] uppercase text-teal-400 font-bold mb-3"><i class="fa-solid fa-volume-high mr-1"></i> Audio Mixing</h4>
                            
                            <div class="mb-3">
                                <div class="flex justify-between text-xs text-gray-400 mb-1">
                                    <span class="flex items-center gap-2">Volume <button onclick="window.AUDIO_MIXER.resetProp('${clip.id}', 'volume', 100)" class="hover:text-white" title="Reset Volume"><i class="fa-solid fa-rotate-left"></i></button></span> 
                                    <span id="am_vol_val">${parseFloat(vol).toFixed(1)}%</span>
                                </div>
                                <input type="range" min="0" max="200" step="0.1" value="${vol}" class="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-teal-500 te-safe-input" oninput="window.AUDIO_MIXER.updateProp('${clip.id}', 'volume', this.value)">
                            </div>
                            
                            <div class="flex gap-3 mb-3">
                                <div class="flex-1">
                                    <div class="flex justify-between text-xs text-gray-400 mb-1">
                                        <span class="flex items-center gap-2">Fade In <button onclick="window.AUDIO_MIXER.resetProp('${clip.id}', 'fadeIn', 0)" class="hover:text-white" title="Reset Fade In"><i class="fa-solid fa-rotate-left"></i></button></span> 
                                        <span id="am_fin_val">${parseFloat(fIn).toFixed(2)}s</span>
                                    </div>
                                    <input type="range" min="0" max="${clip.duration}" step="0.01" value="${fIn}" class="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-teal-500 te-safe-input" oninput="window.AUDIO_MIXER.updateProp('${clip.id}', 'fadeIn', this.value)">
                                </div>
                                <div class="flex-1">
                                    <div class="flex justify-between text-xs text-gray-400 mb-1">
                                        <span class="flex items-center gap-2">Fade Out <button onclick="window.AUDIO_MIXER.resetProp('${clip.id}', 'fadeOut', 0)" class="hover:text-white" title="Reset Fade Out"><i class="fa-solid fa-rotate-left"></i></button></span> 
                                        <span id="am_fout_val">${parseFloat(fOut).toFixed(2)}s</span>
                                    </div>
                                    <input type="range" min="0" max="${clip.duration}" step="0.01" value="${fOut}" class="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-teal-500 te-safe-input" oninput="window.AUDIO_MIXER.updateProp('${clip.id}', 'fadeOut', this.value)">
                                </div>
                            </div>
                    `;

                    // L-CUT Feature: Extract Audio (Only for Video clips)
                    if (trackType === 'video') {
                        html += `
                            <button onclick="window.AUDIO_MIXER.extractAudio('${clip.id}')" class="w-full mt-2 bg-[#111] hover:bg-[#222] border border-[#333] hover:border-teal-500 text-teal-400 py-2 rounded text-xs font-bold transition flex items-center justify-center shadow-md">
                                <i class="fa-solid fa-music mr-2"></i> EXTRACT AUDIO (L-CUT)
                            </button>
                        `;
                    }

                    html += `</div>`;
                    extBox.insertAdjacentHTML('beforeend', html);

                    // Protect timeline hotkeys
                    extBox.querySelectorAll('.te-safe-input').forEach(el => {
                        el.addEventListener('keydown', e => e.stopPropagation());
                        el.addEventListener('mouseup', () => Store.saveState());
                    });
                }
            };
        },

        updateProp(clipId, prop, value) {
            const clip = this.findClip(clipId);
            if (clip) {
                clip[prop] = parseFloat(value);
                
                // Surgical DOM updates for Buttery Smooth drag (bypasses full Inspector rebuild)
                if (prop === 'volume') {
                    const label = document.getElementById('am_vol_val');
                    if (label) label.innerText = parseFloat(value).toFixed(1) + '%';
                } else if (prop === 'fadeIn') {
                    const label = document.getElementById('am_fin_val');
                    if (label) label.innerText = parseFloat(value).toFixed(2) + 's';
                } else if (prop === 'fadeOut') {
                    const label = document.getElementById('am_fout_val');
                    if (label) label.innerText = parseFloat(value).toFixed(2) + 's';
                }

                TimelineModule.renderTrack(this.findTrackId(clipId));
            }
        },

        resetProp(clipId, prop, defaultVal) {
            const clip = this.findClip(clipId);
            if (clip) {
                clip[prop] = defaultVal;
                NativeInspector.render(); // Safe to rebuild full DOM on static button click
                TimelineModule.renderTrack(this.findTrackId(clipId));
                Store.saveState();
            }
        },

        // --- THE L-CUT ENGINE ---
        async extractAudio(clipId) {
            const trackId = this.findTrackId(clipId);
            const clip = this.findClip(clipId);
            if (!clip) return;
            
            const asset = Store.assets.find(a => a.id === clip.assetId);
            if (!asset) return;

            // 1. Ensure "Extracted Audio" track exists
            let extTrack = Store.trackConfig.find(t => t.label === 'Extracted Audio');
            if (!extTrack) {
                extTrack = { id: 'ext_audio_' + Date.now().toString().slice(-4), type: 'audio', label: 'Extracted Audio', icon: 'fa-music', createdAt: Date.now() };
                Store.trackConfig.push(extTrack);
                Store.tracks[extTrack.id] = [];
                Store.sortTracks();
            }

            // 2. Clone the Asset into the Database as an Audio type
            const newAssetId = 'asset_' + Date.now() + Math.random().toString(36).substr(2, 5);
            let clonedAsset;
            if (asset.file instanceof Blob) {
                await DB.put('assets', { id: newAssetId, projectId: Store.projectId, type: 'audio', name: asset.name + ' (Extracted)', file: asset.file, duration: asset.duration, color: '#10b981' });
            } else {
                await DB.put('assets', { id: newAssetId, projectId: Store.projectId, type: 'audio', name: asset.name + ' (Extracted)', url: asset.url, duration: asset.duration, color: '#10b981' });
            }
            
            clonedAsset = { ...asset, id: newAssetId, type: 'audio', name: asset.name + ' (Extracted)', color: '#10b981' };
            Store.assets.push(clonedAsset);

            // 3. Create the detached Audio Clip exactly where the video is
            const newClip = { 
                id: 'clip_' + Date.now(), 
                assetId: newAssetId, 
                start: clip.start, 
                duration: clip.duration, 
                offset: clip.offset,
                volume: clip.volume || 100,
                fadeIn: clip.fadeIn || 0,
                fadeOut: clip.fadeOut || 0,
                muted: false 
            };
            
            Store.tracks[extTrack.id].push(newClip);

            // 4. Mute original video to complete the L-Cut handoff
            clip.muted = true;
            
            Store.saveState();
            Store.refreshUI(); // Refreshes media library and timeline
            Notify.show("Audio Extracted to New Track", "fa-scissors");
        },

        // --- FFMPEG MIDDLEWARE ---
        registerExportMiddleware() {
            if (typeof Store !== 'undefined' && Store.middleware) {
                Store.middleware.push((clip) => {
                    if (!this.isActive) return '';
                    let filters = [];
                    
                    const vol = clip.volume !== undefined ? clip.volume : 100;
                    const fIn = clip.fadeIn || 0;
                    const fOut = clip.fadeOut || 0;

                    // Only apply if changes exist or if it's explicitly muted
                    if (clip.muted || vol !== 100 || fIn > 0 || fOut > 0) {
                        if (clip.muted || vol === 0) {
                            filters.push(`volume=0`);
                        } else {
                            if (vol !== 100) filters.push(`volume=${(vol / 100).toFixed(2)}`);
                            if (fIn > 0) filters.push(`afade=t=in:st=${clip.offset}:d=${fIn}`);
                            if (fOut > 0) filters.push(`afade=t=out:st=${(clip.offset + clip.duration) - fOut}:d=${fOut}`);
                        }
                    }
                    return filters.join(',');
                });
            }
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
            console.log(`[${MODULE_ID}] Uninstalling Audio Mixer...`);
            this.isActive = false;
            
            if (this.originalGetVideoSource) Player.getVideoSource = this.originalGetVideoSource;
            if (this.originalGetAudioSource) Player.getAudioSource = this.originalGetAudioSource;
            if (this.originalRenderFrame) Player.renderFrame = this.originalRenderFrame;
            if (this.originalRenderTrack) TimelineModule.renderTrack = this.originalRenderTrack;
            if (this.originalInspectorRender) NativeInspector.render = this.originalInspectorRender;
            
            document.getElementById(`${MODULE_ID}_styles`)?.remove();
            document.querySelectorAll('.audio-fade-vis').forEach(el => el.remove());
            document.querySelectorAll('.fade-handle').forEach(el => el.remove());
            
            if (Store.middleware) {
                Store.middleware = Store.middleware.filter(m => !m.toString().includes('afade'));
            }
            
            delete window.AUDIO_MIXER;
            if(typeof UI !== 'undefined') UI.refreshTimeline();
        }
    };

    window.AUDIO_MIXER = AudioMixingEngine;
    AudioMixingEngine.init();

})();
