@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ----------------------------------------
echo Forge: Windows WASM Editor Installer
echo Locating Microsoft Edge...
echo ----------------------------------------

:: Try known install paths first
set "EDGE_PATH="
if exist "C:\Program Files\Microsoft\Edge\Application\msedge.exe" (
    set "EDGE_PATH=C:\Program Files\Microsoft\Edge\Application\msedge.exe"
)
if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    set "EDGE_PATH=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
)

:: Fallback to 'where' command
if "!EDGE_PATH!"=="" (
    for /f "delims=" %%i in ('where msedge 2^>nul') do (
        if "!EDGE_PATH!"=="" set "EDGE_PATH=%%i"
    )
)

if "!EDGE_PATH!"=="" (
    echo ERROR: Microsoft Edge not found. Please install it.
    timeout /t 5 >nul
    exit /b 1
)

echo Found: !EDGE_PATH!

set "APP_URL=http://cleo876.github.io/wasm-video-editor"
set "SAFE_URL=https://cleo876.github.io/wasm-video-editor/#safemode=true"
set "ICON_PATH=%~dp0layer.ico"
set "SAFE_ICON_PATH=%~dp0safe-layers.ico"

:: One single sandboxed data folder for both modes
set "DATA_DIR=%LocalAppData%\WASMEditor"

echo Installing WASM Editor (Standard & Safe Mode)...
echo Shared sandboxed data folder: !DATA_DIR!

:: Standard shortcut
powershell -NoProfile -Command "$ws=New-Object -ComObject WScript.Shell; $s=$ws.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\WASM Video Editor.lnk'); $s.TargetPath='!EDGE_PATH!'; $s.Arguments='--app=\"%APP_URL%\" --user-data-dir=\"!DATA_DIR!\"'; $s.IconLocation='%ICON_PATH%'; $s.Save()"

:: Safe Mode shortcut
powershell -NoProfile -Command "$ws=New-Object -ComObject WScript.Shell; $s=$ws.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\SAFEMODE WASM Video Editor.lnk'); $s.TargetPath='!EDGE_PATH!'; $s.Arguments='--app=\"%SAFE_URL%\" --user-data-dir=\"!DATA_DIR!\"'; $s.IconLocation='%SAFE_ICON_PATH%'; $s.Save()"

echo.
echo Success! Both modes are on your Desktop, sharing the same project data.
echo Closing in 2 seconds...
timeout /t 2 >nul
