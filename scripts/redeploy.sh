#!/usr/bin/env bash
# Voxinq Web update script for a Linux host (the Windows equivalent is
# scripts/windows/redeploy-web.ps1).
#
# Usage:  ./scripts/redeploy.sh
#
# git pull -> update deps -> production build -> stop old server -> start -> health check.
# .env / settings.json / prisma/dev.db are gitignored, so pull does not remove them.
#
# Production tracks `release` (the latest tagged version); `main` is where development lands.
# Pass BRANCH=<name> to deploy something else (a leftover feature branch would otherwise
# deploy silently and just look stale). See docs/setup.md "Branches & releases".
set -euo pipefail
cd "$(dirname "$0")/.."   # to the repo root

branch="$(git rev-parse --abbrev-ref HEAD)"
want="${BRANCH:-release}"
if [ "$branch" != "$want" ]; then
  echo "On branch '$branch' but deploying '$want'. Run 'git checkout $want' first," >&2
  echo "or pass BRANCH=$branch to deploy this branch on purpose." >&2
  exit 1
fi

echo "[1/4] git pull ($branch)..."
git pull --ff-only

echo "[2/4] update deps & apply DB schema & production build (keeps the current server on failure)..."
npm install
# Apply pending schema migrations (no-op when up to date).
npx prisma migrate deploy
npm run build

echo "[3/4] stop old server..."
pkill -f "next start"  2>/dev/null || true
pkill -f "next-server" 2>/dev/null || true
sleep 2

echo "[4/4] start & health check..."
nohup npm run start > prod.log 2>&1 &
echo $! > prod.pid
sleep 3
curl -sI http://localhost:3000 | head -n 3
echo "OK: production server updated (check the public URL with tailscale serve status)"
