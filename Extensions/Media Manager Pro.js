/**
 * @name Media Manager Pro
 * @version 1.6.0
 * @developer Forge™
 * @description Refines core UX with Media Deletion, Video/Audio Previews, Inline Renaming, Smart Collision, Validated Google Fonts, cosmetic audio waveforms, and Title Persistence Self-Healing.
 */
(function() {
    const MODULE_ID = 'media_manager_pro';
    const CURRENT_VERSION = '1.6.0';

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
        modal: null,

        // Native Host Hooks
        originalRenderAssetCard: null,
        originalInspectorRender: null,
        originalDrawToCanvas: null,
        originalRenderFrame: null,
        originalAddClip: null,
        originalLoadProject: null,
        originalCreateProject: null,
        globalClickHandler: null,

        // Waveform specific 
        waveCache: new Map(),
        originalRenderTrack: null,
        originalRefreshTimeline: null,
        originalSetZoom: null,

        async init() {
            console.log(`[${MODULE_ID}] Booting Manager v${CURRENT_VERSION}...`);

            await this.checkForUpdates();
            this.injectGoogleFontsLink(this.curatedGoogleFonts);
            await this.loadPersistentFonts();

            this.injectStyles();
            this.injectDeleteModal();
            
            this.hijackCoreLifecycles();       
            this.hijackTimelineForWaveforms(); 
            this.hijackZoomAndRefresh();       
            this.bindGlobalEvents();
            this.preloadWaveforms();            

            // SELF-HEALING PROTOCOL: Guarantee that Titles are never permanently lost
            await this.ensureTitlesExist();

            if (typeof Store !== 'undefined') Store.refreshUI();
            if (NativeInspector.currentClipId) NativeInspector.render();
        },

        async ensureTitlesExist() {
            if (!Store || !Store.assets) return;
            const hasTitles = Store.assets.some(a => a && a.type === 'title');
            
            if (!hasTitles) {
                console.log(`[${MODULE_ID}] Titles missing! Restoring default title assets...`);
                const defaults = [{name:'Big Title', color:'#8b5cf6'}, {name:'Subtitle', color:'#ec4899'}];
                let added = false;
                for (const t of defaults) {
                    const a = await Store.addAsset(t.name, 'title'); 
                    await Store.updateAssetMeta(a.id, { color: t.color });
                    a.color = t.color;
                    added = true;
                }
                if (added && typeof Store.refreshUI === 'function') {
                    Store.refreshUI();
                }
            }
        },

        async checkForUpdates() {
            try {
                const repoUrl = 'https://api.github.com/repos/Cleo876/wasm-video-editor/contents/Extensions';
                const response = await fetch(repoUrl);
                if (!response.ok) return;
                const files = await response.json();
                
                const fileInfo = files.find(f => f.name === 'media_manager_pro.js');
                if (!fileInfo) return;

                const rawRes = await fetch(fileInfo.download_url);
                const scriptStr = await rawRes.text();
                
                const versionMatch = scriptStr.match(/@version\s+([\d\.]+)/);
                if (versionMatch) {
                    const fetchedVersion = versionMatch[1].trim();
                    
                    if (this.compareVersions(fetchedVersion, CURRENT_VERSION) > 0) {
                        if (typeof DB !== 'undefined') {
                            const modules = await DB.getAll('modules');
                            const myModule = modules.find(m => m.name === 'Media Manager Pro' || m.name === MODULE_ID);
                            
                            if (myModule) {
                                myModule.content = scriptStr;
                                myModule.version = fetchedVersion;
                                await DB.put('modules', myModule);
                                if(typeof Notify !== 'undefined') {
                                    Notify.show(`Media Manager Pro updated to v${fetchedVersion}. Reload page to apply.`, 'fa-cloud-arrow-up');
                                }
                            }
                        }
                    }
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

        injectDeleteModal() {
            const modal = document.createElement('div');
            modal.id = 'mediaManagerDeleteModal';
            modal.className = 'fixed inset-0 bg-black/80 z-[100000] flex items-center justify-center hidden';
            modal.innerHTML = `
                <div class="bg-[#1e1e1e] border border-[#333] p-6 rounded-xl w-[400px] shadow-2xl">
                    <div class="flex items-center gap-3 mb-4 text-yellow-400">
                        <i class="fa-solid fa-triangle-exclamation text-3xl"></i>
                        <h2 class="text-lg font-bold text-white">Media Currently In Use</h2>
                    </div>
                    <p class="text-sm text-gray-400 mb-6">
                        This media is active on your timeline (<span id="mmDeleteCount" class="text-white font-bold px-1 bg-[#333] rounded">0</span> clips). 
                        Deleting it is <span class="text-red-400 font-bold">NOT recommended</span> and will forcefully remove these clips from your project.
                    </p>
                    <div class="flex justify-end gap-3">
                        <button id="mmCancelDelete" class="px-4 py-2 text-gray-400 hover:text-white text-sm transition">Cancel</button>
                        <button id="mmConfirmDelete" class="bg-red-600 hover:bg-red-500 text-white text-sm font-bold px-5 py-2 rounded transition shadow-lg shadow-red-900/20">Force Delete</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            this.modal = modal;
        },

        hijackCoreLifecycles() {
            // Original renderAssetCard
            this.originalRenderAssetCard = UI.renderAssetCard.bind(UI);
            UI.renderAssetCard = (gridId, asset) => {
                this.originalRenderAssetCard(gridId, asset);
                if (!this.isActive) return;
                const grid = document.getElementById(gridId);
                const card = grid.lastElementChild;
                if (!card) return;

                // 🛡️ PROTECTION SHIELD: Only inject the delete button if it's NOT a core Title node
                if (asset.type !== 'title') {
                    const delBtn = document.createElement('div');
                    delBtn.className = 'media-delete-btn';
                    delBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
                    delBtn.title = "Delete Media";
                    delBtn.onclick = (e) => { e.stopPropagation(); this.requestDelete(asset.id); };
                    card.appendChild(delBtn);
                }

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

            // Inject Self-Healing hook into Store load/create logic
            if (typeof Store !== 'undefined' && Store.loadProject && Store.createProject) {
                this.originalLoadProject = Store.loadProject.bind(Store);
                Store.loadProject = async (pid) => {
                    await this.originalLoadProject(pid);
                    if (this.isActive) {
                        await this.ensureTitlesExist();
                    }
                };

                this.originalCreateProject = Store.createProject.bind(Store);
                Store.createProject = async (name) => {
                    await this.originalCreateProject(name);
                    if (this.isActive) {
                        await this.ensureTitlesExist();
                    }
                };
            }

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

                // Font manager
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

            // Smart collision resolver
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
                            if (other && other.id !== clip.id) {
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
        // Waveform generation & drawing (cosmetic only)
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

                const peaksPerSecond = 100;               
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

            ctx.fillStyle = 'rgba(140, 255, 240, 0.9)'; 
            const peakStep = totalPeaksNeeded / w;

            for (let x = 0; x < w; x++) {
                let peakIdx = startPeak + Math.floor(x * peakStep);
                if (peakIdx >= peaks.length) break;
                let peak = peaks[peakIdx] || 0;
                let amplitude = Math.min(1.0, peak * 1.2); 
                let barH = amplitude * h;
                ctx.fillRect(x, (h - barH) / 2, 1, barH);
            }
        },

        hijackTimelineForWaveforms() {
            this.originalRenderTrack = TimelineModule.renderTrack.bind(TimelineModule);
            TimelineModule.renderTrack = (trackId) => {
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
                    canvas.height = clipEl.clientHeight; 

                    if (!this.waveCache.has(asset.id)) {
                        this.generateWaveform(asset.id);
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
        // Restored Core Media Methods
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

        injectGoogleFontsLink(fontsArray) {
            if (fontsArray.length === 0) return;
            const url = `https://fonts.googleapis.com/css2?${fontsArray.map(f => `family=${f.replace(/ /g, '+')}`).join('&')}&display=swap`;
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = url;
            document.head.appendChild(link);
        },

        async loadPersistentFonts() {
            try {
                const systemData = await DB.getAll('system');
                const localFonts = systemData.filter(item => item.id.startsWith('font_'));
                for (const record of localFonts) {
                    try {
                        const font = new FontFace(record.name, `url(${record.data})`);
                        await font.load();
                        document.fonts.add(font);
                        this.fonts.push({ name: record.name, data: record.data });
                    } catch(e) {}
                }

                const googleFontsRecord = await DB.get('system', 'google_fonts_registry');
                if (googleFontsRecord && googleFontsRecord.list) {
                    this.usedGoogleFonts = new Set(googleFontsRecord.list);
                    const toInject = Array.from(this.usedGoogleFonts).filter(f => !this.curatedGoogleFonts.includes(f));
                    if (toInject.length > 0) this.injectGoogleFontsLink(toInject);
                }
            } catch (e) {}
        },

        renderFontList(query = '') {
            const listEl = document.getElementById('mmFontList');
            if (!listEl) return;
            
            let allFonts = [
                ...this.fonts.map(f => ({ name: f.name, type: 'Custom Upload' })),
                ...Array.from(this.usedGoogleFonts).map(f => ({ name: f, type: 'Google Font' })),
                ...this.curatedGoogleFonts.map(f => ({ name: f, type: 'Google Font' }))
            ];
            
            const unique = [];
            const seen = new Set();
            for(let f of allFonts) {
                if(!seen.has(f.name)) { seen.add(f.name); unique.push(f); }
            }

            const q = query.toLowerCase().trim();
            const filtered = q ? unique.filter(f => f.name.toLowerCase().includes(q)) : unique;
            
            if (filtered.length === 0) {
                listEl.innerHTML = `
                    <div class="p-4 text-center text-gray-500 text-xs">
                        <i class="fa-solid fa-magnifying-glass mb-2 text-lg opacity-50 block"></i>
                        Could not find "${query}".<br><br>
                        <button onclick="window.MEDIA_MANAGER_PRO.fetchDynamicGoogleFont('${query.replace(/'/g, "\\'")}')" class="bg-teal-600/20 text-teal-400 border border-teal-600/50 px-3 py-1.5 rounded hover:bg-teal-600 hover:text-white transition w-full font-bold shadow-lg">
                            <i class="fa-solid fa-cloud-arrow-down mr-1"></i> Fetch from Google
                        </button>
                    </div>
                `;
            } else {
                listEl.innerHTML = filtered.map(f => `
                    <div class="p-2 mb-1 border border-transparent hover:border-[#333] hover:bg-[#222] rounded cursor-pointer group transition-colors"
                         onclick="window.MEDIA_MANAGER_PRO.applyFontToClip('${f.name.replace(/'/g, "\\'")}')">
                        <div style="font-family: '${f.name}', sans-serif; font-size: 15px;" class="text-white group-hover:text-teal-400 tracking-wide">
                            ${f.name}
                        </div>
                        <div class="text-[9px] text-gray-500 font-sans uppercase mt-0.5 tracking-widest font-bold">
                            ${f.name} • ${f.type}
                        </div>
                    </div>
                `).join('');
            }
        },

        async fetchDynamicGoogleFont(fontName) {
            const listEl = document.getElementById('mmFontList');
            if (listEl) {
                listEl.innerHTML = `
                    <div class="p-6 text-center text-teal-400 text-xs font-bold">
                        <i class="fa-solid fa-circle-notch fa-spin mb-3 text-3xl block"></i>
                        Verifying Font on Google...
                    </div>
                `;
            }
            
            try {
                const url = `https://fonts.googleapis.com/css2?family=${fontName.replace(/ /g, '+')}&display=swap`;
                const response = await fetch(url);
                
                if (!response.ok) {
                    if (listEl) {
                        listEl.innerHTML = `
                            <div class="p-4 text-center text-red-400 text-xs">
                                <i class="fa-solid fa-triangle-exclamation mb-2 text-3xl block opacity-80"></i>
                                <b>"${fontName}"</b> was not found on Google Fonts.<br><br>
                                <span class="text-gray-500 font-normal">Check your spelling or upload a custom .ttf file instead.</span>
                            </div>
                        `;
                    }
                    return; 
                }
                
                this.injectGoogleFontsLink([fontName]);
                await document.fonts.load(`16px "${fontName}"`);
                
                this.usedGoogleFonts.add(fontName);
                await DB.put('system', { id: 'google_fonts_registry', list: Array.from(this.usedGoogleFonts) });
                
                if (typeof Notify !== 'undefined') Notify.show(`${fontName} Loaded!`, 'fa-check');
                document.getElementById('mmFontDropdown').classList.add('hidden'); 
                this.applyFontToClip(fontName);
                
            } catch(e) {
                if (listEl) {
                    listEl.innerHTML = `
                        <div class="p-4 text-center text-red-400 text-xs">
                            <i class="fa-solid fa-circle-xmark mb-2 text-3xl block opacity-80"></i>
                            Failed to load "${fontName}".
                        </div>
                    `;
                }
            }
        },

        applyFontToClip(fontName) {
            const clip = this.findClip(NativeInspector.currentClipId);
            if (clip) {
                clip.fontFamily = fontName;
                Store.saveState();
                Player.safeRenderFrame();
                
                const display = document.getElementById('mmFontName');
                if (display) {
                    display.innerText = fontName;
                    display.style.fontFamily = `"${fontName}", sans-serif`;
                }
                document.getElementById('mmFontDropdown').classList.add('hidden');
            }
        },

        uploadFont() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.ttf,.otf,.woff,.woff2';
            
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                
                const fontName = file.name.split('.')[0].replace(/[^a-zA-Z0-9]/g, '');
                const reader = new FileReader();
                reader.onload = async (event) => {
                    const base64Data = event.target.result;
                    try {
                        const font = new FontFace(fontName, `url(${base64Data})`);
                        await font.load();
                        document.fonts.add(font);
                        
                        await DB.put('system', { id: 'font_' + fontName, name: fontName, data: base64Data });
                        this.fonts.push({ name: fontName, data: base64Data });
                        
                        if (NativeInspector.currentClipId) {
                            const clip = this.findClip(NativeInspector.currentClipId);
                            if (clip) {
                                clip.fontFamily = fontName;
                                Store.saveState();
                            }
                        }
                        
                        if (typeof Notify !== 'undefined') Notify.show("Custom Font Installed", "fa-font");
                        NativeInspector.render();
                        Player.safeRenderFrame();
                        
                    } catch (err) {
                        alert("Invalid font file. Could not install.");
                    }
                };
                reader.readAsDataURL(file);
            };
            input.click();
        },

        requestDelete(assetId) {
            const inUseClips = [];
            for (let tid in Store.tracks) {
                const trackData = Store.tracks[tid] || [];
                trackData.forEach(c => {
                    if (c && c.assetId === assetId) inUseClips.push({ clip: c, trackId: tid });
                });
            }
            
            if (inUseClips.length > 0) {
                inUseClips.forEach(item => {
                    const lane = document.getElementById(`track-${item.trackId}`);
                    if (!lane) return;
                    const index = Store.tracks[item.trackId].indexOf(item.clip);
                    const el = lane.children[index];
                    if (el) el.classList.add('highlight-warning');
                });
                
                document.getElementById('mmDeleteCount').innerText = inUseClips.length;
                if(this.modal) this.modal.classList.remove('hidden');
                
                document.getElementById('mmCancelDelete').onclick = () => {
                    if(this.modal) this.modal.classList.add('hidden');
                    this.cancelDeleteHighlights(inUseClips);
                };
                
                document.getElementById('mmConfirmDelete').onclick = () => {
                    if(this.modal) this.modal.classList.add('hidden');
                    this.executeDelete(assetId, inUseClips);
                };
            } else {
                this.executeDelete(assetId, []);
            }
        },

        cancelDeleteHighlights(inUseClips) {
            inUseClips.forEach(item => {
                const lane = document.getElementById(`track-${item.trackId}`);
                if (!lane) return;
                const index = Store.tracks[item.trackId].indexOf(item.clip);
                const el = lane.children[index];
                if (el) el.classList.remove('highlight-warning');
            });
        },

        executeDelete(assetId, inUseClips) {
            inUseClips.forEach(item => {
                Store.tracks[item.trackId] = Store.tracks[item.trackId].filter(c => c && c.id !== item.clip.id);
            });
            
            Store.assets = Store.assets.filter(a => a && a.id !== assetId);
            if (typeof DB !== 'undefined') DB.delete('assets', assetId);
            
            Store.saveState();
            if (typeof UI !== 'undefined') UI.refreshTimeline();
            Store.refreshUI();
            
            if(NativeInspector.currentClipId && inUseClips.find(i => i.clip.id === NativeInspector.currentClipId)) {
                Store.selectedClipId = null;
                NativeInspector.render();
            }
            
            if (typeof Notify !== 'undefined') Notify.show("Media Deleted Successfully", "fa-trash-can");
        },

        toggleMediaPreview(assetId, btnEl, cardEl) {
            if (this.currentPreview && this.currentPreview.assetId === assetId) {
                this.stopMediaPreview();
                return;
            }
            
            this.stopMediaPreview();
            
            const asset = Store.assets.find(a => a && a.id === assetId);
            if (!asset || (!asset.url && !asset.file)) return;
            
            btnEl.classList.add('playing-heartbeat');
            btnEl.innerHTML = '<i class="fa-solid fa-stop"></i>';
            
            let mediaEl;
            const thumbContainer = cardEl.querySelector(`#thumb_container_${assetId}`);
            
            // Generate valid blob URL if offline
            const mediaSrc = asset.url || URL.createObjectURL(asset.file);

            if (asset.type === 'video') {
                mediaEl = document.createElement('video');
                mediaEl.src = mediaSrc;
                mediaEl.muted = false; 
                mediaEl.className = 'preview-video-layer absolute inset-0 w-full h-full object-cover z-10 rounded-t';
                thumbContainer.appendChild(mediaEl);
                mediaEl.play().catch(e => console.warn("Preview blocked:", e));
            } else {
                mediaEl = new Audio(mediaSrc);
                mediaEl.play().catch(e => console.warn("Preview blocked:", e));
            }
            
            const limit = Math.min((asset.duration || 15) * 1000, 15000);
            const timer = setTimeout(() => {
                if (this.currentPreview && this.currentPreview.assetId === assetId) {
                    this.stopMediaPreview();
                }
            }, limit);
            
            mediaEl.onended = () => {
                if (this.currentPreview && this.currentPreview.assetId === assetId) {
                    this.stopMediaPreview();
                }
            };
            
            this.currentPreview = { assetId, mediaEl, btn: btnEl, timer, container: thumbContainer };
        },

        stopMediaPreview() {
            if (this.currentPreview) {
                this.currentPreview.mediaEl.pause();
                if (this.currentPreview.mediaEl.tagName === 'VIDEO') this.currentPreview.mediaEl.remove();
                
                this.currentPreview.btn.classList.remove('playing-heartbeat');
                this.currentPreview.btn.innerHTML = '<i class="fa-solid fa-play"></i>';
                clearTimeout(this.currentPreview.timer);
                this.currentPreview = null;
            }
        },

        findTrackId(clipId) {
            for (let tid in Store.tracks) {
                const trackData = Store.tracks[tid] || [];
                if (trackData.find(c => c && c.id === clipId)) return tid;
            }
            return null;
        },

        findClip(clipId) {
            for (let tid in Store.tracks) {
                const trackData = Store.tracks[tid] || [];
                const c = trackData.find(x => x && x.id === clipId);
                if (c) return c;
            }
            return null;
        },

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
            if (this.originalLoadProject) Store.loadProject = this.originalLoadProject;
            if (this.originalCreateProject) Store.createProject = this.originalCreateProject;
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
