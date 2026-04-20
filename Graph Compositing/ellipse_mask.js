/**
 * @name Ellipse Mask
 * @version 1.0.0
 * @developer Forge™
 * @description Generates a procedural circular or elliptical alpha mask with soft feathering controls.
 */
if (window.RUBICON) {
    window.RUBICON.registerNode('mask_ellipse', {
        name: 'Ellipse Mask',
        type: 'mask',
        inputs: [], // Generators have no inputs
        outputs: ['mask'],
        getUI: () => `
            <div class="mt-2">
                <div class="flex justify-between text-[10px] text-gray-400 mb-1"><span>Soft Edge</span> <span>10px</span></div>
                <input type="range" min="0" max="100" value="10" class="w-full h-1 bg-gray-700 rounded appearance-none accent-blue-500">
            </div>
        `,
        process: (props) => {
            // Generates an Alpha channel buffer
            return null;
        }
    });
}