# Design decisions

Why Voxinq Meeting is built the way it is — including the things it deliberately does *not* do.
Most entries exist because the obvious-looking alternative was tried, measured, or reasoned
through and rejected. If you are about to propose one of these, start here.

The constraint behind most of it: **one consumer GPU with 8 GB of VRAM**, and meetings that are
mostly Japanese.

## The GPU is time-shared, not shared

Whisper (~1–3 GB) and a 7B LLM (~4.7 GB) do not both stay resident on 8 GB. Rather than
shrink both until each is mediocre, the app moves the GPU between them: **Whisper during the
meeting, the LLM after it ends**. Ollama is told to unload (`keep_alive: 0`) when a meeting
starts, and a UI lock prevents a second GPU task from starting while one runs.

The consequence to know about: minutes generation, re-transcription, diarization and answering
questions all queue behind each other. That is the price of not requiring a bigger card.

Translation is the exception — it runs on the **CPU** (NLLB-200 distilled via CTranslate2)
precisely so it can happen *during* a meeting without competing for VRAM.

## Diarization runs after the meeting, not during it

Real-time speaker diarization is expensive and, on this hardware, would compete with the
transcription that has to keep up with live speech. Since the transcript is reviewed after the
meeting anyway, speakers are assigned in a batch pass at the end (pyannote, in its own venv,
as a subprocess).

Speakers map onto utterances **by index**: `segments.json[N]` corresponds to the Nth transcript
row. This is why deleting an utterance also deletes the matching boundary in the recording, and
why editing text does not — rewording changes no positions.

## VAD is two layers, both already present

Recognition quality on meeting audio depends more on segmentation than on the ASR model. Two
mechanisms are in play and are easy to mistake for one:

1. **Utterance boundaries** — an energy/RMS-based VAD in `stt-service/server.py` decides where
   one utterance ends and the next begins (`VAD_SILENCE_MS`, `VAD_ENERGY_THRESH`, and the rest
   of the `VAD_*` settings). This is what makes text appear at natural pauses.
2. **Within-segment silence** — on faster-whisper, `vad_filter=True` hands each segment to its
   built-in **Silero** VAD before recognition, which is the main defence against silence-derived
   hallucinations. whisper.cpp ships its Silero VAD as a separate model that is not wired up
   yet, so on that backend layer 1 and the filters below are what remain.

On top of those, low-confidence segments are dropped by `no_speech_prob` / `avg_logprob`, and a
blocklist catches the canned phrases Whisper emits over silence. Adding another VAD library
would duplicate layer 2.

## Capture is filtered and limited before it leaves the browser

Recording downsamples to the 16 kHz Whisper wants. That was a plain decimation — every third
sample of a 48 kHz stream — with no low-pass first, so everything above 8 kHz folded back into
the band that was kept. An input at 14 kHz arrives as 2 kHz, in the middle of speech. It is not
audible as anything, which is why it went unnoticed; it shows up as words that come back
slightly wrong.

A 6th-order Butterworth now runs before the decimation, cut at 6.4 kHz. The order and cutoff
were picked by measuring where each fold lands rather than by the textbook "just under
Nyquist": 4 kHz is untouched, 6 kHz loses 2 dB (sibilance, which Japanese needs), and the
14 kHz fold is 56 dB down instead of 35. Coefficients are designed on the main thread
(`lib/audio/lowpass.ts`, with the response asserted in tests) and handed to the worklet, which
only runs the recurrence.

Mixing was a bare sum: mic and PC audio both at full scale could add past 1.0 and hit a hard
clip. Each source now gets headroom and the sum passes a limiter, so a loud moment is rounded
rather than squared. What clipping remains is **reported** — the level meter turns amber during
the meeting — because a clipped word is destroyed, not merely loud, and no later processing
recovers it.

Sidechain ducking, which a desktop capture app can do, is not attempted here: Web Audio has no
native sidechain, and the useful part (headroom and a limiter) does not need one.

## Two recognition backends, chosen by the hardware

faster-whisper covers both cases that matter on the original box: `large-v3-turbo` for
multilingual meetings with glossary support, and `kotoba-whisper` for Japanese-only. What it
does not cover is any machine without an NVIDIA card — CTranslate2 has no Metal and no Vulkan
path, so a Mac or an AMD/Intel GPU is left on a slow CPU fallback. That, rather than any
shortcoming in recognition quality, is why a second backend exists.

whisper.cpp (through pywhispercpp) runs on Metal, Vulkan and CPU, and takes a numpy array
directly — so the streaming path hands over the buffers it already builds.

**The choice follows the hardware and defaults to leaving CUDA alone.** With a CUDA device
present the service picks faster-whisper, which is about 30% quicker there; everywhere else it
picks whisper.cpp. `STT_BACKEND` overrides, and a backend that is asked for but not installed
falls back rather than refusing to start. So a CUDA host behaves exactly as it did before any
of this existed, and that is asserted in `stt-service/test_backends.py`.

This is deliberately not the "abstraction layer" that was previously declined here. The
interface is four methods, and it exists because there are now two real implementations to
abstract over — which was the condition stated for writing one.

The alternatives that still do not fit:

- **VibeVoice-ASR** — 7B. It cannot share 8 GB with anything, and OOMs on long audio even on
  much larger cards.
- **Parakeet** — strong on English, unproven for Japanese meetings, which is the primary use.

## kotoba-whisper is never given the glossary

Measured, not assumed: passing an `initial_prompt` to kotoba-whisper made it emit **nothing at
all** — 0 of 3 utterances on audio where the same model without the prompt got 3 of 3. The
distilled 2-layer decoder cannot handle the prompt. `_effective_prompt()` drops the glossary for
kotoba models rather than dropping the model.

## Semantic search / RAG was built, then removed

Meetings were embedded (bge-m3 via Ollama) with cosine ranking in the app, behind an "AI search"
toggle. It was removed in the list-UI overhaul because keyword search over titles, transcripts
and minutes answered the same questions more predictably.

**Ask** deliberately does not use retrieval either. It packs a series' minutes newest-first and
drops the oldest only when they do not fit, then says so in the footer. For "what were the TODOs
so far", missing a meeting because it ranked poorly is worse than a longer prompt — the current
approach cannot silently skip one.

Revisit when a single series stops fitting in the context window (roughly 30–50 meetings). At
that point `pgvector` on the existing PostgreSQL is the natural step; a separate vector service
would not be.

## Minutes are Markdown, not structured JSON

Constrained decoding would guarantee well-formed fields, but the minutes format is a **user
setting** — editable globally and overridable per series. A fixed schema would remove the
feature that makes the output fit each meeting. Format adherence is handled where it actually
breaks: the first heading is pinned via an assistant prefill, and temperature is held at 0.3.

## Restoring a backup merges; it does not replace

**Settings → Data** exports the instance as one encrypted file and restores one by **adding what
is missing**: meetings whose id is already present are skipped, series and tags are matched by
name, and voice profiles keep the local copy on a name collision. Running the same file twice
changes nothing the second time.

Replace-everything is the easier semantic and the wrong default here. The common uses are moving
to a new machine, and pulling one meeting back after deleting it by mistake — and in the second
one, a restore that wipes everything newer is a second, larger accident. Merging means a restore
can be run against a live install without a rehearsal.

The file is encrypted with a password because of what is in it: every transcript, and the API
keys from `settings.json`, in the clear. It is meant to be copied somewhere else, where this
server's login no longer protects it. **The password cannot be recovered** — not by the server,
which never sees it, and not by anyone else. A backup you cannot open is a real cost, and it is
the price of a backup that leaking does not expose everything.

## Live transcript polls the database, not the STT service

While one device records, others watching the meeting page see utterances appear. They do not
stream from the STT service; they poll the ordinary meeting API every few seconds.

The recording device already saves each utterance as it is finalised, so the database is a
complete record within a round-trip of the words being recognised — no new transport was needed
for the useful part. Streaming from STT would have added one: a broadcast fan-out on a service
that today only writes to the socket that asked, plus a second live path to keep correct.

It also would not reach the audience. Read-only viewers outside the tailnet can load the page but
cannot reach the STT service at all, and they are exactly the people watching rather than
recording. Polling works for everyone.

What this gives up is the provisional text that appears on the recording device as someone
speaks. That text is a partial hypothesis, rewritten as the model hears more of the sentence, and
it is never saved. Watching it change is useful when you are the one recording and can correct
course; it is noise for someone reading along.

A poll is merged, not applied: a response in flight cannot undo an edit made in the meantime
(`lib/live-merge.ts`).

## Single user, by design

There is no user model, no per-meeting ownership, and one `settings.json`. The threat model is
"my meetings, on my machine, reachable from my phone" — served by Tailscale, optional password
auth, and a read-only public link for sharing.

Multi-user would mean an ownership column, authorization on ~30 API routes (one miss = someone
else's minutes), and per-user settings — and 8 GB still allows only one recording at a time. If
it is ever added, the cheap path is the `Tailscale-User-Login` header that already arrives on
every tailnet request.

## Fonts are bundled for Latin, borrowed from the OS for Japanese

`next/font/google` downloads at **build** time and caches the URLs it was handed. Google
rotated the Noto Sans JP files, every cached URL began returning 404, and the build failed —
taking production down with it, on a project whose premise is not depending on anyone else's
servers. A build that needs the network is a build that someone else can break.

Inter is now committed to the repo (`app/fonts/`, latin subset, 48 KB) and loaded through
`next/font/local`, so the build reaches nothing external.

Japanese is **not** bundled. The face alone costs 5.4 MB as a variable font and 16 MB as three
static weights, and every platform already ships a good one — so `globals.css` names them
instead: Hiragino Sans, BIZ UDPGothic, Meiryo, then `sans-serif` for Android's Noto Sans CJK.
Yu Gothic is deliberately left out of that list; it is what Windows would otherwise choose.

The trade is that Japanese rendering varies a little between devices. Bundling the variable
face is a one-line change in `layout.tsx` for anyone who would rather have it identical
everywhere.

## Docker was removed, brought back to distribute, and then adopted

The Docker files were deleted once because the primary host ran natively (Task Scheduler,
`redeploy-*.ps1`) and nothing used them. They returned as a **distribution** mechanism: the
prerequisite list (CUDA, Node, Python, PostgreSQL, Ollama) is the biggest barrier for anyone
else adopting this.

Building that for other people turned out to be the argument for using it. Running the compose
stack to test it made the native setup look like what it was — a pile of scheduled tasks, a
hand-placed PostgreSQL and redeploy scripts that each host had to be talked through — so in
August 2026 the author's own machine moved to Docker too, and the native path is now maintained
for people who install that way rather than because it is what production runs.

The native scripts stay: `setup.ps1`/`setup.sh` still work, and someone who would rather not run
containers is not worse off. What changed is which one gets exercised daily.

Desktop installers (`.exe` / `.dmg`) are out of scope: macOS has no CUDA, so a `.dmg` would mean
reimplementing the STT and diarization stack on Metal — a different project.

## Considered and not doing (yet)

Reasonable suggestions that keep coming back, with what stops them. Each has a condition that
would change the answer.

**Published accuracy benchmarks** (WER/CER, diarization error rate, hallucination rate on
Japanese meetings). It is the most common suggestion and the most attractive one: "runs on 8 GB"
means little without a number next to it. What stops it is the corpus. Real meetings here are
confidential and cannot be published, and public Japanese speech corpora are read speech or
scripted dialogue — the acoustics that actually cost accuracy in this app (a room mic, crosstalk,
someone on a laptop speaker) are the ones they do not have. A benchmark on the wrong audio is
worse than none: it would be quoted. *Changes if* a suitable recorded-meeting corpus with
reference transcripts becomes available, or if enough consenting recordings accumulate to build
one.

**A GPU task queue in the UI.** There is no queue to show. GPU work is mutually exclusive, not
ordered: a second task is refused with a 409 rather than lined up, because the useful behaviour
when transcription is running is to tell you, not to start minutes twenty minutes later. The
header already reports what holds the GPU and disables the buttons that would fail
(`app/use-gpu-busy.ts`). Drawing a queue would mean building one first, and waiting in line is
not better than being told to try again. *Changes if* tasks are ever made to run unattended.

**Evidence timestamps in the minutes** — each claim linked to the utterance it came from.
Attractive, and it is the transcript that carries verification today: every line is timestamped
and clicking one plays that moment. Generating those references reliably is a different matter. A
7B model asked to cite line numbers while summarising gets them subtly wrong, and the checking
layer (does this line exist, does it support this claim) ends up larger and less reliable than
the feature. The glossary-correction feature is the shape that does work: the model finds
candidates, the server validates them against the text, the user approves. *Changes if* a local
model that can hold references accurately becomes practical here.

**Speaker names inferred by the LLM** from context ("thanks, Tanaka" → speaker 1 is Tanaka).
Plausible, and wrong often enough to be a problem: a name in the text is as likely to be someone
being discussed as someone speaking. Voice profiles solve the same problem from the audio, where
the evidence actually is.

**pgvector / retrieval for Ask** — see above; **cloud LLM as the default** — contradicts the
premise; **Prisma 7** — a major upgrade for no feature this needs, and `dependabot.yml` already
declines majors.

---

[Docs index](README.md) · [← Architecture](architecture.md)
