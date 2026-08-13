# Complete Voxinq export: everything needed to rebuild this instance elsewhere.
#
# The nightly backup (backup-db.ps1) covers the database only. Restoring from that alone
# loses every recording, which takes playback, re-transcription, diarization and voiceprint
# enrolment with it — so this bundles the three places state actually lives:
#
#   1. PostgreSQL  — meetings, transcripts, minutes, series, tags, voice profiles
#   2. recordings/ — the meeting WAVs plus the utterance boundaries diarization maps onto
#   3. settings.json / .env — models, glossary, API keys, DB credentials
#
# Usage:
#   .\scripts\windows\export-all.ps1
#   .\scripts\windows\export-all.ps1 -Repo C:\path\to\voxinq -OutDir D:\somewhere
#
# The result CONTAINS SECRETS (API keys, the database password) and the full text of every
# meeting. Treat it like the database itself: keep it local, or encrypt it before it moves.
param(
  [string]$Repo = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)),
  [string]$OutDir = "$HOME\voxinq-backups",
  [string]$PgDump = "$HOME\pgsql\bin\pg_dump.exe",
  # Skip the audio. Much smaller, but a restore cannot play, re-transcribe or diarize anything.
  [switch]$NoRecordings
)
$ErrorActionPreference = "Stop"

function Fail($msg) { Write-Error $msg; exit 1 }

if (-not (Test-Path (Join-Path $Repo "package.json"))) { Fail "Not a Voxinq checkout: $Repo" }
if (-not (Test-Path $PgDump)) { Fail "pg_dump not found at $PgDump (pass -PgDump)" }

$envFile = Join-Path $Repo ".env"
if (-not (Test-Path $envFile)) { Fail "No .env in $Repo — cannot find DATABASE_URL" }
$envLine = Select-String -Path $envFile -Pattern '^DATABASE_URL=' | Select-Object -First 1
if (-not $envLine) { Fail "DATABASE_URL not set in $envFile" }
$dbUrl = $envLine.Line -replace '^DATABASE_URL=', '' -replace '^"|"$', ''

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$dest = Join-Path $OutDir "voxinq-full-$stamp"
New-Item -ItemType Directory -Force $dest | Out-Null
Write-Host "Exporting to $dest" -ForegroundColor Cyan

# --- 1. Database ------------------------------------------------------------------------
# Custom format: compressed, and pg_restore can be selective on the way back in.
Write-Host "[1/3] pg_dump..."
$dump = Join-Path $dest "voxinq.dump"
& $PgDump --dbname=$dbUrl --format=custom --file=$dump
if ($LASTEXITCODE -ne 0) { Fail "pg_dump failed (exit $LASTEXITCODE)" }
Write-Host ("      {0:N1} MB" -f ((Get-Item $dump).Length / 1MB))

# --- 2. Recordings ----------------------------------------------------------------------
# Includes <id>.segments.json and <id>.speakers.json, not just the audio: diarization maps
# speakers onto utterances by position, and those files are that mapping.
$recSrc = Join-Path $Repo "stt-service\recordings"
if ($NoRecordings) {
  Write-Host "[2/3] recordings skipped (-NoRecordings)" -ForegroundColor Yellow
} elseif (Test-Path $recSrc) {
  Write-Host "[2/3] recordings..."
  $recDest = Join-Path $dest "recordings"
  New-Item -ItemType Directory -Force $recDest | Out-Null
  Copy-Item "$recSrc\*" $recDest -Recurse -Force
  $files = Get-ChildItem $recDest -File -Recurse
  Write-Host ("      {0} files, {1:N1} MB" -f $files.Count, (($files | Measure-Object Length -Sum).Sum / 1MB))
} else {
  Write-Host "[2/3] no recordings directory" -ForegroundColor Yellow
}

# --- 3. Configuration -------------------------------------------------------------------
Write-Host "[3/3] configuration..."
$cfg = Join-Path $dest "config"
New-Item -ItemType Directory -Force $cfg | Out-Null
foreach ($f in @("settings.json", ".env")) {
  $p = Join-Path $Repo $f
  if (Test-Path $p) { Copy-Item $p (Join-Path $cfg $f) -Force; Write-Host "      $f" }
  else { Write-Host "      $f (absent)" -ForegroundColor Yellow }
}

# Record what produced this, so a restore knows which code the schema belongs to.
$commit = (git -C $Repo rev-parse HEAD 2>$null)
$version = (Get-Content (Join-Path $Repo "package.json") -Raw | ConvertFrom-Json).version
@{
  exportedAt = (Get-Date).ToString("o")
  version    = $version
  commit     = $commit
  host       = $env:COMPUTERNAME
  recordings = -not $NoRecordings
} | ConvertTo-Json | Set-Content (Join-Path $dest "manifest.json") -Encoding utf8

$total = (Get-ChildItem $dest -Recurse -File | Measure-Object Length -Sum).Sum / 1MB
Write-Host ""
Write-Host ("Done: {0} ({1:N1} MB, Voxinq {2})" -f $dest, $total, $version) -ForegroundColor Green
Write-Host "Restore with: .\scripts\windows\import-all.ps1 -From `"$dest`"" -ForegroundColor Green
Write-Host "This bundle holds API keys, the DB password and every meeting transcript — keep it private." -ForegroundColor Yellow
