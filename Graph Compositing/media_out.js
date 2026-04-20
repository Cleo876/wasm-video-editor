/**
 * @name Media Out
 * @version 1.0.0
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
        process: (frameData) => {
            // The final node in the chain. Outputs data back to Player.renderFrame()
            return frameData;
        }
    });
}