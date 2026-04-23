# Rubicon Graph Engine: Developer Guide 🎲

Welcome to the absolute bleeding edge of the Forge™ WASM Editor. The **Rubicon Graph Engine** is a professional, node‑based compositing ecosystem. It allows users to build infinite mathematical image‑processing chains per‑clip, unlocking Hollywood‑grade VFX directly in the browser.

## The Inspiration: “The Die is Cast”
Historically, the Rubicon was a shallow river in Italy. In 49 BC, Julius Caesar crossed it with his army, uttering the phrase *“Alea iacta est”* (**“The die is cast”**). It was a point of no return that ignited a revolution.

In the context of video editing, moving from basic “layers” to Node‑Based Compositing is your Rubicon. Once a user understands the power of nodes—routing specific data, generating masks, and chaining mathematics—there is no going back to amateur editing. That is why our engine is named **Rubicon**, and why our timeline badge is a **D20 (a 20‑sided die)**.

---

## 1. How the Engine Works (Architecture)

### Overlay Compositing
The Rubicon engine does **not** replace the editor’s native renderer. Instead, it lets the host editor draw all clips normally, then **overlays** the processed result of each clip that has a Rubicon graph attached.  
This ensures that non‑graph clips always display correctly, while graph‑modified clips receive their VFX as an additional paint pass.

### Topological Evaluation
Internally, the engine finds the \`media_out\` node in your graph and walks **backwards** along the Bezier wires, evaluating every node recursively.  
* Each frame, the engine passes the current video frame (\`ImageData\`) into the \`media_in\` node.
* Intermediate nodes process data and pass it forward.
* The final result from \`media_out\` is drawn onto the main compositor canvas on top of the original clip.

### Strict Port Typing & Dynamic Colours
To prevent impossible connections, every node port is assigned a **data type** (e.g. \`image\`, \`mask\`, \`value\`). Wires can only connect ports of the **same type**.  
The engine automatically colours ports and wires based on type, making your node graphs instantly readable:

| Type       | Colour  | Description |
|------------|---------|-------------|
| \`image\`    | 🟨 Yellow | Raw pixel/video data (\`ImageData\` objects) |
| \`mask\`     | 🟦 Blue   | Alpha channel data for mattes and isolations |
| \`value\`    | 🟩 Green  | Floating‑point numbers (brightness, speed, etc.) |
| \`time\`     | 🟥 Red    | Timecode or speed‑ramp data |
| \`vector\`   | 🟧 Orange | X/Y coordinate pairs for motion tracking |
| \`gradient\` | 🟦 Cyan   | Gradient data (optional, for advanced nodes) |
| \`audio\`    | 🩷 Pink   | Audio buffers (reserved for future use) |

*Any unrecognised type gets a deterministic colour derived from its name, so community nodes automatically look professional.*

### Node Definitions Are Loaded First
All node \`.js\` files from the \`Graph Compositing\` folder (on GitHub) are fetched and registered **before** the renderer is hijacked.  
This eliminates timing bugs: by the time you open the Rubicon workspace, every node type is ready.

---

## 2. The “Must Follows” (Engine Rules)

If you are developing a custom \`.js\` node, you **must** adhere to these rules:

1. **The IIFE Rule** – Wrap your code in an IIFE (\`(function() { ... })();\`) to avoid polluting the global scope.
2. **Stateless Processing** – The \`process(context)\` function runs **60 times per second**. **Do not** create new HTML elements or heavy objects inside it every frame. Use module‑level variables for reusable canvases, but keep dimensions in sync.
3. **Strict Array Definitions** – You must explicitly declare \`inputs\` and \`outputs\` as arrays of data‑type strings (e.g. \`inputs: ['image', 'mask']\`). The engine uses these to generate coloured ports and enforce type matching.
4. **Always Return Valid Data**  
   - If your node outputs \`image\` or \`mask\`, the \`process()\` return value **must** be an \`ImageData\` object, or \`null\`/\`undefined\` to pass through the original frame.  
   - If your node outputs \`value\`, \`time\`, or \`vector\`, you can return plain numbers or objects—but downstream nodes will trust the type you declared.

---

## 3. The Complete \`context\` Object

A node’s \`process\` function receives a single \`context\` argument with the following properties:

| Property | Type | Description |
|----------|------|-------------|
| \`inputs\` | Array | Ordered list of data from connected input wires (matching the \`inputs\` declaration). |
| \`props\`  | Object | Current values of the node’s properties (updated by the UI sliders). |
| \`ctx\`    | CanvasRenderingContext2D | The offscreen canvas context where you should perform drawing. |
| \`width\`  | Number | Width of the frame (pixels). |
| \`height\` | Number | Height of the frame (pixels). |
| \`time\`   | Number | Current playhead time (seconds). |
| \`clipStart\` | Number | Start time of the clip in the timeline (seconds). |
| \`clipDuration\` | Number | Duration of the clip (seconds). |

For convenience, the engine also aliases:
- \`image\` = \`inputs[0]\`
- \`bg\` = \`inputs[0]\`, \`fg\` = \`inputs[1]\` (for two‑image merges)
- \`mask\` = \`inputs[2]\` (for three‑input merges)

---

## 4. Tutorial: Building a “Cinematic Vignette” Node

Let’s build a custom node that adds a dark, moody shadow around the edges of the video.

### Step 1: Metadata & Registration
Every node must have metadata headers and use the \`window.RUBICON.registerNode\` API.

\`\`\`javascript
/**
 * @name Cinematic Vignette
 * @version 1.0.0
 * @developer Your Name
 * @description Adds a dramatic dark shadow around the edges of the frame.
 */
if (window.RUBICON) {
    window.RUBICON.registerNode('vignette_fx', {
        name: 'Vignette',
        type: 'image',           // The primary output type
        inputs: ['image'],       // Needs exactly 1 video/image input
        outputs: ['image'],

        // Default values for UI controls
        defaultProps: {
            intensity: 50,
            size: 70
        },
\`\`\`

### Step 2: Building the UI
Use **Tailwind CSS** classes (already available in the editor) to style your controls.  
Bind each \`<input>\` to a property using \`data-prop\`.  
Add a \`<span>\` with \`id="val_<property>"\` so the engine can display live values.

\`\`\`javascript
        getUI: (props) => \`
            <div class="mt-2">
                <div class="flex justify-between text-[10px] text-gray-400 mb-1">
                    <span>Intensity</span> 
                    <span id="val_intensity">\${props.intensity}%</span>
                </div>
                <input type="range" data-prop="intensity" min="0" max="100" 
                       value="\${props.intensity}" 
                       class="w-full h-1 bg-gray-700 rounded appearance-none accent-yellow-500">
            </div>
            <div class="mt-2">
                <div class="flex justify-between text-[10px] text-gray-400 mb-1">
                    <span>Spread Size</span> 
                    <span id="val_size">\${props.size}%</span>
                </div>
                <input type="range" data-prop="size" min="10" max="150" 
                       value="\${props.size}" 
                       class="w-full h-1 bg-gray-700 rounded appearance-none accent-yellow-500">
            </div>
        \`,
\`\`\`

### Step 3: The Process Pipeline (Canvas Math)
The \`process\` function receives the \`context\` object. Here we apply a radial gradient to darken the edges.

\`\`\`javascript
        process: (context) => {
            const sourceImage = context.inputs[0];
            if (!sourceImage) return null;  // safety – no input connected

            // 1. Create an offscreen canvas (or reuse a cached one)
            const c = document.createElement('canvas');
            c.width = context.width;
            c.height = context.height;
            const ctx = c.getContext('2d');

            // 2. Draw the original frame
            ctx.putImageData(sourceImage, 0, 0);

            // 3. Calculate vignette parameters
            const alpha = context.props.intensity / 100;
            const radius = (context.props.size / 100) * (Math.max(context.width, context.height) / 2);
            const cx = context.width / 2;
            const cy = context.height / 2;

            // 4. Create a radial gradient and multiply
            const grad = ctx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, radius * 1.5);
            grad.addColorStop(0, 'rgba(0,0,0,0)');
            grad.addColorStop(1, \`rgba(0,0,0,\${alpha})\`);

            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, context.width, context.height);

            // 5. Return the modified ImageData
            return ctx.getImageData(0, 0, context.width, context.height);
        }
    });
}
\`\`\`

### Step 4: Loading the Node
1. Save your code as a \`.js\` file (e.g. \`vignette_node.js\`).
2. In the editor, open the Rubicon Graph for a clip.
3. Click **“Load Custom Node (.js)”** in the right‑side “Port Legend” panel and select your file.
4. Right‑click the workspace canvas → your node appears in the **Add Node** menu.
5. Drag it between \`media_in\` and \`media_out\`, adjust sliders, and enjoy!

---

## 5. Additional Node Examples

### 5.1 Simple Invert Node
An \`image → image\` node that inverts colours.

\`\`\`javascript
if (window.RUBICON) {
    window.RUBICON.registerNode('invert', {
        name: 'Invert',
        type: 'image',
        inputs: ['image'],
        outputs: ['image'],
        getUI: () => \`<div class="text-[10px] text-gray-400">Inverts all colours</div>\`,
        process: (context) => {
            const src = context.inputs[0];
            if (!src) return null;
            const data = new Uint8ClampedArray(src.data.length);
            for (let i = 0; i < src.data.length; i += 4) {
                data[i]     = 255 - src.data[i];     // R
                data[i + 1] = 255 - src.data[i + 1]; // G
                data[i + 2] = 255 - src.data[i + 2]; // B
                data[i + 3] = src.data[i + 3];       // A (unchanged)
            }
            return new ImageData(data, context.width, context.height);
        }
    });
}
\`\`\`

### 5.2 Value Node: “Brightness/Contrast” (Using \`value\` Ports)
A node with two numeric sliders that outputs a filtered image.  
*(Note: we use \`image\` input/output, but could also expose \`value\` ports for dynamic linking.)*

\`\`\`javascript
if (window.RUBICON) {
    window.RUBICON.registerNode('bc_node', {
        name: 'Brightness / Contrast',
        type: 'image',
        inputs: ['image'],
        outputs: ['image'],
        defaultProps: { brightness: 0, contrast: 1 },
        getUI: (props) => \`
            <div class="mt-2">
                <label class="text-[10px] text-gray-400">Brightness <span id="val_brightness">\${props.brightness}</span></label>
                <input type="range" data-prop="brightness" min="-100" max="100" value="\${props.brightness}"
                       class="w-full h-1 bg-gray-700 rounded appearance-none accent-yellow-500">
            </div>
            <div class="mt-2">
                <label class="text-[10px] text-gray-400">Contrast <span id="val_contrast">\${props.contrast}</span></label>
                <input type="range" data-prop="contrast" min="0" max="200" value="\${props.contrast}"
                       class="w-full h-1 bg-gray-700 rounded appearance-none accent-yellow-500">
            </div>
        \`,
        process: (context) => {
            const src = context.inputs[0];
            if (!src) return null;
            const data = new Uint8ClampedArray(src.data);
            const brightness = context.props.brightness / 100;
            const contrast = context.props.contrast / 100;
            for (let i = 0; i < data.length; i += 4) {
                data[i]     = Math.min(255, Math.max(0, (src.data[i]     - 128) * contrast + 128 + brightness * 128));
                data[i + 1] = Math.min(255, Math.max(0, (src.data[i + 1] - 128) * contrast + 128 + brightness * 128));
                data[i + 2] = Math.min(255, Math.max(0, (src.data[i + 2] - 128) * contrast + 128 + brightness * 128));
            }
            return new ImageData(data, context.width, context.height);
        }
    });
}
\`\`\`

### 5.3 Speed Ramp (Using \`time\` Input)
A node that outputs a modified time value, which can be plugged into other nodes.

\`\`\`javascript
if (window.RUBICON) {
    window.RUBICON.registerNode('speed_ramp', {
        name: 'Speed Ramp',
        type: 'time',
        inputs: ['time'],
        outputs: ['time'],
        defaultProps: { speed: 1.0 },
        getUI: (props) => \`
            <div class="mt-2">
                <label class="text-[10px] text-gray-400">Speed <span id="val_speed">\${props.speed}x</span></label>
                <input type="range" data-prop="speed" min="0" max="400" value="\${props.speed * 100}"
                       class="w-full h-1 bg-gray-700 rounded appearance-none accent-red-500">
            </div>
        \`,
        process: (context) => {
            const inputTime = context.inputs[0] || context.time;
            return inputTime * context.props.speed;
        }
    });
}
\`\`\`

### 5.4 Merge Node (Two Images + Mask)
Shows how to handle multiple inputs and a mask.

\`\`\`javascript
if (window.RUBICON) {
    window.RUBICON.registerNode('merge_over', {
        name: 'Merge (Over)',
        type: 'image',
        inputs: ['image', 'image', 'mask'],
        outputs: ['image'],
        getUI: () => \`<div class="text-[10px] text-gray-400">Overlays FG on BG using mask</div>\`,
        process: (context) => {
            const bg = context.inputs[0];  // background
            const fg = context.inputs[1];  // foreground
            const mask = context.inputs[2]; // alpha mask (optional, can be missing)
            if (!bg || !fg) return bg || fg;

            const canvas = document.createElement('canvas');
            canvas.width = context.width;
            canvas.height = context.height;
            const ctx = canvas.getContext('2d');

            // Draw background
            ctx.putImageData(bg, 0, 0);
            // Draw foreground with globalAlpha, or use composite
            const alphaData = mask ? mask.data : null;
            const fgData = fg.data;
            const bgData = bg.data;
            // Simple per‑pixel blend (illustrative)
            const result = new ImageData(context.width, context.height);
            for (let i = 0; i < bgData.length; i += 4) {
                const alpha = alphaData ? alphaData[i] / 255 : 1;
                result.data[i]     = (1 - alpha) * bgData[i]     + alpha * fgData[i];
                result.data[i + 1] = (1 - alpha) * bgData[i + 1] + alpha * fgData[i + 1];
                result.data[i + 2] = (1 - alpha) * bgData[i + 2] + alpha * fgData[i + 2];
                result.data[i + 3] = 255;
            }
            return result;
        }
    });
}
\`\`\`

---

## 6. UI Guidelines

- Use **Tailwind CSS** classes (the editor already includes Tailwind via CDN).
- Sliders: \`accent-yellow-500\` (or other node‑appropriate accent colour) for consistency.
- Numeric displays: include a \`<span id="val_<prop>">\` inside your label to show live values. The engine updates these automatically when \`oninput\` fires.
- \`data-prop\` – the most critical attribute. It tells the engine which property to update when the user drags a slider. The name must match a key in \`defaultProps\`.

---

## 7. Performance Tips

- **Avoid per‑frame canvas creation** – Create a single \`<canvas>\` outside the \`process\` function (in a closure) and reuse it. Check \`width\`/\`height\` and recreate only if necessary.
- **Use \`ctx.putImageData()\`** instead of \`drawImage()\` when you already have an \`ImageData\` object – it’s faster.
- **Keep your pixel loops tight** – The engine already runs at full resolution; unnecessary computations can drop FPS.
- **Return early** if no input is connected (\`return null\`). This tells the overlay system to skip the node and it costs almost nothing.

---

## 8. Exporting FFmpeg Filters (Advanced)

If you want your node to be included in WASM‑based MP4 exports (not just real‑time WebM), you can add a \`getFFmpeg(props)\` function that returns a string of FFmpeg filter options.  
For example, the vignette node could map to \`"vignette=PI/4:max_angle=PI/2"\` (pseudo‑example). The export middleware will automatically collect these strings.

\`\`\`javascript
getFFmpeg: (props) => \`eq=contrast=\${props.contrast}:brightness=\${props.brightness}\`
\`\`\`

This is optional; if omitted, the node’s effect will still appear in the real‑time preview but not in a WASM MP4 render.

---

## 9. Publishing a Node

1. **File name** – Use a descriptive, lowercase name like \`vignette_fx.js\`.
2. **Metadata** – Always include a JSDoc‑style header with \`@name\`, \`@version\`, \`@developer\`, and \`@description\`.
3. **Placement** – For auto‑loading by all users, place the file in the \`Graph Compositing\` folder of the main repository (\`Cleo876/wasm-video-editor\`). The engine fetches from:
   \`\`\`
   https://api.github.com/repos/Cleo876/wasm-video-editor/contents/Graph%20Compositing
   \`\`\`
4. **Testing** – Use the “Load Custom Node (.js)” button in the Rubicon workspace to test locally before committing.

---

## 10. FAQ / Troubleshooting

**Q:** My port isn’t the colour I expected.  
**A:** Check the \`inputs\`/\`outputs\` array – the colour is derived from the data type string. “image” = yellow, “mask” = blue, etc. Unknown types get an auto‑generated colour.

**Q:** I get “Type Mismatch” when connecting wires.  
**A:** The output port type must exactly match the input port type. For example, you cannot connect a \`value\` port to an \`image\` port. Create a converter node if needed.

**Q:** Nothing happens when I add my node.  
**A:** Ensure your script runs without errors (check the browser console). The node must be registered before you open the workspace. Use the “Load Custom Node” button to re‑load it manually.

**Q:** My changes disappear after a page refresh.  
**A:** The Rubicon workspace saves the graph to IndexedDB automatically. However, custom node definitions loaded via the UI are not persisted—you need to load them again or add them to the GitHub folder for auto‑loading.

---

Happy compositing! You’ve crossed the Rubicon. Now make it legendary. God Bless! 🎲
