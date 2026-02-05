@echo off
REM True Sight - Frontend Startup Script (Windows)

echo ========================================
echo True Sight Frontend Starting...
echo ========================================
echo.

REM Check if in correct directory
if not exist "package.json" (
    echo ERROR: Please run this script in frontend directory
    pause
    exit /b 1
)

REM Check node_modules
if not exist "node_modules" (
    echo WARNING: node_modules not found, installing dependencies...
    call npm install
) else (
    echo Found node_modules
)

echo.
echo ========================================
echo Ready
echo ========================================
echo.
echo Frontend will run on: http://localhost:5173
echo.
echo Press Ctrl+C to stop server
echo.
echo ========================================
echo.

REM Start development server
call npm run dev
