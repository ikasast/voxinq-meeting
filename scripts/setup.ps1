# One-shot Voxinq setup (Windows). Idempotent — safe to re-run.
#
#   .\scripts\setup.ps1                 # web app + DB schema + STT venv + Ollama model
#   .\scripts\setup.ps1 -Diarization    # also build the diarization venv (GPU torch)
param(
  [switch]$Diarization
)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

function Step($msg) { Write-Host "`n== $msg ==" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "  [--] $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host "  [NG] $msg" -ForegroundColor Red }

function Have($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

Step "Checking prerequisites"
$missing = $false
if (Have node)   { Ok ("node " + (node --version)) } else { Fail "node not found - install Node.js 20+ (https://nodejs.org)"; $missing = $true }
if (Have python) { Ok ("python " + (python --version).Split(" ")[1]) } else { Fail "python not found - install Python 3.11"; $missing = $true }
if (Have psql)   { Ok ("psql " + (psql --version).Split(" ")[2]) } else { Warn "psql not found - fine if PostgreSQL runs elsewhere (DATABASE_URL just needs to reach it)" }
if (Have ollama) { Ok "ollama" } else { Warn "ollama not found - install from https://ollama.com (or use another LLM provider in Settings)" }
if (Have nvidia-smi) { Ok ("NVIDIA GPU: " + (nvidia-smi --query-gpu=name --format=csv,noheader | Select-Object -First 1)) } else { Warn "nvidia-smi not found - Whisper will fall back to CPU (slow)" }
if ($missing) { Fail "Install the missing prerequisites above, then re-run."; exit 1 }

Step "Installing web app dependencies (npm install)"
npm install
if ($LASTEXITCODE -ne 0) { exit 1 }

Step "Environment file (.env)"
if (Test-Path .env) {
  Ok ".env already exists - leaving it untouched"
} else {
  Copy-Item .env.example .env
  Ok "created .env from .env.example"
  $dburl = Read-Host "  Enter your PostgreSQL connection string`n  [postgresql://voxinq:PASSWORD@localhost:5432/voxinq]"
  if ($dburl) {
    $lines = Get-Content .env | ForEach-Object {
      if ($_ -match '^DATABASE_URL=') { "DATABASE_URL=`"$dburl`"" } else { $_ }
    }
    Set-Content .env $lines
    Ok "DATABASE_URL set"
  } else {
    Warn "kept the example DATABASE_URL - edit .env before the next step if it is wrong"
  }
}

Step "Database schema (prisma db push)"
npx prisma db push
if ($LASTEXITCODE -ne 0) { exit 1 }

Step "STT service venv (stt-service\.venv)"
$sttPy = "stt-service\.venv\Scripts\python.exe"
if (Test-Path $sttPy) {
  Ok "venv already exists"
} else {
  python -m venv stt-service\.venv
  Ok "venv created"
}
& $sttPy -m pip install -q -r stt-service\requirements.txt
if ($LASTEXITCODE -ne 0) { exit 1 }
Ok "STT dependencies installed"

if ($Diarization) {
  Step "Diarization venv (diarization\.venv, GPU torch)"
  $diaPy = "diarization\.venv\Scripts\python.exe"
  if (Test-Path $diaPy) {
    Ok "venv already exists"
  } else {
    python -m venv diarization\.venv
    Ok "venv created"
  }
  & $diaPy -m pip install -q torch torchaudio --index-url https://download.pytorch.org/whl/cu128
  if ($LASTEXITCODE -ne 0) { exit 1 }
  & $diaPy -m pip install -q -r diarization\requirements.txt
  if ($LASTEXITCODE -ne 0) { exit 1 }
  Ok "diarization dependencies installed"
  Warn "remember: set HF_TOKEN and accept the pyannote model terms on Hugging Face (see docs/setup.md)"
}

Step "Default LLM model (ollama pull)"
if (Have ollama) {
  ollama pull qwen2.5:7b-instruct
  Ok "qwen2.5:7b-instruct ready"
} else {
  Warn "skipped - ollama not installed"
}

Step "Done"
Write-Host "Start everything with:  .\scripts\start.ps1"
