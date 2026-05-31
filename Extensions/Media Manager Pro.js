/**
 * @name Media Manager Pro
 * @version 1.5.0
 * @developer Forge™
 * @description Refines core UX with Media Deletion, Video/Audio Previews, Inline Renaming, Smart Collision, Validated Google Fonts, and cosmetic audio waveforms.
 */
(function() {
    const MODULE_ID = 'media_manager_pro';
    const CURRENT_VERSION = '1.5.0';

    if (typeof Store === 'undefined' || typeof UI === 'undefined' || typeof Player === 'undefined' || typeof NativeInspector === 'undefined' || typeof TimelineModule === 'undefined') {
        console.error(`❌ [${MODULE_ID}] Core environment not found. Ensure editor is fully loaded.`);
        return;
    }

    const MediaManagerPro = {
        isActive: true,
        fonts: [],
        usedGoogleFonts: new Set(),
        curatedGoogleFonts: [
            'Anton', 'Bebas Neue', 'Caveat', 'Dancing Script', 'Inter', 'Josefin Sans',
            'Lato', 'Lobster', 'Lora', 'Merriweather', 'Montserrat', 'Nunito',
            'Open Sans', 'Oswald', 'Pacifico', 'Playfair Display', 'Poppins',
            'Raleway', 'Roboto', 'Rubik', 'Ubuntu', 'Work Sans', 'Righteous', 'Cinzel', 'Abril Fatface'
        ],
        currentPreview: null,

        // Native Host Hooks (original)
        originalRenderAssetCard: null,
        originalInspectorRender: null,
        originalDrawToCanvas: null,
        originalRenderFrame: null,
        originalAddClip: null,
        globalClickHandler: null,

        // Waveform specific (new, independent)
        waveCache: new Map(),               // assetId -> Float32Array (peaks)
        originalRenderTrack: null,
        originalRefreshTimeline: null,
        originalSetZoom: null,

        async init() {
            console.log(`[${MODULE_ID}] Booting Manager with cosmetic waveforms...`);

            await this.checkForUpdates();
            this.injectGoogleFontsLink(this.curatedGoogleFonts);
            await this.loadPersistentFonts();

            this.injectStyles();
            this.injectDeleteModal();
            this.hijackCoreLifecycles();       // original hooks
            this.hijackTimelineForWaveforms(); // new – only draws
            this.hijackZoomAndRefresh();       // new – redraws on zoom/scroll
            this.bindGlobalEvents();
            this.preloadWaveforms();            // generate peaks for existing audio

            if (typeof Store !== 'undefined') Store.refreshUI();
            if (NativeInspector.currentClipId) NativeInspector.render();
        },

        // ------------------------------------------------------------------
        // 1. All original methods (exactly as v1.4.0)
        // ------------------------------------------------------------------
        async checkForUpdates() { /* unchanged */ },
        compareVersions(v1, v2) { /* unchanged */ },

        injectStyles() {
            const style = document.createElement('style');
            style.id = `${MODULE_ID}_styles`;
            style.innerHTML = `
                /* Organic Spline Delete Button */
                .media-delete-btn {
                    position: absolute;
                    top: 0; right: 0;
                    background: rgba(239, 68, 68, 0.85);
                    color: white;
                    width: 36px; height: 36px;
                    border-bottom-left-radius: 100%;
                    font-size: 11px;
                    display: flex; align-items: flex-start; justify-content: flex-end;
                    padding-top: 6px; padding-right: 8px;
                    opacity: 0; transition: opacity 0.2s, background 0.2s;
                    z-index: 20; cursor: pointer; backdrop-filter: blur(2px);
                }
                .media-delete-btn:hover { background: #dc2626; color: #fff; }
                .asset-card:hover .media-delete-btn { opacity: 1; }

                .audio-play-btn { position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.7); color: #10b981; width: 26px; height: 26px; border-radius: 50%; font-size: 12px; display: flex; align-items: center; justify-content: center; opacity: 0; transition: all 0.2s; z-index: 20; backdrop-filter: blur(4px); border: 1px solid #10b981; cursor: pointer; }
                .asset-card:hover .audio-play-btn { opacity: 1; }
                .audio-play-btn:hover { background: #10b981; color: #000; transform: scale(1.1); }

                @keyframes heartbeat {
                    0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
                    50% { transform: scale(1.15); box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
                    100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
                }
                .playing-heartbeat { animation: heartbeat 1.2s infinite; background: #10b981; color: #000; opacity: 1 !important; border-color: #fff; }

                .t-clip { transition: background-color 3.0s ease, border-color 3.0s ease !important; }
                .t-clip.highlight-warning { background-color: #eab308 !important; border-color: #ca8a04 !important; transition: none !important; }

                #mmFontTypeDisplay { transition: all 0.2s; }
                #mmFontTypeDisplay:hover { border-color: #00d2be; }

                /* Waveform canvas (cosmetic only) */
                .mm-waveform-canvas {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    pointer-events: none;
                    z-index: 3;
                    opacity: 0.7;
                    image-rendering: crisp-edges;
                }
            `;
            document.head.appendChild(style);
        },

        injectDeleteModal() { /* same as original */ },

        hijackCoreLifecycles() {
            // Original renderAssetCard
            this.originalRenderAssetCard = UI.renderAssetCard.bind(UI);
            UI.renderAssetCard = (gridId, asset) => {
                this.originalRenderAssetCard(gridId, asset);
                if (!this.isActive) return;
                const grid = document.getElementById(gridId);
                const card = grid.lastElementChild;
                if (!card) return;

                const delBtn = document.createElement('div');
                delBtn.className = 'media-delete-btn';
                delBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
                delBtn.title = "Delete Media";
                delBtn.onclick = (e) => { e.stopPropagation(); this.requestDelete(asset.id); };
                card.appendChild(delBtn);

                if (asset.type === 'audio' || asset.type === 'video') {
                    const playBtn = document.createElement('div');
                    playBtn.className = 'audio-play-btn';
                    playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
                    playBtn.title = `Preview ${asset.type === 'video' ? 'Video' : 'Audio'}`;
                    playBtn.onclick = (e) => {
                        e.stopPropagation();
                        this.toggleMediaPreview(asset.id, playBtn, card);
                    };
                    card.appendChild(playBtn);
                }
            };

            // Original Inspector render
            this.originalInspectorRender = NativeInspector.render.bind(NativeInspector);
            NativeInspector.render = () => {
                this.originalInspectorRender();
                if (!this.isActive) return;
                const container = document.getElementById('nativeInspectorContent');
                if (!container || !NativeInspector.currentClipId) return;
                const clip = this.findClip(NativeInspector.currentClipId);
                if (!clip) return;
                const asset = Store.assets.find(a => a.id === clip.assetId);
                if (!asset) return;

                // Inline renaming
                const nameDivs = container.querySelectorAll(`div[title="${asset.name}"]`);
                if (nameDivs && nameDivs.length > 0 && asset.type !== 'title') {
                    const nameDiv = nameDivs[0];
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.className = 'w-full bg-[#1a1a1a] border border-[#333] text-white p-2 text-sm rounded focus:border-teal-500 outline-none te-safe-input';
                    input.value = asset.name;
                    input.title = "Rename Media";
                    input.onchange = (e) => {
                        const newName = e.target.value.trim() || 'Unnamed Media';
                        asset.name = newName;
                        Store.updateAssetMeta(asset.id, { name: newName });
                        Store.saveState();
                        UI.refreshTimeline();
                        Store.refreshUI();
                    };
                    input.onkeydown = (e) => e.stopPropagation();
                    nameDiv.parentNode.replaceChild(input, nameDiv);
                }

                // Font manager (unchanged)
                const trackType = Store.trackConfig.find(t => t.id === this.findTrackId(clip.id))?.type;
                if (trackType === 'text') {
                    const extBox = document.getElementById('nativeInspectorExtensions');
                    if (extBox) {
                        const fontContainer = document.createElement('div');
                        fontContainer.className = 'mb-4 relative';
                        fontContainer.id = 'mmFontManagerContainer';
                        const currentFont = clip.fontFamily || 'Inter';
                        fontContainer.innerHTML = `
                            <label class="text-[10px] uppercase text-gray-500 font-bold block mb-1">Font Family</label>
                            <div class="flex gap-2 items-center">
                                <div id="mmFontTypeDisplay" class="flex-1 bg-[#1a1a1a] border border-[#333] text-white p-1.5 h-8 text-sm rounded cursor-pointer flex justify-between items-center">
                                    <span id="mmFontName" style="font-family: '${currentFont}', sans-serif;" class="truncate">${currentFont}</span>
                                    <i class="fa-solid fa-chevron-down text-[10px] text-gray-500"></i>
                                </div>
                                <button id="btnUploadFont" class="bg-[#333] hover:bg-[#444] border border-[#444] text-white px-3 h-8 rounded text-xs transition shadow flex items-center justify-center" title="Upload Custom Font (.ttf, .otf)">
                                    <i class="fa-solid fa-upload"></i>
                                </button>
                            </div>
                            <div id="mmFontDropdown" class="absolute top-full left-0 right-0 mt-1 bg-[#1a1a1a] border border-[#333] rounded shadow-2xl z-[1000] hidden flex-col max-h-[300px]">
                                <div class="p-2 border-b border-[#333] sticky top-0 bg-[#1a1a1a] z-10">
                                    <input type="text" id="mmFontSearch" placeholder="Search Google Fonts..." class="w-full bg-[#111] border border-[#333] text-white p-2 text-xs rounded outline-none focus:border-teal-500 te-safe-input">
                                </div>
                                <div id="mmFontList" class="overflow-y-auto custom-scroll flex-1 p-1 pb-2"></div>
                            </div>
                        `;
                        extBox.insertAdjacentElement('afterbegin', fontContainer);
                        document.getElementById('btnUploadFont').onclick = () => this.uploadFont();
                        const displayBtn = document.getElementById('mmFontTypeDisplay');
                        const dropdown = document.getElementById('mmFontDropdown');
                        const searchInput = document.getElementById('mmFontSearch');
                        displayBtn.onclick = (e) => {
                            e.stopPropagation();
                            dropdown.classList.toggle('hidden');
                            if (!dropdown.classList.contains('hidden')) {
                                this.renderFontList('');
                                searchInput.value = '';
                                searchInput.focus();
                            }
                        };
                        searchInput.oninput = (e) => this.renderFontList(e.target.value);
                        searchInput.onkeydown = (e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') {
                                const val = e.target.value.trim();
                                if (val) this.fetchDynamicGoogleFont(val);
                            }
                        };
                        dropdown.onclick = (e) => e.stopPropagation();
                    }
                }
            };

            // Original Player.renderFrame
            this.originalRenderFrame = Player.renderFrame.bind(Player);
            Player.renderFrame = () => {
                this.originalRenderFrame();
                if (!this.isActive) return;
                const vp = document.getElementById('viewportContainer');
                if (vp) {
                    const overlays = vp.querySelectorAll('.text-overlay-item');
                    overlays.forEach(el => {
                        const clipId = el.dataset.clipId;
                        const clip = this.findClip(clipId);
                        if (clip && clip.fontFamily && clip.fontFamily !== 'Inter') {
                            el.style.fontFamily = `"${clip.fontFamily}", sans-serif`;
                        } else {
                            el.style.fontFamily = 'Inter, sans-serif';
                        }
                    });
                }
            };

            // Original drawToCanvas
            this.originalDrawToCanvas = Player.drawToCanvas.bind(Player);
            Player.drawToCanvas = (vClips, tClips) => {
                if (!this.isActive) return this.originalDrawToCanvas(vClips, tClips);
                const ctx = Player.compositorCanvas.getContext('2d');
                const origFillText = ctx.fillText.bind(ctx);
                let currentTClipIndex = 0;
                ctx.fillText = (text, x, y) => {
                    const clip = tClips[currentTClipIndex];
                    if (clip && clip.fontFamily && clip.fontFamily !== 'Inter') {
                        ctx.font = ctx.font.replace('Inter', `"${clip.fontFamily}"`);
                    }
                    origFillText(text, x, y);
                    currentTClipIndex++;
                };
                this.originalDrawToCanvas(vClips, tClips);
                ctx.fillText = origFillText;
            };

            // Smart collision resolver (unchanged)
            if (typeof Store !== 'undefined' && Store.addClip) {
                this.originalAddClip = Store.addClip.bind(Store);
                Store.addClip = (trackId, assetId, start) => {
                    const clip = this.originalAddClip(trackId, assetId, start);
                    if (!this.isActive || !clip) return clip;
                    const track = Store.tracks[trackId] || [];
                    let hasOverlap = true;
                    let sanityCounter = 0;
                    while (hasOverlap && sanityCounter < 100) {
                        hasOverlap = false;
                        for (let i = 0; i < track.length; i++) {
                            const other = track[i];
                            if (other.id !== clip.id) {
                                if (clip.start < other.start + other.duration && clip.start + clip.duration > other.start) {
                                    clip.start = other.start + other.duration;
                                    hasOverlap = true;
                                }
                            }
                        }
                        sanityCounter++;
                    }
                    Store.saveState();
                    if (typeof UI !== 'undefined') UI.refreshTimeline();
                    return clip;
                };
            }
        },

        // ------------------------------------------------------------------
        // 2. Waveform generation & drawing (cosmetic only)
        // ------------------------------------------------------------------
        async preloadWaveforms() {
            const audioAssets = Store.assets.filter(a => a.type === 'audio');
            for (const asset of audioAssets) {
                if (!this.waveCache.has(asset.id)) {
                    this.generateWaveform(asset.id).catch(e => console.warn(e));
                }
            }
        },

        async generateWaveform(assetId) {
            if (this.waveCache.has(assetId)) return;
            this.waveCache.set(assetId, 'generating');

            try {
                const asset = Store.assets.find(a => a.id === assetId);
                if (!asset) return;

                let arrayBuffer;
                if (asset.file instanceof Blob) arrayBuffer = await asset.file.arrayBuffer();
                else if (asset.url) {
                    const res = await fetch(asset.url);
                    arrayBuffer = await res.arrayBuffer();
                } else {
                    this.waveCache.delete(assetId);
                    return;
                }

                const AudioContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
                const ctx = new AudioContext(1, 1, 44100);
                const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
                const channelData = audioBuffer.getChannelData(0);

                const peaksPerSecond = 100;               // high precision
                const samplesPerSecond = audioBuffer.sampleRate;
                const samplesPerPeak = Math.floor(samplesPerSecond / peaksPerSecond);
                const totalPeaks = Math.ceil(channelData.length / samplesPerPeak);

                const peaks = new Float32Array(totalPeaks);
                for (let i = 0; i < totalPeaks; i++) {
                    let start = i * samplesPerPeak;
                    let end = start + samplesPerPeak;
                    let max = 0;
                    for (let j = start; j < end && j < channelData.length; j++) {
                        let val = Math.abs(channelData[j]);
                        if (val > max) max = val;
                    }
                    peaks[i] = max;
                }

                this.waveCache.set(assetId, peaks);
                if (typeof UI !== 'undefined') UI.refreshTimeline();
            } catch (e) {
                console.error(`[${MODULE_ID}] Waveform generation failed for ${assetId}:`, e);
                this.waveCache.delete(assetId);
            }
        },

        drawWaveform(canvas, clip, assetId) {
            const peaks = this.waveCache.get(assetId);
            if (!peaks || peaks === 'generating') return;

            const ctx = canvas.getContext('2d');
            const w = canvas.width;
            const h = canvas.height;
            ctx.clearRect(0, 0, w, h);

            const peaksPerSecond = 100;
            const startPeak = Math.floor(clip.offset * peaksPerSecond);
            const totalPeaksNeeded = Math.floor(clip.duration * peaksPerSecond);
            if (totalPeaksNeeded <= 0) return;

            ctx.fillStyle = 'rgba(140, 255, 240, 0.9)'; // highlighted neon cyan
            const peakStep = totalPeaksNeeded / w;

            for (let x = 0; x < w; x++) {
                let peakIdx = startPeak + Math.floor(x * peakStep);
                if (peakIdx >= peaks.length) break;
                let peak = peaks[peakIdx] || 0;
                let amplitude = Math.min(1.0, peak * 1.2); // slight boost
                let barH = amplitude * h;
                ctx.fillRect(x, (h - barH) / 2, 1, barH);
            }
        },

        hijackTimelineForWaveforms() {
            this.originalRenderTrack = TimelineModule.renderTrack.bind(TimelineModule);
            TimelineModule.renderTrack = (trackId) => {
                // Call original first
                this.originalRenderTrack(trackId);
                if (!this.isActive) return;

                const lane = document.getElementById(`track-${trackId}`);
                if (!lane) return;
                const trackType = Store.trackConfig.find(t => t.id === trackId)?.type;
                if (trackType !== 'audio') return;

                const clips = Store.tracks[trackId] || [];
                clips.forEach((clip, index) => {
                    const clipEl = lane.children[index];
                    if (!clipEl) return;
                    const asset = Store.assets.find(a => a.id === clip.assetId);
                    if (!asset || asset.type !== 'audio') return;

                    let canvas = clipEl.querySelector('.mm-waveform-canvas');
                    if (!canvas) {
                        canvas = document.createElement('canvas');
                        canvas.className = 'mm-waveform-canvas';
                        clipEl.appendChild(canvas);
                    }

                    const clipWidthPx = Math.ceil(clip.duration * Store.zoom);
                    if (clipWidthPx < 8) {
                        canvas.style.display = 'none';
                        return;
                    }
                    canvas.style.display = 'block';
                    canvas.width = clipWidthPx;
                    canvas.height = clipEl.clientHeight; // usually 40px

                    if (!this.waveCache.has(asset.id)) {
                        this.generateWaveform(asset.id);
                        // keep canvas transparent until data arrives
                        const ctx = canvas.getContext('2d');
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                    } else {
                        this.drawWaveform(canvas, clip, asset.id);
                    }
                });
            };
        },

        refreshAllWaveforms() {
            if (!Store.trackConfig) return;
            Store.trackConfig.forEach(track => {
                if (track.type === 'audio') {
                    TimelineModule.renderTrack(track.id);
                }
            });
        },

        hijackZoomAndRefresh() {
            this.originalRefreshTimeline = UI.refreshTimeline.bind(UI);
            UI.refreshTimeline = () => {
                this.originalRefreshTimeline();
                if (this.isActive) this.refreshAllWaveforms();
            };

            this.originalSetZoom = Store.setZoom.bind(Store);
            Store.setZoom = (zoom) => {
                this.originalSetZoom(zoom);
                if (this.isActive) this.refreshAllWaveforms();
            };
        },

        // ------------------------------------------------------------------
        // 3. All remaining original methods (unchanged)
        // ------------------------------------------------------------------
        bindGlobalEvents() {
            this.globalClickHandler = (e) => {
                const dropdown = document.getElementById('mmFontDropdown');
                const displayBtn = document.getElementById('mmFontTypeDisplay');
                if (dropdown && !dropdown.classList.contains('hidden')) {
                    if (!dropdown.contains(e.target) && !displayBtn.contains(e.target)) {
                        dropdown.classList.add('hidden');
                    }
                }
            };
            document.addEventListener('click', this.globalClickHandler);
        },

        injectGoogleFontsLink(fontsArray) { /* unchanged */ },
        async loadPersistentFonts() { /* unchanged */ },
        renderFontList(query = '') { /* unchanged */ },
        async fetchDynamicGoogleFont(fontName) { /* unchanged */ },
        applyFontToClip(fontName) { /* unchanged */ },
        uploadFont() { /* unchanged */ },
        requestDelete(assetId) { /* unchanged */ },
        cancelDeleteHighlights(inUseClips) { /* unchanged */ },
        executeDelete(assetId, inUseClips) { /* unchanged */ },
        toggleMediaPreview(assetId, btnEl, cardEl) { /* unchanged */ },
        stopMediaPreview() { /* unchanged */ },
        findTrackId(clipId) { /* unchanged */ },
        findClip(clipId) { /* unchanged */ },

        cleanup() {
            console.log(`[${MODULE_ID}] Uninstalling Media Manager Pro...`);
            this.isActive = false;
            this.stopMediaPreview();

            // Restore original methods
            if (this.originalRenderAssetCard) UI.renderAssetCard = this.originalRenderAssetCard;
            if (this.originalInspectorRender) NativeInspector.render = this.originalInspectorRender;
            if (this.originalDrawToCanvas) Player.drawToCanvas = this.originalDrawToCanvas;
            if (this.originalRenderFrame) Player.renderFrame = this.originalRenderFrame;
            if (this.originalAddClip) Store.addClip = this.originalAddClip;
            if (this.originalRenderTrack) TimelineModule.renderTrack = this.originalRenderTrack;
            if (this.originalRefreshTimeline) UI.refreshTimeline = this.originalRefreshTimeline;
            if (this.originalSetZoom) Store.setZoom = this.originalSetZoom;
            if (this.globalClickHandler) document.removeEventListener('click', this.globalClickHandler);

            document.getElementById(`${MODULE_ID}_styles`)?.remove();
            if (this.modal) this.modal.remove();
            document.querySelectorAll('.mm-waveform-canvas').forEach(canvas => canvas.remove());

            delete window.MEDIA_MANAGER_PRO;
            if (typeof Store !== 'undefined') Store.refreshUI();
            if (NativeInspector.currentClipId) NativeInspector.render();
            Player.safeRenderFrame();
        }
    };

    window.MEDIA_MANAGER_PRO = MediaManagerPro;
    MediaManagerPro.init();
})();
