@echo off
setlocal enabledelayedexpansion

echo Setting up wallpaper rotation (every 20-25 min)...

set "WALLPAPER_DIR=%APPDATA%\ForgeWallpapers"
if not exist "%WALLPAPER_DIR%" mkdir "%WALLPAPER_DIR%"

:: Copy the rotation script if it exists in the current folder
if exist "%~dp0rotate-wallpaper.ps1" (
    copy /Y "%~dp0rotate-wallpaper.ps1" "%WALLPAPER_DIR%\rotate-wallpaper.ps1" >nul
) else (
    echo ERROR: rotate-wallpaper.ps1 not found. Place it next to this batch file.
    timeout /t 5 >nul
    exit /b 1
)

:: Start the rotation immediately (hidden)
start "" powershell -WindowStyle Hidden -ExecutionPolicy Bypass -File "%WALLPAPER_DIR%\rotate-wallpaper.ps1"

:: Remove old tasks
schtasks /delete /tn "Forge Wallpaper Rotation" /f >nul 2>&1
schtasks /delete /tn "Forge Wallpaper Rotation Mid-Session" /f >nul 2>&1

:: Create tasks
schtasks /create /tn "Forge Wallpaper Rotation" /tr "powershell -WindowStyle Hidden -ExecutionPolicy Bypass -File \"%WALLPAPER_DIR%\rotate-wallpaper.ps1\"" /sc ONLOGON /f >nul 2>&1
schtasks /create /tn "Forge Wallpaper Rotation Mid-Session" /tr "powershell -WindowStyle Hidden -ExecutionPolicy Bypass -File \"%WALLPAPER_DIR%\rotate-wallpaper.ps1\"" /sc MINUTE /mo 30 /f >nul 2>&1

echo Done. Wallpaper will rotate every 20-25 minutes.
timeout /t 2 >nul
