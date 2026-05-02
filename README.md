# Forge™ WASM Video Editor 🎬
**Forge™. Own. Forever. ⚒️**

A professional-grade, 100% client-side Non-Linear Editor (NLE) running entirely in your browser. Powered by **WebAssembly (FFmpeg.wasm)**, the **HTML5 Canvas API**, and the **Web Audio API**, this editor delivers a desktop-like workflow with zero server uploads, ensuring total privacy and instantaneous performance.

## ✨ Core Features

* **Advanced Multi-Track Timeline:** Support for limitless Video, Audio, Text, and FX tracks with magnetic snapping, frame-accurate trimming, and Smart Collision resolution.

* **Real-Time Canvas Compositing:** 60fps real-time preview of multi-layered video, opacity, scaling, rotation, and dynamic blend modes.

* **Web Audio Mixer &amp; L-Cuts:** Dedicated Web Audio `GainNodes` for every clip. Support for real-time volume mixing, visual fade in/out handles, and independent audio extraction (L-Cuts).

* **Advanced PiP (Picture-in-Picture):** On-canvas direct manipulation. Drag, scale, and rotate media directly in the viewport with magnetic Smart Guides (Rule of Thirds &amp; Center).

* **IndexedDB Persistence:** Your media, timelines, and states are saved entirely offline in your browser. Close the tab and pick up exactly where you left off.

* **Dual Export Engine:**

  * **WASM Export:** True `.mp4` rendering using FFmpeg.wasm for high-fidelity outputs.

  * **Realtime Fallback:** `.webm` recording fallback via `MediaRecorder` for strict CORS environments or unsupported mobile browsers.

## 🧩 The Modular Extension Ecosystem

The defining feature of the WASM Video Editor is its **Extension Manager**. Rather than bloating the core engine, advanced features are loaded dynamically as hot-pluggable `.js` scripts.

Extensions can intercept core lifecycles (like `Player.renderFrame` or `Timeline.addClip`) to inject Hollywood-grade functionality:

* **Transitions Engine:** A True-Facilitator engine that calculates absolute block timeframes. Includes features like Cross-Dissolve, Fade to Color, and Cinematic Anamorphic Lens Flares.

* **Media Manager Pro:** Adds smart-deletion warnings, inline timeline clip renaming, 15-second media hover previews, and an integrated **Google Fonts Typography Engine**.

* **Undo &amp; Redo Engine:** 1500-state history tracking with a visual Storage Manager to prevent RAM bloat.

### Safe Mode

If an extension causes instability, simply append `?safemode=true` or `#safemode=true` to your URL. The editor will execute a sterile boot, bypassing all IndexedDB extensions so you can safely access the Extension Manager to uninstall faulty modules.

## 🚀 Getting Started

Because this editor heavily relies on `SharedArrayBuffer` for FFmpeg.wasm multi-threading, it **must** be served in a secure context with specific HTTP headers.

### Prerequisites

You need a local server capable of injecting Cross-Origin Isolation headers.

1. Clone the repository:

   ```bash
   git clone [https://github.com/Cleo876/wasm-video-editor.git](https://github.com/Cleo876/wasm-video-editor.git)
   ```

2. Serve the `index.html` (or `video_editor.html`) file with the following headers:

   * `Cross-Origin-Opener-Policy: same-origin`

   * `Cross-Origin-Embedder-Policy: require-corp`

*Tip: If you are using Node.js, you can use a simple Express server to append these headers, or use the `npx serve` package configured for secure contexts.*

## 🛠 Building Custom Extensions

The editor exposes a global architecture designed for rapid extension development. Create a `.js` file with the following metadata headers to integrate with the Extension Manager:

```javascript
/**
 * @name My Custom Extension
 * @version 1.0.0
 * @developer Your Name
 * @description A brief description of your module.
 */
(function() {
    const MyModule = {
        init() {
            // Hijack core functions, inject UI, or listen to Store changes
        },
        cleanup() {
            // MANDATORY: Remove event listeners and DOM nodes when uninstalled
        }
    };
    window.MY_MODULE = MyModule;
    MyModule.init();
})();
```

Check the `Extensions/` directory in this repository for examples like the `anamorphic_flare.js` and the `pip_transform_engine.js`.

## 🤝 Contributing

We aren't currently accepting Pull Request, however, we are looking for developers to build new Transition Scripts, LUT/Color-grading modules, and Audio EQ tools to expand the Extension Ecosystem.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
