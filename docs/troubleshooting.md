# Troubleshooting

## The page is blank / unresponsive over Tailscale

You are serving a dev build. `npm run dev` breaks hydration when accessed cross-origin. Always
run a **production build**: `npm run build && npm start`.

## Transcript stays on "Preparing" and never updates

The Whisper model is loading (first meeting can take ~1 minute). Audio is captured meanwhile
and transcribed once the model is ready. If it never proceeds, check the STT logs
(`stt-service/stt.log`) and that the GPU has free VRAM.

## STT won't reflect new code after a restart

`Stop-ScheduledTask` can leave the Python process running. Instead, kill the process owning
port 8000 — the `run-stt.bat` loop relaunches with the new code in ~15s:

```powershell
Stop-Process -Id (Get-NetTCPConnection -LocalPort 8000 -State Listen).OwningProcess -Force
```

## `prisma generate` fails with EPERM (locked DLL)

The web server is holding the Prisma engine. Stop the web app, run `npx prisma generate`, then
restart it.

## Minutes contain content that was never discussed

Usually the business-background context leaking in, or the transcript being truncated. Voxinq Meeting
sizes the LLM context from the input and chunk-summarizes long meetings; if you changed models,
make sure the endpoint's context window is adequate. Keep `llmBackground` concise.

## Recording lost after ending on a phone

Fixed: pressing "back" to the recording page no longer restarts an ended meeting. If a WAV is
missing, note that recordings auto-delete after 7 days unless protected.

## Diarization finds only one speaker

The recording may be too short or one-sided. Try a longer clip where both sides speak multiple
times, pass the participant count, or assign speakers manually per line.

## Out of VRAM

Whisper (`large-v3` ≈ 3 GB) and the LLM (7B ≈ 5 GB) cannot both stay resident on 8 GB. Voxinq Meeting
releases Whisper on meeting end. If needed, use a smaller Whisper model (`medium`) or
`OLLAMA_KEEP_ALIVE=0`.

---

[Docs index](README.md) · [← Architecture](architecture.md)
