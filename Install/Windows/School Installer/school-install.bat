# Forge Wallpaper Rotator – Bing Wallpaper Edition
# Kills Bing Wallpaper, disables slideshow, sets wallpaper, repeats every 20‑25 min.

$ErrorActionPreference = "SilentlyContinue"

# ---- Singleton guard ----
$mutex = New-Object System.Threading.Mutex($false, "Global\ForgeWallpaperRotator")
if (-not $mutex.WaitOne(0, $false)) { exit }
$host.UI.RawUI.WindowTitle = "Forge Wallpaper Rotator"

$manifestUrl = "https://raw.githubusercontent.com/Cleo876/wasm-video-editor/refs/heads/main/Wallpaper/wallpaper-manifest.json"
$cacheDir = "$env:APPDATA\ForgeWallpapers\cache"
$manifestCache = "$env:APPDATA\ForgeWallpapers\manifest.json"
$brandedRatio = 0.6

if (-not (Test-Path $cacheDir)) { New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null }

# ---- One‑time: disable Windows Slideshow / Spotlight ----
function Disable-Slideshow {
    $wallpaperReg = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Wallpapers"
    $desktopReg   = "HKCU:\Control Panel\Desktop"
    if (-not (Test-Path $wallpaperReg)) { New-Item -Path $wallpaperReg -Force | Out-Null }
    Set-ItemProperty -Path $wallpaperReg -Name BackgroundType -Value 0 -Force
    Set-ItemProperty -Path $desktopReg   -Name SlideshowFolderPath -Value "" -Force
    Set-ItemProperty -Path $desktopReg   -Name WallpaperStyle -Value "10" -Force
    Set-ItemProperty -Path $desktopReg   -Name TileWallpaper -Value "0" -Force
}

# ---- Kill Bing Wallpaper process ----
function Stop-BingWallpaper {
    Get-Process -Name "BingWallpaperApp" -ErrorAction SilentlyContinue | Stop-Process -Force
    Get-Process -Name "BingWallpaper"   -ErrorAction SilentlyContinue | Stop-Process -Force
}

# ---- Manifest & image helpers ----
function Get-Manifest {
    try {
        $m = Invoke-RestMethod -Uri $manifestUrl -TimeoutSec 10
        $m | ConvertTo-Json | Set-Content $manifestCache -Force
        return $m
    } catch {
        if (Test-Path $manifestCache) {
            return Get-Content $manifestCache | ConvertFrom-Json
        }
        Write-Output "Wallpaper Rotator: No internet and no cached manifest."
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
        try { Invoke-WebRequest -Uri $url -OutFile $local -TimeoutSec 15 } catch { return $null }
    }
    return $local
}

# ---- One‑time disable ----
Disable-Slideshow

# ---- Main loop ----
Write-Output "Forge Wallpaper Rotator started."
while ($true) {
    Stop-BingWallpaper

    $manifest = Get-Manifest
    $choice = Get-RandomWallpaper $manifest
    if ($choice) {
        $imagePath = Get-LocalImage $choice.url
        if ($imagePath) {
            Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Wallpaper {
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int SystemParametersInfo(int uAction, int uParam, string lpvParam, int fuWinIni);
}
"@
            [Wallpaper]::SystemParametersInfo(0x0014, 0, $imagePath, 0x0003)
        }
    }

    $sleepSeconds = Get-Random -Minimum 1200 -Maximum 1501
    Start-Sleep -Seconds $sleepSeconds
}
