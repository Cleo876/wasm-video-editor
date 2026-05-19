# Forge Wallpaper Rotator – Immediate & Verbose Edition
# Forces TLS 1.2, downloads images right away, sets wallpaper instantly, then loops every 20-25 min.

$ErrorActionPreference = "Continue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$logFile = "$env:TEMP\ForgeWallpaper.log"
function Log($msg) {
    "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg" | Add-Content $logFile
    Write-Host $msg  # Visible if run from a console
}

Log "Rotator started (TLS 1.2 enabled)."

# ---- Singleton guard ----
$mutex = New-Object System.Threading.Mutex($false, "Global\ForgeWallpaperRotator")
if (-not $mutex.WaitOne(0, $false)) {
    Log "Another instance already running. Exiting."
    exit
}
$host.UI.RawUI.WindowTitle = "Forge Wallpaper Rotator"

# ---- Configuration ----
$manifestUrl   = "https://raw.githubusercontent.com/Cleo876/wasm-video-editor/refs/heads/main/Wallpaper/wallpaper-manifest.json"
$cacheDir      = "$env:APPDATA\ForgeWallpapers\cache"
$manifestCache = "$env:APPDATA\ForgeWallpapers\manifest.json"
$brandedRatio  = 0.6

if (-not (Test-Path $cacheDir)) {
    New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null
    Log "Created cache directory: $cacheDir"
}

# ---- Helpers ----
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

function Stop-BingWallpaper {
    $names = @("BingWallpaperApp","BingWallpaper","Microsoft.BingWallpaper","BingDesktop","BingWallpaperTray")
    foreach ($n in $names) {
        Get-Process -Name $n -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    }
    Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*BingWallpaper*" } | Stop-Process -Force -ErrorAction SilentlyContinue
    Log "Bing processes terminated."
}

function Get-Manifest {
    try {
        $m = Invoke-RestMethod -Uri $manifestUrl -TimeoutSec 10
        $m | ConvertTo-Json | Set-Content $manifestCache -Force
        Log "Manifest fetched from URL."
        return $m
    } catch {
        Log "ERROR fetching manifest: $_"
        if (Test-Path $manifestCache) {
            Log "Falling back to cached manifest."
            return Get-Content $manifestCache | ConvertFrom-Json
        }
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
        try {
            Invoke-WebRequest -Uri $url -OutFile $local -TimeoutSec 15
            Log "Downloaded: $url"
        } catch {
            Log "FAILED to download $url : $_"
            return $null
        }
    }
    return $local
}

function Set-Wallpaper($imagePath) {
    Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Wallpaper {
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int SystemParametersInfo(int uAction, int uParam, string lpvParam, int fuWinIni);
}
"@
    [Wallpaper]::SystemParametersInfo(0x0014, 0, $imagePath, 0x0003)
    Log "Wallpaper set to: $imagePath"
}

# ---- Initialization ----
Disable-Slideshow
Stop-BingWallpaper

# ---- IMMEDIATE wallpaper change ----
Log "Attempting first wallpaper change..."
$manifest = Get-Manifest
if ($manifest) {
    $choice = Get-RandomWallpaper $manifest
    if ($choice) {
        $img = Get-LocalImage $choice.url
        if ($img) {
            Set-Wallpaper $img
            Log "First wallpaper change SUCCESS."
        } else {
            Log "First wallpaper change FAILED: image download error."
        }
    } else {
        Log "First wallpaper change FAILED: no wallpaper chosen from manifest."
    }
} else {
    Log "First wallpaper change FAILED: manifest unavailable."
}

# ---- Main loop ----
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
