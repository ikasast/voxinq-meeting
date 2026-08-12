# Restore a bundle produced by export-all.ps1 into this checkout.
#
# This REPLACES the database contents, the recordings directory and settings.json. It is
# meant for a fresh install or a rebuild — not for merging two instances together.
#
# Usage:
#   .\scripts\windows\import-all.ps1 -From C:\Users\me\voxinq-backups\voxinq-full-20260812-160000
#   .\scripts\windows\import-all.ps1 -From <dir> -Force     # skip the confirmation
#
# Stop the web app and the STT service first: both hold open handles, and restoring the
# database under a running app leaves it serving rows that are being dropped.
param(
  [Parameter(Mandatory = $true)][string]$From,
  [string]$Repo = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)),
  [string]$PgRestore = "$HOME\pgsql\bin\pg_restore.exe",
  [switch]$Force,
  # Leave settings.json and .env alone (useful when the target host differs).
  [switch]$NoConfig
)
$ErrorActionPreference = "Stop"

function Fail($msg) { Write-Error $msg; exit 1 }

if (-not (Test-Path $From)) { Fail "No such bundle: $From" }
if (-not (Test-Path (Join-Path $Repo "package.json"))) { Fail "Not a Voxinq checkout: $Repo" }
if (-not (Test-Path $PgRestore)) { Fail "pg_restore not found at $PgRestore (pass -PgRestore)" }

$dump = Join-Path $From "voxinq.dump"
if (-not (Test-Path $dump)) { Fail "No voxinq.dump in $From — is this an export-all bundle?" }

$manifestPath = Join-Path $From "manifest.json"
$manifest = if (Test-Path $manifestPath) { Get-Content $manifestPath -Raw | ConvertFrom-Json } else { $null }

# The .env in the bundle is only used when we are also restoring config; the DB we restore
# INTO always comes from the current checkout, so a restore cannot write to the wrong host.
$envFile = Join-Path $Repo ".env"
if (-not (Test-Path $envFile)) { Fail "No .env in $Repo — set DATABASE_URL before restoring" }
$envLine = Select-String -Path $envFile -Pattern '^DATABASE_URL=' | Select-Object -First 1
if (-not $envLine) { Fail "DATABASE_URL not set in $envFile" }
$dbUrl = $envLine.Line -replace '^DATABASE_URL=', '' -replace '^"|"$', ''
$dbShown = $dbUrl -replace '://([^:]+):[^@]*@', '://$1:***@'

Write-Host "About to restore" -ForegroundColor Cyan
Write-Host "  from     : $From"
if ($manifest) { Write-Host "  taken    : $($manifest.exportedAt)  (Voxinq $($manifest.version))" }
Write-Host "  into DB  : $dbShown"
Write-Host "  repo     : $Repo"
Write-Host ""
Write-Host "This DROPS the current contents of that database" -ForegroundColor Yellow
Write-Host "and replaces stt-service\recordings\ and settings.json." -ForegroundColor Yellow

if (-not $Force) {
  $answer = Read-Host "Type the word 'restore' to continue"
  if ($answer -ne "restore") { Write-Host "Aborted."; exit 1 }
}

# Refuse to run while the services are up: a restore under a live app is how you get a
# half-replaced database being served.
foreach ($port in 3000, 8000) {
  $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($conn) {
    $name = (Get-Process -Id $conn[0].OwningProcess -ErrorAction SilentlyContinue).ProcessName
    Fail "Something is listening on $port ($name). Stop the web app and STT service first."
  }
}

# --- 1. Database ------------------------------------------------------------------------
# --clean --if-exists drops the existing objects first, so this works whether the target is
# empty or already migrated. The dump carries _prisma_migrations, so a later `migrate deploy`
# correctly becomes a no-op.
Write-Host "[1/3] pg_restore..."
& $PgRestore --dbname=$dbUrl --clean --if-exists --no-owner --no-privileges $dump
# pg_restore exits non-zero on benign "does not exist" notices from --clean; surface it
# rather than hiding it, but do not treat it as fatal on its own.
if ($LASTEXITCODE -ne 0) {
  Write-Host "      pg_restore exited $LASTEXITCODE — check the messages above." -ForegroundColor Yellow
  Write-Host "      Warnings about dropping objects that do not exist are expected on an empty DB." -ForegroundColor Yellow
}

# --- 2. Recordings ----------------------------------------------------------------------
$recSrc = Join-Path $From "recordings"
$recDest = Join-Path $Repo "stt-service\recordings"
if (Test-Path $recSrc) {
  Write-Host "[2/3] recordings..."
  New-Item -ItemType Directory -Force $recDest | Out-Null
  Copy-Item "$recSrc\*" $recDest -Recurse -Force
  $files = Get-ChildItem $recDest -File -Recurse
  Write-Host ("      {0} files, {1:N1} MB" -f $files.Count, (($files | Measure-Object Length -Sum).Sum / 1MB))
} else {
  Write-Host "[2/3] bundle has no recordings — playback and re-transcription will be unavailable" -ForegroundColor Yellow
}

# --- 3. Configuration -------------------------------------------------------------------
if ($NoConfig) {
  Write-Host "[3/3] config skipped (-NoConfig)" -ForegroundColor Yellow
} else {
  Write-Host "[3/3] configuration..."
  $cfgSettings = Join-Path $From "config\settings.json"
  if (Test-Path $cfgSettings) {
    Copy-Item $cfgSettings (Join-Path $Repo "settings.json") -Force
    Write-Host "      settings.json"
  }
  # .env is deliberately NOT overwritten: it carries this host's DATABASE_URL and the
  # baked-in STT URL, which are properties of the machine rather than of the data.
  if (Test-Path (Join-Path $From "config\.env")) {
    Write-Host "      .env left alone (host-specific; copy by hand if you want it)" -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "Restored. Next: npx prisma migrate deploy (no-op if the dump is current), then start the services." -ForegroundColor Green
