# Configuration

Two places: `.env` (build/runtime, restart to apply) and `settings.json` (runtime, editable
in the UI). Both are gitignored.

## `.env`

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | — | PostgreSQL connection string (required). Under Docker this names the compose service: `postgresql://voxinq:PASSWORD@db:5432/voxinq` — a loopback address would mean the web container itself. |
| `STT_WS_URL` | falls back to the build-time value | **Docker path.** STT WebSocket URL the *browser* connects to. Read at request time, so `docker compose up -d` applies it — no rebuild. Set this to record from a phone: `wss://<host>.<tailnet>.ts.net:8443/ws`. |
| `NEXT_PUBLIC_STT_WS_URL` | `ws://localhost:8000/ws` | **Native path.** Same URL, compiled into the browser bundle — **rebuild after changing**. Ignored when `STT_WS_URL` is set. |
| `APP_PASSWORD` | unset | The shared password, for an instance with **no accounts**. Unset = open within your network. When set, access without a tailnet identity (Funnel, a public URL) is **read-only**: view & download only, state-changing requests are refused (403). Creating the first account replaces it — see [Accounts](usage.md#accounts). |
| `APP_SESSION_SECRET` | `voxinq-default-secret` | Secret for the auth cookie. Set your own if using `APP_PASSWORD` or accounts. |
| `VOXINQ_SIGNUP` | `open` | `open`: a tailnet identity nobody has seen becomes an account the first time it appears — what keeps a household's phones working with nobody administering anything. `closed`: only an administrator makes accounts, and an unknown identity is sent to the login page. The **first** account is exempt either way, or a server with this closed and nobody on it would have no administrator and no way to make one. An unrecognised value reads as `open`. |
| `VOXINQ_KEY_SECRET` | falls back to `APP_SESSION_SECRET`, then a built-in default | Wraps the keys that are open while somebody is using the app or has work queued. **Without it a stolen database alone reads whatever was unlocked at that moment; with it, a dump or a backup on its own does not.** Keep it out of the backup. Changing it costs nothing: any open key becomes unreadable and the next sign-in opens it again from the password. |
| `NETWORK_MODE` | `tailscale` | `tailscale`: external (non-tailnet) access is login-gated. `lan`: any reachable client is trusted. |
| `STT_INTERNAL_URL` | `http://127.0.0.1:8000` | Where the web server reaches the STT service (server-side). More goes through it than the name suggests: reading a recording's length when a meeting ends, keeping utterance boundaries in step when a line is deleted, **every queued re-transcription and diarization**, and **a recording shared from the Android app**, which is stored through it. Wrong, and all of those fail while live recording — which goes from the browser to `STT_WS_URL` — carries on as if nothing were amiss. Set if STT runs on another host. **Literal `127.0.0.1`, not `localhost`** — see below. |
| `TAILSCALE_BIN` | auto | Path to the `tailscale` CLI, used by **Settings → Remote access** to publish/unpublish. Defaults to the OS install path, then `PATH`. |
| `TAILSCALE_FUNNEL_PORT` | `443` | Public HTTPS port toggled by Remote access. |
| `TAILSCALE_FUNNEL_TARGET` | `localhost:$PORT` | Local web target the Funnel points at. |

Docker-only, read by `docker-compose.yml` rather than by the app:

| Variable | Default | Purpose |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | — | Password for the bundled database. Compose refuses to start without it; use the same value in `DATABASE_URL`. |
| `HF_TOKEN` | unset | Needed for diarization on an NVIDIA GPU, which uses pyannote — a gated model. Without a GPU, diarization uses ungated ONNX models and needs no token. Also needed if `WHISPER_MODEL` points at a gated Hugging Face repo. |
| `DIA_BACKEND` | unset | Which diarization engine to use: `pyannote` (accurate, CUDA + `HF_TOKEN`) or `sherpa` (portable, no token). Unset picks from the hardware. Forcing one that cannot run is an error, not a fallback. |
| `DIA_MIN_PIECE_S` | `0` | When diarization divides a line between two speakers, fold any piece shorter than this many seconds into its neighbour. `0` keeps every piece, deliberately: a short piece is usually a real answer — the "yes" to a question — and folding it away is the mistake the division exists to stop. Raise it only if short fragments turn out to be the diarizer's noise on your recordings. |
| `VOXINQ_VERSION` | `latest` | Pin the image tag instead of following releases, e.g. `v3.8.1`. Unset follows the newest stable release, which is what `latest`, the `release` branch and GitHub's *Latest* badge all name. Prereleases never move `latest`, so a beta or rc has to be named here to be used. `v1.5.0` is the last of the 1.x line — pin it to stay there; it needs an NVIDIA GPU, which 2.0 does not. |
| `TZ` | unset (= UTC) | Timezone the **server** formats meeting dates in: the meeting list, the detail header, the print page and the DOCX/PDF exports. A container has no timezone unless given one, so leaving this unset shows those in UTC while the browser shows transcript timestamps in local time. Set it to yours, e.g. `Asia/Tokyo`. Native installs take the machine's own timezone. |
| `WEB_PORT` / `STT_PORT` / `DB_PORT` / `OLLAMA_PORT` | `3000` / `8000` / `127.0.0.1:5432` / `127.0.0.1:11434` | Host ports. Only affect access from the host — containers always reach each other by service name. |
| `OLLAMA_PROFILE` | unset | Set it to anything (`external` reads well) to **not** start the bundled Ollama, for a host already running one. The container is behind a compose profile, so a name that matches nothing leaves it out. Then point **Settings → LLM** at `http://host.docker.internal:11434`. |

> A host Ollama also needs `OLLAMA_HOST=0.0.0.0` **set on Ollama itself**, not here: it listens
> on loopback by default, and from inside a container loopback is the container. This is the one
> variable in `.env.example` that is a note about another program rather than a setting Voxinq
> reads.

### Read by the STT service

All optional. **Under Docker, the `stt` container receives only the variables
`docker-compose.yml` names** — `HF_TOKEN`, `DIA_BACKEND`, `DIA_MIN_PIECE_S`, `WHISPER_MODEL`,
`STT_ALLOWED_ORIGINS` and `TZ` — so putting any other one below in `.env` does nothing. To set
it, add it to the `stt` service in a `docker-compose.override.yml` beside the compose file, which
Compose reads on its own and git ignores:

```yaml
services:
  stt:
    environment:
      VAD_SILENCE_MS: "900"
```

A native install and the `voxinq` launcher read them from the environment as they are.

| Variable | Default | Purpose |
| --- | --- | --- |
| `WHISPER_MODEL` | `large-v3-turbo` | The model when the app does not name one. The app normally does, from Settings; this is the fallback. |
| `WHISPER_DEVICE` | `cuda` | faster-whisper's device, `cuda` or `cpu`. whisper.cpp picks its own. |
| `WHISPER_COMPUTE` | from the device | The precision: `int8_float16` on CUDA, `int8` on a CPU. `int8_float16` fails to load without CUDA, which is why it is not a fixed default. |
| `STT_BACKEND` | chosen from the hardware | `faster-whisper` on CUDA, `whisper.cpp` everywhere else — GPU-accelerated only on Apple silicon, plain CPU on an AMD or Intel GPU. Set to pin one. |
| `STT_LIVE_TRANSCRIPTION` | chosen from the hardware | Recognise during the meeting only where there is GPU acceleration; a host without it records and transcribes in one pass at the end. |
| `STT_HOST` / `STT_PORT` | `0.0.0.0` / `8000` | Where the service listens. |
| `STT_PRELOAD` | `1` | Load the model when the service starts, so the first meeting does not wait for it. `0` loads it when a meeting first needs it instead. |
| `STT_IDLE_RELEASE_SECONDS` | `600` | Release the model from VRAM after this long with nothing to recognise. |
| `STT_RECORDING_RETENTION_DAYS` | `7` | Delete recordings (the WAV) this many days old, except protected ones. `0` or less keeps them. |
| `STT_RECORDINGS_DIR` | `stt-service/recordings` | Where recordings and their `segments.json` live. The Docker image sets `/data/recordings`, on a volume. |
| `STT_PARTIAL_MS` | `1200` | How often a provisional transcription of the line still being spoken is pushed to the recording screen. `0` turns partials off. |
| `STT_TRANSLATE_MODEL` / `STT_TRANSLATE_THREADS` | — | The translation model's repository, and its CPU threads. |
| `STT_CLOUD_TIMEOUT` | `600` | Seconds to wait for a remote recognition endpoint to answer one request. |
| `STT_GEMINI_GAP` | `0.35` | Seconds of silence that start a new line in Gemini's answer. Gemini hears shorter pauses than an energy detector does, so this is lower than `VAD_SILENCE_MS`. |
| `STT_GEMINI_MAX_SEGMENT` | `20` | The longest a line from Gemini may be, in seconds, for someone who does not pause. |

**Where a line ends, and what counts as nothing** — the live side's voice detection. Change these
only against a recording that came out wrong; they were set against real rooms.

| Variable | Default | Purpose |
| --- | --- | --- |
| `VAD_SILENCE_MS` | `700` | Silence that ends a line. |
| `VAD_MAX_SEGMENT_MS` | `12000` | The longest a line may run before it is cut anyway. |
| `VAD_MIN_SEGMENT_MS` | `300` | Lines shorter than this are dropped. |
| `VAD_ENERGY_THRESH` | `0.012` | The level that counts as sound rather than silence. |
| `VAD_MIN_SPEECH_MS` | `250` | A line with less voiced time than this is not sent to Whisper at all — the guard against the phrases it invents out of silence. |
| `STT_NO_SPEECH_THRESH` / `STT_LOGPROB_THRESH` | `0.6` / `-1.0` | A recognised line is dropped when Whisper's no-speech probability is at least the first **and** its average log-probability at most the second: sure it heard nothing, and unsure of what it wrote. |

### Speaker separation

Read by `diarization/` when the STT service runs it — so under Docker, the same rule as above
applies: anything but `DIA_BACKEND` and `DIA_MIN_PIECE_S` goes in the override file.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DIA_MODEL` | `pyannote/speaker-diarization-community-1` | The pyannote pipeline. `pyannote/speaker-diarization-3.1` is the one to fall back to. |
| `DIA_DEVICE` | `cuda` where there is CUDA | Where pyannote runs. On a CPU it is roughly real time, which is why it is not the CPU backend. |
| `DIA_MIN_SPEAKERS` / `DIA_MAX_SPEAKERS` | unset | Bounds for pyannote when the meeting does not say how many people spoke. |
| `DIA_MODEL_DIR` | `diarization/models` | Where sherpa-onnx's models are kept. |
| `DIA_THREADS` | half the CPU's threads | sherpa-onnx's CPU threads. |
| `DIA_CLUSTER_THRESHOLD` | `0.5` | sherpa-onnx's first clustering pass. It is left to over-split on purpose — its clusters are merged afterwards by their centroids, which is where the speaker count is really decided — so this is rarely the setting to reach for. |

`DIA_NUM_SPEAKERS` is not one to set: the service sets it for each meeting from the participants
ticked as expected to speak, and a value in the environment would apply one count to every
meeting that has none.

### First-run values for `settings.json`

Read by the **web app**, and only as the starting value of a setting that `settings.json` does not
have yet. Once a setting is saved from the UI, the file wins, and changing the variable does
nothing. They exist so an install configured entirely from `.env` works without opening Settings;
the UI is the better place for anything, and especially for keys.

| Variable | Setting it seeds | Default |
| --- | --- | --- |
| `WHISPER_LANGUAGE` | Transcription language | `auto` |
| `LLM_PROVIDER` | Which LLM writes the minutes | `ollama` |
| `OLLAMA_BASE_URL` / `OLLAMA_MODEL` | Ollama's address and model | `http://127.0.0.1:11434` / `qwen2.5:7b-instruct` |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | Anthropic's key and model (`CLAUDE_MODEL` is an older name for the second) | — / `claude-sonnet-4-6` |
| `OPENAI_BASE_URL` / `OPENAI_API_KEY` / `OPENAI_MODEL` | An OpenAI-compatible endpoint | `https://api.openai.com/v1` / — / `gpt-4o-mini` |
| `SUMMARY_LANGUAGE` / `SUMMARY_DETAIL` | The minutes' language and length | `ja` / `standard` |

Under Docker, `OLLAMA_BASE_URL` is set by the compose file to the bundled Ollama.

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

### Recognising speech somewhere else

Endpoints are saved in the app — **Settings → Transcription** — with a name each, and the one
to use is picked per run from *Re-transcribe*, this machine included. The variables below seed
**one** of them so an install can come up already configured; what is set in the app wins.

| Variable | Example | Purpose |
| --- | --- | --- |
| `STT_BACKEND` | `openai` | Any value makes the seeded endpoint the default on first run. Unset leaves the default on this machine. (The STT service reads a variable of the same name for something else — which recognition engine to run locally. They are different settings that happen to share a name.) |
| `STT_CLOUD_BASE_URL` | `https://api.groq.com/openai/v1` | Anything that speaks `/v1/audio/transcriptions`. Seeds one endpoint; leave unset and add them in the app instead. |
| `STT_CLOUD_API_KEY` | `gsk_…` | Bearer token. Not needed by a server of your own that does not ask for one. |
| `STT_CLOUD_MODEL` | `whisper-large-v3-turbo` | Defaults to `whisper-large-v3-turbo`. |

There is no environment variable for a Gemini endpoint: it needs a different request shape and
a different header, so it is added in the app rather than guessed from a URL.

Read by the **web** service, not the STT one. The key stays there: the app posts the job to the
STT service over `STT_INTERNAL_URL` with the credential attached, so it never passes through a
browser — and `toPublic` strips it from everything the settings screen receives.

**Two kinds are understood.** *OpenAI-compatible* means anything speaking
`/v1/audio/transcriptions`: what Groq, OpenAI, Fireworks, Mistral, Azure and OVHcloud
implement, what OpenRouter and LiteLLM route on to Deepgram and AssemblyAI through — and what a
**whisper server of your own on another machine** answers. *Google Gemini* is the second,
because Google's models do not answer that path at all.

The field is the **request format, not the vendor**; the address is separate. Pointing an
OpenAI-compatible endpoint at your own box is a supported configuration and raises no warning in
the app, because nothing is leaving your network — the endpoint list says `your network` for it.

For Gemini, use **`gemini-3.5-transcribe`**. A general model such as `gemini-3.5-flash` answers
with prose and no word timings, which arrives as one unbroken utterance per part and leaves
speaker separation with a single line to attribute; the app reports that rather than leaving a
transcript that merely looks broken. Asking for timings costs a little accuracy and caps
diarized audio at 30 minutes per request — well beyond the ~7.6 minutes each request carries.

It exists for the machine with no NVIDIA card and no Apple silicon, where recognising an hour
of audio locally takes about three hours. A hosted `whisper-large-v3-turbo` returns it in
minutes.

What it applies to, and what it gives up:

- **The after-the-meeting pass only.** Live recognition streams and an HTTP round trip does
  not, so recording still happens the way it always did — and a host slow enough to want this
  was already deferring. On a machine that transcribes live, this is what *Re-transcribe* uses.
- **Long meetings are split.** These endpoints cap the upload, so the recording is cut at the
  quietest moment near each boundary and sent in pieces, with the timestamps stitched back onto
  the meeting's own clock. With the default 20 MB budget that is about **11 minutes** of
  16 kHz audio per request for an OpenAI-compatible endpoint, and about **7.5** for Gemini,
  which sends its audio base64-encoded — four bytes for every three.
- **It is billed by the provider**, roughly $0.25–0.40 per hour of audio at current rates.

What stays here regardless: the recording, the voiceprints, speaker separation and the
database. The settings screen names the destination host while this is in force, so nobody has
to read a `.env` file to find out where their meetings are going. See
[the requirement](design-decisions.md#running-entirely-on-your-own-machine-is-a-requirement-not-a-default).

## `settings.json`

Edit these in **Settings** in the UI (no restart needed). Keep the file private: the API keys in
it are stored in plaintext.

**With accounts, this file is only half the story.** A setting is either the machine's or a
person's, and the split is by what it is *about*:

- **The machine** — `whisperModel`, `vramBudgetMb`, `ollamaNumCtx`. Hardware exists once: two
  people cannot each choose which model is resident on the one GPU. Only an administrator can
  change these, and they live in this file.
- **A person** — everything else below. Stored against the account, and **sparsely**: a setting
  somebody has never touched follows the value in this file, so an administrator moving the house
  standard reaches everybody who has not formed an opinion, and nobody is frozen at the settings
  of the day they signed up.
- **Both** — `sttProfiles`. An administrator publishes endpoints everybody can use, and anybody
  may add their own on top. One list on screen, two underneath.

An administrator edits the values everybody starts from under **Settings → Defaults for
everyone**, which is a separate tab on purpose: setting Japanese for yourself and setting it for
the household are different acts.

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
- `micMode` — `standard` / `room`. Room turns the browser's echo cancellation and noise
  suppression off **and raises the captured level four-fold**. Both halves matter: the first keeps
  a speakerphone's far end from being cancelled away, the second is what lifts a voice from across
  a table above the level below which the service hears silence (`VAD_ENERGY_THRESH`).
- `vramBudgetMb` — megabytes of video memory the [queue](usage.md#the-queue) may commit at
  once. `0` (the default) works it out: the card's total less 1 GB for the display, or 4 GB
  where there is no NVIDIA card and CPU contention serialises the work anyway. Raise it to let
  two things run together on a bigger card; lower it if something else on the machine needs the
  memory. It is a scheduling figure, not a cap on any one job — something larger than the whole
  budget still runs, on its own, because the alternative is a queue that silently never moves.
  Work sent to an endpoint or a cloud model is priced at zero and never waits for the card.
  Minutes are written one meeting at a time whatever the budget, because they share one model.
- `sttProfiles` — saved recognition endpoints, one object each:
  `{ id, name, kind: "openai" | "gemini", baseUrl, model, apiKey }`. Edited in the UI; the keys
  never reach the browser. Empty (the default) means recognition only happens here.
- `sttDefaultProfileId` — which of them new work uses. Empty = this machine. A run can still
  choose any of them, or this machine, from *Re-transcribe*.
- `sttTranslate` — `false` (default). Shows a Japanese translation under each non-Japanese
  utterance, live and on the transcript; minutes are still generated from the original words.
  Translation runs on the **CPU**, so it does not compete with transcription for the GPU.
  Enabling it downloads a ~600MB model (NLLB-200 distilled, **CC-BY-NC — non-commercial use
  only**) to the STT host on first use. Override the repo with `STT_TRANSLATE_MODEL`.

**Minutes**
- `summaryLanguage` — `ja` / `en` / `zh` (output language, regardless of what was spoken)
- `summaryDetail` — `brief` / `standard` / `detailed`
- `minutesTemplates` — saved heading structures, `{ id, name, body }` each. A lecture is not a
  meeting, and the same headings leave one with empty sections. Empty (the default) means the
  built-in format. A `summaryFormat` from an older settings file is migrated into one entry and
  becomes the default, so nothing changes on upgrade.
- `defaultMinutesTemplateId` — which one new minutes use. Empty = the built-in format. Any of
  them can be chosen for a single run from *Regenerate*.
- `llmBackground` — always-on business/research context (used to interpret terms, not copied into minutes)

**Per-series overrides** (edited on a series page, not in `settings.json`)
- A series can define its own **minutes format** and **transcription glossary**. The series
  format wins over `defaultMinutesTemplateId` — it was set for that series deliberately, and a
  later default should not quietly override it — and a template chosen at *Regenerate* wins over
  both. The series glossary is appended to `sttGlossary`.

**LLM**
- `llmProvider` — `ollama` (default) / `anthropic` / `openai`
- `ollamaBaseUrl`, `ollamaModel`
- `anthropicModel`, `anthropicApiKey`
- `openaiBaseUrl`, `openaiModel`, `openaiApiKey` — key optional for local servers

**Appearance**
- `restScreenSeconds` — seconds of no touch before the recording screen goes black while it
  records: `0` (never, the default), `30`, `60`, `300` or `600`. A touch brings it back and it
  rests again after the same wait. The screen lock, the microphone and the upload are all
  unaffected; what it costs is the live transcript. See
  [Usage](usage.md#record-a-meeting).

**Search & speakers** (edit `settings.json` directly)
- `voiceprintThreshold` — cosine similarity needed for voice-profile auto-naming, default `0.5`
- `ollamaNumCtx` — Ollama context window in tokens. `0` (default) uses the built-in budget of
  24576, which is what fits beside a 7B model on 8 GB of VRAM. **This is a VRAM figure, not a
  model limit** — qwen2.5 itself accepts 32k. Raise it on a bigger card; asking for more than
  the card holds does not fail, it makes Ollama spill to the CPU, where generation goes from
  minutes to tens of minutes with nothing to say why. The same number decides when a long
  transcript is condensed before being sent, so there is only one to change.

See **[LLM providers](llm-providers.md)** for provider details.

## Retention

- **Recordings (WAV):** auto-delete after `STT_RECORDING_RETENTION_DAYS` (default 7). Protect
  a recording to keep it. Minutes/transcripts in the DB are **not** affected.
- **Trash:** deleted meetings are purged after 30 days.
- **Archive:** archived meetings are hidden from the list but stay in the DB and appear in search.

---

[Docs index](README.md) · [← Remote access](remote-access.md) · Next: [LLM providers →](llm-providers.md)
