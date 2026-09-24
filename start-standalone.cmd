@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-standalone.ps1" %*
if errorlevel 1 (
    echo.
    echo Startup failed. Read the message above, then press any key to close this window.
    pause >nul
)
