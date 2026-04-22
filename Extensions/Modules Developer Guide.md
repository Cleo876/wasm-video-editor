# WASM Video Editor Extension API (v2.6.21)

## Official Module Development Documentation

Welcome, Developer. This guide outlines the standard architecture for building extension modules for the WASM Video Editor. To maintain system stability and user transparency, all modules must adhere to the metadata, lifecycle, and cleanup protocols defined below.

### 1. The Module Architecture

The editor executes modules in a shared global context. To prevent scope collisions, all modules **must** be wrapped in an IIFE (Immediately Invoked Function Expression).

### 2. Mandatory Metadata Headers

The Extension Manager (v2.6.21+) uses a regex scanner to extract module details during the import process. You **must** include the following tags in a comment block at the very top of your file:

| Tag | Description |
| :--- | :--- |
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
            this.bindEvents();
        },

        createUI() {
            const panel = document.createElement('div');
            panel.id = `${MODULE_ID}_panel`;
            panel.className = 'p-3 bg-gray-800 rounded border border-gray-700 mt-2';
            panel.innerHTML = `Grain Settings`;
            
            // Injecting into the Sidebar
            const sidebar = document.querySelector('.main-section .flex-col');
            if (sidebar) sidebar.appendChild(panel);
            
            this.elements.push(panel);
        },

        bindEvents() {
            // Note: See Section 7 for proper keyboard bindings!
        },

        // MANDATORY: Cleanup Function
        // This is called by the system when toggled OFF or UNINSTALLED
        cleanup() {
            console.log(`[${MODULE_ID}] Performing deep cleanup...`);
            
            // 1. Remove DOM Elements
            this.elements.forEach(el => el.remove());
            this.elements = [];

            // 2. Stop Intervals/Timeouts
            if (this.refreshInterval) clearInterval(this.refreshInterval);

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
| :--- | :--- |
| `Store` | Access timeline data, project configuration, and `tracks`. |
| `Player` | Control the preview video (`togglePlay`, `renderFrame`, `drawToCanvas`). |
| `TimelineModule` | Manipulate tracks and clips programmatically. |
| `NativeInspector` | Dynamically inject settings into the properties panel. |
| `UI` | Post system notifications via `Notify.show(msg, icon)`. |
| `DB` | Store local extension data asynchronously using IndexedDB. |

# HotKey Master Extension Support
### 7. Keyboard & Shortcut Integration (Mandatory)

To prevent shortcut conflicts and maintain absolute user control over keyboard mapping, the Editor employs a **Load-Time Static Analysis Rogue Shield**. 

**⚠️ CRITICAL WARNING:** Using native bindings like `document.addEventListener('keydown', ...)` or `window.onkeyup = ...` is **strictly forbidden**. If the engine's regex scanner detects these hardcoded native inputs in your code, your extension will be permanently blocked from injecting into the DOM, flagged as a rogue module, and the user will be forced to uninstall it.

You must route all keyboard inputs through the centralized `Hotkey Master` API. This allows the Hotkey Master to automatically build a custom UI for your command, letting the user map it to whatever key they prefer. 

Follow this exact 4-step process to migrate your extension:

#### Step 1: Remove Native Listeners
Scrub your codebase of any direct DOM keyboard listeners.
**❌ DO NOT DO THIS:**
```javascript
window.addEventListener('keydown', (e) => { 
    if(e.key === 'M') this.doMagic(); 
});
```

#### Step 2: Define Your Command Package
Instead of binding a specific key (like 'M'), you define a "Command Package". 
Create an array containing exactly 6 elements:
1. **Context ID:** Use `'global'` to make it work anywhere in the main editor.
2. **Command ID:** A unique string namespace (e.g., `'my_ext.do_magic'`).
3. **Display Name:** What the user sees in the Shortcut Mapper UI.
4. **Category:** Groups similar commands together in the UI (e.g., `'VFX'`, `'Editing'`).
5. **Execution Function:** An arrow function `() =>` that runs your actual logic.
6. **Description:** A helpful tooltip for the user explaining what the command does.

```javascript
const magicCommand = [
    'global',                 // 1. Context
    'my_ext.do_magic',        // 2. Unique ID
    'Trigger Magic Effect',   // 3. Display Name
    'VFX',                    // 4. Category
    () => this.doMagic(),     // 5. Execution Function
    "Applies a sparkling magic effect to the timeline." // 6. Description
];
```

#### Step 3: Implement the Registration Logic
Because extensions load asynchronously via IndexedDB, your script might boot *before* the Hotkey Master is ready. You must implement a fallback queue. 

Write a registration function like this:
```javascript
registerHotkeys() {
    // Check if the Hotkey Master is already active and ready
    if (window.HOTKEY_MASTER && window.HOTKEY_MASTER.registerCommand) {
        window.HOTKEY_MASTER.registerCommand(...magicCommand);
    } else {
        // Fallback: Push it to the global queue. 
        // The Hotkey Master will process this array the exact millisecond it boots!
        window.HOTKEY_QUEUE = window.HOTKEY_QUEUE || [];
        window.HOTKEY_QUEUE.push({ type: 'command', args: magicCommand });
    }
}
```

#### Step 4: Call Registration on Init
Finally, call your new `registerHotkeys()` function inside your module's `init()` method so it registers as soon as your extension boots up. Once registered, users can open the "Keyboard Shortcuts..." menu in the editor and securely assign their preferred key combinations to your command!

*Documentation Version 2.6.21-Docs*
    
