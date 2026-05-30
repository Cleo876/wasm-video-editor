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
Add your logic to the global registry object. You can now define a **maxDuration** to protect your animation from being stretched too far by the user!
```javascript
window.TRANSITION_REGISTRY['color_wipe'] = {
    name: 'Color Wipe',
    description: 'Swipes a solid color block across the screen.',
    defaultDuration: 1.0,
    maxDuration: 3.0, // Limits how long the user can stretch this transition
    
    // Auto-Reverse Magic:
    // By default, the engine runs your animation backward if placed at the END of a clip.
    // Set to false if your transition should always play the exact same way.
    autoReverse: true, 

    // Ping-Pong Magic (NEW):
    // If true, a center-aligned transition will peak in the middle and reverse (0.0 -&gt; 1.0 -&gt; 0.0).
    // Best for "Fade to Color" or "Flash" effects where the screen must be covered at the exact cut.
    pingPong: false,
```

### Step 3: Build the UI (Optional)
Let users customize it in the inspector!
```javascript
    getUI: (params) =&gt; `
        <div class="mt-3">
            <label style="font-size: 10px; color: gray; font-weight: bold;">WIPE COLOR</label>
            <input type="color" id="wipe_color" value="${params.color || '#ffffff'}" style="width: 100%; height: 32px; background: transparent; cursor: pointer; border-radius: 4px; border: 1px solid #333;">
        </div>
    `,
    // Extract the values when the user makes changes
    getParams: () =&gt; ({ color: document.getElementById('wipe_color').value }),
```

### Step 4: Spatial Movement (Delta Transforms)
If you want to physically move, scale, or rotate the video clips (like a Push, Slide, or Zoom), use `getClipTransform`. 

**The Magic:** You do NOT override the user's manual placement. Instead, you return **Delta Offsets** (how much to add/subtract). The engine automatically resurrects dead clips for you and feeds these offsets into the PiP Engine.
```javascript
    // Engine automatically feeds these offsets into the PiP Transform Engine!
    // No need to manually manipulate the canvas for X, Y, Scale, Rotation, or Opacity.
    getClipTransform: (progress, edge, params) =&gt; {
        let delta = { x: 0, y: 0, scale: 0, rotation: 0 };
        if (edge === 'in') delta.x = (1 - progress) * 100; // Slide in from right
        if (edge === 'out') delta.x = progress * -100;     // Slide out to left
        return delta;
    },
```

### Step 5: The Canvas Render (Preview)
This is the visual magic! It runs 60 times a second during preview playback. 
The Editor handles dynamic time scaling for you: `progress` is a decimal that always goes from `0.0` (start) to `1.0` (end) exactly over the duration of the transition block.
```javascript
    onRender: (ctx, canvas, progress, params) =&gt; {
        ctx.fillStyle = params.color || '#ffffff';
        // Draws a rectangle growing from width 0 to full width
        ctx.fillRect(0, 0, canvas.width * progress, canvas.height);
    },
```

### Step 6: FFmpeg Export
Translate your effect into FFmpeg string format for the final MP4 render.
```javascript
    getFFmpeg: (edge, duration, params, alignment) =&gt; {
        // Example: Using standard fade as a fallback
        const hexColor = (params.color || '#ffffff').replace('#', '0x');
        return "fade=t=" + edge + ":st=0:d=" + duration + ":c=" + hexColor; 
    }
}; // Close the registry object
```

---

## 🏆 Full Code Example: The Push Transition

Here is a complete, production-ready example of a physical transition using Delta Transforms. Copy and paste this to start building!

```javascript
/**
 * @name Push Transition
 * @version 1.0.0
 * @developer Forge™
 * @description Pushes the current clip off the screen while pushing the new clip into view.
 */
window.TRANSITION_REGISTRY['push'] = {
    name: 'Push Transition',
    description: 'Pushes the current clip off the screen while pushing the new clip into view.',
    defaultDuration: 1.0,
    maxDuration: 5.0,
    
    // K.I.S.S. Method: Disable auto-reverse and pingPong so 'progress' reliably flows 0.0 -&gt; 1.0
    autoReverse: false, 
    pingPong: false,
    
    getUI: (params) =&gt; `
        <div class="mt-3 border-t border-[#333] pt-3">
            <label class="block text-[10px] text-gray-500 font-bold mb-1 uppercase">Push Direction</label>
            <select id="trans_push_dir" class="w-full bg-[#111] border border-[#333] text-white p-2 text-sm rounded outline-none focus:border-teal-500">
                <option value="left" ${params.direction="==" 'left'="" ?="" 'selected'="" :="" ''}="">Push Left</option>
                <option value="right" ${params.direction="==" 'right'="" ?="" 'selected'="" :="" ''}="">Push Right</option>
                <option value="up" ${params.direction="==" 'up'="" ?="" 'selected'="" :="" ''}="">Push Up</option>
                <option value="down" ${params.direction="==" 'down'="" ?="" 'selected'="" :="" ''}="">Push Down</option>
            </select>
        </div>
    `,
    
    getParams: () =&gt; ({ direction: document.getElementById('trans_push_dir').value }),
    
    // The Delta Transform Matrix
    getClipTransform: (progress, edge, params) =&gt; {
        const dir = params.direction || 'left';
        let delta = { x: 0, y: 0, scale: 0, rotation: 0, opacity: 0 };
        
        if (dir === 'left') {
            if (edge === 'in') delta.x = (1 - progress) * 100; 
            if (edge === 'out') delta.x = progress * -100;     
        } 
        else if (dir === 'right') {
            if (edge === 'in') delta.x = (1 - progress) * -100; 
            if (edge === 'out') delta.x = progress * 100;       
        }
        else if (dir === 'up') {
            if (edge === 'in') delta.y = (1 - progress) * 100;  
            if (edge === 'out') delta.y = progress * -100;      
        }
        else if (dir === 'down') {
            if (edge === 'in') delta.y = (1 - progress) * -100; 
            if (edge === 'out') delta.y = progress * 100;       
        }

        return delta;
    },
    
    getFFmpeg: (edge, duration, params, align) =&gt; {
        return `fade=t=${edge}:st=0:d=${duration}:alpha=1`;
    }
};
```
