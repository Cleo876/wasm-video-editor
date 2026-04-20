# Rubicon Graph Engine: Developer Guide 🎲

Welcome to the absolute bleeding edge of the Forge™ WASM Editor. The **Rubicon Graph Engine** is a professional, node-based compositing ecosystem. It allows users to build infinite mathematical image-processing chains per-clip, unlocking Hollywood-grade VFX directly in the browser.

## The Inspiration: "The Die is Cast"
Historically, the Rubicon was a shallow river in Italy. In 49 BC, Julius Caesar crossed it with his army, uttering the phrase *"Alea iacta est"* (**"The die is cast"**). It was a point of no return that ignited a revolution. 

In the context of video editing, moving from basic "layers" to Node-Based Compositing is your Rubicon. Once a user understands the power of nodes—routing specific data, generating masks, and chaining mathematics—there is no going back to amateur editing. That is why our engine is named **Rubicon**, and why our timeline badge is a **D20 (a 20-sided die)**. 

---

## Core Architecture &amp; Port Typing

The Rubicon engine is built on **Topological Evaluation**. The engine starts at the `Media Out` node and traces the Bezier splines backward, evaluating the pixel data of every node sequentially at 60fps.

To prevent bad code from crashing the engine, Rubicon uses **Strict Port Typing**. Yellow wires cannot plug into Blue ports. 

### The Standard Palette:
* 🟨 **`image` (Yellow):** Raw pixel/video data (ImageData arrays).
* 🟦 **`mask` (Blue):** Alpha channel data used for cutting holes or isolating effects.
* 🟩 **`value` (Green):** Floating point numbers or data arrays.
* 🟥 **`time` (Red):** Timecode or speed data.
* 🟧 **`vector` (Orange):** X/Y coordinates for motion tracking.

---

## The "Must Follows" (Engine Rules)

If you are developing a custom `.js` node for the community, you **must** adhere to these strict rules:

1. **The IIFE Rule:** Your node code must be wrapped in an `(function() { ... })();` to prevent global variable pollution.
2. **Stateless Processing:** The `process(context)` function runs 60 times a second. **Do not** create new HTML elements or heavy objects inside this function, or you will cause a memory leak. Create your offscreen `<canvas>` elements once, or garbage collect them properly.
3. **Strict Array Definitions:** You must explicitly define your `inputs: ['image', 'mask']` array. The engine uses this exact array to dynamically generate the UI ports and mathematically resolve the incoming data.
4. **Always Return ImageData:** If your node outputs an `image` or a `mask`, the final return of your `process()` function *must* be a valid `ImageData` object, or the chain will break.

---

## Tutorial: Building a "Cinematic Vignette" Node

Let's build a custom node that adds a dark, moody shadow around the edges of the video.

### Step 1: The Metadata &amp; Registration
Every node must have metadata headers and use the `window.RUBICON.registerNode` API.

```javascript
/**
 * @name Cinematic Vignette
 * @version 1.0.0
 * @developer Your Name
 * @description Adds a dramatic dark shadow around the edges of the frame.
 */
if (window.RUBICON) {
    window.RUBICON.registerNode('vignette_fx', {
        name: 'Vignette',
        type: 'image', // The primary output type
        inputs: ['image'], // Needs exactly 1 video/image input
        outputs: ['image'],
        
        // Define the default properties your UI will manipulate
        defaultProps: { intensity: 50, size: 70 },
```

### Step 2: Building the UI
Use Tailwind classes to match the sleek UI of the editor. Bind HTML inputs to `data-prop` so the engine knows which variables to update in real-time.

```javascript
        getUI: (props) =&gt; \`
            <div class="mt-2">
                <div class="flex justify-between text-[10px] text-gray-400 mb-1">
                    <span>Intensity</span> 
                    <span id="val_intensity">\${props.intensity}%</span>
                </div>
                <input type="range" data-prop="intensity" min="0" max="100" value="\${props.intensity}" class="w-full h-1 bg-gray-700 rounded appearance-none accent-yellow-500">
            </div>
            <div class="mt-2">
                <div class="flex justify-between text-[10px] text-gray-400 mb-1">
                    <span>Spread Size</span> 
                    <span id="val_size">\${props.size}%</span>
                </div>
                <input type="range" data-prop="size" min="10" max="150" value="\${props.size}" class="w-full h-1 bg-gray-700 rounded appearance-none accent-yellow-500">
            </div>
        \`,
```

### Step 3: The Process Pipeline (Canvas Math)
The engine provides a `context` object containing `inputs` (an array matching your declared inputs), the active `ctx`, and dimensions.

```javascript
        process: (context) =&gt; {
            const { inputs, props, width, height } = context;
            const sourceImage = inputs[0]; // The image data from the yellow wire
            
            // Safety check: If nothing is plugged in, return null
            if (!sourceImage) return null;
            
            // 1. Create an offscreen buffer
            const c = document.createElement('canvas');
            c.width = width; c.height = height;
            const ctx = c.getContext('2d');
            
            // 2. Draw the original video frame
            ctx.putImageData(sourceImage, 0, 0);
            
            // 3. Math: Calculate Vignette intensity
            const alpha = props.intensity / 100;
            if (alpha &lt;= 0) return sourceImage; // Optimization: do nothing if 0%
            
            const radius = (props.size / 100) * (Math.max(width, height) / 2);
            const cx = width / 2;
            const cy = height / 2;
            
            // 4. Draw the shadowy radial gradient
            const grad = ctx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, radius * 1.5);
            grad.addColorStop(0, 'rgba(0,0,0,0)');
            grad.addColorStop(1, \`rgba(0,0,0,\${alpha})\`);
            
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, width, height);
            
            // 5. Return the manipulated frame back to the engine
            return ctx.getImageData(0, 0, width, height);
        }
    });
}
```

### Step 4: Loading it into the Editor
Save your code as `vignette_node.js`. In the editor, open the Rubicon Graph, click **"Load Custom Node (.js)"** in the right-hand panel, and select your file. Right-click the canvas to spawn it!

---
*End of Documentation*</canvas>
