/**
 * @name Push Transition
 * @version 1.0.0
 * @developer Forge™
 * @description Pushes the current clip off the screen while pushing the new clip into view. Powered by Delta Transforms.
 */
window.TRANSITION_REGISTRY['push'] = {
    name: 'Push Transition',
    description: 'Pushes the current clip off the screen while pushing the new clip into view.',
    defaultDuration: 1.0,
    maxDuration: 5.0,
    
    // We disable Auto-Reverse so the engine allows 'progress' to run 0.0 -> 1.0 for BOTH the incoming and outgoing clips. 
    // This allows us to mathematically control exactly where they slide to in getClipTransform!
    autoReverse: false, 
    
    getUI: (params) => `
        <div class="mt-3 border-t border-[#333] pt-3">
            <label class="block text-[10px] text-gray-500 font-bold mb-1 uppercase">Push Direction</label>
            <select id="trans_push_dir" class="w-full bg-[#111] border border-[#333] text-white p-2 text-sm rounded outline-none focus:border-teal-500">
                <option value="left" ${params.direction === 'left' ? 'selected' : ''}>Push Left</option>
                <option value="right" ${params.direction === 'right' ? 'selected' : ''}>Push Right</option>
                <option value="up" ${params.direction === 'up' ? 'selected' : ''}>Push Up</option>
                <option value="down" ${params.direction === 'down' ? 'selected' : ''}>Push Down</option>
            </select>
        </div>
    `,
    getParams: () => ({ direction: document.getElementById('trans_push_dir').value }),
    
    // 🔥 DELTA TRANSFORM MATRIX
    // The Transition Engine evaluates this 60 times a second and feeds it directly into the PiP Engine!
    getClipTransform: (progress, edge, params) => {
        const dir = params.direction || 'left';
        let delta = { x: 0, y: 0, scale: 0, rotation: 0, opacity: 0 };
        
        if (dir === 'left') {
            if (edge === 'in') delta.x = (1 - progress) * 100; // Incoming: Slides from Right (100) to Center (0)
            if (edge === 'out') delta.x = progress * -100;     // Outgoing: Slides from Center (0) to Left (-100)
        } 
        else if (dir === 'right') {
            if (edge === 'in') delta.x = (1 - progress) * -100; // Incoming: Slides from Left (-100) to Center (0)
            if (edge === 'out') delta.x = progress * 100;       // Outgoing: Slides from Center (0) to Right (100)
        }
        else if (dir === 'up') {
            if (edge === 'in') delta.y = (1 - progress) * 100;  // Incoming: Bottom to Center
            if (edge === 'out') delta.y = progress * -100;      // Outgoing: Center to Top
        }
        else if (dir === 'down') {
            if (edge === 'in') delta.y = (1 - progress) * -100; // Incoming: Top to Center
            if (edge === 'out') delta.y = progress * 100;       // Outgoing: Center to Bottom
        }

        return delta;
    },
    
    getFFmpeg: (edge, duration, params, align) => {
        // Safe Fallback: A raw FFmpeg xfade string is highly complex to route. 
        // Defaulting to a standard opacity fade to prevent export crashes until the Export Engine is upgraded.
        return `fade=t=${edge}:st=0:d=${duration}:alpha=1`;
    }
};
