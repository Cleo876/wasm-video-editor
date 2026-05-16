# 🧬 WASM Video Editor – Developer Interface Reference
*Complete API surface for building extensions, export tools, and integrations.*

---

## 1. Global Singletons (Always Available)

All core objects are attached to `window` and guaranteed to exist before any extension runs.

| Singleton | Purpose |
|-----------|---------|
| `Store` | Project state, timeline data, asset registry, middleware |
| `Player` | Playback engine, canvas compositor, media pools |
| `TimelineModule` | Timeline UI, clip rendering, drag/resize/split |
| `UI` | Asset cards, upload handling, timeline refresh |
| `NativeInspector` | Properties panel, DOM injection point for extensions |
| `DB` | IndexedDB wrapper – `put`, `get`, `getAll`, `delete` |
| `ExportManager` | Export modal, WebM recorder, WASM MP4 render |
| `Notify` | Toast notification system |
| `FileManager` | Project CRUD, import dialogs |

---

## 2. Store – Project & Timeline Data

### 2.1 Project Identity
```js
Store.projectId    // "proj_1680123456789_abc12"
Store.projectName  // "My Awesome Video"
```

### 2.2 Track Configuration
```js
Store.trackConfig = [
  { id: "v1", type: "video",  label: "Video",  icon: "fa-video",  createdAt: 2 },
  { id: "a1", type: "audio",  label: "Audio",  icon: "fa-music",  createdAt: 1 },
  { id: "v2", type: "text",   label: "Text",   icon: "fa-font",   createdAt: 4 },
  { id: "fx1",type: "fx",     label: "FX Overlay", icon: "fa-wand-magic-sparkles", createdAt: 3 }
];
```
- `type` is one of `"video"`, `"audio"`, `"text"`, `"fx"`.
- `createdAt` determines display order (higher = drawn on top).

### 2.3 Tracks & Clips
```js
Store.tracks = {
  "v1": [ /* array of clip objects */ ],
  "a1": [],
  "v2": [],
  "fx1": []
};
```

**Clip object (every property that can exist):**
```js
{
  id: "clip_1680123456789_xyz",   // unique
  assetId: "asset_1680123456789_abc",
  start: 3.5,                     // seconds from timeline origin
  duration: 12.0,
  offset: 0.5,                    // seconds into the source media

  // Visual (video/image/fx tracks)
  scale: 100,                     // percent
  opacity: 100,                   // percent
  rotation: 0,                    // degrees
  x: 50,                          // position %, only if PiP Transform is active
  y: 50,
  borderRadius: 0,
  borderWidth: 0,
  borderColor: "#ffffff",
  shadowBlur: 0,
  shadowDist: 0,
  shadowColor: "#000000",
  blendMode: "source-over",      // "screen","multiply","overlay","color-dodge"

  // Audio
  volume: 100,                    // percent
  fadeIn: 0.0,                    // seconds
  fadeOut: 0.0,
  muted: false,

  // Text
  text: "Hello World",
  color: "#ffffff",
  fontSize: 60,
  fontFamily: "Inter",

  // Rubicon Graph
  graphData: {
    nodes: [ /* … */ ],
    wires: [ /* … */ ]
  },

  // Transitions
  transitions: {
    in: {
      type: "dissolve",
      duration: 1.0,
      alignment: "edge",          // "edge" | "center"
      easing: "linear",           // "linear"|"scurve"|"exp"
      params: {}
    },
    out: { /* same shape */ }
  }
}
```

### 2.4 Assets
```js
Store.assets = [
  {
    id: "asset_1680123456789_abc",
    projectId: "proj_1680123456789_abc12",
    type: "video",               // "video"|"image"|"audio"|"title"
    name: "my-footage.mp4",
    duration: 45.2,              // seconds
    color: "#3b82f6",
    file: <Blob>,                // the original file
    url: "blob:http://...",      // URL created from the Blob
    thumbnail: "data:image/jpeg;base64,..."
  }
];
```

### 2.5 Export Middleware
```js
Store.middleware = [
  function(clip) { return "volume=0.8,afade=t=in:d=0.5"; },
  function(clip) { return "fade=t=out:st=0:d=1.0:alpha=1"; },
  // … more pushed by extensions
];
```
- Each function receives **one clip** and returns a **string** of FFmpeg filter options, or an empty string.
- Extensions push their function during `init()`.
- The export engine calls every middleware function for every clip on video/fx tracks.

---

## 3. DB – IndexedDB Interface

```js
await DB.init();                     // opens "WasmEditorDB" v4
await DB.put(storeName, object);     // store: "projects","assets","modules","system"
const record = await DB.get(storeName, key);
const all = await DB.getAll(storeName);
await DB.delete(storeName, key);
```

**Object stores:**
- `projects` – keyed by `projectId`
- `assets` – keyed by `assetId`, has index `projectId`
- `modules` – keyed by extension `name`
- `system` – keyed by arbitrary ID (`history_<pid>`, `custom_transitions_registry`, `hotkey_preferences`, etc.)

---

## 4. Player – Rendering & Playback

### 4.1 Compositor Canvas
```js
Player.compositorCanvas   // <canvas> 1920×1080
```

### 4.2 Media Pools
```js
Player.videoPool[clipId]   // <video> element (lazy‑created)
Player.imagePool[clipId]   // <img> element
Player.audioPool[clipId]   // { el, source, url }  (Audio Mixer extension augments this)
```

### 4.3 Core Render Pipeline
```js
Player.drawToCanvas(vClips, tClips)   // vClips = active video/image clips, tClips = active text clips
Player.renderFrame()                   // called every frame; calls drawToCanvas internally
Player.safeRenderFrame()               // try/catch wrapper around renderFrame
Player.togglePlay()
Player.seekToStart()
Player.seekRelative(seconds)
```

### 4.4 Extension Override Pattern (Critical)
Extensions **hijack** `Player.drawToCanvas` and `Player.renderFrame`:

```js
// Inside your extension's init():
this.originalDrawToCanvas = Player.drawToCanvas.bind(Player);

Player.drawToCanvas = (vClips, tClips) => {
    // 1. Do your pre‑processing (modify clip opacities, etc.)
    // 2. Call the original
    this.originalDrawToCanvas(vClips, tClips);
    // 3. Do your post‑processing (draw overlays, etc.)
};

// In cleanup():
Player.drawToCanvas = this.originalDrawToCanvas;
```

**Load order matters.** The Rubicon Graph Engine loads asynchronously (after node fetching) and therefore its overlay sits on top. Other extensions should store the *current* function when they boot, not assume they are first.

---

## 5. NativeInspector – Properties Panel Injection

### 5.1 Polling
The inspector polls `Store.selectedClipId` every 200ms. When it changes, it rebuilds the entire panel HTML.

### 5.2 Injection Point
Extensions add custom UI by appending to the div with id `nativeInspectorExtensions`:

```js
// Override NativeInspector.render to add your section:
this.originalInspectorRender = NativeInspector.render.bind(NativeInspector);
NativeInspector.render = () => {
    this.originalInspectorRender();   // let the core build the base panel
    const extBox = document.getElementById('nativeInspectorExtensions');
    if (extBox && Store.selectedClipId) {
        // Append your custom HTML
        extBox.insertAdjacentHTML('beforeend', `<div>…</div>`);
    }
};
```

---

## 6. ExportManager – Export Flow

### 6.1 DOM Elements (IDs in the Export Modal)
```js
"exportModal"              // the full modal overlay
"exportFilename"           // <input> for the file name
"exportRes"                // <select> for quality (720,1080,2160)
"exportProgressContainer"  // hidden div that shows during export
"exportProgress"           // the progress bar
"exportStatus"             // status text
"exportActions"            // buttons container
"btnRenderWasm"            // the "Render MP4 (WASM)" button
```

### 6.2 Key Methods
```js
ExportManager.start()            // opens the export modal
ExportManager.render()           // experimental WASM MP4 path (you can hijack this)
ExportManager.recordBrowser()    // realtime WebM fallback
ExportManager.initFFmpeg()       // loads ffmpeg.wasm core
ExportManager.cancelRecording()  // aborts WebM recording
```

### 6.3 FFmpeg Initialization Pattern
```js
const { FFmpeg } = window.FFmpegWASM;   // from CDN script
const { fetchFile } = window.FFmpegUtil;

const ffmpeg = new FFmpeg();
await ffmpeg.load({
    coreURL: "blob:…",   // or CDN URL
    wasmURL: "blob:…"
});
```
The editor caches the core files in IndexedDB (`system` store keys `core_js`, `core_wasm`) and falls back to CDN. Your extension can reuse the same `ffmpeg` instance or create its own.

---

## 7. TimelineModule – Timeline UI & Interactions

```js
TimelineModule.renderTrack(trackId)     // redraws all clips on that track
TimelineModule.selectClip(clipId, trackId)
TimelineModule.deleteSelected()
TimelineModule.splitClip()
TimelineModule.updatePlayhead(time)
```

Clip DOM elements have class `.t-clip` and are positioned absolutely inside `.track-lane` divs.

---

## 8. UI – Asset Cards & Timeline Refresh

```js
UI.renderAssetCard(gridId, asset)   // creates a draggable card in the media/audio library
UI.refreshTimeline()                // rebuilds track structure and all clips
UI.checkExportButton()              // enables/disables the export button based on content
```

---

## 9. Notify – Toast System

```js
Notify.show("Message", "fa-icon-name");           // default 2 seconds
Notify.show("Message", "fa-icon-name", 4000);     // custom duration (ms)
```
Queue‑based – if multiple toasts fire, they display one after another.

---

## 10. Extension Format (Mandatory)

Every extension is an **IIFE** with these metadata headers:

```js
/**
 * @name Your Extension Name
 * @version 1.0.0
 * @developer Your Name
 * @description Brief description.
 */
(function() {
    const MODULE_ID = 'your_unique_id';

    if (typeof Store === 'undefined' || typeof Player === 'undefined') {
        console.error(`❌ [${MODULE_ID}] Core not ready.`);
        return;
    }

    const YourExtension = {
        isActive: true,
        originalSomething: null,

        init() {
            // Hijack core functions here
            // Inject UI
            // Push to Store.middleware
        },

        cleanup() {
            // Restore originals
            // Remove DOM elements
            // Clear intervals
            // Delete window.YOUR_GLOBAL
        }
    };

    window.YOUR_GLOBAL = YourExtension;
    YourExtension.init();
})();
```

---

## 11. Hotkey Registration

Extensions should not use native `keydown` listeners. Instead, push to the reactive queue:

```js
window.HOTKEY_QUEUE = window.HOTKEY_QUEUE || [];
window.HOTKEY_QUEUE.push({
    type: 'command',
    args: [
        'global',                  // context ID
        'myext.do_thing',          // unique command ID
        'Do Thing',                // display name
        'Category',                // grouping
        () => { /* execute */ },   // callback
        "Description of action",   // tooltip
        "Ctrl+KeyT"                // default key
    ]
});
```

---

## 12. Building an MP4 Export Extension – Specific Steps

1. Create an IIFE with the standard metadata headers.
2. Hijack `ExportManager.render()` (store the original, replace it).
3. In your replacement:
   - Collect all video/fx clips from `Store.tracks`.
   - For each clip, call every function in `Store.middleware`.
   - Write source assets to ffmpeg.wasm virtual filesystem.
   - Build `filter_complex` string from trim/setpts + middleware output + concat.
   - Run ffmpeg.
   - Read `output.mp4` and trigger download.
4. Update `#exportProgress` and `#exportStatus` during encoding.
5. If WASM is not available, fall back to the original method.
6. Provide a `cleanup()` that restores the original function.

---

## 13. Example Middleware Outputs (for Testing)

These are strings returned by different extensions when their middleware function is called with a clip:

- **Audio Mixer:** `"volume=0.80"`, `"afade=t=in:st=0.5:d=1.0"`, `"afade=t=out:st=10.0:d=1.0"`
- **Transitions (dissolve):** `"fade=t=in:st=0:d=1.0:alpha=1"`
- **Transitions (fade):** `"fade=t=in:st=0:d=1.0:c=0x000000"`
- **Rubicon nodes (via their `getFFmpeg`):** `"eq=contrast=1.2:brightness=0.05"`, `"vignette=PI/4:max_angle=PI/2"`

Your export engine should simply join these with commas and inject them into the filter chain.

---

*This document covers every interface an extension (or an AI like Lovable) needs to integrate deeply with the WASM Video Editor. Pair it with the Extension Developer Guide for lifecycle rules and metadata requirements.*
