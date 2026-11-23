@echo off
setlocal
cd /d "%~dp0"
title Appofasistis - Local Laws
echo =============================================
echo   Appofasistis - Local Greek Laws
echo =============================================
echo.
where node >nul 2>&1
if errorlevel 1 goto missing_node
node -e "if (Number(process.versions.node.split('.')[0]) < 24) { console.error('Node.js 24 or newer is required.'); process.exit(1); }"
if errorlevel 1 goto failed
if not exist "node_modules\neo4j-driver\package.json" goto missing_dependencies
echo Starting... Keep this window open while using the app.
echo.
node scripts/start-local.js
set "APP_EXIT_CODE=%ERRORLEVEL%"
if not "%APP_EXIT_CODE%"=="0" goto failed
goto finished
:missing_node
echo [ERROR] Node.js was not found. Install Node.js 24 or newer.
goto failed
:missing_dependencies
echo [ERROR] Dependencies are missing. Run install.bat first.
:failed
echo.
echo [ERROR] Appofasistis could not start. Read the message above.
echo Database startup details are in data\neo4j-launcher.log.
:finished
echo.
echo Press any key to close this launcher.
pause >nul
endlocal
