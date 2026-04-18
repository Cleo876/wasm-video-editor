# The Transition Creator Guide

Welcome to the Transition Ecosystem! You can easily add custom transitions to the editor by uploading a `.js` file.

Here is the exact step-by-step blueprint to create your own:

### Step 1: The File Setup
Create a new `.js` file and include these mandatory headers at the top so the automated GitHub updater can track versions:
```javascript
/**
 * @name Color Wipe
 * @version 1.0.0
 * @developer Your Name
 * @description Swipes a solid color block across the screen.
 */
```

### Step 2: Register the Engine
Add your logic to the global registry object.
```javascript
window.TRANSITION_REGISTRY['color_wipe'] = {
    name: 'Color Wipe',
    description: 'Swipes a solid color block across the screen.',
    defaultDuration: 1.0,
    
    // Auto-Reverse Magic:
    // By default, the engine runs your animation backward if placed at the END of a clip.
    // Set to false if your transition should always play the exact same way.
    autoReverse: true, 
```

### Step 3: Build the UI (Optional)
Let users customize it in the inspector!
```javascript
    getUI: (params) => `
        <div class="mt-3">
            <label style="font-size: 10px; color: gray; font-weight: bold;">WIPE COLOR</label>
            <input type="color" id="wipe_color" value="${params.color || '#ffffff'}" style="width: 100%; height: 32px; background: transparent; cursor: pointer; border-radius: 4px; border: 1px solid #333;">
        </div>
    `,
    // Extract the values when the user makes changes
    getParams: () => ({ color: document.getElementById('wipe_color').value }),
```

### Step 4: The Canvas Render (Preview)
This is the visual magic! It runs 60 times a second during preview playback. 
`progress` is a decimal that goes from `0.0` (start) to `1.0` (end).
```javascript
    onRender: (ctx, canvas, progress, params) => {
        ctx.fillStyle = params.color || '#ffffff';
        // Draws a rectangle growing from width 0 to full width
        ctx.fillRect(0, 0, canvas.width * progress, canvas.height);
    },
```

### Step 5: FFmpeg Export
Translate your effect into FFmpeg string format for the final MP4 render.
```javascript
    getFFmpeg: (edge, duration, params) => {
        // Example: Using standard fade as a fallback
        const hexColor = (params.color || '#ffffff').replace('#', '0x');
        return "fade=t=" + edge + ":st=0:d=" + duration + ":c=" + hexColor; 
    }
}; // Close the registry object
```
