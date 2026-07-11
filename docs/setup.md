# Setup

Voxinq runs on a single GPU box that hosts everything: the web app, PostgreSQL, the STT
service, diarization, and the LLM. A browser (incl. a phone) connects to it.

## Prerequisites

- **NVIDIA GPU** with CUDA (8 GB VRAM is enough)
- **Node.js** 20+
- **Python** 3.11
- **PostgreSQL** 17 (running, with a database you can connect to)
- **[Ollama](https://ollama.com)** (default LLM) — or any OpenAI-compatible endpoint

## Recommended: one-shot script

```bash
git clone https://github.com/ikasast/voxinq.git
cd voxinq
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
`pyannote/speaker-diarization-3.1` and `pyannote/segmentation-3.0` on Hugging Face.

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
- Restarting the STT service: kill the process owning port 8000 — the `run-stt.bat` loop
  relaunches it with the new code in ~15s. (`Stop-ScheduledTask` can leave the process running.)

### Linux

- Web app: `scripts/redeploy.sh`
- STT service: install the provided `stt-service/voxinq-stt.service` systemd unit, then
  `sudo systemctl enable --now voxinq-stt`.

## Remote access (Tailscale)

Expose the host over [Tailscale](https://tailscale.com) so you can record from a phone:

```bash
tailscale serve --https=443 localhost:3000     # web
tailscale serve --https=8443 localhost:8000     # STT (wss)
```

Set `NEXT_PUBLIC_STT_WS_URL` to the `wss://<host>.<tailnet>.ts.net:8443/ws` URL **before
building** (it is baked in at build time). Optionally set `APP_PASSWORD` for login on
public/Funnel access. See [Configuration](configuration.md).

---

[Docs index](README.md) · Next: [Configuration →](configuration.md)
