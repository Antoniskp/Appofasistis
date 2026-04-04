@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo =============================================
echo   Appofasistis — Windows Setup
echo =============================================
echo.

:: Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed.
    echo.
    echo Please download and install Node.js from:
    echo   https://nodejs.org
    echo.
    echo Make sure to check "Add to PATH" during installation,
    echo then run this script again.
    echo.
    pause
    exit /b 1
)

:: Get Node.js major version
for /f "tokens=1 delims=." %%v in ('node --version') do (
    set "NODE_MAJOR=%%v"
)
:: Strip the leading 'v'
set "NODE_MAJOR=%NODE_MAJOR:~1%"

if %NODE_MAJOR% LSS 18 (
    echo [ERROR] Your Node.js version is too old.
    echo.
    echo Appofasistis requires Node.js 18 or newer.
    echo Please update from: https://nodejs.org
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js found (version %NODE_MAJOR%.x)
echo.

:: Install dependencies
echo Installing dependencies...
echo.
npm install
if errorlevel 1 (
    echo.
    echo [ERROR] npm install failed. Check the output above for details.
    echo.
    pause
    exit /b 1
)

echo.
echo [OK] Dependencies installed.
echo.

:: Set up .env
if not exist ".env" (
    copy ".env.example" ".env" >nul
    echo [OK] Created .env from .env.example
    echo.
    echo =============================================
    echo   ACTION REQUIRED: Edit .env
    echo =============================================
    echo.
    echo Open .env in Notepad and fill in:
    echo   SERVER_URL   — your Appofa server WebSocket URL
    echo   WORKER_TOKEN — your token from the Appofa admin panel
    echo.
) else (
    echo [OK] .env already exists — config is already set up.
    echo.
)

echo =============================================
echo   Setup complete!
echo   Double-click start.bat to run the worker.
echo =============================================
echo.
pause
