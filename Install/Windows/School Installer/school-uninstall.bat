@echo off
echo ----------------------------------------
echo Forge: WASM Video Editor - School Uninstaller
echo ----------------------------------------
echo This will remove:
echo   - Desktop shortcut: WASM Video Editor
echo   - Desktop shortcut: SAFEMODE WASM Video Editor
echo   - Wallpaper rotation tasks (if installed)
echo.
set /p "confirm=Continue? (Y/N): "
if /i not "%confirm:~0,1%"=="Y" (
    echo Uninstall cancelled.
    timeout /t 2 >nul
    exit /b
)

:: Remove desktop shortcuts
del /f /q "%USERPROFILE%\Desktop\WASM Video Editor.lnk" 2>nul
del /f /q "%USERPROFILE%\Desktop\SAFEMODE WASM Video Editor.lnk" 2>nul
echo Shortcuts removed.

:: Stop wallpaper rotation
schtasks /delete /tn "Forge Wallpaper Rotation" /f >nul 2>&1
taskkill /f /im powershell.exe /fi "WINDOWTITLE eq Forge Wallpaper Rotator*" >nul 2>&1
echo Wallpaper rotation stopped.

:: Optional: delete sandboxed browser data
set /p "clean=Do you also want to delete the shared sandboxed browser data (IndexedDB, cache, settings)? (Y/N): "
if /i "%clean:~0,1%"=="Y" (
    rd /s /q "%LocalAppData%\WASMEditor" 2>nul
    echo Sandboxed data folder deleted.
) else (
    echo Data folder kept. You can manually delete it at:
    echo   %LocalAppData%\WASMEditor
)

echo.
echo ========================================
echo Uninstall complete.
echo To also remove icons and scripts, delete this entire folder.
echo Closing in 2 seconds...
timeout /t 2 >nul
