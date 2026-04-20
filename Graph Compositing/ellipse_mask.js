/**
 * @name Ellipse Mask
 * @version 3.0.0
 * @developer Forge™
 * @description Procedurally generates a soft radial gradient Alpha channel.
 */
if (window.RUBICON) {
    window.RUBICON.registerNode('mask_ellipse', {
        name: 'Ellipse Mask',
        type: 'mask',
        inputs: [], 
        outputs: ['mask'],
        defaultProps: { radius: 30, soft: 10 },
        getUI: (props) => `
            <div class="mt-2">
                <div class="flex justify-between text-[10px] text-gray-400 mb-1"><span>Radius</span> <span id="val_radius">${props.radius}%</span></div>
                <input type="range" data-prop="radius" min="1" max="100" value="${props.radius}" class="w-full h-1 bg-gray-700 rounded appearance-none accent-blue-500">
            </div>
            <div class="mt-2">
                <div class="flex justify-between text-[10px] text-gray-400 mb-1"><span>Soft Edge</span> <span id="val_soft">${props.soft}%</span></div>
                <input type="range" data-prop="soft" min="0" max="100" value="${props.soft}" class="w-full h-1 bg-gray-700 rounded appearance-none accent-blue-500">
            </div>
        `,
        process: (context) => {
            const { props, width, height } = context;
            const c = document.createElement('canvas');
            c.width = width; c.height = height;
            const ctx = c.getContext('2d');
            
            const cx = width/2; const cy = height/2;
            const r = (props.radius / 100) * Math.min(width, height);
            const s = (props.soft / 100) * r;
            
            const grad = ctx.createRadialGradient(cx, cy, Math.max(0, r - s), cx, cy, r);
            grad.addColorStop(0, 'rgba(255,255,255,1)');
            grad.addColorStop(1, 'rgba(255,255,255,0)');
            
            ctx.fillStyle = grad;
            ctx.fillRect(0,0, width, height);
            
            return ctx.getImageData(0,0, width, height);
        }
    });
}
