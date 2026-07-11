# Start Voxinq: STT service (background) + web app (foreground, production build).
# Ctrl+C stops the web app; the STT process started here is stopped on exit.
# If a service is already running on its port, it is reused.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

function Step($msg) { Write-Host "`n== $msg ==" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "  [--] $msg" -ForegroundColor Yellow }

function PortInUse($port) {
  return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

$sttProc = $null
try {
  Step "STT service (port 8000)"
  if (PortInUse 8000) {
    Ok "already running - reusing it"
  } elseif (-not (Test-Path "stt-service\.venv\Scripts\python.exe")) {
    Warn "stt-service\.venv missing - run .\scripts\setup.ps1 first"
    exit 1
  } else {
    $sttProc = Start-Process -FilePath "stt-service\.venv\Scripts\python.exe" `
      -ArgumentList "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000" `
      -WorkingDirectory "stt-service" -PassThru -WindowStyle Hidden `
      -RedirectStandardOutput "stt-service\stt.log" -RedirectStandardError "stt-service\stt.err.log"
    Ok "started (pid $($sttProc.Id), logs: stt-service\stt.log)"
  }

  Step "Web app (port 3000)"
  if (PortInUse 3000) {
    Warn "port 3000 already in use - is the web app already running?"
    exit 1
  }
  if (-not (Test-Path ".next")) {
    Write-Host "No production build found - running npm run build (first time only)..."
    npm run build
    if ($LASTEXITCODE -ne 0) { exit 1 }
  }
  Ok "http://localhost:3000"
  npm start
} finally {
  if ($sttProc -and -not $sttProc.HasExited) {
    Write-Host "Stopping STT service (pid $($sttProc.Id))..."
    Stop-Process -Id $sttProc.Id -Force -ErrorAction SilentlyContinue
  }
}
