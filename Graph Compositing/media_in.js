/**
 * @name Media In
 * @version 4.3.0
 * @developer Forge™
 * @description Imports the selected timeline track video/image into the Rubicon Graph.
 */
if (window.RUBICON) {
    window.RUBICON.registerNode('media_in', {
        name: 'Media In',
        type: 'image',
        inputs: [],
        outputs: ['image'],
        getUI: () => `<div class="text-xs text-gray-400">Source: Timeline Clip</div>`,
        process: (context) => {
            return context.baseFrame; // Evaluated natively by engine
        }
    });
}
