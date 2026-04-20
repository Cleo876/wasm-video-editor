/**
 * @name Merge
 * @version 4.3.0
 * @developer Forge™
 * @description Mathematically blends Foreground over Background. Includes Smart-Adaptation for missing foregrounds.
 */
if (window.RUBICON) {
    window.RUBICON.registerNode('merge', {
        name: 'Merge',
        type: 'image',
        inputs: ['image', 'image', 'mask'], // Background (0), Foreground (1), Mask (2)
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
            const { inputs, props, width, height } = context;
            const bgData = inputs[0];
            const fgData = inputs[1];
            const maskData = inputs[2];
            
            // SMART ADAPTATION: If user plugs into BG but leaves FG empty, treat BG as FG so the mask still works!
            let targetBg = bgData;
            let targetFg = fgData;
            
            if (bgData && !fgData && maskData) {
                targetFg = bgData;
                targetBg = null; // We promote the BG to FG so it gets masked
            }
            
            if (!targetBg && !targetFg) return null;
            if (!targetBg && !maskData) return targetFg;
            if (!targetFg) return targetBg;
            
            const c = document.createElement('canvas');
            c.width = width; c.height = height;
            const ctx = c.getContext('2d');
            
            if (targetBg) {
                ctx.putImageData(targetBg, 0, 0);
            }
            
            if (targetFg) {
                const fgCanvas = document.createElement('canvas');
                fgCanvas.width = width; fgCanvas.height = height;
                const fgCtx = fgCanvas.getContext('2d');
                fgCtx.putImageData(targetFg, 0, 0);
                
                if (maskData) {
                    const mCanvas = document.createElement('canvas');
                    mCanvas.width = width; mCanvas.height = height;
                    mCanvas.getContext('2d').putImageData(maskData, 0, 0);
                    
                    fgCtx.globalCompositeOperation = 'destination-in';
                    fgCtx.drawImage(mCanvas, 0, 0);
                }
                
                ctx.globalCompositeOperation = props.mode || 'source-over';
                ctx.drawImage(fgCanvas, 0, 0);
            }
            
            return ctx.getImageData(0, 0, width, height);
        }
    });
}
