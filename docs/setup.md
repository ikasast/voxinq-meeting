# Setup

Voxinq Meeting runs on a single machine that hosts everything: the web app, PostgreSQL, the
STT service, speaker separation, and the LLM. A browser — including a phone — connects to it.

## Which way to install

| | you install first | best for |
| --- | --- | --- |
| **[A. Docker](#a-docker)** | Docker Desktop | most people — one command, nothing else on the host |
| **[B. Without Docker](#b-without-docker-voxinq)** | `brew` or `scoop` | no Docker, and the only way to get Metal on a Mac |
| **[C. Native](#c-native-install)** | Node, Python, PostgreSQL, Ollama | working on the code |

All three end up at `http://localhost:3000`, with the same data and the same features. Read
**[Prerequisites](#prerequisites)** first if you are not sure what your machine can do — or,
if a terminal is not where you want to be, go straight to
**[Without the command line](#without-the-command-line-windows-docker-desktop)**.

## Prerequisites

An **NVIDIA GPU with CUDA** (8 GB of VRAM is plenty) gives the best experience, but is **not
required** — the table below is what changes without one.

### What has actually been run

The support table below says what the code *chooses*. This one says where that has been seen to
work, because the two are not the same thing and the second is the one that can bite you.

| | status |
| --- | --- |
| **Windows 11 + NVIDIA, Docker** | ✅ the development and production host — every release runs here |
| **Windows 11 + NVIDIA, native** | ✅ how it ran before the Docker cutover |
| **Windows, `voxinq` via Scoop** | ✅ installed from the bucket, `setup` and `start` from what it placed |
| **x86 CPU only, no GPU** | ✅ recognition and the deferred path measured on one; not lived in |
| **Linux + NVIDIA** | ⚠️ the images are built and pulled for it, but nobody here runs it daily |
| **Linux / macOS, `voxinq` via Homebrew** | ⚠️ the formula is written and unverified — no Mac here |
| **Apple silicon, native (Metal)** | ⚠️ chosen by the code and never run: the wheel's Metal was confirmed on a CI runner's virtual GPU, which is not a Mac |
| **Apple silicon, Docker (CPU images)** | ⚠️ images built for arm64, not run on the hardware |
| **AMD / Intel GPU** | ⚠️ falls back to the CPU by design; the fallback is measured, the machines are not owned |

Nothing here is a promise that the ⚠️ rows are broken — they are the rows where a report from
someone who has the hardware would be worth more than anything written here. Please open an
issue either way.

### What runs on what

Every machine here works. What differs is whether transcription keeps up with speech: the ones
that can show you text during the meeting, and the ones that transcribe when it ends.

| your machine | transcription | when you see the text | speaker separation |
| --- | --- | --- | --- |
| **NVIDIA GPU** | faster-whisper on CUDA | **as you speak** | pyannote (GPU) |
| **Apple silicon**, native install | whisper.cpp on Metal | **as you speak** | sherpa-onnx (CPU) |
| **Apple silicon**, Docker | whisper.cpp on the CPU — see below | when the meeting ends | sherpa-onnx (CPU) |
| **AMD / Intel GPU** | whisper.cpp on the **CPU** — the GPU is not used | when the meeting ends | sherpa-onnx (CPU) |
| **CPU only** | whisper.cpp on the CPU | when the meeting ends | sherpa-onnx (CPU) |

#### And the minutes?

The table above stops at speaker separation, but writing the minutes is a third stage, and on a
machine without a GPU it is the slowest of the three. Ollama falls back to the CPU, where the
model has to read the whole transcript before it writes anything.

Measured on the same 16-core x86 CPU as the transcription figure below, with an 8B model and no
GPU: **31 tokens/second reading, 6.5 tokens/second writing**. A meeting that fills the default
24k-token budget therefore spends **around 13 minutes being read and another 3–4 being written**
— a quarter of an hour for one set of minutes, against under a minute on an 8 GB card.

It works, and it is unattended — minutes generate in the background and the app tells you when
they are done. But if that is too slow, there are two ways out, in `Settings → LLM`:

- **A smaller model.** Something in the 3B class runs several times faster and still writes
  serviceable minutes for a straightforward meeting. Not measured here, so try it against one
  of your own before committing to it.
- **Another machine.** The LLM is reached over HTTP and does not have to be local: point it at
  Ollama or vLLM on a machine that does have a GPU, or at Anthropic or OpenAI. See
  [LLM providers](llm-providers.md). Sending it off the machine means the finished transcript
  goes to that endpoint — a deliberate choice, and off by default.

The audio never goes anywhere in either case: only the transcript is sent, and only to the
endpoint you name.

A machine with no GPU acceleration **records the meeting and transcribes it in one pass at the
end**, rather than trying to keep up and falling behind. What is lost is the text during the
meeting.

The model is nominally the same, but **the weights are not**: faster-whisper runs CTranslate2
weights and whisper.cpp runs GGML-quantised ones, and the two do not produce the same
transcript. Measured on a real 12-minute Japanese meeting with the segmentation held constant,
`large-v3-turbo` through whisper.cpp diverges from the same model through faster-whisper by
**13.8% of characters**. Neither output is ground truth, so that is a difference rather than a
verdict — the numbers and the method are in
[Design decisions](design-decisions.md#what-whispercpp-costs-on-a-cpu). Everything after that (minutes, speaker
separation, search) is unchanged. `STT_LIVE_TRANSCRIPTION=1` forces live recognition anyway on
a machine you know is fast enough.

**An AMD or Intel GPU does not accelerate anything here.** whisper.cpp supports Vulkan
upstream, but the pywhispercpp wheels for Linux and Windows are CPU builds, so such a machine
performs exactly like a CPU-only one. Measured on a 16-core x86 CPU with a real Japanese
meeting, the default `large-v3-turbo` runs at **2.8x the length of the audio** — which is why
those machines transcribe at the end instead: recognising live would leave ~39 minutes
unprocessed at the moment you press stop on an hour-long meeting, and take another hour and a
half to catch up. More threads do not help; it is memory-bandwidth bound.

**Metal is not available inside Docker**, on any Mac: Docker Desktop runs a Linux VM with no
GPU passthrough. So an Apple silicon machine gets live transcription from a *native* install
and deferred transcription from the containers — the same laptop, two different answers. The
containers are far easier to set up, which is the trade.

A Radeon *can* still be used for the minutes: Ollama has ROCm builds, and it is a separate
service. Only the transcription and diarization stay on the CPU. The same applies to a Mac:
running Ollama natively gets it Metal, and Settings → LLM can point at
`http://host.docker.internal:11434`.

## A. Docker

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
# edit .env: set POSTGRES_PASSWORD and TZ, and point DATABASE_URL at the `db` service
docker compose up -d
```

**Without an NVIDIA GPU, bring it up with the CPU images instead.** They are multi-arch (so
they run on Apple silicon) and about 1.8 GB instead of 21 GB, because nothing CUDA-shaped is in
them. Only this last command changes; the two files and the `.env` are the same:

```bash
docker compose -f docker-compose.yml -f docker-compose.cpu.yml up -d
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

### Without the command line (Windows, Docker Desktop)

Everything above assumes a terminal. On Windows it can be done almost entirely with the mouse
— **one command, once**, and after that Docker Desktop's own buttons run it.

1. **Install [Docker Desktop](https://www.docker.com/products/docker-desktop/)** and restart
   when it asks. On an NVIDIA machine, keep the WSL2 backend it offers by default: GPU support
   is built into it.

2. **Make a folder for it** — File Explorer, right-click → *New* → *Folder*. `C:\voxinq` will
   do. Everything Voxinq needs on the host lives in this one folder.

3. **Save two files into it from your browser.** Open each link, then Ctrl+S:

   - [`docker-compose.yml`](https://raw.githubusercontent.com/ikasast/voxinq-meeting/release/docker-compose.yml)
   - [`.env.example`](https://raw.githubusercontent.com/ikasast/voxinq-meeting/release/.env.example)
     — in the save dialog set **Save as type: All Files** and name it exactly `.env`, with the
     dot and no extension.

   > Windows fights you over a filename that starts with a dot. If the dialog will not take
   > `.env`, save it as `env.txt` and rename it afterwards to `.env.` — with a **trailing**
   > dot, which Explorer strips, leaving `.env`.

4. **Fill it in.** Right-click `.env` → *Open with* → *Notepad*. Most lines are commented out
   with `#` and can stay that way; the table below says which ones to change. When saving from
   Notepad, put quotes round the name — `".env"` — or it will be saved as `.env.txt`.

5. **Start it.** Open Docker Desktop and use its built-in terminal (the `>_` button along the
   bottom), or PowerShell in the folder. This is the one command:

   ```powershell
   cd C:\voxinq
   docker compose up -d
   ```

   The first start downloads about 20 GB and takes a while. **Without an NVIDIA GPU**, also
   save [`docker-compose.cpu.yml`](https://raw.githubusercontent.com/ikasast/voxinq-meeting/release/docker-compose.cpu.yml)
   into the folder and use `docker compose -f docker-compose.yml -f docker-compose.cpu.yml up -d`
   instead — 1.8 GB rather than 21.

6. **Get the minutes model.** In Docker Desktop → **Containers**, expand the `voxinq` project,
   click the `ollama` container, open its **Exec** tab and run:

   ```
   ollama pull qwen2.5:7b-instruct
   ```

7. **Open it.** Still in **Containers**, the `web` row shows `3000:3000` as a link — click it,
   or go to `http://localhost:3000`.

**From then on there is no command line at all.** The Containers view starts and stops the
whole project with one button, shows each service's logs on its own tab, and survives reboots
on its own (the services are set to restart unless you stop them). To update, press the pull
icon on the project in the **Images** view, then start it again.

### Filling in `.env`

The file you downloaded has every setting commented out with an explanation. You do not need
most of them. Work down this table: **two entries are required**, the rest can wait until you
want the feature they belong to.

| Setting | Needed? | What to put there |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | **Required** | Invent one. It is the password for the database container this install creates, so it does not have to match anything that already exists |
| `DATABASE_URL` | **Required** | `postgresql://voxinq:THAT-SAME-PASSWORD@db:5432/voxinq`. `db` is the compose service name — `localhost` here would mean "the web container itself" and cannot work |
| `STT_WS_URL` | To record from a phone | The address the *phone's browser* uses to reach transcription, e.g. `wss://myhost.tailnet.ts.net:8443/ws`. [Walkthrough below](remote-access.md#step-by-step-including-the-phone) |
| `APP_PASSWORD` + `APP_SESSION_SECRET` | Before exposing it | A login password and a long random string. Without them, anyone who can reach the address gets in. Only relevant once the app is reachable beyond your own machine |
| `WEB_PORT` `STT_PORT` `DB_PORT` `OLLAMA_PORT` | Only on a clash | Compose fails with "port is already allocated" rather than sharing. [Which to change](#already-using-one-of-these-ports) |
| `VOXINQ_VERSION` | Rarely | Pins the image version instead of following `latest`, e.g. `v2.0.0`. Prereleases never move `latest`, so a beta or rc has to be named here. `v1.5.0` is the last 1.x release — pin it to stay on that line |
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

Budget for the first run: the STT image carries the CUDA runtime for transcription, so it is a
large pull. Model weights download separately on first use and are cached in a volume,
so that happens once. The first recording of a session still takes tens of seconds to warm the
model.

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

## B. Without Docker (`voxinq`)

`voxinq` **bundles PostgreSQL** — the hardest prerequisite in a native install — and runs
everything in the background. Node and Python come from the package manager.

### From a package manager

The shortest route, and the one that needs no signed installer: `brew` and `scoop` unpack the
archive themselves, so macOS never attaches a quarantine attribute and Gatekeeper is never
consulted.

```bash
brew install ikasast/voxinq/voxinq                                          # macOS, Linux
scoop bucket add voxinq https://github.com/ikasast/scoop-voxinq             # Windows
scoop install voxinq
```

Then finish the install — it takes several minutes and needs the network:

```bash
voxinq setup
voxinq start
```

Node and Python come as dependencies rather than bundled copies, which is what a package
manager is for. PostgreSQL *is* bundled. Minutes need an LLM: install Ollama, or point
Settings → LLM at a cloud model.

> **Status.** The definitions live in [`packaging/`](../packaging/) and are published from a tap
> and a bucket. Neither has been installed from yet — there is no Mac here for `brew`, and Scoop
> is not on the development machine. The archive they install, and the `voxinq setup` and
> `voxinq start` that follow, are verified on Windows.

### From a checkout

The native install above needs PostgreSQL installed and running before anything else works,
and then two terminals to keep it up. The `voxinq` launcher removes both: it **bundles
PostgreSQL** and starts everything in the background.

```bash
cd cli && npm install && npm link      # once
voxinq setup                            # dependencies, build, both service venvs, models
voxinq start                            # brings it all up and opens a browser
voxinq status
voxinq stop
```

`voxinq autostart on` registers it to start when you log in — a Task Scheduler task on Windows,
a LaunchAgent on macOS, a systemd user service on Linux — and `off` removes it again. No
elevation needed on any of them.

`voxinq setup` is the cross-platform equivalent of the shell scripts above, and is also how you
upgrade after pulling new code. It needs Node 20+ and Python 3.11+ on the machine; everything
else it installs itself.

Two things to know on **Windows**:

- **pyannote installs and runs, through a slightly different route.** `torchcodec`, which
  pyannote reads audio through, is not published for Windows on the CUDA wheel index, so setup
  takes it from PyPI there instead — verified working: `torchcodec 0.16.0+cpu` alongside
  `torch 2.11.0+cu128`, and a real diarization run on GPU. If that install ever fails, setup
  says so and carries on: speaker separation still works on the ONNX backend, which is less
  accurate on long meetings.
- **Install somewhere with a short path.** Some Python packages nest deeply enough to exceed
  the 260-character limit, and pip fails part way through with a missing-file error. Either
  install under something like `C:\voxinq`, or enable long-path support (pip prints the link).

Data lives outside the install directory (`%LOCALAPPDATA%\voxinq`,
`~/Library/Application Support/voxinq`, `~/.local/share/voxinq`), so reinstalling or upgrading
the app cannot delete it. Ports are chosen at start time, so it does not collide with anything
already running — including a Docker install of Voxinq on the same machine.

One thing to know: the bundled PostgreSQL ships the **server** binaries only, with no `psql`
or `pg_dump`. Back up with **Settings → Export** instead. See [cli/README.md](../cli/README.md).

## C. Native install

**Install first** — this is the only route that expects them on the host; A and B bring their
own:

- **Node.js** 20+
- **Python** 3.11
- **PostgreSQL** 17 (running, with a database you can connect to)
- **[Ollama](https://ollama.com)** (default LLM) — or any OpenAI-compatible endpoint

### One-shot script

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

For speaker diarization (optional), add the flag:

```bash
./scripts/setup.sh --diarization      # Windows: .\scripts\setup.ps1 -Diarization
```

That installs sherpa-onnx into `diarization/.venv` and downloads two ONNX models (~33 MB) — no
account, no token. On a machine with an NVIDIA GPU, also install the more accurate pyannote
backend into the same venv and set `HF_TOKEN` (see [Speaker separation](#speaker-separation)):

```bash
diarization/.venv/bin/pip install torch torchaudio torchcodec --index-url https://download.pytorch.org/whl/cu128
diarization/.venv/bin/pip install -r diarization/requirements-pyannote.txt
```

### Starting it

```bash
./scripts/start.sh      # Windows: .\scripts\start.ps1
```

Starts the STT service in the background (reusing it if already running), builds the web app
if needed, and serves it at `http://localhost:3000`. Ctrl+C stops both.

> ⚡ Always serve a **production build** (`start` does). `npm run dev` breaks hydration when
> accessed cross-origin (e.g. over Tailscale).

### Manual install (what the script does)

<details>
<summary>Step-by-step manual setup</summary>

#### 1. Web app

```bash
npm install
cp .env.example .env        # then set DATABASE_URL
npx prisma migrate deploy   # create/update the DB schema
```

#### 2. LLM (Ollama, default)

```bash
ollama pull qwen2.5:7b-instruct   # fits 8 GB VRAM
```

Prefer a bigger model or an external GPU? See **[LLM providers](llm-providers.md)**.

#### 3. STT service (separate Python venv)

```bash
cd stt-service
python -m venv .venv
. .venv/Scripts/activate            # Linux: source .venv/bin/activate
pip install -r requirements.txt
cd ..
```

#### 4. Speaker separation (optional, separate venv)

The ONNX backend, which is what runs without CUDA and needs no account:

```bash
cd diarization
python -m venv .venv
. .venv/Scripts/activate          # Linux/macOS: . .venv/bin/activate
pip install -r requirements.txt
python fetch_models.py            # the two ONNX models (~33 MB). Without this it cannot run.
cd ..
```

On a machine with an NVIDIA GPU, add pyannote as well — it is the more accurate backend and
the one `diarize.py` then selects. Several gigabytes, and it needs `HF_TOKEN`:

```bash
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu128
pip install torchcodec --index-url https://download.pytorch.org/whl/cu128   # Windows: omit the index
pip install -r requirements-pyannote.txt
```

#### 5. Run

```bash
# STT service (GPU)
cd stt-service && . .venv/Scripts/activate && python -m uvicorn server:app --host 0.0.0.0 --port 8000

# Web app (production build)
npm run build && npm start
```

</details>

</details>

## After installing

### What works right away

Worth knowing in which order things start needing setup, so a missing step looks like a missing
step rather than a broken install:

| Step | Works immediately? |
| --- | --- |
| Recording | ✅ |
| Live transcription *as you speak* | ✅ with an NVIDIA GPU or Apple silicon; elsewhere the text arrives when the meeting ends ([why](#what-runs-on-what)) |
| Playing a recording back, editing utterances | ✅ |
| Generating minutes | ✅ once `ollama pull` has finished |
| Recording **from a phone** | Needs `STT_WS_URL` — the phone cannot reach `localhost` |
| **Telling speakers apart** (diarization) | ✅ without a GPU. With an NVIDIA GPU it uses pyannote, which needs `HF_TOKEN` first ([how](#getting-a-hugging-face-token-nvidia-gpus-only)) |
| Voice profiles (naming speakers automatically) | Same as above — it uses the same model |

### Speaker separation

**Diarize** on a finished meeting splits it by speaker; name them once and **Voice profiles**
will recognise those people in later meetings.

Which engine does the work depends on the machine, and so does whether you need to set anything
up:

| your machine | engine | setup |
| --- | --- | --- |
| NVIDIA GPU | pyannote | needs a Hugging Face token — see below |
| anything else (Mac, AMD/Intel GPU, CPU) | sherpa-onnx | nothing; the models ship with the image |

pyannote is noticeably more accurate on long meetings, which is why it is preferred where it
can run. It cannot run usefully without CUDA — on a CPU it takes about as long as the meeting
itself — so machines without a GPU get sherpa-onnx, which runs at roughly five times real time
and needs no account anywhere.

Set `DIA_BACKEND=pyannote` or `DIA_BACKEND=sherpa` in `.env` to override the choice. Forcing
one that cannot run is an error rather than a silent fallback.

#### Getting a Hugging Face token (NVIDIA GPUs only)

Free, and about three minutes. Without it, Diarize on a CUDA machine fails with an
authentication error for a model you have never heard of.

1. Create an account at [huggingface.co](https://huggingface.co/join).
2. Open [pyannote/speaker-diarization-community-1](https://huggingface.co/pyannote/speaker-diarization-community-1)
   and accept the terms. The page grants access immediately.
3. Go to [Settings → Access Tokens](https://huggingface.co/settings/tokens), create a token
   with the **Read** role, and copy it (it starts with `hf_`).
4. Put it in `.env` and restart:

   ```bash
   HF_TOKEN="hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
   ```

Everything except speaker separation and voice profiles works without it.

### Recording from a phone

The browser talks to the STT service **directly**, so the phone needs an address it can reach
and HTTPS — `localhost` is neither. The Tailscale walkthrough, sharing read-only outside your
tailnet, and the WireGuard alternative are all in **[Remote access](remote-access.md)**.

## Operating it

### Running in the background

#### Windows (primary host)

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

### Moving or rebuilding

State lives in three places, so a complete copy needs all three: **PostgreSQL** (meetings,
transcripts, minutes, series, tags, voice profiles), **the recordings directory** (the WAVs
and the utterance boundaries diarization maps speakers onto), and **`settings.json`** (models,
glossary, API keys).

#### From the app (easiest, and covers all three)

**Settings → Data** exports the lot — every meeting, the recordings, and your settings — as one
password-encrypted `.voxbak` file, and restores one by merging it into whatever is already
there. No shell, no database client, and the same on every platform. Full description:
[Usage → Backup & restore](usage.md#backup--restore).

That is the right answer for moving to another machine, for a copy you keep off the box, and
for rebuilding after a mistake.

Reach for the commands below instead when you want something the button cannot do: an
**unattended nightly** dump, or a database-only copy without the audio.

#### Docker

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

#### Native

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

#### Linux

- Web app: `scripts/redeploy.sh`
- STT service: install the provided `stt-service/voxinq-stt.service` systemd unit, then
  `sudo systemctl enable --now voxinq-stt`.

### Branches & releases

Two long-lived branches:

- **`main`** — development. Every PR lands here.
- **`release`** — what production runs. Always points at the latest tagged version.

The **1.x line ended at `v1.5.0`**, which is still published and still installable by pinning
`VOXINQ_VERSION`. It required an NVIDIA GPU; 2.0 does not, which is the reason the major
version changed. Development happens on 2.x, and 1.5 takes fixes only — hotfix it the way any
release is hotfixed, from a branch off its tag.

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

Then publish the GitHub release — **not** as a pre-release, or `latest` stays where it is:

```bash
gh release create v1.1.0 --title v1.1.0 --notes-file <file>
```

Publishing is what builds and pushes the container images, and the only thing that moves
`latest`, so nothing can be deployed from Docker until it has run. The **Publish images**
workflow can also be run by hand for a trial build; that publishes the tag you name and leaves
`latest` alone.

Deploying comes **after** publishing, and depends on how the host runs:

| host runs | deploy with |
| --- | --- |
| Docker | `docker compose pull && docker compose up -d` (set `VOXINQ_VERSION` first to pin) |
| native | `scripts\windows\redeploy-all.ps1`, or `scripts/redeploy.sh` on Linux |

Publishing also builds the release tarball the package managers install from, and — for a full
release, not a prerelease — points the Scoop manifest and Homebrew formula at it and pushes
them to the tap and the bucket. That step used to be manual, and was missed twice running,
which left `scoop install voxinq` serving a prerelease. It needs a `PACKAGING_TOKEN` secret; if
it is missing the job fails loudly rather than leaving the distribution repositories stale.

The workflow also opens a PR putting the same values into `packaging/` here, so the copies in
this repository stay equal to what a package manager installs. Merge it; nothing else depends
on it. (It is created with `GITHUB_TOKEN`, so CI does not run on it.)

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

---

[Docs index](README.md) · Next: [Remote access →](remote-access.md)
