# Configuration

Two places: `.env` (build/runtime, restart to apply) and `settings.json` (runtime, editable
in the UI). Both are gitignored.

## `.env`

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | — | PostgreSQL connection string (required) |
| `NEXT_PUBLIC_STT_WS_URL` | `ws://localhost:8000/ws` | STT WebSocket URL. **Baked in at build time** — rebuild after changing. |
| `APP_PASSWORD` | unset | Enables password login. Unset = open within your network. |
| `APP_SESSION_SECRET` | `voxinq-default-secret` | Secret for the auth cookie. Set your own if using `APP_PASSWORD`. |
| `NETWORK_MODE` | `tailscale` | `tailscale`: external (non-tailnet) access is login-gated. `lan`: any reachable client is trusted. |

STT-side env (optional, read by `stt-service/server.py`): `WHISPER_MODEL`, `WHISPER_DEVICE`,
`WHISPER_COMPUTE`, `STT_HOST`, `STT_PORT`, `STT_RECORDING_RETENTION_DAYS` (default 7),
`STT_IDLE_RELEASE_SECONDS` (default 600), and VAD tuning (`VAD_*`).

## `settings.json`

Edit these in **Settings** in the UI (no restart needed). API keys are stored in plaintext
here (single on-prem user assumed), so keep the file private.

**Transcription**
- `whisperModel` — `large-v3-turbo` (default), `large-v3`, `medium`, `distil-large-v3`, `small`
- `sttLanguage` — `auto` (default) / `ja` / `en`
- `sttGlossary` — terms/proper nouns to bias recognition (short)
- `micMode` — `standard` / `room` (room picks up distant voices)

**Minutes**
- `summaryLanguage` — `ja` / `en` / `zh` (output language, regardless of what was spoken)
- `summaryDetail` — `brief` / `standard` / `detailed`
- `summaryFormat` — custom heading structure (empty = default)
- `llmBackground` — always-on business/research context (used to interpret terms, not copied into minutes)

**LLM**
- `llmProvider` — `ollama` (default) / `anthropic` / `openai`
- `ollamaBaseUrl`, `ollamaModel`
- `anthropicModel`, `anthropicApiKey`
- `openaiBaseUrl`, `openaiModel`, `openaiApiKey` — key optional for local servers

See **[LLM providers](llm-providers.md)** for provider details.

## Retention

- **Recordings (WAV):** auto-delete after `STT_RECORDING_RETENTION_DAYS` (default 7). Protect
  a recording to keep it. Minutes/transcripts in the DB are **not** affected.
- **Trash:** deleted meetings are purged after 30 days.
- **Archive:** archived meetings are hidden from the list but stay in the DB and appear in search.

---

[Docs index](README.md) · [← Setup](setup.md) · Next: [LLM providers →](llm-providers.md)
