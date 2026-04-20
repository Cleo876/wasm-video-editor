/**
 * @name Advanced PiP & Transform Engine
 * @version 1.0.1
 * @developer Forge™
 * @description Direct on-canvas drag controls, magnetic smart guides, rounded corners, cinematic drop shadows, and professional blend modes.
 */
(function() {
    const MODULE_ID = 'pip_transform_engine';

    if (typeof Store === 'undefined' || typeof Player === 'undefined' || typeof NativeInspector === 'undefined') {
        console.error(`❌ [${MODULE_ID}] Core environment not found. Ensure editor is fully loaded.`);
        return;
    }

    const PipEngine = {
        isActive: true,
        isDragging: false,
        draggedClipId: null,
        dragOffset: { x: 0, y: 0 },
        snapDistance: 2.5, // % distance to trigger a magnetic snap
        
        originalDrawToCanvas: null,
        originalInspectorRender: null,

        init() {
            console.log(`[${MODULE_ID}] Booting Advanced PiP Engine...`);
            
            this.injectStyles();
            this.injectSmartGuides();
            this.hijackRenderer();
            this.hijackInspector();
            this.attachViewportInteractions();
            
            if (NativeInspector.currentClipId) NativeInspector.render();
            Player.safeRenderFrame();
        },

        injectStyles() {
            const style = document.createElement('style');
            style.id = `${MODULE_ID}_styles`;
            style.innerHTML = `
                .pip-smart-guide {
                    position: absolute;
                    background: #00d2be;
                    box-shadow: 0 0 8px #00d2be, 0 0 15px #00d2be;
                    opacity: 0;
                    pointer-events: none;
                    z-index: 1000;
                    transition: opacity 0.1s ease-out;
                }
                .pip-smart-guide.vertical { top: 0; bottom: 0; width: 1px; transform: translateX(-50%); }
                .pip-smart-guide.horizontal { left: 0; right: 0; height: 1px; transform: translateY(-50%); }
                .pip-smart-guide.visible { opacity: 0.8; }
            `;
            document.head.appendChild(style);
        },

        injectSmartGuides() {
            const vp = document.getElementById('viewportContainer');
            if (!vp) return;
            
            // X-Axis Guides
            this.guideXCenter = this.createGuide('vertical', '50%');
            this.guideXThirdL = this.createGuide('vertical', '33.33%');
            this.guideXThirdR = this.createGuide('vertical', '66.66%');
            
            // Y-Axis Guides
            this.guideYCenter = this.createGuide('horizontal', '50%');
            this.guideYThirdT = this.createGuide('horizontal', '33.33%');
            this.guideYThirdB = this.createGuide('horizontal', '66.66%');

            vp.appendChild(this.guideXCenter); vp.appendChild(this.guideXThirdL); vp.appendChild(this.guideXThirdR);
            vp.appendChild(this.guideYCenter); vp.appendChild(this.guideYThirdT); vp.appendChild(this.guideYThirdB);
        },

        createGuide(type, position) {
            const guide = document.createElement('div');
            guide.className = `pip-smart-guide ${type}`;
            if (type === 'vertical') guide.style.left = position;
            else guide.style.top = position;
            return guide;
        },

        hijackRenderer() {
            this.originalDrawToCanvas = Player.drawToCanvas.bind(Player);
            
            Player.drawToCanvas = (vClips, tClips) => {
                if (!this.isActive) return this.originalDrawToCanvas(vClips, tClips);
                
                const ctx = Player.compositorCanvas.getContext('2d');
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.clearRect(0, 0, Player.compositorCanvas.width, Player.compositorCanvas.height);
                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, Player.compositorCanvas.width, Player.compositorCanvas.height);
                
                // Keep track of rendered bounding boxes for Hit Testing
                this.renderedBoxes = [];

                vClips.forEach(vClip => {
                    const asset = Store.assets.find(a => a.id === vClip.assetId);
                    if (!asset) return; 
                    
                    const scale = (vClip.scale !== undefined ? vClip.scale : 100) / 100;
                    const rotation = vClip.rotation || 0;
                    const opacity = (vClip.opacity !== undefined ? vClip.opacity : 100) / 100;
                    
                    // Advanced PiP Defaults
                    const px = vClip.x !== undefined ? vClip.x : 50;
                    const py = vClip.y !== undefined ? vClip.y : 50;
                    const radius = vClip.borderRadius || 0;
                    const bWidth = vClip.borderWidth || 0;
                    const bColor = vClip.borderColor || '#ffffff';
                    
                    const b = typeof VideoEffects !== 'undefined' ? VideoEffects.values.brightness : 100;
                    const c = typeof VideoEffects !== 'undefined' ? VideoEffects.values.contrast : 100;
                    const s = typeof VideoEffects !== 'undefined' ? VideoEffects.values.saturate : 100;
                    
                    let drawW = Player.compositorCanvas.width;
                    let drawH = Player.compositorCanvas.height;
                    let sourceEl = asset.type === 'video' ? Player.videoPool[vClip.id] : Player.imagePool[vClip.id];
                    
                    if (sourceEl) {
                        let sWidth = asset.type === 'video' ? sourceEl.videoWidth : sourceEl.naturalWidth;
                        let sHeight = asset.type === 'video' ? sourceEl.videoHeight : sourceEl.naturalHeight;
                        
                        if(sWidth && sHeight) {
                            const vRatio = sWidth / sHeight;
                            const cRatio = drawW / drawH;
                            if (vRatio > cRatio) drawH = drawW / vRatio;
                            else drawW = drawH * vRatio;
                        }
                    }
                    
                    drawW *= scale;
                    drawH *= scale;

                    const absX = (px / 100) * Player.compositorCanvas.width;
                    const absY = (py / 100) * Player.compositorCanvas.height;

                    // Save bounding box for drag-and-drop Hit Testing
                    this.renderedBoxes.push({
                        id: vClip.id,
                        trackId: this.findTrackId(vClip.id),
                        left: absX - drawW/2, right: absX + drawW/2,
                        top: absY - drawH/2, bottom: absY + drawH/2
                    });

                    ctx.save();
                    
                    // Transform
                    ctx.translate(absX, absY);
                    ctx.rotate(rotation * Math.PI / 180);
                    ctx.globalAlpha = opacity;
                    ctx.filter = `brightness(${b}%) contrast(${c}%) saturate(${s}%)`;
                    
                    // Cinematic Blend Modes
                    ctx.globalCompositeOperation = vClip.blendMode || 'source-over';

                    // Drop Shadows
                    if (vClip.shadowBlur > 0) {
                        ctx.shadowColor = vClip.shadowColor || 'rgba(0,0,0,0.8)';
                        ctx.shadowBlur = vClip.shadowBlur;
                        ctx.shadowOffsetY = vClip.shadowDist || 0;
                        ctx.shadowOffsetX = 0;
                    }

                    // Rounded Corners (Border Radius clipping)
                    if (radius > 0) {
                        ctx.beginPath();
                        ctx.roundRect(-drawW/2, -drawH/2, drawW, drawH, (radius / 100) * Math.min(drawW, drawH));
                        ctx.clip();
                    }

                    // Draw Media
                    if (asset.type === 'video' && sourceEl && sourceEl.readyState >= 2) {
                        ctx.drawImage(sourceEl, -drawW/2, -drawH/2, drawW, drawH);
                    } else if (asset.type === 'image' && sourceEl) {
                        ctx.drawImage(sourceEl, -drawW/2, -drawH/2, drawW, drawH);
                    }
                    
                    // Remove shadow so border doesn't cast its own shadow over the image
                    ctx.shadowColor = 'transparent';
                    
                    // Custom Borders
                    if (bWidth > 0) {
                        ctx.lineWidth = (bWidth / 100) * Math.min(drawW, drawH);
                        ctx.strokeStyle = bColor;
                        if (radius > 0) {
                            ctx.strokeRect(-drawW/2, -drawH/2, drawW, drawH); // Clip handles the corner shape
                        } else {
                            ctx.strokeRect(-drawW/2, -drawH/2, drawW, drawH);
                        }
                    }

                    ctx.restore();
                });
                
                // CRITICAL FIX: The host's originalDrawToCanvas function starts by clearing the canvas to black. 
                // Since we just drew our PiP videos, calling it normally wipes them out, leaving a blank viewport.
                // We surgically neutralize the clear/fill functions on the canvas instance context just for this call.
                ctx.clearRect = () => {};
                ctx.fillRect = () => {};
                
                this.originalDrawToCanvas([], tClips);
                
                // Safely unmask the prototype methods to restore normal canvas functionality
                delete ctx.clearRect;
                delete ctx.fillRect;
            };
        },

        attachViewportInteractions() {
            const vp = document.getElementById('viewportContainer');
            if (!vp) return;

            vp.addEventListener('mousedown', (e) => {
                if (!this.isActive) return;
                
                const rect = vp.getBoundingClientRect();
                
                // Map mouse coordinates to Canvas coordinates (accounting for responsive letterboxing)
                const scaleX = Player.compositorCanvas.width / rect.width;
                const scaleY = Player.compositorCanvas.height / rect.height;
                const mx = (e.clientX - rect.left) * scaleX;
                const my = (e.clientY - rect.top) * scaleY;

                // Hit Test: Iterate backwards to select the top-most clip in the Z-stack
                let hitClip = null;
                for (let i = this.renderedBoxes.length - 1; i >= 0; i--) {
                    const box = this.renderedBoxes[i];
                    if (mx >= box.left && mx <= box.right && my >= box.top && my <= box.bottom) {
                        hitClip = box;
                        break;
                    }
                }

                if (hitClip) {
                    this.isDragging = true;
                    this.draggedClipId = hitClip.id;
                    
                    const clip = this.findClip(hitClip.id);
                    const cx = (clip.x !== undefined ? clip.x : 50) / 100 * Player.compositorCanvas.width;
                    const cy = (clip.y !== undefined ? clip.y : 50) / 100 * Player.compositorCanvas.height;
                    
                    this.dragOffset = { x: mx - cx, y: my - cy };
                    
                    // Select clip in timeline instantly
                    if (typeof TimelineModule !== 'undefined') {
                        TimelineModule.selectClip(hitClip.id, hitClip.trackId);
                    }
                }
            });

            window.addEventListener('mousemove', (e) => {
                if (!this.isDragging || !this.draggedClipId) return;
                
                const rect = vp.getBoundingClientRect();
                const clip = this.findClip(this.draggedClipId);
                if (!clip) return;

                const scaleX = Player.compositorCanvas.width / rect.width;
                const scaleY = Player.compositorCanvas.height / rect.height;
                const mx = (e.clientX - rect.left) * scaleX;
                const my = (e.clientY - rect.top) * scaleY;

                // Calculate raw un-snapped percentage
                let targetX = ((mx - this.dragOffset.x) / Player.compositorCanvas.width) * 100;
                let targetY = ((my - this.dragOffset.y) / Player.compositorCanvas.height) * 100;

                // MAGNETIC SMART SNAPPING
                this.hideAllGuides();
                
                // X-Axis Snaps
                if (Math.abs(targetX - 50) < this.snapDistance) { targetX = 50; this.guideXCenter.classList.add('visible'); }
                else if (Math.abs(targetX - 33.33) < this.snapDistance) { targetX = 33.33; this.guideXThirdL.classList.add('visible'); }
                else if (Math.abs(targetX - 66.66) < this.snapDistance) { targetX = 66.66; this.guideXThirdR.classList.add('visible'); }

                // Y-Axis Snaps
                if (Math.abs(targetY - 50) < this.snapDistance) { targetY = 50; this.guideYCenter.classList.add('visible'); }
                else if (Math.abs(targetY - 33.33) < this.snapDistance) { targetY = 33.33; this.guideYThirdT.classList.add('visible'); }
                else if (Math.abs(targetY - 66.66) < this.snapDistance) { targetY = 66.66; this.guideYThirdB.classList.add('visible'); }

                clip.x = targetX;
                clip.y = targetY;
                
                // Update Sidebar smoothly
                if (document.getElementById('pip_x_val')) document.getElementById('pip_x_val').innerText = targetX.toFixed(1) + '%';
                if (document.getElementById('pip_y_val')) document.getElementById('pip_y_val').innerText = targetY.toFixed(1) + '%';
                
                Player.safeRenderFrame();
            });

            window.addEventListener('mouseup', () => {
                if (this.isDragging) {
                    this.isDragging = false;
                    this.draggedClipId = null;
                    this.hideAllGuides();
                    Store.saveState();
                }
            });
        },

        hideAllGuides() {
            document.querySelectorAll('.pip-smart-guide').forEach(el => el.classList.remove('visible'));
        },

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
                if (trackType !== 'video' && trackType !== 'image' && trackType !== 'fx') return;

                const extBox = document.getElementById('nativeInspectorExtensions');
                if (extBox) {
                    // Defaults
                    const px = clip.x !== undefined ? clip.x : 50;
                    const py = clip.y !== undefined ? clip.y : 50;
                    const br = clip.borderRadius || 0;
                    const shadowB = clip.shadowBlur || 0;
                    const shadowD = clip.shadowDist || 0;
                    const shadowC = clip.shadowColor || '#000000';
                    const bW = clip.borderWidth || 0;
                    const bC = clip.borderColor || '#ffffff';
                    const blend = clip.blendMode || 'source-over';

                    const html = `
                        <div class="mb-4 relative border-t border-[#222] pt-4 mt-2">
                            <h4 class="text-[10px] uppercase text-teal-400 font-bold mb-3"><i class="fa-solid fa-crop-simple mr-1"></i> PiP & Transform</h4>
                            
                            <div class="flex gap-3 mb-3">
                                <div class="flex-1">
                                    <div class="flex justify-between text-xs text-gray-400 mb-1"><span>Pos X</span> <span id="pip_x_val">${px.toFixed(1)}%</span></div>
                                    <input type="range" min="-50" max="150" step="0.5" value="${px}" class="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-teal-500 te-safe-input" oninput="window.PIP_ENGINE.updateProp('${clip.id}', 'x', this.value)">
                                </div>
                                <div class="flex-1">
                                    <div class="flex justify-between text-xs text-gray-400 mb-1"><span>Pos Y</span> <span id="pip_y_val">${py.toFixed(1)}%</span></div>
                                    <input type="range" min="-50" max="150" step="0.5" value="${py}" class="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-teal-500 te-safe-input" oninput="window.PIP_ENGINE.updateProp('${clip.id}', 'y', this.value)">
                                </div>
                            </div>

                            <div class="mb-3 border-t border-[#333] pt-3">
                                <label class="text-[10px] uppercase text-gray-500 font-bold block mb-1">Blend Mode</label>
                                <select class="w-full bg-[#111] border border-[#333] text-white p-1.5 text-sm rounded te-safe-input outline-none focus:border-teal-500" onchange="window.PIP_ENGINE.updateStrProp('${clip.id}', 'blendMode', this.value)">
                                    <option value="source-over" ${blend === 'source-over' ? 'selected' : ''}>Normal</option>
                                    <option value="screen" ${blend === 'screen' ? 'selected' : ''}>Screen (Drop Black)</option>
                                    <option value="multiply" ${blend === 'multiply' ? 'selected' : ''}>Multiply (Drop White)</option>
                                    <option value="overlay" ${blend === 'overlay' ? 'selected' : ''}>Overlay</option>
                                    <option value="color-dodge" ${blend === 'color-dodge' ? 'selected' : ''}>Color Dodge (Cinematic Glow)</option>
                                </select>
                            </div>

                            <div class="mb-3">
                                <div class="flex justify-between text-xs text-gray-400 mb-1"><span>Corner Radius</span> <span id="pip_rad_val">${br}%</span></div>
                                <input type="range" min="0" max="50" step="1" value="${br}" class="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-teal-500 te-safe-input" oninput="window.PIP_ENGINE.updateProp('${clip.id}', 'borderRadius', this.value)">
                            </div>

                            <div class="flex gap-3 mb-3 border-t border-[#333] pt-3">
                                <div class="flex-[2]">
                                    <div class="flex justify-between text-xs text-gray-400 mb-1"><span>Drop Shadow</span> <span id="pip_shad_val">${shadowB}</span></div>
                                    <input type="range" min="0" max="100" step="1" value="${shadowB}" class="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-teal-500 te-safe-input mb-2" oninput="window.PIP_ENGINE.updateProp('${clip.id}', 'shadowBlur', this.value)">
                                    <input type="range" min="-50" max="50" step="1" value="${shadowD}" class="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-teal-500 te-safe-input" oninput="window.PIP_ENGINE.updateProp('${clip.id}', 'shadowDist', this.value)" title="Shadow Distance">
                                </div>
                                <div class="flex-1">
                                    <label class="text-[10px] uppercase text-gray-500 font-bold block mb-1">Color</label>
                                    <input type="color" value="${shadowC}" class="w-full h-8 p-0 border-0 bg-transparent cursor-pointer rounded" oninput="window.PIP_ENGINE.updateStrProp('${clip.id}', 'shadowColor', this.value)">
                                </div>
                            </div>
                            
                            <div class="flex gap-3 mb-1 border-t border-[#333] pt-3">
                                <div class="flex-[2]">
                                    <div class="flex justify-between text-xs text-gray-400 mb-1"><span>Border Width</span> <span id="pip_bord_val">${bW}%</span></div>
                                    <input type="range" min="0" max="20" step="0.5" value="${bW}" class="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-teal-500 te-safe-input" oninput="window.PIP_ENGINE.updateProp('${clip.id}', 'borderWidth', this.value)">
                                </div>
                                <div class="flex-1">
                                    <label class="text-[10px] uppercase text-gray-500 font-bold block mb-1">Color</label>
                                    <input type="color" value="${bC}" class="w-full h-8 p-0 border-0 bg-transparent cursor-pointer rounded" oninput="window.PIP_ENGINE.updateStrProp('${clip.id}', 'borderColor', this.value)">
                                </div>
                            </div>

                        </div>
                    `;
                    extBox.insertAdjacentHTML('beforeend', html);

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
                
                // Smooth UI update
                if (prop === 'x' && document.getElementById('pip_x_val')) document.getElementById('pip_x_val').innerText = parseFloat(value).toFixed(1) + '%';
                if (prop === 'y' && document.getElementById('pip_y_val')) document.getElementById('pip_y_val').innerText = parseFloat(value).toFixed(1) + '%';
                if (prop === 'borderRadius' && document.getElementById('pip_rad_val')) document.getElementById('pip_rad_val').innerText = value + '%';
                if (prop === 'shadowBlur' && document.getElementById('pip_shad_val')) document.getElementById('pip_shad_val').innerText = value;
                if (prop === 'borderWidth' && document.getElementById('pip_bord_val')) document.getElementById('pip_bord_val').innerText = value + '%';

                Player.safeRenderFrame();
            }
        },

        updateStrProp(clipId, prop, value) {
            const clip = this.findClip(clipId);
            if (clip) {
                clip[prop] = value;
                Player.safeRenderFrame();
                Store.saveState();
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
            console.log(`[${MODULE_ID}] Uninstalling PiP & Transform Engine...`);
            this.isActive = false;
            
            if (this.originalDrawToCanvas) Player.drawToCanvas = this.originalDrawToCanvas;
            if (this.originalInspectorRender) NativeInspector.render = this.originalInspectorRender;
            
            document.getElementById(`${MODULE_ID}_styles`)?.remove();
            this.hideAllGuides();
            
            delete window.PIP_ENGINE;
            if(NativeInspector.currentClipId) NativeInspector.render();
            Player.safeRenderFrame(); 
        }
    };

    window.PIP_ENGINE = PipEngine;
    PipEngine.init();

})();
