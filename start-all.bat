@echo off
REM True Sight - One-Click Startup Script (Windows)

echo ========================================
echo   True Sight - Dota 2 Replay Analyzer
echo ========================================
echo.
echo Starting frontend and backend...
echo.

REM Start Backend (new window)
echo [1/2] Starting Backend Server...
start "True Sight Backend" cmd /k "cd /d %~dp0backend && start-backend.bat"

REM Wait 3 seconds
timeout /t 3 /nobreak >nul

REM Start Frontend (new window)
echo [2/2] Starting Frontend Dev Server...
start "True Sight Frontend" cmd /k "cd /d %~dp0frontend && start-frontend.bat"

echo.
echo ========================================
echo Startup Complete
echo ========================================
echo.
echo Backend: http://localhost:8000
echo Frontend: http://localhost:5173
echo API Docs: http://localhost:8000/docs
echo.
echo Two new windows opened.
echo Close windows to stop servers.
echo.
echo ========================================
echo.
pause
