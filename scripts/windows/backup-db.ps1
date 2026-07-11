# Nightly PostgreSQL backup for Voxinq (Windows primary host).
# Dumps the DB from DATABASE_URL in .env to ~\voxinq-backups\voxinq-YYYYMMDD.dump
# (pg_dump custom format, compressed). Rotation: daily dumps kept 14 days;
# dumps taken on the 1st of a month kept 366 days.
# Restore example:  pg_restore -d "<DATABASE_URL>" --clean --if-exists <file>.dump
param(
  [string]$PgDump = "$HOME\pgsql\bin\pg_dump.exe",
  [string]$BackupDir = "$HOME\voxinq-backups"
)
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

New-Item -ItemType Directory -Force $BackupDir | Out-Null
$log = Join-Path $BackupDir "backup.log"
function Log($msg) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg" | Tee-Object -FilePath $log -Append }

# Read DATABASE_URL from the repo .env
$envLine = Select-String -Path (Join-Path $repo ".env") -Pattern '^DATABASE_URL=' | Select-Object -First 1
if (-not $envLine) { Log "ERROR: DATABASE_URL not found in $repo\.env"; exit 1 }
$dbUrl = $envLine.Line -replace '^DATABASE_URL=', '' -replace '^"|"$', ''

if (-not (Test-Path $PgDump)) { Log "ERROR: pg_dump not found at $PgDump"; exit 1 }

$stamp = Get-Date -Format "yyyyMMdd"
$out = Join-Path $BackupDir "voxinq-$stamp.dump"

& $PgDump --dbname=$dbUrl --format=custom --file=$out
if ($LASTEXITCODE -ne 0) { Log "ERROR: pg_dump failed (exit $LASTEXITCODE)"; exit 1 }
$size = [math]::Round((Get-Item $out).Length / 1MB, 2)
Log "OK: $out ($size MB)"

# Rotation
Get-ChildItem $BackupDir -Filter "voxinq-*.dump" | ForEach-Object {
  if ($_.Name -notmatch '^voxinq-(\d{4})(\d{2})(\d{2})\.dump$') { return }
  $date = Get-Date -Year $Matches[1] -Month $Matches[2] -Day $Matches[3]
  $age = (Get-Date) - $date
  $isMonthly = $Matches[3] -eq "01"
  if (($isMonthly -and $age.Days -gt 366) -or (-not $isMonthly -and $age.Days -gt 14)) {
    Remove-Item $_.FullName -Force
    Log "pruned: $($_.Name)"
  }
}
