/**
 * @name Color Grade Pro
 * @version 5.0.0
 * @developer Forge™
 * @description Advanced RGB color grading. Features Exposure, Contrast, Saturation, Temperature, Tint, and Hue Rotation.
 */
if (window.RUBICON) {
    window.RUBICON.registerNode('color_corr', {
        name: 'Color Grade Pro',
        type: 'image',
        inputs: ['image'],
        outputs: ['image'],
        defaultProps: { 
            exposure: 0, 
            contrast: 100, 
            saturation: 100, 
            temperature: 0, 
            tint: 0, 
            hue: 0 
        },
        getUI: (props) => `
            <div class="mt-2 space-y-3">
                <div>
                    <div class="flex justify-between text-[10px] text-gray-400 mb-1"><span>Exposure</span> <span id="val_exposure">${props.exposure}</span></div>
                    <input type="range" data-prop="exposure" min="-100" max="100" value="${props.exposure}" class="w-full h-1 bg-gray-700 rounded appearance-none accent-yellow-500">
                </div>
                <div>
                    <div class="flex justify-between text-[10px] text-gray-400 mb-1"><span>Contrast</span> <span id="val_contrast">${props.contrast}</span></div>
                    <input type="range" data-prop="contrast" min="0" max="200" value="${props.contrast}" class="w-full h-1 bg-gray-700 rounded appearance-none accent-yellow-500">
                </div>
                <div>
                    <div class="flex justify-between text-[10px] text-gray-400 mb-1"><span>Saturation</span> <span id="val_saturation">${props.saturation}</span></div>
                    <input type="range" data-prop="saturation" min="0" max="200" value="${props.saturation}" class="w-full h-1 bg-gray-700 rounded appearance-none accent-yellow-500">
                </div>
                
                <div class="pt-2 border-t border-[#333]">
                    <div class="flex justify-between text-[10px] text-gray-400 mb-1"><span>Temperature (B/Y)</span> <span id="val_temperature">${props.temperature}</span></div>
                    <input type="range" data-prop="temperature" min="-100" max="100" value="${props.temperature}" class="w-full h-1 bg-gray-700 rounded appearance-none accent-blue-400">
                </div>
                <div>
                    <div class="flex justify-between text-[10px] text-gray-400 mb-1"><span>Tint (G/M)</span> <span id="val_tint">${props.tint}</span></div>
                    <input type="range" data-prop="tint" min="-100" max="100" value="${props.tint}" class="w-full h-1 bg-gray-700 rounded appearance-none accent-pink-500">
                </div>
                
                <div class="pt-2 border-t border-[#333]">
                    <div class="flex justify-between text-[10px] text-gray-400 mb-1"><span>Hue Shift</span> <span id="val_hue">${props.hue}°</span></div>
                    <input type="range" data-prop="hue" min="-180" max="180" value="${props.hue}" class="w-full h-1 bg-gradient-to-r from-red-500 via-green-500 to-blue-500 rounded appearance-none cursor-pointer">
                </div>
            </div>
        `,
        process: (context) => {
            const { inputs, props, width, height } = context;
            const image = inputs[0]; 
            if (!image) return null;
            
            // 1. Buffer the raw input
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = width; tempCanvas.height = height;
            const tCtx = tempCanvas.getContext('2d');
            tCtx.putImageData(image, 0, 0);
            
            // 2. Setup the output processor
            const c2 = document.createElement('canvas');
            c2.width = width; c2.height = height;
            const ctx2 = c2.getContext('2d');
            
            // 3. Batch Hardware-Accelerated Filters
            const brightness = parseFloat(props.exposure) + 100; // Maps -100/100 to 0/200%
            const contrast = parseFloat(props.contrast);
            const saturate = parseFloat(props.saturation);
            const hue = parseFloat(props.hue);
            
            ctx2.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%) hue-rotate(${hue}deg)`;
            ctx2.drawImage(tempCanvas, 0, 0);
            
            // Reset filter so it doesn't affect our subsequent overlays
            ctx2.filter = 'none';

            // 4. Optical Temperature & Tint (Soft-Light Blending)
            const temp = parseFloat(props.temperature) || 0;
            const tint = parseFloat(props.tint) || 0;

            if (temp !== 0 || tint !== 0) {
                ctx2.globalCompositeOperation = 'soft-light';
                
                // Temperature: Negative = Cool (Blue), Positive = Warm (Orange)
                if (temp !== 0) {
                    const tAlpha = Math.abs(temp) / 100 * 0.4; // Max 40% opacity impact
                    ctx2.fillStyle = temp > 0 ? `rgba(255, 140, 0, ${tAlpha})` : `rgba(0, 130, 255, ${tAlpha})`;
                    ctx2.fillRect(0, 0, width, height);
                }

                // Tint: Negative = Green, Positive = Magenta
                if (tint !== 0) {
                    const tintAlpha = Math.abs(tint) / 100 * 0.3; // Max 30% opacity impact
                    ctx2.fillStyle = tint > 0 ? `rgba(255, 0, 255, ${tintAlpha})` : `rgba(0, 255, 0, ${tintAlpha})`;
                    ctx2.fillRect(0, 0, width, height);
                }
            }
            
            return ctx2.getImageData(0, 0, width, height);
        }
    });
}
