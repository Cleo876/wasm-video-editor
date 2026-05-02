# 🎬 Forge™ WASM Video Editor

The most advanced browser‑based video editor – now available as a
**true desktop application** on Linux and Windows via one‑click install
scripts.

## What Is a “Ghost App”?

A **ghost app** is a real website that has been given a permanent home on your
computer. It launches in its own dedicated window, uses a completely separate
browser profile, and behaves exactly like a native application – but the entire
engine is still your existing browser, running in a clean, isolated environment.

- **No Electron wrapper** – we reuse the browser you already have.
- **No heavy downloads** – the installer only copies a few small files.
- **No interference** – the editor never touches your personal browsing data, and
  your browser extensions can’t affect it.
- **Instant uninstall** – just run the provided uninstall script.

## Why Install Instead of Just Using the Web Link?

### 1. **Rock‑solid stability**
Your project data (IndexedDB) lives in a **private folder** that cannot be
wiped when you clear your browser history. Even if your main browser crashes or
updates, the editor remains untouched.

### 2. **Zero distractions**
No bookmarks, no open tabs, no extension pop‑ups. Just a clean, focused editing
workspace – exactly like professional desktop software.

### 3. **Truly air‑gapped editing**
Because the editor is already 100 % client‑side, once you’ve launched it once
and the core assets are cached, you can edit without an internet connection.
The ghost app makes this seamless and permanent.

### 4. **Professional first impression**
Double‑click the icon, and a sleek, borderless window opens with *your* tool.
It appears in your taskbar, can be pinned to your dock, and feels like a
purpose‑built application – because it is.

### 5. **Secure air‑gapped environment**
The editor never uploads anything. Combined with the isolated profile, this
makes it the only NLE **trusted for sensitive government, legal, and medical
video editing** – no data ever leaves the device, and no external code can
access the editing environment.

## How to Install

Choose your platform:

### 🐧 Linux

1. Download the Linux package (the folder containing `install.sh`, `uninstall.sh`,
   and the application icon).
2. Move the folder to a permanent location (Documents, an Apps folder, etc.).
3. Right‑click inside the folder and choose **“Open in Terminal”**.
4. Run:
   ```bash
   bash install.sh
   ```
5. After a few seconds, you’ll find **“WASM Video Editor”** and
   **“SAFEMODE WASM Video Editor”** in your applications menu, and desktop.

### 🪟 Windows

1. Download the Windows package (the folder containing `install.bat`, `uninstall.bat`,
   `layer.ico`, and `safe-layers.ico`).
2. Move the folder to a permanent location (Documents, a “My Apps” folder, etc.).
3. Double‑click **install.bat**.
4. Two shortcuts will appear on your Desktop:
   - **WASM Video Editor**
   - **SAFEMODE WASM Video Editor**
5. Double‑click any shortcut to launch the editor in a clean, borderless window.

Both shortcuts share the **same project data** (videos, timelines, extensions) –
they just open in different modes.

## What Is Safe Mode?

Safe Mode starts the editor with all extensions temporarily disabled. If a
faulty extension ever causes instability, open the SAFEMODE launcher. The
editor will run a clean session, allowing you to safely open the Extension
Manager and remove the problem module. After that, close Safe Mode and return
to the standard launcher – everything works again.

## How to Uninstall

### Linux
From the folder, run:
```bash
bash uninstall.sh
```

### Windows
From the folder, double‑click **uninstall.bat** and follow the prompts.

Your project data is preserved in the isolated profile folder unless you choose
to delete it.

## Where Is My Project Data Stored?

All timeline data, assets, and settings are stored in the browser’s IndexedDB
inside the **isolated profile folder** created by the installer. You can
backup, migrate, or delete this folder at any time.

## Contributing

We welcome extensions, transitions, Rubicon nodes, and documentation
improvements. Check out the
[Extension Developer Guide](https://github.com/Cleo876/wasm-video-editor/blob/main/Extensions/Modules%20Developer%20Guide.md)
to get started, and join the **Editor’s Jam 2026** for a chance to win prizes
and be featured on the official landing page.

## The Forge™ Promise

All Forge™ tools are **open‑source, client‑side, and free forever**. We believe
that creative software should belong to the people who use it – no
subscriptions, no lock‑in, no compromises.

---

**Forge™. Own. Forever. ⚒️**
