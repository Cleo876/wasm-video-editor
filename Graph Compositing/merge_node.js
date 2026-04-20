/**
 * @name Merge
 * @version 3.0.0
 * @developer Forge™
 * @description Mathematically blends Foreground over Background using HTML5 Canvas Compositing. Supports Alpha masking.
 */
if (window.RUBICON) {
    window.RUBICON.registerNode('merge', {
        name: 'Merge',
        type: 'image',
        inputs: ['image', 'image', 'mask'], // BG, FG, Mask
        outputs: ['image'],
        defaultProps: { mode: 'source-over' },
        getUI: (props) => `
            <div class="mt-2">
                <label class="block text-[10px] text-gray-400 uppercase mb-1">Blend Mode</label>
                <select data-prop="mode" class="w-full bg-[#111] border border-[#333] text-gray-300 text-xs p-1 rounded outline-none focus:border-yellow-500">
                    <option value="source-over" ${props.mode === 'source-over' ? 'selected' : ''}>Normal</option>
                    <option value="screen" ${props.mode === 'screen' ? 'selected' : ''}>Screen</option>
                    <option value="multiply" ${props.mode === 'multiply' ? 'selected' : ''}>Multiply</option>
                    <option value="overlay" ${props.mode === 'overlay' ? 'selected' : ''}>Overlay</option>
                </select>
            </div>
        `,
        process: (context) => {
            const { image, bg, mask, props, width, height } = context;
            if (!bg && !image) return null;
            if (!bg) return image;
            if (!image) return bg;
            
            const c = document.createElement('canvas');
            c.width = width; c.height = height;
            const ctx = c.getContext('2d');
            
            // Base layer
            ctx.putImageData(bg, 0, 0);
            
            // Fore layer
            const fgCanvas = document.createElement('canvas');
            fgCanvas.width = width; fgCanvas.height = height;
            const fgCtx = fgCanvas.getContext('2d');
            fgCtx.putImageData(image, 0, 0);
            
            // Carve the mask
            if (mask) {
                const mCanvas = document.createElement('canvas');
                mCanvas.width = width; mCanvas.height = height;
                mCanvas.getContext('2d').putImageData(mask, 0, 0);
                
                fgCtx.globalCompositeOperation = 'destination-in';
                fgCtx.drawImage(mCanvas, 0, 0);
            }
            
            // Execute final blend
            ctx.globalCompositeOperation = props.mode || 'source-over';
            ctx.drawImage(fgCanvas, 0, 0);
            
            return ctx.getImageData(0, 0, width, height);
        }
    });
}
