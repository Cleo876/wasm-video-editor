/**
 * @name Media Out
 * @version 3.0.0
 * @developer Forge™
 * @description Exports the final composited frame back to the editor's main timeline.
 */
if (window.RUBICON) {
    window.RUBICON.registerNode('media_out', {
        name: 'Media Out',
        type: 'image',
        inputs: ['image'],
        outputs: [],
        getUI: () => `<div class="text-xs text-gray-400">Target: Compositor Renderer</div>`,
        process: (context) => {
            // Passes the final calculated ImageData back to the Render Loop
            return context.image;
        }
    });
}
