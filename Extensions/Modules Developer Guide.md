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

\`\`\`javascript
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
            console.log(\`[\${MODULE_ID}] Initializing...\`);
            this.createUI();
            this.bindEvents();
        },

        createUI() {
            const panel = document.createElement('div');
            panel.id = \`\${MODULE_ID}_panel\`;
            panel.className = 'p-3 bg-gray-800 rounded border border-gray-700 mt-2';
            panel.innerHTML = \`Grain Settings\`;
            
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
            console.log(\`[\${MODULE_ID}] Performing deep cleanup...\`);
            
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
\`\`\`

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

### 7. Keyboard & Shortcut Integration (Mandatory)

To prevent shortcut conflicts and maintain absolute user control over keyboard mapping, the Editor employs an **Execution-Level Rogue Shield**. 

**⚠️ CRITICAL WARNING:** Using native bindings like `document.addEventListener('keydown', ...)` or `window.onkeyup = ...` is **strictly forbidden**. The system utilizes Load-Time Static Analysis. If it detects these bindings in your code, your extension will be permanently blocked from injecting into the DOM, flagged as rogue, and the user will be prompted to uninstall it.

You must register your commands through the centralized `Hotkey Master` API. This automatically adds your command to the user's visual Shortcut Mapper UI where they can assign their own keys to it.

**How to Register a Command safely:**
Because your extension might load before the Hotkey Master boots, you should push your commands to the global `window.HOTKEY_QUEUE`.

\`\`\`javascript
// Define your command package
const myCommand = [
    'global',                 // Context ID ('global' for main editor scope)
    'my_ext.do_magic',        // Unique Command ID (Use a namespace)
    'Do Magic Trick',         // Display Name for the Shortcut UI
    'VFX',                    // Category Name for the UI
    () => this.triggerMagic(),// The function to execute
    "Applies a sparkling magic effect to the timeline." // Detailed description
];

// Safely register the command
if (window.HOTKEY_MASTER && window.HOTKEY_MASTER.registerCommand) {
    window.HOTKEY_MASTER.registerCommand(...myCommand);
} else {
    // Fallback: Queue it for when Hotkey Master boots
    window.HOTKEY_QUEUE = window.HOTKEY_QUEUE || [];
    window.HOTKEY_QUEUE.push({ type: 'command', args: myCommand });
}
\`\`\`

*Documentation Version 2.6.21-Docs*
    
