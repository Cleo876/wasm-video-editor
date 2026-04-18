/**
 * @name Cinematic Light Leak
 * @version 1.0.0
 * @developer Forge™
 * @description Simulates an organic film flash/light leak. A staple in high-end documentaries to gracefully hide cuts with a burst of warm light.
 */
window.TRANSITION_REGISTRY['light_leak'] = {
    name: 'Cinematic Light Leak',
    description: 'Simulates an organic film flash/light leak. Perfect for nostalgic or emotional documentary cuts.',
    defaultDuration: 1.2,
    
    // Engine automatically runs this backwards for the 'Out' (end) of a clip!
    autoReverse: true,

    getUI: (params) => `
        <div class="mt-3">
            <label class="block text-[10px] text-gray-500 font-bold mb-1 uppercase">Leak Base Tint</label>
            <input type="color" id="leak_tint" value="${params.color || '#ff5500'}" class="w-full h-8 bg-transparent cursor-pointer rounded border border-[#333]">
            <div class="text-[9px] text-gray-600 mt-1 italic">Warm colors (Orange/Red) mimic classic 35mm film burns best.</div>
        </div>
    `,

    getParams: () => ({ color: document.getElementById('leak_tint').value }),

    onRender: (ctx, canvas, progress, params) => {
        // The edge of the clip is where the cut happens.
        // For 'in' transitions, progress goes 0.0 -> 1.0. 
        // We want maximum blinding light at the cut (0.0), fading away to nothing at (1.0).
        const intensity = 1.0 - progress;

        if (intensity <= 0) return;

        const width = canvas.width;
        const height = canvas.height;
        const cx = width / 2;
        const cy = height / 2;
        
        // Let the light bloom far beyond the edges of the screen
        const maxRadius = Math.max(width, height) * 1.5;

        ctx.save();
        
        // 'screen' blending adds light values together natively, creating a realistic, glowing over-exposure
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = intensity;

        // Create an organic, slightly shifting light bloom center
        const grad = ctx.createRadialGradient(
            cx + (width * 0.1 * intensity), cy - (height * 0.1 * intensity), 0,
            cx, cy, maxRadius * intensity
        );

        // Convert the user's hex choice to RGB for alpha blending
        const tint = params.color || '#ff5500';
        let r = 255, g = 85, b = 0;
        if (tint.length === 7) {
            r = parseInt(tint.substring(1, 3), 16);
            g = parseInt(tint.substring(3, 5), 16);
            b = parseInt(tint.substring(5, 7), 16);
        }

        // The exact center of the leak is blinding hot white
        grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        // The mid-bloom uses the chosen warm tint
        grad.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, 0.9)`);
        grad.addColorStop(0.7, `rgba(${r}, ${g}, ${b}, 0.3)`);
        // The outer edges fade smoothly into the underlying footage
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)'); 

        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);

        ctx.restore();
    },

    getFFmpeg: (edge, duration, params) => {
        // Fallback for the raw FFmpeg export: Fades to/from a blinding flash of the selected tint
        const hexColor = (params.color || '#ff5500').replace('#', '0x');
        return "fade=t=" + edge + ":st=0:d=" + duration + ":c=" + hexColor;
    }
};
