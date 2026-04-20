/**
 * @name Color Corrector
 * @version 3.0.0
 * @developer Forge™
 * @description Live RGB color grading using Canvas manipulation.
 */
if (window.RUBICON) {
    window.RUBICON.registerNode('color_corr', {
        name: 'Color Corrector',
        type: 'image',
        inputs: ['image'],
        outputs: ['image'],
        defaultProps: { lift: 0, contrast: 100 },
        getUI: (props) => `
            <div class="mt-2">
                <div class="flex justify-between text-[10px] text-gray-400 mb-1"><span>Lift (Brightness)</span> <span id="val_lift">${props.lift}</span></div>
                <input type="range" data-prop="lift" min="-100" max="100" value="${props.lift}" class="w-full h-1 bg-gray-700 rounded appearance-none accent-yellow-500">
            </div>
            <div class="mt-2">
                <div class="flex justify-between text-[10px] text-gray-400 mb-1"><span>Contrast</span> <span id="val_contrast">${props.contrast}</span></div>
                <input type="range" data-prop="contrast" min="0" max="200" value="${props.contrast}" class="w-full h-1 bg-gray-700 rounded appearance-none accent-yellow-500">
            </div>
        `,
        process: (context) => {
            const { image, props, width, height } = context;
            if (!image) return null;
            
            // Offscreen Buffer
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = width; tempCanvas.height = height;
            const tCtx = tempCanvas.getContext('2d');
            tCtx.putImageData(image, 0, 0);
            
            // Lift Math
            if (props.lift !== 0) {
                tCtx.fillStyle = props.lift > 0 ? `rgba(255,255,255,${props.lift/100})` : `rgba(0,0,0,${-props.lift/100})`;
                tCtx.globalCompositeOperation = props.lift > 0 ? 'screen' : 'multiply';
                tCtx.fillRect(0, 0, width, height);
            }
            
            // Contrast Math
            if (props.contrast !== 100) {
                const c2 = document.createElement('canvas');
                c2.width = width; c2.height = height;
                const ctx2 = c2.getContext('2d');
                ctx2.filter = `contrast(${props.contrast}%)`;
                ctx2.drawImage(tempCanvas, 0, 0);
                return ctx2.getImageData(0, 0, width, height);
            }
            
            return tCtx.getImageData(0, 0, width, height);
        }
    });
}
