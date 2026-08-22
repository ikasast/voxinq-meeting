#!/usr/bin/env bash
# One-shot Voxinq setup (Linux/macOS). Idempotent — safe to re-run.
#
#   ./scripts/setup.sh                # web app + DB schema + STT venv + Ollama model
#   ./scripts/setup.sh --diarization  # also build the diarization venv (adds pyannote if an NVIDIA GPU is present)
set -euo pipefail
cd "$(dirname "$0")/.."

CYAN=$'\033[1;36m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; RESET=$'\033[0m'
step() { printf '\n%s== %s ==%s\n' "$CYAN" "$1" "$RESET"; }
ok()   { printf '  %s✔%s %s\n' "$GREEN" "$RESET" "$1"; }
warn() { printf '  %s✖%s %s\n' "$YELLOW" "$RESET" "$1"; }
fail() { printf '  %s✖ %s%s\n' "$RED" "$1" "$RESET"; }

WITH_DIARIZATION=0
for arg in "$@"; do
  [ "$arg" = "--diarization" ] && WITH_DIARIZATION=1
done

PY=python3
command -v python3 >/dev/null 2>&1 || PY=python

step "Checking prerequisites"
MISSING=0
if command -v node >/dev/null 2>&1; then ok "node $(node --version)"; else fail "node not found — install Node.js 20+ (https://nodejs.org)"; MISSING=1; fi
if command -v "$PY" >/dev/null 2>&1; then ok "$PY $("$PY" --version 2>&1 | cut -d' ' -f2)"; else fail "python not found — install Python 3.11"; MISSING=1; fi
if command -v psql >/dev/null 2>&1; then ok "psql $(psql --version | awk '{print $3}')"; else warn "psql not found — fine if PostgreSQL runs elsewhere (DATABASE_URL just needs to reach it)"; fi
if command -v ollama >/dev/null 2>&1; then ok "ollama"; else warn "ollama not found — install from https://ollama.com (or use another LLM provider in Settings)"; fi
if command -v nvidia-smi >/dev/null 2>&1; then ok "NVIDIA GPU: $(nvidia-smi --query-gpu=name --format=csv,noheader | head -1)"; else warn "nvidia-smi not found — Whisper will fall back to CPU (slow)"; fi
[ "$MISSING" -eq 1 ] && { fail "Install the missing prerequisites above, then re-run."; exit 1; }

step "Installing web app dependencies (npm install)"
npm install

step "Environment file (.env)"
if [ -f .env ]; then
  ok ".env already exists — leaving it untouched"
else
  cp .env.example .env
  ok "created .env from .env.example"
  printf '  Enter your PostgreSQL connection string\n  [postgresql://voxinq:PASSWORD@localhost:5432/voxinq]: '
  if [ -t 0 ]; then read -r DBURL; else DBURL=""; fi
  if [ -n "${DBURL:-}" ]; then
    # replace the DATABASE_URL line with the answer
    tmp=$(mktemp); awk -v url="$DBURL" '/^DATABASE_URL=/{print "DATABASE_URL=\"" url "\""; next} {print}' .env > "$tmp" && mv "$tmp" .env
    ok "DATABASE_URL set"
  else
    warn "kept the example DATABASE_URL — edit .env before the next step if it is wrong"
  fi
fi

step "Database schema (prisma migrate deploy)"
npx prisma migrate deploy

step "STT service venv (stt-service/.venv)"
if [ -x stt-service/.venv/bin/python ]; then
  ok "venv already exists"
else
  "$PY" -m venv stt-service/.venv
  ok "venv created"
fi
stt-service/.venv/bin/pip install -q -r stt-service/requirements.txt
ok "STT dependencies installed"

if [ "$WITH_DIARIZATION" -eq 1 ]; then
  step "Diarization venv (diarization/.venv, ONNX Runtime)"
  if [ -x diarization/.venv/bin/python ]; then
    ok "venv already exists"
  else
    "$PY" -m venv diarization/.venv
    ok "venv created"
  fi
  diarization/.venv/bin/pip install -q -r diarization/requirements.txt
  diarization/.venv/bin/python diarization/fetch_models.py
  ok "diarization dependencies and models installed"

  # On an NVIDIA machine, add the pyannote backend too: it is markedly more accurate on long
  # meetings and is what diarize.py picks when CUDA is there. Several gigabytes, so it is not
  # installed anywhere it would never be selected.
  if command -v nvidia-smi >/dev/null 2>&1; then
    step "pyannote backend (NVIDIA GPU detected)"
    diarization/.venv/bin/pip install -q torch torchaudio torchcodec \
      --index-url https://download.pytorch.org/whl/cu128
    diarization/.venv/bin/pip install -q -r diarization/requirements-pyannote.txt
    ok "pyannote installed — set HF_TOKEN before the first Diarize (see docs/setup.md)"
  fi
fi

step "Default LLM model (ollama pull)"
if command -v ollama >/dev/null 2>&1; then
  ollama pull qwen2.5:7b-instruct
  ok "qwen2.5:7b-instruct ready"
else
  warn "skipped — ollama not installed"
fi

step "Done"
echo "Start everything with:  ./scripts/start.sh"
