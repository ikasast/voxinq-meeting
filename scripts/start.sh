#!/usr/bin/env bash
# Start Voxinq: STT service (background) + web app (foreground, production build).
# Ctrl+C stops both. If a service is already running on its port, it is reused.
set -euo pipefail
cd "$(dirname "$0")/.."

CYAN=$'\033[1;36m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RESET=$'\033[0m'
step() { printf '\n%s== %s ==%s\n' "$CYAN" "$1" "$RESET"; }
ok()   { printf '  %s✔%s %s\n' "$GREEN" "$RESET" "$1"; }
warn() { printf '  %s✖%s %s\n' "$YELLOW" "$RESET" "$1"; }

port_in_use() {
  if command -v ss >/dev/null 2>&1; then ss -ltn "sport = :$1" | grep -q LISTEN
  else (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && { exec 3>&-; return 0; } || return 1
  fi
}

STT_PID=""
cleanup() {
  if [ -n "$STT_PID" ] && kill -0 "$STT_PID" 2>/dev/null; then
    echo "Stopping STT service (pid $STT_PID)…"
    kill "$STT_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

step "STT service (port 8000)"
if port_in_use 8000; then
  ok "already running — reusing it"
elif [ ! -x stt-service/.venv/bin/python ]; then
  warn "stt-service/.venv missing — run ./scripts/setup.sh first"
  exit 1
else
  (cd stt-service && exec .venv/bin/python -m uvicorn server:app --host 0.0.0.0 --port 8000) &
  STT_PID=$!
  ok "started (pid $STT_PID, logs inline below)"
fi

step "Web app (port 3000)"
if port_in_use 3000; then
  warn "port 3000 already in use — is the web app already running?"
  exit 1
fi
if [ ! -d .next ]; then
  echo "No production build found — running npm run build (first time only)…"
  npm run build
fi
ok "http://localhost:3000"
npm start
