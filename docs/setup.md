# Setup

Voxinq runs on a single GPU box that hosts everything: the web app, PostgreSQL, the STT
service, diarization, and the LLM. A browser (incl. a phone) connects to it.

## Prerequisites

- **NVIDIA GPU** with CUDA (8 GB VRAM is enough)
- **Node.js** 20+
- **Python** 3.11
- **PostgreSQL** 17
- **[Ollama](https://ollama.com)** (default LLM) — or any OpenAI-compatible endpoint

## 1. Clone & install

```bash
git clone https://github.com/ikasast/voxinq.git
cd voxinq
npm install
```

## 2. Database

Create a database and user, then point `.env` at it (see [Configuration](configuration.md)):

```bash
# example (adjust names/passwords)
createdb voxinq
# .env: DATABASE_URL="postgresql://voxinq:PASSWORD@localhost:5432/voxinq"
npx prisma db push          # create the schema
```

## 3. LLM (Ollama, default)

```bash
ollama pull qwen2.5:7b-instruct   # fits 8 GB VRAM
```

Prefer a bigger model or an external GPU? See **[LLM providers](llm-providers.md)**.

## 4. STT service (separate Python venv)

```bash
cd stt-service
python -m venv .venv
. .venv/Scripts/activate            # Linux: source .venv/bin/activate
pip install -r requirements.txt
cd ..
```

## 5. Diarization (optional, separate venv + GPU torch)

Only needed for speaker separation. Requires accepting the pyannote model terms on Hugging Face.

```bash
cd diarization
python -m venv .venv
. .venv/Scripts/activate
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu128
pip install -r requirements.txt
cd ..
```

Set `HF_TOKEN` (or log in with `huggingface-cli`) and accept the terms for
`pyannote/speaker-diarization-3.1` and `pyannote/segmentation-3.0`.

## 6. Run

Always serve a **production build** — `npm run dev` breaks hydration when accessed
cross-origin (e.g. over Tailscale).

```bash
# STT service (GPU)
cd stt-service && . .venv/Scripts/activate && python -m uvicorn server:app --host 0.0.0.0 --port 8000

# Web app
npm run build && npm start
```

Open `http://localhost:3000`.

## Run as background services

### Windows (primary host)

Helper scripts register Task Scheduler tasks that start at logon and self-restart on crash:

```powershell
scripts\windows\install-db-task.ps1        # PostgreSQL
scripts\windows\install-web-task.ps1       # Web app
stt-service\install-startup-task.ps1       # STT service
```

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
