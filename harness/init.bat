@echo off
setlocal enabledelayedexpansion

set "ROOT_DIR=%~dp0.."
for %%I in ("%ROOT_DIR%") do set "ROOT_DIR=%%~fI"
set "BACKEND_DIR=%ROOT_DIR%\backend"
set "FRONTEND_DIR=%ROOT_DIR%\frontend"

echo [harness:init] Root: %ROOT_DIR%

set "HAS_WARN=0"

where python >nul 2>nul
if errorlevel 1 (
  echo [warn] Python missing in PATH
  set "HAS_WARN=1"
) else (
  echo [ok] Python found
)

where node >nul 2>nul
if errorlevel 1 (
  echo [warn] Node.js missing in PATH
  set "HAS_WARN=1"
) else (
  echo [ok] Node.js found
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [warn] npm missing in PATH
  set "HAS_WARN=1"
) else (
  echo [ok] npm found
)

if exist "%BACKEND_DIR%\requirements.txt" (
  echo [ok] Backend requirements exists
) else (
  echo [warn] Missing backend\requirements.txt
  set "HAS_WARN=1"
)

if exist "%FRONTEND_DIR%\package.json" (
  echo [ok] Frontend package.json exists
) else (
  echo [warn] Missing frontend\package.json
  set "HAS_WARN=1"
)

if exist "%BACKEND_DIR%\.venv" (
  echo [ok] Backend virtualenv exists
) else (
  echo [warn] Backend virtualenv missing: %BACKEND_DIR%\.venv
  echo        Setup: cd backend ^&^& python -m venv .venv ^&^& .venv\Scripts\activate ^&^& pip install -r requirements.txt
  set "HAS_WARN=1"
)

if exist "%FRONTEND_DIR%\node_modules" (
  echo [ok] Frontend node_modules exists
) else (
  echo [warn] Frontend node_modules missing: %FRONTEND_DIR%\node_modules
  echo        Setup: cd frontend ^&^& npm install
  set "HAS_WARN=1"
)

echo.
echo Startup guidance:
echo - Backend: cd backend ^&^& start-backend.bat    ^(or: python main.py^)
echo - Frontend: cd frontend ^&^& start-frontend.bat ^(or: npm run dev^)
echo.

if "%HAS_WARN%"=="0" (
  echo [harness:init] Environment check passed.
  exit /b 0
)

echo [harness:init] Environment check finished with warnings.
exit /b 1
