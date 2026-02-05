@echo off
REM True Sight - Backend Startup Script (Windows)

echo ========================================
echo True Sight Backend Starting...
echo ========================================
echo.

REM Check if in correct directory
if not exist "main.py" (
    echo ERROR: Please run this script in backend directory
    pause
    exit /b 1
)

REM Check Python virtual environment
if exist ".venv\Scripts\activate.bat" (
    echo Found virtual environment, activating...
    call .venv\Scripts\activate.bat
) else (
    echo WARNING: No virtual environment found, using system Python
    echo.
)

REM Create necessary directories
echo Checking data directories...
if not exist "..\data\database" mkdir "..\data\database"
if not exist "..\data\parquet" mkdir "..\data\parquet"
if not exist "..\data\replays" mkdir "..\data\replays"

echo.
echo ========================================
echo Ready
echo ========================================
echo.
echo Backend will run on: http://localhost:8000
echo API Documentation: http://localhost:8000/docs
echo.
echo Press Ctrl+C to stop server
echo.
echo ========================================
echo.

REM Start server
python main.py
