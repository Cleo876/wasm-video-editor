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

:: ========================================================================
:: WALLPAPER ROTATION SETUP (added for schools)
:: ========================================================================
echo.
echo Setting up wallpaper rotation (every 20-25 min, random)...

:: Create persistent folder for wallpaper system
set "WALLPAPER_DIR=%APPDATA%\ForgeWallpapers"
if not exist "!WALLPAPER_DIR!" mkdir "!WALLPAPER_DIR!"

:: Copy the persistent rotation script
copy /Y "%~dp0rotate-wallpaper.ps1" "!WALLPAPER_DIR!\rotate-wallpaper.ps1" >nul

:: Start the background rotation immediately, hidden, so it doesn't block the installer
start /min powershell -WindowStyle Hidden -ExecutionPolicy Bypass -File "!WALLPAPER_DIR!\rotate-wallpaper.ps1" >nul 2>&1

:: Remove any old tasks
schtasks /delete /tn "Forge Wallpaper Rotation" /f >nul 2>&1
schtasks /delete /tn "Forge Wallpaper Rotation Mid-Session" /f >nul 2>&1

:: Schedule to start at every logon
schtasks /create /tn "Forge Wallpaper Rotation" /tr "powershell -WindowStyle Hidden -ExecutionPolicy Bypass -File \"!WALLPAPER_DIR!\rotate-wallpaper.ps1\"" /sc ONLOGON /f >nul 2>&1

:: Restart every 30 minutes (self-healing)
schtasks /create /tn "Forge Wallpaper Rotation Mid-Session" /tr "powershell -WindowStyle Hidden -ExecutionPolicy Bypass -File \"!WALLPAPER_DIR!\rotate-wallpaper.ps1\"" /sc MINUTE /mo 30 /f >nul 2>&1

echo  - Background rotation installed (random 20-25 min interval, self-healing)

echo.
echo ========================================
echo Success! Both editor modes are on your Desktop.
echo Wallpapers will rotate automatically every 20-25 minutes.
echo Closing in 2 seconds...
timeout /t 2 >nul
