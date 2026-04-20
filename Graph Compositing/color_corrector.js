/**
 * @name Color Corrector
 * @version 1.0.0
 * @developer Forge™
 * @description Basic RGB color grading, brightness, and contrast adjustments for a single node path.
 */
if (window.RUBICON) {
    window.RUBICON.registerNode('color_corr', {
        name: 'Color Corrector',
        type: 'image',
        inputs: ['image', 'mask'],
        outputs: ['image'],
        getUI: () => `
            <div class="mt-2">
                <div class="flex justify-between text-[10px] text-gray-400 mb-1"><span>Lift</span> <span>0.0</span></div>
                <input type="range" min="-100" max="100" value="0" class="w-full h-1 bg-gray-700 rounded appearance-none accent-yellow-500">
            </div>
        `,
        process: (frameData, props, maskData) => {
            // Processing logic to be implemented in Phase 2 Canvas integration
            return frameData;
        }
    });
}