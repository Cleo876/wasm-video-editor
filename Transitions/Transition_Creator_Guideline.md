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

### Step 4: The Canvas Render (Preview)
This is the visual magic! It runs 60 times a second during preview playback. 
The Editor handles dynamic time scaling for you: `progress` is a decimal that always goes from `0.0` (start) to `1.0` (end) exactly over the duration of the transition block.
```javascript
    onRender: (ctx, canvas, progress, params) =&gt; {
        ctx.fillStyle = params.color || '#ffffff';
        // Draws a rectangle growing from width 0 to full width
        ctx.fillRect(0, 0, canvas.width * progress, canvas.height);
    },
```

### Step 5: FFmpeg Export
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

## 🚀 Advanced Section: Spatial Transitions &amp; Delta Transforms

### Why is this a thing?
Historically, if you wanted to build a transition that physically moved a video (like a Slide, Push, or Zoom), you had to write complex `onRender` canvas math to manually translate and scale the clip. 

**The Problem:** What if a video editor manually placed their clip in the bottom-right corner using the **PiP Transform Extension**? If your transition uses hardcoded canvas coordinates, it will violently overwrite the user's custom placement, teleporting their PiP clip to the center of the screen during the transition!

### What does it mean for developers and editors?
Enter the **Delta Transform Matrix**. Instead of fighting for control of the canvas, you simply return a mathematical *offset* (e.g., "Add 50 to X, Subtract 20 from Scale"). 

The Engine safely injects these offsets directly into the PiP Transform Engine. **This means your spatial transitions will flawlessly combine with the user's custom PiP layouts without breaking them!** Let's walk through building a completely new transition step-by-step: the **"Whirlwind" (Spin &amp; Zoom)**.

### Step 6: Add the Delta Transform Method
Instead of `onRender`, we add the `getClipTransform` method to our registry object. This method runs 60 times a second and asks you: "How much should I shift the X, Y, Scale, Rotation, and Opacity right now?"

```javascript
    // Engine automatically feeds these offsets into the PiP Transform Engine!
    getClipTransform: (progress, edge, params) =&gt; {
        let delta = { x: 0, y: 0, scale: 0, rotation: 0, opacity: 0 };
        // We will do our math here!
        return delta;
    },
```

### Step 7: Disable Auto-Reverse for Predictable Math
Spatial movement is much easier to program if `progress` *always* runs linearly from `0.0` to `1.0`, regardless of whether the transition is at the start or the end of a clip.

```javascript
    autoReverse: false, // Ensures 'progress' is always 0.0 -&gt; 1.0
    pingPong: false,    // Disables peaking in the middle
```

### Step 8: Handle the Incoming ('in') Edge
When `edge === 'in'`, the transition is at the START of the clip. For a Whirlwind effect, we want the incoming clip to start tiny (`scale: -100`), spun backwards (`rotation: -180`), and invisible (`opacity: -100`). As `progress` reaches `1.0`, the offsets should resolve to `0` so the clip returns to normal.

```javascript
        if (edge === 'in') {
            // At progress 0, (1 - 0) * -100 = -100 scale offset
            // At progress 1, (1 - 1) * -100 = 0 scale offset
            delta.scale = (1 - progress) * -100; 
            delta.rotation = (1 - progress) * -180;
            delta.opacity = (1 - progress) * -100; // Fades in smoothly
        }
```

### Step 9: Handle the Outgoing ('out') Edge
When `edge === 'out'`, the transition is at the END of the clip. We want it to spin forward and shrink away.

```javascript
        if (edge === 'out') {
            // At progress 0, (0 * -100) = 0 scale offset
            // At progress 1, (1 * -100) = -100 scale offset (shrinks away)
            delta.scale = progress * -100; 
            delta.rotation = progress * 180;
            delta.opacity = progress * -100; 
        }
```

### Step 10: Assemble the Final Whirlwind Code
Here is the complete, production-ready code for our new Whirlwind transition! You can copy-paste this directly into the engine.

```javascript
/**
 * @name Whirlwind Transition
 * @version 1.0.0
 * @developer Forge™
 * @description A dynamic spin and zoom effect. Powered by Delta Transforms.
 */
window.TRANSITION_REGISTRY['whirlwind'] = {
    name: 'Whirlwind',
    description: 'Spins and zooms the clip onto the screen.',
    defaultDuration: 1.0,
    maxDuration: 5.0,
    
    // Disable auto-reverse so 'progress' reliably flows 0.0 -&gt; 1.0
    autoReverse: false, 
    pingPong: false,
    
    getUI: (params) =&gt; `<div class="text-xs text-gray-500 italic mt-2">Spins and zooms dynamically.</div>`,
    getParams: () =&gt; ({}),
    
    // The Delta Transform Matrix
    getClipTransform: (progress, edge, params) =&gt; {
        let delta = { x: 0, y: 0, scale: 0, rotation: 0, opacity: 0 };
        
        if (edge === 'in') {
            delta.scale = (1 - progress) * -100; 
            delta.rotation = (1 - progress) * -180;
            delta.opacity = (1 - progress) * -100; 
        } 
        else if (edge === 'out') {
            delta.scale = progress * -100; 
            delta.rotation = progress * 180;
            delta.opacity = progress * -100;       
        }

        return delta;
    },
    
    getFFmpeg: (edge, duration, params, align) =&gt; {
        // Fallback for FFmpeg export
        return `fade=t=${edge}:st=0:d=${duration}:alpha=1`;
    }
};
```
