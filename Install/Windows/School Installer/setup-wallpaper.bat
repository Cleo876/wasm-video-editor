@echo off
setlocal enabledelayedexpansion

echo =====================================
echo  Forge Wallpaper Rotator
echo  (Self-contained, branded/neutral aware)
echo =====================================
echo.

:: ----- cache folder -----
set "CACHE_DIR=%APPDATA%\ForgeWallpapers\cache"
if not exist "%CACHE_DIR%" mkdir "%CACHE_DIR%"

:: ----- manifest URL -----
set "MANIFEST_URL=https://raw.githubusercontent.com/Cleo876/wasm-video-editor/refs/heads/main/Wallpaper/wallpaper-manifest.json"

:: ----- 1. Download the manifest with curl -----
echo Downloading wallpaper manifest...
curl -sL "%MANIFEST_URL%" -o "%TEMP%\wallpaper-manifest.json"
if not exist "%TEMP%\wallpaper-manifest.json" (
    echo ERROR: Could not download manifest.
    timeout /t 5 >nul
    exit /b 1
)
echo Manifest downloaded.

:: ----- 2. Apply one wallpaper right now (branded/neutral aware) -----
echo Choosing and applying a wallpaper...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$m = Get-Content '%TEMP%\wallpaper-manifest.json' | ConvertFrom-Json; " + ^
    "$branded = @($m.wallpapers ^| Where-Object { $_.type -eq 'branded' }); " + ^
    "$neutral = @($m.wallpapers ^| Where-Object { $_.type -eq 'neutral' }); " + ^
    "$pool = if ((Get-Random -Maximum 100) -lt 60) { $branded } else { $neutral }; " + ^
    "if (-not $pool -or $pool.Count -eq 0) { $pool = $m.wallpapers }; " + ^
    "$c = $pool ^| Get-Random; " + ^
    "$img = '%CACHE_DIR%\' + [System.IO.Path]::GetFileName($c.url); " + ^
    "Write-Host ('Downloading ' + $c.type + ': ' + $c.url); " + ^
    "Invoke-WebRequest -Uri $c.url -OutFile $img -TimeoutSec 20; " + ^
    "Add-Type -TypeDef 'using System; using System.Runtime.InteropServices; public class Wallpaper { [DllImport(\"user32.dll\", CharSet = CharSet.Auto)] public static extern int SystemParametersInfo(int uAction, int uParam, string lpvParam, int fuWinIni); }'; " + ^
    "[Wallpaper]::SystemParametersInfo(0x0014, 0, $img, 0x0003); " + ^
    "Write-Host 'Wallpaper applied.'"

if %errorlevel% neq 0 (
    echo WARNING: The wallpaper change may have failed.
) else (
    echo Check your desktop – the wallpaper should be different!
)

:: ----- 3. Install recurring task (every 20 min) -----
echo.
echo Installing background rotation task...
set "TASK_NAME=Forge Wallpaper Rotation"
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1

set "PS_CMD=powershell -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -Command \"[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $m = Invoke-RestMethod '%MANIFEST_URL%'; $branded = @($m.wallpapers ^| Where-Object { $_.type -eq 'branded' }); $neutral = @($m.wallpapers ^| Where-Object { $_.type -eq 'neutral' }); $pool = if ((Get-Random -Maximum 100) -lt 60) { $branded } else { $neutral }; if (-not $pool -or $pool.Count -eq 0) { $pool = $m.wallpapers }; $c = $pool ^| Get-Random; $img = '%CACHE_DIR%\' + [System.IO.Path]::GetFileName($c.url); Invoke-WebRequest $c.url -OutFile $img -TimeoutSec 20; Add-Type -TypeDef 'using System; using System.Runtime.InteropServices; public class Wallpaper { [DllImport(\\\"user32.dll\\\", CharSet = CharSet.Auto)] public static extern int SystemParametersInfo(int uAction, int uParam, string lpvParam, int fuWinIni); }'; [Wallpaper]::SystemParametersInfo(0x0014, 0, $img, 0x0003)\""

schtasks /create /tn "%TASK_NAME%" /tr "%PS_CMD%" /sc MINUTE /mo 20 /f >nul 2>&1

if %errorlevel% equ 0 (
    echo Task installed. Wallpaper will change every 20 minutes.
) else (
    echo WARNING: Could not create scheduled task. Rotation will not happen.
)

echo.
echo =====================================
echo  Setup complete.
echo =====================================
timeout /t 3 >nul
