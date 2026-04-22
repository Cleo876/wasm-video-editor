# WASM Video Editor Extension API (v2.6.22)

## Official Module Development Documentation

Welcome, Developer. This guide outlines the standard architecture for building extension modules for the WASM Video Editor. To maintain system stability and user transparency, all modules must adhere to the metadata, lifecycle, and cleanup protocols defined below.

### 1. The Module Architecture

The editor executes modules in a shared global context. To prevent scope collisions, all modules **must** be wrapped in an IIFE (Immediately Invoked Function Expression).

### 2. Mandatory Metadata Headers

The Extension Manager uses a regex scanner to extract module details during the import process. You **must** include the following tags in a comment block at the very top of your file:

| Tag | Description | 
 | ----- | ----- | 
| `@name` | The display name of the module. | 
| `@version` | Semantic versioning (e.g., 1.0.5). | 
| `@developer` | Your name or organization. | 
| `@description` | A concise one-line summary of what the extension adds. | 

### 3. Standard Module Template

Every module should follow this structural pattern to support system-level toggling, description display, and clean deletion.

```javascript
/**
 * @name My Awesome Filter
 * @version 1.2.0
 * @developer Cleon Williams
 * @description Adds a cinematic grain and vignette effect to the preview.
 */
(function() {
    const MODULE_ID = 'cinematic_grain';

    const MyModule = {
        isActive: true,
        elements: [], // Track all DOM elements for cleanup

        init() {
            console.log(`[${MODULE_ID}] Initializing...`);
            this.createUI();
            this.registerHotkeys(); // See Section 7!
        },

        createUI() {
            const panel = document.createElement('div');
            panel.id = `${MODULE_ID}_panel`;
            panel.className = 'p-3 bg-gray-800 rounded border border-gray-700 mt-2';
            panel.innerHTML = `<h4 class="text-xs font-bold text-teal-400">Grain Settings</h4>`;
            
            // Injecting into the Sidebar
            const sidebar = document.querySelector('.main-section .flex-col');
            if (sidebar) sidebar.appendChild(panel);
            
            this.elements.push(panel);
        },

        // MANDATORY: Cleanup Function
        // This is called by the system when toggled OFF or UNINSTALLED
        cleanup() {
            console.log(`[${MODULE_ID}] Performing deep cleanup...`);
            
            // 1. Remove DOM Elements
            this.elements.forEach(el => el.remove());
            this.elements = [];

            // 2. Stop Intervals/Timeouts (e.g., Handshake loops)
            if (this.hotkeyHandshake) clearInterval(this.hotkeyHandshake);

            // 3. Clear Global References
            delete window[MODULE_ID.toUpperCase()];
        }
    };

    // Attach to window for system-level access
    window[MODULE_ID.toUpperCase()] = MyModule;
    MyModule.init();
})();
```

### 4. Toggling Logic (Active vs. Inactive)

The Editor's `Extension Manager` tracks an `active` boolean in IndexedDB.

* **When `active` is set to `false`:** The system calls your module's `cleanup()` method immediately.

* **When `active` is set back to `true`:** The system re-executes the module code.

**Developer Note:** It is strictly forbidden to simply hide your UI with `display: none`. You must purge event listeners to prevent "Ghosting" where a disabled module still reacts to user inputs.

### 5. Support for Deletion (Uninstallation)

When a user clicks "Uninstall" in the Extension Manager, the system performs the following sequence:

1. Checks for a `cleanup()` method on the registered window object and executes it.

2. Deletes the module script content and metadata from IndexedDB.

3. Removes the UI row from the Manager.

### 6. Accessing Core System APIs

Your module has access to these global singletons:

| Singleton | Purpose | 
 | ----- | ----- | 
| `Store` | Access timeline data, project configuration, and `tracks`. | 
| `Player` | Control the preview video (`togglePlay`, `renderFrame`, `drawToCanvas`). | 
| `TimelineModule` | Manipulate tracks and clips programmatically. | 
| `NativeInspector` | Dynamically inject settings into the properties panel. | 
| `UI` | Post system notifications via `Notify.show(msg, icon)`. | 
| `DB` | Store local extension data asynchronously using IndexedDB. | 

# HotKey Master Extension Support

### 7. Keyboard &amp; Shortcut Integration (Mandatory)

To prevent shortcut conflicts and maintain absolute user control over keyboard mapping, the Editor employs a **Load-Time Static Analysis Rogue Shield**.

**⚠️ CRITICAL WARNING:** Using native bindings like `document.addEventListener('keydown', ...)` or `window.onkeyup = ...` is **strictly forbidden**. If the engine's regex scanner detects these hardcoded native inputs in your code, your extension will be permanently blocked from injecting into the DOM, flagged as a rogue module, and the user will be forced to uninstall it.

You must route all keyboard inputs through the centralized `Hotkey Master` API using the **Open Receiver &amp; Handshake Protocol**. This allows the Hotkey Master to automatically build a custom UI for your commands. Follow this exact 9-step workflow:

#### Step 1: Remove Native Listeners

Scrub your codebase of any direct DOM keyboard listeners.
**❌ DO NOT DO THIS:**

```javascript
window.addEventListener('keydown', (e) => { 
    if(e.key === 'M') this.doMagic(); 
});
```

#### Step 2: Understand the "Open Receiver" Proxy

Because your extension might load before Hotkey Master, you **do not** check if `window.HOTKEY_MASTER` exists. Instead, you push your commands directly to `window.HOTKEY_QUEUE`. If Hotkey Master boots *after* your extension, it processes the queue array. If it booted *before* your extension, it has already replaced the array with a Reactive Proxy that intercepts and registers your commands instantly.

#### Step 3: Define Your Context (Optional but Recommended)

If your hotkeys should only trigger when a specific UI is open (like a popup or node editor), define a Context array: `[Context ID, Display Name, Evaluator Function]`.

```javascript
const myContext = ['my_ext_ui', 'My Custom UI', () => document.getElementById('my_ui').style.display === 'block'];
```

#### Step 4: Define Your Command Package &amp; Auto-Map Defaults

Create your command array. Notice the crucial **7th argument**: an array of `defaultKeys`. The engine will automatically auto-map these for the user!

```javascript
const magicCommand = [
    'my_ext_ui',              // 1. Context ID (or 'global' if no context is needed)
    'my_ext.do_magic',        // 2. Unique Command ID
    'Trigger Magic Effect',   // 3. Display Name
    'VFX',                    // 4. Category
    () => this.doMagic(),     // 5. Execution Function
    "Applies a sparkling magic effect.", // 6. Description
    ["Ctrl+KeyM", "Shift+KeyM"] // 7. DEFAULT KEYS (Auto-Mapped!)
];
```

#### Step 5: Respect the Modifier Key Rules

When defining your `defaultKeys`, adhere to the strict modifier rules of the engine:

* `Ctrl`, `Alt`, and `Shift` cannot be mapped as standalone keys; they are modifiers.
* **Alt Restriction:** `Alt` must always be paired with a standard letter/number key (e.g., `Alt+KeyA`).
* Numpad keys are fully supported (e.g., `Numpad1`, `NumpadAdd`).

#### Step 6: Execute the "Handshake" Registration

Push your configurations to the `HOTKEY_QUEUE`.

```javascript
const attemptRegistration = () => {
    window.HOTKEY_QUEUE = window.HOTKEY_QUEUE || [];
    window.HOTKEY_QUEUE.push({ type: 'context', args: myContext });
    window.HOTKEY_QUEUE.push({ type: 'command', args: magicCommand });
};
attemptRegistration();
```

#### Step 7: Verify the Receipt (Handshake Protocol)

Because loads are asynchronous, you must verify that Hotkey Master received your command using the `HOTKEY_RECEIPTS` ledger. Set up an interval to check for your specific Command ID.

```javascript
let attempts = 0;
this.hotkeyHandshake = setInterval(() => {
    attempts++;
    if (window.HOTKEY_RECEIPTS &amp;&amp; window.HOTKEY_RECEIPTS['my_ext.do_magic']) {
        console.log("✅ Handshake Verified: Hotkeys acknowledged by Master.");
        clearInterval(this.hotkeyHandshake); // Success! Stop looping.
    } else if (attempts > 20) {
        // Proceed to Step 8
        console.warn("⚠️ Hotkey Master handshake timeout.");
        clearInterval(this.hotkeyHandshake);
    } else {
        attemptRegistration(); // Re-attempt if dropped by an async race condition
    }
}, 500);
```

#### Step 8: Handle Registration Timeouts

As seen in Step 7, if `attempts` exceeds 20 (about 10 seconds), you must gracefully clear the interval and abort. This prevents infinite memory loops in the event that the user has chosen to uninstall the Hotkey Master extension entirely.

#### Step 9: Call Registration on Init

Wrap Steps 6-8 into a single `registerHotkeys()` function. Then, call this function inside your module's main `init()` method so the handshake begins the exact millisecond your extension boots up!

Here is a practical example of how it looks when assembled:

```javascript
const MyModule = {
    init() {
        console.log(`Initializing...`);
        this.registerHotkeys(); // Call it immediately!
    },

    registerHotkeys() {
        const attemptRegistration = () => {
            window.HOTKEY_QUEUE = window.HOTKEY_QUEUE || [];
            window.HOTKEY_QUEUE.push({ type: 'context', args: myContext });
            window.HOTKEY_QUEUE.push({ type: 'command', args: magicCommand });
        };
        
        attemptRegistration(); // Fire initial request

        let attempts = 0;
        this.hotkeyHandshake = setInterval(() => {
            attempts++;
            if (window.HOTKEY_RECEIPTS &amp;&amp; window.HOTKEY_RECEIPTS['my_ext.do_magic']) {
                console.log("✅ Handshake Verified!");
                clearInterval(this.hotkeyHandshake);
            } else if (attempts > 20) {
                console.warn("⚠️ Hotkey Master handshake timeout.");
                clearInterval(this.hotkeyHandshake);
            } else {
                attemptRegistration(); // Re-fire if no receipt
            }
        }, 500);
    }
};
```

*Documentation Version 2.6.22-Docs*
