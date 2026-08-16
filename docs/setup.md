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

**No clone needed** — the images are published, so two files are the whole install:

```bash
mkdir voxinq && cd voxinq
curl -O https://raw.githubusercontent.com/ikasast/voxinq-meeting/release/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/ikasast/voxinq-meeting/release/.env.example
# edit .env: set POSTGRES_PASSWORD, and point DATABASE_URL at the `db` service
docker compose up -d
```

<details>
<summary>Building from a checkout instead</summary>

For development, or to run a change that has not been released:

```bash
git clone https://github.com/ikasast/voxinq-meeting.git
cd voxinq-meeting
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

</details>

### Filling in `.env`

The file you downloaded has every setting commented out with an explanation. You do not need
most of them. Work down this table: **two entries are required**, the rest can wait until you
want the feature they belong to.

| Setting | Needed? | What to put there |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | **Required** | Invent one. It is the password for the database container this install creates, so it does not have to match anything that already exists |
| `DATABASE_URL` | **Required** | `postgresql://voxinq:THAT-SAME-PASSWORD@db:5432/voxinq`. `db` is the compose service name — `localhost` here would mean "the web container itself" and cannot work |
| `HF_TOKEN` | For speaker separation | A free Hugging Face token, after accepting the model terms. Leave it out for now if you like — everything except telling speakers apart works without it. [Steps below](#diarization-needs-a-hugging-face-token) |
| `STT_WS_URL` | To record from a phone | The address the *phone's browser* uses to reach transcription, e.g. `wss://myhost.tailnet.ts.net:8443/ws`. [Walkthrough below](#recording-from-a-phone-tailscale-walkthrough) |
| `APP_PASSWORD` + `APP_SESSION_SECRET` | Before exposing it | A login password and a long random string. Without them, anyone who can reach the address gets in. Only relevant once the app is reachable beyond your own machine |
| `WEB_PORT` `STT_PORT` `DB_PORT` `OLLAMA_PORT` | Only on a clash | Compose fails with "port is already allocated" rather than sharing. [Which to change](#already-using-one-of-these-ports) |
| `VOXINQ_VERSION` | Rarely | Pins the image version instead of following `latest`, e.g. `v1.4.0` |
| `NEXT_PUBLIC_STT_WS_URL` | **Ignore on Docker** | Native installs only — it is compiled into the bundle. The published image reads `STT_WS_URL` at runtime instead |

Everything else — transcription model, glossary, minutes format, LLM provider, API keys —
lives in **Settings** in the app, not in `.env`. Full reference: [Configuration](configuration.md).

Then start it:

```bash
docker compose up -d
docker compose exec ollama ollama pull qwen2.5:7b-instruct   # the model that writes minutes
```

Open `http://localhost:3000` and you are ready. **Settings → LLM** already points at the
bundled Ollama, because the compose file addresses it by service name.

Budget for the first run: the STT image carries CUDA and a GPU build of torch, so it is about
**20 GB** to pull. Model weights download separately on first use and are cached in a volume,
so that happens once. The first recording of a session still takes tens of seconds to warm the
model.

### What works right after installing

Worth knowing in which order things start needing setup, so a missing step looks like a missing
step rather than a broken install:

| Step | Works immediately? |
| --- | --- |
| Recording and live transcription | ✅ |
| Playing a recording back, editing utterances | ✅ |
| Generating minutes | ✅ once `ollama pull` has finished |
| Recording **from a phone** | Needs `STT_WS_URL` — the phone cannot reach `localhost` |
| **Telling speakers apart** (diarization) | Needs `HF_TOKEN` — see next section |
| Voice profiles (naming speakers automatically) | Needs `HF_TOKEN`, same model |

### Diarization needs a Hugging Face token

Speaker separation uses [pyannote](https://huggingface.co/pyannote), which is free but *gated*:
its authors ask you to accept their terms before downloading it. Nothing else in Voxinq needs
this, so a fresh install works fine until the first time you press **Diarize** — which is a
confusing moment if you do not know the model is waiting on a signature.

One-time setup, a few minutes:

1. Create a free account at [huggingface.co](https://huggingface.co/join) if you do not have one.
2. Accept the terms on **each** of these pages (they are separate models; the pipeline loads all
   three). Each is a form asking who you are and what you plan to use it for, approved instantly:
   - [`pyannote/speaker-diarization-community-1`](https://huggingface.co/pyannote/speaker-diarization-community-1)
   - [`pyannote/speaker-diarization-3.1`](https://huggingface.co/pyannote/speaker-diarization-3.1)
   - [`pyannote/segmentation-3.0`](https://huggingface.co/pyannote/segmentation-3.0)
3. Create a token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) —
   **New token → type "Read"**. Copy it; the site shows it once.
4. Put it in `.env` and restart the transcription service:

   ```bash
   HF_TOKEN="hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
   ```

   ```bash
   docker compose up -d stt
   ```

The first diarization then downloads the model (a few hundred MB, once) before it starts, so
that run takes longer than later ones.

> Accepting the terms without creating a token, or creating a token without accepting the terms,
> both fail the same way. If diarization still reports a missing token, check that the account
> that accepted the terms is the account the token belongs to.

### Recording from a phone (Tailscale walkthrough)

The browser talks to the STT service **directly**, so it needs a URL it can actually reach —
`localhost` only works when you browse from the same machine. Recording also needs HTTPS,
because browsers refuse microphone access on plain HTTP from anything but localhost.

[Tailscale](https://tailscale.com) gives you both at once: a private network between your own
devices, and a real HTTPS certificate for a `*.ts.net` name. This walks through it end to end.

**1. Install Tailscale on the host and on the phone**, then sign both into the same account:

```bash
tailscale up
```

**2. Find your host's name.** This is the part the `STT_WS_URL` placeholder cannot tell you.
Your machine's full name is `<host>.<tailnet>.ts.net`, and `tailscale status` prints it — your
own machine is the first line:

```bash
tailscale status
```

```
100.88.208.114  myhost   tagged-devices  linux  -
```

Combine that with your tailnet name, shown at the top of the
[admin console](https://login.tailscale.com/admin/machines) (something like `tail1a2b3c.ts.net`
unless you renamed it), giving `myhost.tail1a2b3c.ts.net`. Hovering a machine in the admin
console also copies the full name directly.

**3. Enable MagicDNS and HTTPS certificates.** Both live in the admin console under
[DNS](https://login.tailscale.com/admin/dns) and both are required — `tailscale serve --https`
cannot issue a certificate without them.

**4. Publish the two ports:**

```bash
tailscale serve --bg --https=443 localhost:3000    # the web app
tailscale serve --bg --https=8443 localhost:8000   # the STT service (wss)
```

Verify:

```bash
tailscale serve status
```

```
https://myhost.tail1a2b3c.ts.net (tailnet only)
|-- / proxy http://localhost:3000

https://myhost.tail1a2b3c.ts.net:8443 (tailnet only)
|-- / proxy http://localhost:8000
```

**5. Point the app at the STT address the phone will use** — the `:8443` one, with the `wss://`
scheme and the `/ws` path:

```bash
STT_WS_URL=wss://myhost.tail1a2b3c.ts.net:8443/ws
```

```bash
docker compose up -d
```

> **Docker reads this at request time**, so a restart is enough — no rebuild. On a **native**
> install the equivalent is `NEXT_PUBLIC_STT_WS_URL`, which is compiled into the JavaScript
> bundle at build time and therefore needs `npm run build` again after any change.

**6. On the phone**, open `https://myhost.tail1a2b3c.ts.net` and use **Add to Home Screen** —
the app is a PWA and runs full-screen from there.

If the page loads but recording fails, the STT service is rejecting the browser's origin. It
allows `localhost`, private LAN ranges and `*.ts.net` automatically; if you set
`STT_ALLOWED_ORIGINS` yourself, your web address has to be in that list. See
[Troubleshooting](troubleshooting.md).

Sharing with someone **outside** your tailnet (read-only, via Tailscale Funnel), or using
WireGuard instead of Tailscale: **[Remote access](remote-access.md)**.

### Already using one of these ports?

Compose fails on a bind error rather than sharing a port, and **a local PostgreSQL on 5432 is
the common case**. Set the ones you need in `.env`; the containers still reach each other by
name, so only access from the host moves:

```bash
WEB_PORT=3100
DB_PORT=127.0.0.1:5433
OLLAMA_PORT=127.0.0.1:11435
STT_PORT=8100          # STT_WS_URL follows this unless you set one explicitly
```

Useful commands:

```bash
docker compose logs -f web stt     # follow logs
docker compose pull && docker compose up -d   # upgrade to the current images
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

> **The nightly dump is the database only.** Restoring from it alone leaves every meeting
> present but silent: the audio lives on disk, not in PostgreSQL, and without it playback,
> re-transcription, diarization and voiceprint enrolment are all unavailable. For a rebuild
> or a move to another machine, use the full export below.

## Moving or rebuilding an instance

State lives in three places, so a complete copy needs all three: **PostgreSQL** (meetings,
transcripts, minutes, series, tags, voice profiles), **the recordings directory** (the WAVs
and the utterance boundaries diarization maps speakers onto), and **`settings.json`** (models,
glossary, API keys).

### From the app (easiest, and covers all three)

**Settings → Data** exports the lot — every meeting, the recordings, and your settings — as one
password-encrypted `.voxbak` file, and restores one by merging it into whatever is already
there. No shell, no database client, and the same on every platform. Full description:
[Usage → Backup & restore](usage.md#backup--restore).

That is the right answer for moving to another machine, for a copy you keep off the box, and
for rebuilding after a mistake.

Reach for the commands below instead when you want something the button cannot do: an
**unattended nightly** dump, or a database-only copy without the audio.

### Docker

Each of the three is a named volume, so nothing lives in the directory you installed into —
`docker compose down` and even deleting that directory keeps your data. `docker volume ls`
shows them: `pgdata`, `recordings`, `settings`, plus `hfcache` and `ollama` for model weights
(large, and re-downloadable, so not worth backing up).

Nightly database dump — the host does not need PostgreSQL installed, because `pg_dump` runs
inside the container:

```bash
docker compose exec -T db sh -c "pg_dump -U voxinq -Fc voxinq > /tmp/voxinq.dump"
docker compose cp db:/tmp/voxinq.dump ./voxinq-$(date +%Y%m%d).dump
docker compose exec -T db rm -f /tmp/voxinq.dump
```

> Take the dump **inside** the container rather than piping it out through your shell: a
> `pg_dump ... > file` redirection in PowerShell re-encodes the stream as text and corrupts the
> archive.

Restoring that dump into a fresh stack — start the database alone first, so the web container
does not create an empty schema underneath you:

```bash
docker compose up -d db
docker compose cp voxinq-20260815.dump db:/tmp/r.dump
docker compose exec -T db pg_restore -U voxinq -d voxinq --clean --if-exists --no-owner --no-privileges /tmp/r.dump
docker compose up -d
```

The dump carries Prisma's migration table, so the `prisma migrate deploy` that the web
container runs on start correctly becomes a no-op.

Recordings and settings move with `docker compose cp` in the same way — `stt:/data/recordings`
and `web:/data/settings.json`. If you are restoring settings from a native install, change
`ollamaBaseUrl` to `http://ollama:11434` first: inside a container, a loopback address means
the container itself.

### Native

```powershell
scripts\windows\export-all.ps1                      # -> ~\voxinq-backups\voxinq-full-<timestamp>\
scripts\windows\export-all.ps1 -NoRecordings        # database + config only, much smaller
```

To restore into a fresh install — after `setup.ps1` has created `.env` and the database:

```powershell
# stop the web app and the STT service first
scripts\windows\import-all.ps1 -From <bundle directory>
npx prisma migrate deploy    # no-op when the dump is current
```

The import refuses to run while anything is listening on 3000 or 8000, asks for confirmation
before dropping the target database, and leaves `.env` alone — `DATABASE_URL` and the baked-in
STT URL belong to the machine, not to the data.

> The bundle contains **every meeting transcript, your API keys and the database password**.
> It is as sensitive as the database itself; keep it local or encrypt it before it moves.

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

Publishing the release is what builds and pushes the container images, and the only thing that
moves `latest` — so it is the step that makes the Docker install above serve the new version.
The **Publish images** workflow can also be run by hand for a trial build; that publishes the
tag you name and leaves `latest` where it is.

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

Recording from a phone over Tailscale is walked through above:
**[Recording from a phone](#recording-from-a-phone-tailscale-walkthrough)**.

For sharing read-only with someone outside your tailnet (Tailscale Funnel), self-hosted
**WireGuard** with no third party, or a public URL behind your own proxy — including the
comparison between them:

**→ [Remote access](remote-access.md)**

---

[Docs index](README.md) · Next: [Remote access →](remote-access.md)
