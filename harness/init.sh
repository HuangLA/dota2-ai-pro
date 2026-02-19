#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

echo "[harness:init] Root: $ROOT_DIR"

ok=true

check_cmd() {
  local cmd="$1"
  local label="$2"
  if command -v "$cmd" >/dev/null 2>&1; then
    echo "[ok] $label found: $cmd"
  else
    echo "[warn] $label missing: $cmd"
    ok=false
  fi
}

check_path() {
  local path="$1"
  local label="$2"
  if [ -e "$path" ]; then
    echo "[ok] $label exists: $path"
  else
    echo "[warn] $label missing: $path"
    ok=false
  fi
}

check_cmd python "Python"
check_cmd node "Node.js"
check_cmd npm "npm"

check_path "$BACKEND_DIR/requirements.txt" "Backend requirements"
check_path "$FRONTEND_DIR/package.json" "Frontend package definition"

if [ -d "$BACKEND_DIR/.venv" ]; then
  echo "[ok] Backend virtualenv exists: $BACKEND_DIR/.venv"
else
  echo "[warn] Backend virtualenv missing: $BACKEND_DIR/.venv"
  echo "       Setup: cd backend && python -m venv .venv && . .venv/Scripts/activate && pip install -r requirements.txt"
  ok=false
fi

if [ -d "$FRONTEND_DIR/node_modules" ]; then
  echo "[ok] Frontend node_modules exists: $FRONTEND_DIR/node_modules"
else
  echo "[warn] Frontend node_modules missing: $FRONTEND_DIR/node_modules"
  echo "       Setup: cd frontend && npm install"
  ok=false
fi

echo
echo "Startup guidance:"
echo "- Backend: cd backend && ./start-backend.sh   (or: python main.py)"
echo "- Frontend: cd frontend && ./start-frontend.sh (or: npm run dev)"
echo

if [ "$ok" = true ]; then
  echo "[harness:init] Environment check passed."
  exit 0
fi

echo "[harness:init] Environment check finished with warnings."
exit 1
