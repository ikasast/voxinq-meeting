# Setup

Voxinq Meeting runs on a single GPU box that hosts everything: the web app, PostgreSQL, the STT
service, diarization, and the LLM. A browser (incl. a phone) connects to it.

Two ways in: **Docker Compose** (one command, everything in containers) or a **native
install** (what the author's own machine runs). Both need an NVIDIA GPU.

## Prerequisites

- **NVIDIA GPU** with CUDA (8 GB VRAM is enough)

For a native install, additionally:

- **Node.js** 20+
- **Python** 3.11
- **PostgreSQL** 17 (running, with a database you can connect to)
- **[Ollama](https://ollama.com)** (default LLM) — or any OpenAI-compatible endpoint

## Docker (fewest moving parts)

Brings up PostgreSQL, the web app, the STT service and Ollama together. You still need the
NVIDIA driver on the host, but not Node, Python, PostgreSQL or Ollama.

**Additionally required:** [Docker Compose](https://docs.docker.com/compose/) and the
[NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)
(on Windows: Docker Desktop with the WSL2 backend, where GPU support is built in).

```bash
git clone https://github.com/ikasast/voxinq-meeting.git
cd voxinq-meeting
cp .env.example .env       # set POSTGRES_PASSWORD, and point DATABASE_URL at the `db` service
docker compose up -d
```

Then:

1. `docker compose exec ollama ollama pull qwen2.5:7b-instruct` — the minutes model.
2. Open `http://localhost:3000` → **Settings → LLM** → set the Ollama base URL to
   `http://ollama:11434` (containers reach each other by service name, not `localhost`).
3. For diarization, accept the terms for
   [`pyannote/speaker-diarization-community-1`](https://huggingface.co/pyannote/speaker-diarization-community-1)
   and put your token in `.env` as `HF_TOKEN`, then `docker compose up -d stt`.

First use downloads several GB of model weights; they are cached in a volume, so this happens
once. The first recording of a session still takes tens of seconds to warm the model.

> **`NEXT_PUBLIC_STT_WS_URL` is baked in at build time.** The browser talks to the STT service
> directly, so the default `ws://localhost:8000/ws` only works when you browse from the same
> machine. To record from a phone, set it to the address that machine will use and rebuild:
> `docker compose up -d --build web`.

Useful commands:

```bash
docker compose logs -f web stt     # follow logs
docker compose up -d --build       # rebuild after pulling changes
docker compose down                # stop (volumes, and so your data, are kept)
docker compose up -d web           # web only — for a viewer-only host pointing DATABASE_URL elsewhere
```

## Native install: one-shot script

```bash
git clone https://github.com/ikasast/voxinq-meeting.git
cd voxinq-meeting
./scripts/setup.sh      # Windows: .\scripts\setup.ps1
```

The script is **idempotent** (safe to re-run) and does, in order:

1. Checks the prerequisites above and tells you what is missing.
2. `npm install`
3. Creates `.env` from `.env.example` and asks for your `DATABASE_URL`.
4. `npx prisma migrate deploy` — creates/updates the DB schema.
5. Creates the STT venv (`stt-service/.venv`) and installs its requirements.
6. Pulls the default LLM (`ollama pull qwen2.5:7b-instruct`).

For speaker diarization (optional, GPU torch + pyannote), add the flag:

```bash
./scripts/setup.sh --diarization      # Windows: .\scripts\setup.ps1 -Diarization
```

then set `HF_TOKEN` (or log in with `huggingface-cli`) and accept the terms for
[`pyannote/speaker-diarization-community-1`](https://huggingface.co/pyannote/speaker-diarization-community-1)
on Hugging Face. The model downloads on first use.

> Set `DIA_MODEL=pyannote/speaker-diarization-3.1` to use the older pipeline instead — it
> needs `pyannote/segmentation-3.0` accepted as well.

## Run

```bash
./scripts/start.sh      # Windows: .\scripts\start.ps1
```

Starts the STT service in the background (reusing it if already running), builds the web app
if needed, and serves it at `http://localhost:3000`. Ctrl+C stops both.

> ⚡ Always serve a **production build** (`start` does). `npm run dev` breaks hydration when
> accessed cross-origin (e.g. over Tailscale).

## Manual install (what the script does)

<details>
<summary>Step-by-step manual setup</summary>

### 1. Web app

```bash
npm install
cp .env.example .env        # then set DATABASE_URL
npx prisma migrate deploy   # create/update the DB schema
```

### 2. LLM (Ollama, default)

```bash
ollama pull qwen2.5:7b-instruct   # fits 8 GB VRAM
```

Prefer a bigger model or an external GPU? See **[LLM providers](llm-providers.md)**.

### 3. STT service (separate Python venv)

```bash
cd stt-service
python -m venv .venv
. .venv/Scripts/activate            # Linux: source .venv/bin/activate
pip install -r requirements.txt
cd ..
```

### 4. Diarization (optional, separate venv + GPU torch)

```bash
cd diarization
python -m venv .venv
. .venv/Scripts/activate
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu128
pip install -r requirements.txt
cd ..
```

### 5. Run

```bash
# STT service (GPU)
cd stt-service && . .venv/Scripts/activate && python -m uvicorn server:app --host 0.0.0.0 --port 8000

# Web app (production build)
npm run build && npm start
```

</details>

## Run as background services

### Windows (primary host)

Helper scripts register Task Scheduler tasks that start at logon and self-restart on crash:

```powershell
scripts\windows\install-db-task.ps1        # PostgreSQL
scripts\windows\install-web-task.ps1       # Web app
stt-service\install-startup-task.ps1       # STT service
scripts\windows\install-backup-task.ps1    # nightly DB backup (03:00, pg_dump + rotation)
```

Backups land in `~\voxinq-backups` (daily kept 14 days, 1st-of-month kept a year — a dump is
only a few hundred KB). Restore with `pg_restore -d "<DATABASE_URL>" --clean --if-exists <file>.dump`.

- Redeploy the web app after code changes: `scripts\windows\redeploy-web.ps1`
- Redeploy **web + STT together** (use this when a pull also touched `stt-service/`):
  `scripts\windows\redeploy-all.ps1`
- Restarting the STT service on its own: kill the process owning port 8000 — the `run-stt.bat`
  loop relaunches it with the new code in ~15s. (`Stop-ScheduledTask` can leave the process running.)

### Linux

- Web app: `scripts/redeploy.sh`
- STT service: install the provided `stt-service/voxinq-stt.service` systemd unit, then
  `sudo systemctl enable --now voxinq-stt`.

## Branches & releases

Two long-lived branches:

- **`main`** — development. Every PR lands here.
- **`release`** — what production runs. Always points at the latest tagged version.

Tags (`v1.0.0`, `v1.1.0`, …) mark the versions; `release` just follows the newest one. The
redeploy scripts default to `release` and refuse to build any other checkout, so a leftover
feature branch cannot be deployed by accident — pass `-Branch <name>` (PowerShell) or
`BRANCH=<name>` (shell) when you mean to.

**Cutting a release**

```bash
# on main, with everything for this version merged
npm version 1.1.0 --no-git-tag-version   # commit this via a PR
git checkout release && git merge --ff-only main
git tag -a v1.1.0 -m "v1.1.0" && git push origin release v1.1.0
```

Then deploy (`scripts\windows\redeploy-all.ps1` on the primary host, `scripts/redeploy.sh`
on Linux) and publish the GitHub release: `gh release create v1.1.0 --title v1.1.0 --notes-file <file>`.

**Hotfixing production** — branch from `release`, not `main`, so an unfinished feature cannot
ride along:

```bash
git checkout -b hotfix-x release
# fix, PR into release, then tag the patch
git tag -a v1.1.1 -m "v1.1.1" && git push origin release v1.1.1
git checkout main && git cherry-pick <fix commit>   # keep main in sync
```

**Rolling back** — `release` is an ordinary branch, so move it back to the previous tag and
redeploy:

```bash
git checkout release && git reset --hard v1.0.0 && git push --force-with-lease
```

A rollback across a migration needs the database considered separately — `prisma migrate deploy`
only rolls forward. Restore from the nightly `pg_dump` if the schema has to go back too.

## Remote access (record & view from a phone)

Expose the host so a phone can reach it — the quickest is [Tailscale](https://tailscale.com),
but self-hosted **WireGuard** (no third party) and public-URL options work too. The full
comparison and step-by-step for each is on its own page:

**→ [Remote access](remote-access.md)**

---

[Docs index](README.md) · Next: [Configuration →](configuration.md)
