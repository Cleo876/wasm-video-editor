/**
 * @name Ellipse Mask Pro
 * @version 5.0.0
 * @developer Forge™
 * @description Advanced procedural shape mask generator. Features independent X/Y positioning, Width/Height scaling, rotation, feathering, and mask inversion.
 */
if (window.RUBICON) {
    window.RUBICON.registerNode('mask_ellipse', {
        name: 'Ellipse Mask Pro',
        type: 'mask',
        inputs: [], 
        outputs: ['mask'], // Blue Port
        defaultProps: { 
            centerX: 50, 
            centerY: 50, 
            maskWidth: 50, 
            maskHeight: 50, 
            rotation: 0, 
            softness: 20, 
            invert: 'false' 
        },
        getUI: (props) => `
            <div class="mt-2 space-y-3">
                <div class="flex gap-2">
                    <div class="flex-1">
                        <div class="flex justify-between text-[10px] text-gray-400 mb-1"><span>Pos X</span> <span id="val_centerX">${props.centerX}%</span></div>
                        <input type="range" data-prop="centerX" min="-50" max="150" step="0.5" value="${props.centerX}" class="w-full h-1 bg-gray-700 rounded appearance-none accent-blue-400">
                    </div>
                    <div class="flex-1">
                        <div class="flex justify-between text-[10px] text-gray-400 mb-1"><span>Pos Y</span> <span id="val_centerY">${props.centerY}%</span></div>
                        <input type="range" data-prop="centerY" min="-50" max="150" step="0.5" value="${props.centerY}" class="w-full h-1 bg-gray-700 rounded appearance-none accent-blue-400">
                    </div>
                </div>
                
                <div class="flex gap-2 pt-2 border-t border-[#333]">
                    <div class="flex-1">
                        <div class="flex justify-between text-[10px] text-gray-400 mb-1"><span>Width</span> <span id="val_maskWidth">${props.maskWidth}%</span></div>
                        <input type="range" data-prop="maskWidth" min="0" max="300" value="${props.maskWidth}" class="w-full h-1 bg-gray-700 rounded appearance-none accent-blue-500">
                    </div>
                    <div class="flex-1">
                        <div class="flex justify-between text-[10px] text-gray-400 mb-1"><span>Height</span> <span id="val_maskHeight">${props.maskHeight}%</span></div>
                        <input type="range" data-prop="maskHeight" min="0" max="300" value="${props.maskHeight}" class="w-full h-1 bg-gray-700 rounded appearance-none accent-blue-500">
                    </div>
                </div>

                <div class="pt-2 border-t border-[#333]">
                    <div class="flex justify-between text-[10px] text-gray-400 mb-1"><span>Rotation</span> <span id="val_rotation">${props.rotation}°</span></div>
                    <input type="range" data-prop="rotation" min="-180" max="180" value="${props.rotation}" class="w-full h-1 bg-gray-700 rounded appearance-none accent-blue-400">
                </div>

                <div>
                    <div class="flex justify-between text-[10px] text-gray-400 mb-1"><span>Softness (Feather)</span> <span id="val_softness">${props.softness}%</span></div>
                    <input type="range" data-prop="softness" min="0" max="100" value="${props.softness}" class="w-full h-1 bg-gray-700 rounded appearance-none accent-blue-500">
                </div>

                <div class="pt-2 border-t border-[#333] flex items-center justify-between">
                    <span class="text-[10px] uppercase text-gray-400 font-bold">Invert Mask</span>
                    <select data-prop="invert" class="bg-[#111] border border-[#333] text-gray-300 text-xs p-1 rounded outline-none focus:border-blue-500">
                        <option value="false" ${props.invert === 'false' || props.invert === false ? 'selected' : ''}>Off (Reveal Inside)</option>
                        <option value="true" ${props.invert === 'true' || props.invert === true ? 'selected' : ''}>On (Punch Hole)</option>
                    </select>
                </div>
            </div>
        `,
        process: (context) => {
            const { props, width, height } = context;
            const c = document.createElement('canvas');
            c.width = width; c.height = height;
            const ctx = c.getContext('2d');
            
            // 1. Parse Properties
            const cx = (parseFloat(props.centerX) / 100) * width;
            const cy = (parseFloat(props.centerY) / 100) * height;
            
            // Width and Height are radii (divided by 2 conceptually)
            const w = (parseFloat(props.maskWidth) / 100) * width;
            const h = (parseFloat(props.maskHeight) / 100) * height;
            
            const rot = parseFloat(props.rotation) * (Math.PI / 180);
            const soft = parseFloat(props.softness) / 100;
            const isInverted = props.invert === 'true' || props.invert === true;
            
            // 2. Handle Inversion Pre-Fill
            if (isInverted) {
                ctx.fillStyle = 'rgba(255, 255, 255, 1)';
                ctx.fillRect(0, 0, width, height);
                // Draw the mask out of the white background
                ctx.globalCompositeOperation = 'destination-out';
            }
            
            // 3. Canvas Transform Array
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(rot);
            
            // Prevent mathematical division errors if width or height hits 0
            const safeW = Math.max(1, w / 2); 
            const safeH = Math.max(1, h / 2); 
            
            // Scale the canvas dynamically to morph the circular gradient into a true ellipse
            ctx.scale(safeW / 100, safeH / 100);
            
            // 4. Optical Feathering
            const innerRadius = Math.max(0, 100 * (1 - soft));
            const grad = ctx.createRadialGradient(0, 0, innerRadius, 0, 0, 100);
            grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
            grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            
            // 5. Draw the scalable box encompassing the normalized 100px radius
            ctx.fillStyle = grad;
            ctx.fillRect(-100, -100, 200, 200);
            
            ctx.restore();
            
            return ctx.getImageData(0, 0, width, height);
        }
    });
}
