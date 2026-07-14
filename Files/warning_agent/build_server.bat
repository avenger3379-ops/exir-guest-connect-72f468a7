@echo off
echo ==========================================
echo   Building Warning Server
echo ==========================================
echo.

python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed!
    pause
    exit /b 1
)

echo [1/2] Installing requirements...
pip install websockets pyinstaller

echo.
echo [2/2] Building exe...
pyinstaller --onefile --name WarningServer server.py

echo.
echo ==========================================
if exist "dist\WarningServer.exe" (
    echo   Build Successful!
    echo   Output: dist\WarningServer.exe
) else (
    echo   Build Failed!
)
echo ==========================================
pause