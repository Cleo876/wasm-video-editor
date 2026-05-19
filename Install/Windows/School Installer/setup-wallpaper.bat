@echo off
setlocal enabledelayedexpansion

echo ===========================================
echo  FORGE WALLPAPER ROTATOR – Immediate Test
echo ===========================================
echo.

:: 1. Create the cache folder where images are stored
set "CACHE=%APPDATA%\ForgeWallpapers\cache"
if not exist "%CACHE%" mkdir "%CACHE%"

:: 2. Download the list of wallpapers from GitHub
echo [1/4] Downloading wallpaper list...
set "MANIFEST_URL=https://raw.githubusercontent.com/Cleo876/wasm-video-editor/refs/heads/main/Wallpaper/wallpaper-manifest.json"
curl -sL "%MANIFEST_URL%" -o "%TEMP%\manifest.json"
if not exist "%TEMP%\manifest.json" (
    echo ERROR: Could not download manifest. Check internet.
    timeout /t 10 >nul
    exit /b 1
)
echo       Done.

:: 3. Pick a random wallpaper, download it, set it as background
echo [2/4] Choosing and applying a wallpaper...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$m = Get-Content '%TEMP%\manifest.json' | ConvertFrom-Json; " + ^
    "$pool = $m.wallpapers; " + ^
    "$branded = @($pool ^| Where-Object { $_.type -eq 'branded' }); " + ^
    "$neutral = @($pool ^| Where-Object { $_.type -eq 'neutral' }); " + ^
    "$pick = if ((Get-Random -Maximum 100) -lt 60 -and $branded.Count -gt 0) { $branded ^| Get-Random } elseif ($neutral.Count -gt 0) { $neutral ^| Get-Random } else { $pool ^| Get-Random }; " + ^
    "$img = '%CACHE%\' + [System.IO.Path]::GetFileName($pick.url); " + ^
    "Write-Host ('      Downloading ' + $pick.url); " + ^
    "Invoke-WebRequest -Uri $pick.url -OutFile $img -TimeoutSec 30; " + ^
    "Add-Type -TypeDef 'using System; using System.Runtime.InteropServices; public class Wallpaper { [DllImport(\"user32.dll\", CharSet = CharSet.Auto)] public static extern int SystemParametersInfo(int uAction, int uParam, string lpvParam, int fuWinIni); }'; " + ^
    "[Wallpaper]::SystemParametersInfo(0x0014, 0, $img, 0x0003); " + ^
    "Write-Host '      Wallpaper set.'"

if %errorlevel% neq 0 (
    echo.
    echo ERROR: The wallpaper change failed. Check the messages above.
    timeout /t 10 >nul
    exit /b 1
)
echo       Wallpaper should be visible now!

:: 4. Create a scheduled task to do this every 20 minutes
echo [3/4] Installing automatic rotation (every 20 min)...
set "TASK_NAME=Forge Wallpaper Rotation"
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1

set "PS_CMD=powershell -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -Command \""[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $m = Invoke-RestMethod '%MANIFEST_URL%'; $pool = $m.wallpapers; $branded = @($pool ^| Where-Object { $_.type -eq 'branded' }); $neutral = @($pool ^| Where-Object { $_.type -eq 'neutral' }); $pick = if ((Get-Random -Maximum 100) -lt 60 -and $branded.Count -gt 0) { $branded ^| Get-Random } elseif ($neutral.Count -gt 0) { $neutral ^| Get-Random } else { $pool ^| Get-Random }; $img = '%CACHE%\' + [System.IO.Path]::GetFileName($pick.url); Invoke-WebRequest -Uri $pick.url -OutFile $img -TimeoutSec 30; Add-Type -TypeDef 'using System; using System.Runtime.InteropServices; public class Wallpaper { [DllImport(\\\"user32.dll\\\", CharSet = CharSet.Auto)] public static extern int SystemParametersInfo(int uAction, int uParam, string lpvParam, int fuWinIni); }'; [Wallpaper]::SystemParametersInfo(0x0014, 0, $img, 0x0003)\""

schtasks /create /tn "%TASK_NAME%" /tr "%PS_CMD%" /sc MINUTE /mo 20 /f >nul 2>&1

if %errorlevel% equ 0 (
    echo       Task installed successfully.
) else (
    echo       WARNING: Task could not be created. Rotation will not repeat.
)

:: 5. Done
echo [4/4] Setup complete.
echo.
echo ===========================================
echo  If you see a new wallpaper, everything works.
echo  The task will rotate it every 20 minutes.
echo ===========================================
timeout /t 5 >nul
