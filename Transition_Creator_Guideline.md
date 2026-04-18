# Transition Creator Guideline

Welcome to the **Advanced Transitions Engine** ecosystem!

You can create powerful custom transitions and install them via the **Import Custom Transition (.js)** button. Once installed, they persist in your local database automatically.

## The Registry API

To register a transition, inject a new object into `window.TRANSITION_REGISTRY`:

```javascript
// Example 1: Custom Fade
window.TRANSITION_REGISTRY['my_custom_fade'] = {
    name: 'My Custom Fade',
    defaultDuration: 1.0,

    // 1. UI Generator (Optional)
    // Return an HTML string for custom Inspector settings
    getUI: (params) => `<input type="color" id="my_color">`,

    // 2. State Extractor (Optional)
    // Extract values from your UI when the user makes changes
    getParams: () => ({ color: document.getElementById('my_color').value }),

    // 3. Canvas Render Hook (For Realtime Preview)
    // progress: 0.0 (start) to 1.0 (end)
    onRender: (ctx, canvas, progress, params) => {
        ctx.fillStyle = params.color || '#000';
        ctx.globalAlpha = progress;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    },

    // 4. FFmpeg Filter Hook (For Export)
    // edge: 'in' or 'out'
    getFFmpeg: (edge, duration, params) => {
        return "fade=t=" + edge + ":st=0:d=" + duration + ":c=" + params.color;
    }
};
```

## Example 2: Color Wipe

```javascript
window.TRANSITION_REGISTRY['color_wipe'] = {
    name: 'Color Wipe',
    defaultDuration: 1.0,
    getUI: (params) => `
        <div class="mt-3">
            <label class="block text-[10px] text-gray-500 font-bold mb-1 uppercase">Wipe Color</label>
            <input type="color" id="wipe_color" value="${params.color || '#ffffff'}" class="w-full h-8 bg-transparent cursor-pointer rounded border border-[#333]">
        </div>
    `,
    getParams: () => ({ color: document.getElementById('wipe_color').value }),
    onRender: (ctx, canvas, progress, params) => {
        ctx.fillStyle = params.color || '#ffffff';
        // Creates a cinematic wipe from left to right
        ctx.fillRect(0, 0, canvas.width * progress, canvas.height);
    },
    getFFmpeg: (edge, duration, params) => {
        // Fallback or complex overlay filters can be constructed here
        const c = (params.color || '#ffffff').replace('#', '0x');
        return "fade=t=" + edge + ":st=0:d=" + duration + ":c=" + c; 
    }
};
```

## Lifecycle Architecture
- **onRender** executes 60 times a second during preview. Keep canvas math lightweight!
- **getFFmpeg** fires only during export compilation. Ensure your syntax perfectly matches valid FFmpeg filters.