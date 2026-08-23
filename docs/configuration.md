# Configuration

Two places: `.env` (build/runtime, restart to apply) and `settings.json` (runtime, editable
in the UI). Both are gitignored.

## `.env`

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | — | PostgreSQL connection string (required). Under Docker this names the compose service: `postgresql://voxinq:PASSWORD@db:5432/voxinq` — a loopback address would mean the web container itself. |
| `STT_WS_URL` | falls back to the build-time value | **Docker path.** STT WebSocket URL the *browser* connects to. Read at request time, so `docker compose up -d` applies it — no rebuild. Set this to record from a phone: `wss://<host>.<tailnet>.ts.net:8443/ws`. |
| `NEXT_PUBLIC_STT_WS_URL` | `ws://localhost:8000/ws` | **Native path.** Same URL, compiled into the browser bundle — **rebuild after changing**. Ignored when `STT_WS_URL` is set. |
| `APP_PASSWORD` | unset | Enables password login. Unset = open within your network. When set, access without a tailnet identity (e.g. via Tailscale Funnel / a public URL) is **read-only**: view & download only, all state-changing requests are refused (HTTP 403). |
| `APP_SESSION_SECRET` | `voxinq-default-secret` | Secret for the auth cookie. Set your own if using `APP_PASSWORD`. |
| `NETWORK_MODE` | `tailscale` | `tailscale`: external (non-tailnet) access is login-gated. `lan`: any reachable client is trusted. |
| `STT_INTERNAL_URL` | `http://127.0.0.1:8000` | Where the web server reaches the STT service (server-side), used on meeting end to read the recorded length and to keep utterance boundaries in step when a line is deleted. Set if STT runs on another host. **Literal `127.0.0.1`, not `localhost`** — see below. |
| `TAILSCALE_BIN` | auto | Path to the `tailscale` CLI, used by **Settings → Remote access** to publish/unpublish. Defaults to the OS install path, then `PATH`. |
| `TAILSCALE_FUNNEL_PORT` | `443` | Public HTTPS port toggled by Remote access. |
| `TAILSCALE_FUNNEL_TARGET` | `localhost:$PORT` | Local web target the Funnel points at. |

Docker-only, read by `docker-compose.yml` rather than by the app:

| Variable | Default | Purpose |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | — | Password for the bundled database. Compose refuses to start without it; use the same value in `DATABASE_URL`. |
| `HF_TOKEN` | unset | Needed for diarization on an NVIDIA GPU, which uses pyannote — a gated model. Without a GPU, diarization uses ungated ONNX models and needs no token. Also needed if `WHISPER_MODEL` points at a gated Hugging Face repo. |
| `DIA_BACKEND` | unset | Which diarization engine to use: `pyannote` (accurate, CUDA + `HF_TOKEN`) or `sherpa` (portable, no token). Unset picks from the hardware. Forcing one that cannot run is an error, not a fallback. |
| `VOXINQ_VERSION` | `latest` | Pin the image tag instead of following releases, e.g. `v1.3.1`. |
| `WEB_PORT` / `STT_PORT` / `DB_PORT` / `OLLAMA_PORT` | `3000` / `8000` / `127.0.0.1:5432` / `127.0.0.1:11434` | Host ports. Only affect access from the host — containers always reach each other by service name. |

STT-side env (optional, read by `stt-service/server.py`): `WHISPER_MODEL`, `WHISPER_DEVICE`,
`WHISPER_COMPUTE` (unset = int8_float16 on CUDA, int8 on CPU), `STT_BACKEND` (unset = choose by
hardware: faster-whisper on CUDA, whisper.cpp everywhere else — GPU-accelerated only on Apple
silicon, plain CPU on an AMD or Intel GPU), `STT_LIVE_TRANSCRIPTION`
(unset = recognise during the meeting only where there is GPU acceleration; a host without it
records and transcribes in one pass at the end), `STT_HOST`, `STT_PORT`,
`STT_RECORDING_RETENTION_DAYS` (default 7),
`STT_IDLE_RELEASE_SECONDS` (default 600), `STT_TRANSLATE_MODEL` / `STT_TRANSLATE_THREADS`
(translation model repo and CPU threads), `STT_PARTIAL_MS` (default 1200 — how often a
provisional "partial" transcription of the segment still being spoken is pushed to the
recording screen; 0 disables partials), and VAD tuning (`VAD_*`).

> **Why `127.0.0.1` rather than `localhost` for same-host services.** The STT service and
> Ollama bind IPv4, but on Windows `localhost` resolves to `::1` first. Any other process
> holding the same port on IPv6 — a Docker container publishing `8000`, for instance — then
> answers these requests instead, silently and with no error to point at. Naming the IPv4
> address avoids the whole class of problem. Same reasoning for `ollamaBaseUrl`.

`STT_ALLOWED_ORIGINS` — comma-separated browser origins allowed to call the STT service.
(This one is read by the **STT service**, not the web app; under Docker it is passed to the
`stt` container by `docker-compose.yml`.)
The browser talks to it directly, so it must accept the origin the web app is served from.
Leave unset to allow the usual self-hosted origins automatically (`localhost`, private LAN
addresses, and `*.ts.net`); set it to lock the service to an explicit list, e.g.
`https://myhost.tailnet.ts.net,http://localhost:3000`. Everything else — including any site
you happen to visit — is refused.

## `settings.json`

Edit these in **Settings** in the UI (no restart needed). API keys are stored in plaintext
here (single on-prem user assumed), so keep the file private.

**Transcription**
- `whisperModel` — `large-v3-turbo` (default), `large-v3`, `medium`, `distil-large-v3`, `small`,
  or `kotoba-tech/kotoba-whisper-v2.0-faster` (distilled on Japanese speech: faster and more
  accurate for Japanese, but Japanese-only and sparse on punctuation; downloaded from Hugging
  Face on first use). Any CTranslate2 model repo id works here.
- `sttLanguage` — `auto` (default) / `ja` / `en`. Forced to `ja` when the model is
  Japanese-only.
- `sttGlossary` — terms/proper nouns to bias recognition (short). Skipped for kotoba-whisper:
  its distilled decoder cannot take a prompt and returns nothing when one is set. These terms
  are also what **Suggest fixes** looks for after a meeting, which is how a glossary reaches
  kotoba-whisper transcripts at all — see [Usage](usage.md#suggest-fixes-glossary-terms-the-recognizer-missed).
- `micMode` — `standard` / `room` (room picks up distant voices)
- `sttTranslate` — `false` (default). Shows a Japanese translation under each non-Japanese
  utterance, live and on the transcript; minutes are still generated from the original words.
  Translation runs on the **CPU**, so it does not compete with transcription for the GPU.
  Enabling it downloads a ~600MB model (NLLB-200 distilled, **CC-BY-NC — non-commercial use
  only**) to the STT host on first use. Override the repo with `STT_TRANSLATE_MODEL`.

**Minutes**
- `summaryLanguage` — `ja` / `en` / `zh` (output language, regardless of what was spoken)
- `summaryDetail` — `brief` / `standard` / `detailed`
- `summaryFormat` — custom heading structure (empty = default)
- `llmBackground` — always-on business/research context (used to interpret terms, not copied into minutes)

**Per-series overrides** (edited on a series page, not in `settings.json`)
- A series can define its own **minutes format** and **transcription glossary**. The series
  format replaces `summaryFormat`, and the series glossary is appended to `sttGlossary`.

**LLM**
- `llmProvider` — `ollama` (default) / `anthropic` / `openai`
- `ollamaBaseUrl`, `ollamaModel`
- `anthropicModel`, `anthropicApiKey`
- `openaiBaseUrl`, `openaiModel`, `openaiApiKey` — key optional for local servers

**Search & speakers** (edit `settings.json` directly)
- `voiceprintThreshold` — cosine similarity needed for voice-profile auto-naming, default `0.5`

See **[LLM providers](llm-providers.md)** for provider details.

## Retention

- **Recordings (WAV):** auto-delete after `STT_RECORDING_RETENTION_DAYS` (default 7). Protect
  a recording to keep it. Minutes/transcripts in the DB are **not** affected.
- **Trash:** deleted meetings are purged after 30 days.
- **Archive:** archived meetings are hidden from the list but stay in the DB and appear in search.

---

[Docs index](README.md) · [← Remote access](remote-access.md) · Next: [LLM providers →](llm-providers.md)
