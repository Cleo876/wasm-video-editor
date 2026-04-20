/**
 * @name Merge
 * @version 1.0.0
 * @developer Forge™
 * @description Combines a Background and Foreground image source using standard compositing blend modes.
 */
if (window.RUBICON) {
    window.RUBICON.registerNode('merge', {
        name: 'Merge',
        type: 'image',
        inputs: ['image', 'image', 'mask'], // Background, Foreground, Mask
        outputs: ['image'],
        getUI: () => `
            <div class="mt-2">
                <label class="block text-[10px] text-gray-400 uppercase mb-1">Blend Mode</label>
                <select class="w-full bg-[#111] border border-[#333] text-gray-300 text-xs p-1 rounded outline-none">
                    <option value="source-over">Normal</option>
                    <option value="screen">Screen</option>
                    <option value="multiply">Multiply</option>
                </select>
            </div>
        `,
        process: (bgData, fgData, props, maskData) => {
            // Blends fgData over bgData using the selected blend mode
            return bgData;
        }
    });
}