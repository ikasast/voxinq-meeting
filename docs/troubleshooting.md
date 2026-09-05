# Troubleshooting

> **Where the logs are** depends on how you installed. Several entries below name
> `stt-service/stt.log`, which is the **native** path. Under Docker use
> `docker logs voxinq-meeting-stt-1`; under the `voxinq` launcher, `voxinq logs` prints the
> directory.

## The page is blank / unresponsive over Tailscale

You are serving a dev build. `npm run dev` breaks hydration when accessed cross-origin. Always
run a **production build**: `npm run build && npm start`.

## Recording / diarization fails only from a particular URL (CORS)

The STT service only accepts browser requests from the origins a self-hosted setup normally
uses: `localhost`, private LAN addresses (10.x, 192.168.x, 172.16–31.x) and `*.ts.net`
(Tailscale). If you open the web app from some other origin — a custom domain, or a reverse
proxy on a public hostname — the browser console shows a CORS error and STT calls fail.

Fix: list your origins explicitly for the STT service and restart it.

```
STT_ALLOWED_ORIGINS=https://myhost.tailnet.ts.net,http://localhost:3000
```

## Transcript stays on "Preparing" and never updates

The Whisper model is loading (first meeting can take ~1 minute). Audio is captured meanwhile
and transcribed once the model is ready. If it never proceeds, check the STT logs
(`stt-service/stt.log`) and that the GPU has free VRAM.

## Recording takes several minutes to start

Only one Whisper model is resident at a time, so loading a different one releases the current
one. If the model you pick on the New meeting screen is usually *not* the one in
**Settings → Transcription**, the two can end up being loaded alternately, and each swap is a
full load. Look for alternating lines in `stt-service/stt.log`:

```
[preload] loaded model: kotoba-tech/kotoba-whisper-v2.0-faster
[preload] loaded model: large-v3-turbo
```

**Set the model you normally use as the default in Settings.** The per-meeting picker is for
exceptions; when it disagrees with the default on every meeting, you pay for it twice.

## Translations never appear

Check in order:

1. `sttTranslate` is on (**Settings → Transcription**) — it is off by default.
2. The speech was actually **not Japanese**. Japanese utterances are deliberately left alone.
3. `GET /health` on the STT service reports `"translate": {"loaded": true}`. The model is
   warmed when the recording screen opens; if it is still cold when the meeting ends, any
   translation still in flight is discarded when the WebSocket closes. A very short meeting
   started immediately after an STT restart can hit this.
4. `stt-service/stt.log` for `[translate] unavailable:` — a failed load is not retried for the
   life of the process, so restart the service after fixing the cause.

## The site is down after a redeploy

Check whether the build actually produced anything:

```powershell
Test-Path .next\BUILD_ID    # False = the build failed; `next start` cannot run
```

`redeploy-web.ps1` now stops before touching the running server if any step fails, so this
should not happen again. If you hit it on an older copy of the script, rebuild by hand and the
`run-web.bat` watch loop picks the new build up within ~15 seconds:

```powershell
npm run build
```

### The build fails on fonts (404s from fonts.gstatic.com)

Fixed at the source: fonts are no longer fetched from Google at build time. If you are on a
build from before that change, clear the caches so the stale URLs are refetched:

```powershell
Remove-Item -Recurse -Force .next, node_modules\.cache
npm run build
```

## Meeting times are hours off

The date under a meeting's title, and the times in the meeting list, are formatted by the
**server**; the timestamps on transcript lines are formatted by the **browser**. A Docker
container has no timezone unless it is given one, so it formats in UTC — and the same meeting
then shows two different clocks, several hours apart.

Set `TZ` in `.env` to your own zone and restart:

```bash
echo 'TZ="Asia/Tokyo"' >> .env
docker compose up -d
```

Check what the container thinks the time is:

```bash
docker compose exec web date
```

Stored data is unaffected either way — timestamps go into PostgreSQL in UTC and only the
formatting changes, so fixing this corrects meetings that already exist. A native install
takes the machine's timezone and never had the problem.

## Recording works, but the meeting length is wrong or deleting a line says it could not sync

The browser reaches the STT service directly, so recording is fine — but the **web server**
also talks to it, over loopback, to read the recorded length on meeting end and to keep
utterance boundaries in step when you delete a line. If something else has taken port 8000,
those two calls reach the wrong server.

The trap is IPv6: the STT service binds IPv4, while `localhost` resolves to `::1` first on
Windows. A Docker container publishing `8000` therefore shadows it for anything using the
name. Check who is actually listening:

```powershell
Get-NetTCPConnection -LocalPort 8000 -State Listen |
  ForEach-Object { "$($_.LocalAddress)  $((Get-Process -Id $_.OwningProcess).ProcessName)" }
```

Two entries (one `0.0.0.0`, one `::`) mean two different servers. Compare the responses:
`curl http://127.0.0.1:8000/health` should return the STT JSON; if
`curl http://localhost:8000/health` returns something else, that is the collision.

Stop the other service, or point `STT_INTERNAL_URL` at `http://127.0.0.1:8000` explicitly.
(That is the default, so this only bites installs that overrode it with a hostname.)

## STT won't reflect new code after a restart

`Stop-ScheduledTask` can leave the Python process running. Instead, kill the process owning
port 8000 — the `run-stt.bat` loop relaunches with the new code in ~15s:

```powershell
Stop-Process -Id (Get-NetTCPConnection -LocalPort 8000 -State Listen).OwningProcess -Force
```

## `prisma generate` fails with EPERM (locked DLL)

The web server is holding the Prisma engine. Stop the web app, run `npx prisma generate`, then
restart it.

## Minutes generation failed

The meeting page shows the **reason** under "Failed to generate minutes" (or in a banner if
an earlier version exists) plus a **Retry** button. Common causes:

- *Cannot reach Ollama* — the LLM is not running, or the Base URL in Settings is wrong.
- *HTTP 401 / API key not set* — a cloud provider is selected without a key.
- A timeout on a very long meeting: responses are streamed, so slow local models no longer
  hit the old 5-minute limit; if it still fails, try a smaller detail level or a faster model.

## Minutes contain content that was never discussed

Usually the business-background context leaking in, or the transcript being truncated. Voxinq Meeting
sizes the LLM context from the input and chunk-summarizes long meetings; if you changed models,
make sure the endpoint's context window is adequate. Keep `llmBackground` concise.

## The recording screen went black on its own

That is **Settings → Appearance → Rest the screen while recording**, which is off by default
but on if someone set it. A touch brings the screen back; recording never stopped — the screen
lock, the microphone and the upload all keep going, which is why the running time on the black
screen is still counting. Set it back to *Never* if it is not wanted.

## Recording lost after ending on a phone

Fixed: pressing "back" to the recording page no longer restarts an ended meeting. If a WAV is
missing, note that recordings auto-delete after 7 days unless protected.

## The recording came back empty (or nearly)

**Check the microphone before the next one.** The panel above the record button opens the mic
and shows whether anything is arriving; it is the only way to find this out that does not cost
a meeting. The usual causes all look identical from the outside:

- a headset with its own mute switch, muted
- an input the operating system switched on its own — docking, a lid closing, a call ending
- another application holding the microphone exclusively
- the wrong device selected, so the recording is of a room nobody is in

If the check says sound is arriving and the transcript is still empty, the problem is further
along: see "Transcript stays on Preparing" and "No text appears while recording" below.

> The microphone opened by the check is handed to the recording, so what you tested is what
> records. If you change the source or the mic mode afterwards, the check is discarded — the
> constraints would no longer match — and running it again takes a few seconds.

## No text appears while recording

**Does the status say "recording only"?** Then this was chosen when the recording started:
something else was using the GPU and the answer was to leave it alone. The audio is being kept
and will be transcribed when you end the meeting — nothing is lost. Ending it and starting
again is not necessary and would split the recording.

Otherwise, check the badge next to the record button. If it reads **● Transcribes when the meeting ends**,
this is the design rather than a fault: the machine has no GPU acceleration, recognition there
is slower than speech, and trying to keep up would fall behind and never recover. The meeting
is recorded and transcribed in one pass when you end it — the transcript
appears then. [What runs on what](setup.md#what-runs-on-what) explains which machines do which.

`STT_LIVE_TRANSCRIPTION=1` forces live recognition anyway. Expect it to lag on a CPU: measured
at 2.8x the length of the audio with the default model.

If the badge reads **● Model ready** and text still does not appear, that is a different
problem — see "Transcript stays on Preparing" above.

## Diarization finds only one speaker

**Count the utterances first.** Diarization attaches a speaker to each one, so if the whole
meeting is a single line there is one thing to attribute and one speaker is the only possible
answer. That happens when a recognition endpoint returns the transcript without timings —
which a *general* model does: `gemini-3.5-flash` and its like answer with prose, while word
timings and speaker labels come from `gemini-3.5-transcribe`. Re-transcribe reports this now,
naming the model that was asked and the one that reports timings; older runs pre-date the
message. Fix the model in **Settings → Transcription** and re-transcribe, then diarize again.

If the transcript is properly split and diarization still finds one speaker, the recording may
be too short or one-sided. Try a longer clip where both sides speak multiple times, pass the
participant count, or assign speakers manually per line.

**Which backend ran matters here.** `curl http://127.0.0.1:8000/health` reports
`diarizationBackend`. `sherpa` is the ONNX backend used where there is no CUDA, and it is
measurably weaker at this on long meetings — that is the known trade for working at all on
those machines. `pyannote` is the accurate one; if you have an NVIDIA GPU and see `sherpa`,
pyannote did not install (check `HF_TOKEN` and the diarization venv).

## The queue is not moving

Open **Queue**. It says what is running and what is waiting; a job that has been going for
hours has probably wedged and can be stopped from there.

If nothing is running and nothing starts, something is holding the card that should not be. A
**live recording holds it too**, and appears in the queue while the meeting lasts — that is
deliberate, and it is released when the meeting ends, when you leave the recording screen, and
when the tab is closed. A browser that is killed outright, or a phone that discards the tab,
releases nothing, so the queue asks the transcription service every 30 seconds which meetings
still have a live connection and takes the card back from the ones that do not. Holds younger
than 90 seconds are never swept, because the hold is taken before the connection exists.

That sweep needs the STT service. If it cannot be reached it releases nothing on purpose — "I
could not ask" is not "nothing is recording" — so an STT service that is down long enough can
leave a stale hold in place. Check `curl http://127.0.0.1:8000/health`, bring it back, and the
hold clears within a minute.

If a job is *waiting* while the card is plainly free, it may be larger than the budget. That
is allowed — an oversized job runs on its own — but it will not start beside anything else.
`vramBudgetMb` in **Settings → Transcription** is the figure; see
[configuration](configuration.md#settingsjson).

## Out of VRAM

Whisper (`large-v3` ≈ 3 GB) and the LLM (7B ≈ 5 GB) cannot both stay resident on 8 GB. Voxinq Meeting
releases Whisper on meeting end. If needed, use a smaller Whisper model (`medium`) or
`OLLAMA_KEEP_ALIVE=0`.

---

[Docs index](README.md) · [← Architecture](architecture.md)
