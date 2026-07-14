@echo off
echo ==========================================
echo   Building Warning Client
echo ==========================================
echo.

python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed!
    pause
    exit /b 1
)

echo [1/2] Installing requirements...
pip install customtkinter websockets pillow PySide6 pystray pyinstaller

echo.
echo [2/2] Building exe...
pyinstaller --onefile --noconsole --name Warningclient ^
    --add-data "assets;assets" ^
    --collect-all customtkinter ^
    --collect-all pystray ^
    agent.py

echo.
echo ==========================================
if exist "dist\Warningclient.exe" (
    echo   Build Successful!
    echo   Output: dist\Warningclient.exe
    echo   NOTE: copy the "assets" folder next to Warningclient.exe too
    echo   (same as WarningServer.exe already does^) so the background
    echo   image loads even if --add-data bundling misses an edge case.
) else (
    echo   Build Failed!
)
echo ==========================================
pause
