@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo =============================================
echo   Appofasistis — Starting Worker
echo =============================================
echo.

:: Check node_modules exists
if not exist "node_modules" (
    echo [ERROR] Dependencies are not installed.
    echo.
    echo Please double-click install.bat first, then try again.
    echo.
    pause
    exit /b 1
)

:: Check .env exists
if not exist ".env" (
    echo [ERROR] Configuration file .env not found.
    echo.
    echo Please double-click install.bat first, then try again.
    echo.
    pause
    exit /b 1
)

echo [OK] All checks passed. Starting worker...
echo.
echo Press Ctrl+C to stop.
echo.

npm start

echo.
echo =============================================
echo   Worker stopped.
echo =============================================
echo.
pause
