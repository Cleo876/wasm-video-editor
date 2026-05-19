# Forge Wallpaper Rotator – Bing Wallpaper Exterminator
$ErrorActionPreference = "Continue"
$logFile = "$env:TEMP\ForgeWallpaper.log"
function Log($msg) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg" | Add-Content $logFile }

# Singleton guard – prevent multiple copies
$mutex = New-Object System.Threading.Mutex($false, "Global\ForgeWallpaperRotator")
if (-not $mutex.WaitOne(0, $false)) { exit }
$host.UI.RawUI.WindowTitle = "Forge Wallpaper Rotator"
Log "Rotator started."

# ──────────────────────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────────────────────
$manifestUrl   = "https://raw.githubusercontent.com/Cleo876/wasm-video-editor/refs/heads/main/Wallpaper/wallpaper-manifest.json"
$cacheDir      = "$env:APPDATA\ForgeWallpapers\cache"
$manifestCache = "$env:APPDATA\ForgeWallpapers\manifest.json"
$brandedRatio  = 0.6

if (-not (Test-Path $cacheDir)) { New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null }

# ──────────────────────────────────────────────────────────
# Kill Bing Wallpaper – exhaustive search
# ──────────────────────────────────────────────────────────
function Stop-BingWallpaper {
    # Kill by known process names
    $names = @("BingWallpaperApp", "BingWallpaper", "Microsoft.BingWallpaper", "BingDesktop", "BingWallpaperTray")
    foreach ($n in $names) {
        Get-Process -Name $n -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    }

    # Kill any process whose path contains "BingWallpaper"
    Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*BingWallpaper*" } | Stop-Process -Force -ErrorAction SilentlyContinue

    Log "Bing processes terminated."
}

# ──────────────────────────────────────────────────────────
# Disable Windows Slideshow / Spotlight
# ──────────────────────────────────────────────────────────
function Disable-Slideshow {
    $wallpaperReg = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Wallpapers"
    $desktopReg   = "HKCU:\Control Panel\Desktop"
    if (-not (Test-Path $wallpaperReg)) { New-Item -Path $wallpaperReg -Force | Out-Null }
    Set-ItemProperty -Path $wallpaperReg -Name BackgroundType -Value 0 -Force
    Set-ItemProperty -Path $desktopReg   -Name SlideshowFolderPath -Value "" -Force
    Set-ItemProperty -Path $desktopReg   -Name WallpaperStyle -Value "10" -Force
    Set-ItemProperty -Path $desktopReg   -Name TileWallpaper -Value "0" -Force
    Log "Slideshow disabled."
}

# ──────────────────────────────────────────────────────────
# Manifest & image helpers
# ──────────────────────────────────────────────────────────
function Get-Manifest {
    try {
        $m = Invoke-RestMethod -Uri $manifestUrl -TimeoutSec 10
        $m | ConvertTo-Json | Set-Content $manifestCache -Force
        Log "Manifest fetched."
        return $m
    } catch {
        if (Test-Path $manifestCache) {
            Log "Using cached manifest."
            return Get-Content $manifestCache | ConvertFrom-Json
        }
        Log "No manifest available."
        return $null
    }
}

function Get-RandomWallpaper($manifest) {
    if (-not $manifest -or -not $manifest.wallpapers) { return $null }
    $wallpapers = $manifest.wallpapers
    $branded = @($wallpapers | Where-Object { $_.type -eq "branded" })
    $neutral = @($wallpapers | Where-Object { $_.type -eq "neutral" })
    $pool = if ((Get-Random -Maximum 100) -lt ($brandedRatio * 100)) { $branded } else { $neutral }
    if (-not $pool -or $pool.Count -eq 0) { $pool = $wallpapers }
    return $pool | Get-Random
}

function Get-LocalImage($url) {
    $name = Split-Path $url -Leaf
    $local = Join-Path $cacheDir $name
    if (-not (Test-Path $local)) {
        try { Invoke-WebRequest -Uri $url -OutFile $local -TimeoutSec 15 } catch { Log "Download failed: $url"; return $null }
    }
    return $local
}

# ──────────────────────────────────────────────────────────
# Apply wallpaper (reusable function)
# ──────────────────────────────────────────────────────────
function Set-Wallpaper($imagePath) {
    Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Wallpaper {
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int SystemParametersInfo(int uAction, int uParam, string lpvParam, int fuWinIni);
}
"@
    # 0x0014 = SPI_SETDESKWALLPAPER, 0x0003 = SPIF_UPDATEINIFILE | SPIF_SENDCHANGE
    [Wallpaper]::SystemParametersInfo(0x0014, 0, $imagePath, 0x0003)
    Log "Wallpaper set to $imagePath"
}

# ──────────────────────────────────────────────────────────
# Initialization
# ──────────────────────────────────────────────────────────
Disable-Slideshow
Stop-BingWallpaper

# Immediate wallpaper change
$manifest = Get-Manifest
$choice = Get-RandomWallpaper $manifest
if ($choice) {
    $img = Get-LocalImage $choice.url
    if ($img) { Set-Wallpaper $img }
}

# ──────────────────────────────────────────────────────────
# Main loop (every 20‑25 min)
# ──────────────────────────────────────────────────────────
while ($true) {
    Stop-BingWallpaper
    $manifest = Get-Manifest
    $choice = Get-RandomWallpaper $manifest
    if ($choice) {
        $img = Get-LocalImage $choice.url
        if ($img) { Set-Wallpaper $img }
    }
    $sleepSeconds = Get-Random -Minimum 1200 -Maximum 1501
    Start-Sleep -Seconds $sleepSeconds
}
