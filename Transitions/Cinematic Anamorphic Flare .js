/**
 * @name Cinematic Anamorphic Flare
 * @version 1.0.0
 * @developer Forge™
 * @description A Hollywood-style anamorphic lens flare that creates a sweeping horizontal light burst across cuts.
 */
window.TRANSITION_REGISTRY['anamorphic_flare'] = {
    name: 'Cinematic Anamorphic Flare',
    description: 'Simulates a wide-screen anamorphic lens light burst. Perfect for dramatic, sci-fi, or high-impact movie cuts.',
    defaultDuration: 1.5,
    
    // We handle the fade-in and fade-out internally using a sine wave, 
    // so we disable the engine's default auto-reverse logic to ensure perfect scaling.
    autoReverse: false, 

    getUI: (params) => `
        <div class="mt-3">
            <label class="block text-[10px] text-gray-500 font-bold mb-1 uppercase">Flare Tint</label>
            <input type="color" id="flare_tint" value="${params.color || '#0077ff'}" class="w-full h-8 bg-transparent cursor-pointer rounded border border-[#333]">
            <div class="text-[9px] text-gray-600 mt-1 italic">Deep Blues or Warm Golds provide the most authentic cinematic look.</div>
        </div>
    `,

    getParams: () => ({ color: document.getElementById('flare_tint').value }),

    onRender: (ctx, canvas, progress, params) => {
        // The True Facilitator engine gives us a linear progress from 0.0 to 1.0 over the block's lifespan.
        // We use a Sine Wave to make the intensity start at 0, peak at 1 in the exact center (0.5), and fade back to 0.
        // This ensures the transition flawlessly scales to ANY duration the user drags the block to.
        const intensity = Math.sin(progress * Math.PI);

        if (intensity <= 0.01) return;

        const width = canvas.width;
        const height = canvas.height;
        const cx = width / 2;
        const cy = height / 2;
        
        ctx.save();
        
        // 'screen' mode acts like real light, purely adding brightness to the underlying video
        ctx.globalCompositeOperation = 'screen';
        
        // Parse the user's hex color into RGB for alpha layering
        const tint = params.color || '#0077ff'; // Cinematic blue default
        let r = 0, g = 119, b = 255;
        if (tint.length === 7) {
            r = parseInt(tint.substring(1, 3), 16);
            g = parseInt(tint.substring(3, 5), 16);
            b = parseInt(tint.substring(5, 7), 16);
        }

        // 1. Render the sweeping Horizontal Anamorphic Streak
        const streakHeight = height * 0.3 * intensity;
        const streakWidth = width * (0.5 + intensity); 
        
        const gradY = ctx.createLinearGradient(0, cy - streakHeight/2, 0, cy + streakHeight/2);
        gradY.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`);
        gradY.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, ${0.7 * intensity})`);
        gradY.addColorStop(0.5, `rgba(255, 255, 255, ${intensity})`); // White hot center
        gradY.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, ${0.7 * intensity})`);
        gradY.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

        ctx.fillStyle = gradY;
        ctx.fillRect(cx - streakWidth/2, cy - streakHeight/2, streakWidth, streakHeight);

        // 2. Render the central spherical Lens Glow
        const coreRadius = Math.max(width, height) * 0.6 * intensity;
        const gradRad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRadius);
        gradRad.addColorStop(0, `rgba(255, 255, 255, ${intensity})`);
        gradRad.addColorStop(0.15, `rgba(${r}, ${g}, ${b}, ${0.8 * intensity})`);
        gradRad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

        ctx.fillStyle = gradRad;
        ctx.fillRect(cx - coreRadius, cy - coreRadius, coreRadius*2, coreRadius*2);

        // 3. Absolute Peak White-Out
        // When the transition hits its absolute center (highest intensity), briefly flash the whole screen white 
        // to perfectly mask the hard cut between the two video clips underneath.
        if (intensity > 0.85) {
            const flashAlpha = (intensity - 0.85) * (1 / 0.15); // Maps the top 15% to a 0.0 -> 1.0 opacity curve
            ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
            ctx.fillRect(0, 0, width, height);
        }

        ctx.restore();
    },

    getFFmpeg: (edge, duration, params) => {
        // Fallback for the raw FFmpeg export: A colored flash
        const hexColor = (params.color || '#0077ff').replace('#', '0x');
        return "fade=t=" + edge + ":st=0:d=" + duration + ":c=" + hexColor;
    }
};
