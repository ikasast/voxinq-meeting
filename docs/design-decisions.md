# Design decisions

Why Voxinq Meeting is built the way it is — including the things it deliberately does *not* do.
Most entries exist because the obvious-looking alternative was tried, measured, or reasoned
through and rejected. If you are about to propose one of these, start here.

The requirement behind all of it is the next section. The constraint behind much of the rest:
**one consumer GPU with 8 GB of VRAM**, and meetings that are mostly Japanese — that is the
machine this was written on, not a premise of the app, which runs without a GPU at all.

## Running entirely on your own machine is a requirement, not a default

Everything Voxinq needs to do its job — record, recognise speech, separate speakers, translate,
write minutes, store it all — has an implementation that runs on the machine in front of you and
talks to nothing else. That is the requirement. It is checkable: `app/` and `lib/` contain no
external URL that is fetched at runtime, Latin type is bundled through `next/font/local`
rather than pulled from a font CDN, the service worker intercepts nothing and caches nothing —
it exists only because Chromium will not offer to install the app without one — and the
launcher carries its own PostgreSQL, so even the database is not something you have to go and
get.

**This is not the same as forbidding anything else, and the difference is the whole point.**
Cloud providers for minutes are supported, deliberately, and a cloud model does write better
minutes than a 7B on 8 GB. What is rejected is a cloud service being *required*, or being the
default, or being the path of least resistance that a local one has to be argued for against.
An option someone chooses, having been told what it does, is not a compromise of this; a
dependency they cannot remove is.

The distinction shows up as a rule about where the work goes when nothing is configured.
Recognition picks a backend from the hardware and both of them are local. Diarization does the
same, and its second backend exists partly so that speaker separation stops needing a Hugging
Face account. Translation runs on the CPU rather than asking anyone. The provider selector
defaults to Ollama, and choosing otherwise raises a notice naming the host your transcripts
will go to.

**What this costs** is that the local path has to be built and kept working even where a hosted
API would be less effort — two speech backends instead of one, two diarization backends, a
model-download step in `voxinq setup` that a cloud call would not need, and an 8 GB VRAM budget
threaded through the LLM context sizing. Several entries below are that bill arriving.

**Where the line sits.** Voiceprints and the database stay on the machine, full stop: a
voiceprint is biometric, and nothing in the app has a route that sends one anywhere. Recordings
are *stored* only here too — but recognition can be sent to an endpoint you name, and what goes
over that wire is the audio itself, not the transcript.

That is the sharpest case of the paragraph above, and it is why the audio path has the loudest
notices in the app rather than the quietest. Sending a transcript somewhere is a decision its
owner can make. Sending everyone's voice somewhere is not obviously theirs alone — so it is off
until it is chosen, chosen per run rather than once in a setting, and the destination host is
named in the confirmation, in the endpoint list and on the settings screen while it is in force.
What is refused is the version of this where it is the default, or where a screen says "local"
while audio leaves.

The point of the requirement is not that everyone will want it. Most people are already sending
this material somewhere. It is that **being able to stop is a property you cannot add later** —
it has to be true of the whole design, and once any single piece has no local implementation,
it stops being true of all of it.

## The GPU is time-shared, not shared

This is about a machine with **one CUDA card of about 8 GB**, which is what Voxinq was written
on. A host with no GPU has nothing to arbitrate — the queue still serialises the work, but it
is CPU time being shared rather than VRAM.

Whisper (~1–3 GB) and a 7B LLM (~4.7 GB) do not both stay resident on 8 GB. Rather than
shrink both until each is mediocre, the app moves the GPU between them: **Whisper during the
meeting, the LLM after it ends**. Ollama is told to unload (`keep_alive: 0`) when a meeting
starts.

Translation is the exception — it runs on the **CPU** (NLLB-200 distilled via CTranslate2)
precisely so it can happen *during* a meeting without competing for VRAM.

## Arbitration is a measurement, not a count

The rule used to be **one GPU task at a time**, enforced by a lock in the UI: a button went
dead while anything else ran. It was right for the case it was written for and wrong
everywhere else. A re-transcription sent to Groq uses no video memory at all; so do minutes
written by Anthropic. Both waited behind local work for no reason other than the rule being a
count rather than a measurement.

Work is now priced when it is queued (`lib/queue/capacity.ts`) and admitted while the running
total fits a budget: the card's total less headroom for the display, or a saved figure when
someone has measured their own machine. An Ollama model is costed by asking Ollama what it
holds, plus a fifth for the context it cannot see. Anything running on someone else's machine
costs **zero** and never waits.

The estimates decide what may *start together*, not what is allowed to exist: a job larger
than the whole budget still runs, alone, because the alternative is a queue that silently
never moves.

Two consequences worth stating plainly:

- **The queue is server-side.** Minutes, diarization and re-transcription are rows in a table
  claimed with `FOR UPDATE SKIP LOCKED`, not work the browser drives. Closing the tab used to
  abandon a run — the service finished and nothing applied the answer, which read as
  diarization silently not happening. Now it does not.
- **A stopped run does not requeue itself.** Whoever stopped it decides whether it happens
  again. The one thing that cannot actually be stopped is a recognition pass already running
  on the transcription service; that one finishes and its result is discarded, and the app
  says so rather than letting it look instant.

## A recording asks for the GPU rather than waiting for it

Everything else in the queue can wait. A recording cannot: it starts when someone presses a
button in a room where people have already begun talking, and "the card is busy" is not an
answer you can give them. Under the old lock the record button simply went dead.

So a recording asks. What is running is named, and there are two answers — interrupt it, or
record without recognising as you go. Neither is destructive: the audio is kept either way,
and what changes is whether text appears while you talk. An interrupted job goes back to the
**front** of the queue with the reason recorded on it, because the person interrupting wants
to record, not to abandon their minutes.

The question is deliberately rare. Only work that actually occupies the card counts as being
in the way, so a cloud model writing minutes produces no dialog at all. A confirmation that
appears every time is one people learn to click through, and then it means nothing.

A live recording takes a row in the same table — already `running`, holding what recognition
needs — so admission control sees the card is spoken for without knowing anything special
about recordings. The hard part is releasing it: the screen does so when the meeting ends, on
unmount, and on `pagehide`, and none of those fire for a browser that is killed or a phone
that discards the tab. A hold nobody releases is a queue that never moves again, so the
dispatcher also asks the STT service which meetings still have a live connection and releases
the rest. It releases only what it can confirm — an unreachable service means "I could not
ask", not "nothing is recording" — and never a hold younger than 90 seconds, because the hold
is taken before the websocket exists.

Restart recovery excludes recordings for the same reason. A recording is a browser talking
straight to the STT service; the web app restarting does not interrupt it, so requeueing the
hold would drop it mid-meeting and let something heavy start underneath.

## The microphone is checked before the meeting, and the check keeps the microphone

The most expensive failure this app has is a meeting nobody recorded. Everything else is
recoverable — minutes can be regenerated, speakers reassigned, a transcript re-run from the
audio — and that one is not. Until v3 the level meter only moved once recording had started,
which is after the point where knowing is any use.

Two things make the check worth trusting:

**It asks for the microphone with the constraints the recording will use**, from one shared
function. Echo cancellation and noise suppression are off in room mode and forced on for
mic + PC audio, and silence *caused* by those settings is exactly the failure being looked
for — so a check that ran with different ones would be a check of something else.

**It hands its microphone to the recording rather than releasing it.** Some phones fail the
second `getUserMedia` of a session, which would make the check break the thing it had just
blessed. The recording takes ownership and stops the tracks at the end. Falling back to
acquiring is not a failure path: it is what happens when nobody ran the check, which is most
of the time.

The sampling runs on a timer rather than `requestAnimationFrame`. rAF does not fire at all
while a tab is hidden — measured at zero frames in a second — so a phone whose screen dimmed
mid-check would freeze the bar and then report silence at the end. A check that answers wrongly
is worse than having no check, and timers are throttled in the background rather than stopped.

## A series is listed, not folded

A recurring series used to be drawn as one stacked entry: newest meeting on top, the rest
behind a disclosure. It made the list shorter and it made it wrong. Four weekly meetings are
four meetings, and the ones folded away were the ones people scroll looking for — the older
instalment with the decision in it.

Every meeting is its own row now, and the series chip filters the list instead. That carries
the same information the stack carried without taking the rows away to carry it, and it costs
one click to get the grouped view back.

The calendar hides while a series filter is on, for the same reason it hides during a search:
both have already answered "which meetings", and a second way to narrow beside them only ever
narrows towards nothing.

## Diarization runs after the meeting, not during it

Real-time speaker diarization is expensive and, on this hardware, would compete with the
transcription that has to keep up with live speech. Since the transcript is reviewed after the
meeting anyway, speakers are assigned in a batch pass at the end, in its own venv, as a
subprocess.

Speakers map onto utterances **by index**: `segments.json[N]` corresponds to the Nth transcript
row. This is why deleting an utterance also deletes the matching boundary in the recording, and
why editing text does not — rewording changes no positions.

## Diarization has two backends, chosen by the hardware

`diarization/diarize.py` dispatches to one of two implementations:

| | chosen when | needs | accuracy |
| --- | --- | --- | --- |
| `backend_pyannote` | a CUDA device is present | torch + torchcodec, `HF_TOKEN` (gated model) | the reference |
| `backend_sherpa` | otherwise | ONNX Runtime, no token | usable, sometimes much worse |

`DIA_BACKEND=pyannote|sherpa` forces one. An explicit choice that cannot run is an error rather
than a silent downgrade — someone who asked for pyannote wants its accuracy, and quietly
substituting the other one would surface much later as unexplained speaker labels.

This shape is the result of getting it wrong first, and the record is worth keeping.

**v2.0.0-beta.1 replaced pyannote outright with sherpa-onnx.** The reasons were good: the
pyannote pipeline needed PyTorch, a CUDA build of torch and torchcodec, and a Hugging Face
token for a gated model — 20.8 GB of STT image, a dependency chain that had already broken
twice, and a new install that worked perfectly until the first time someone pressed Diarize and
got an authentication error for a model they had never heard of. ONNX Runtime does the same job
in tens of megabytes with ungated models, on any OS and any GPU vendor, which is the whole
point of the 2.0 line. It measured well: on a 105-second meeting, 17 s on CPU (0.18x realtime),
the same five speakers, 11 of 12 utterances attributed identically.

**That validation was the mistake.** One 105-second meeting with twelve utterances is not
evidence about hour-long meetings, and the embedding model chosen — WeSpeaker trained on
VoxCeleb — is trained on English speakers, for an application whose recordings are Japanese.
On real meetings, against pyannote's labels:

| meeting | pyannote | sherpa + VoxCeleb (beta.1) |
| --- | --- | --- |
| 12 min, 3 people | 61 / 38 / 9 | 87 / 20 / 1 — 40% agreement |
| 49 min, 3 people | 3 speakers | 2 speakers, split 430 / 20 |

Four embedding models were then measured against pyannote's labels on the 12-minute meeting:

| embedding model | assignment | agreement |
| --- | --- | --- |
| WeSpeaker CN-Celeb | 62 / 38 / 8 | **91%** |
| NeMo TitaNet | 65 / 42 / 1 | 86% |
| WeSpeaker VoxCeleb (beta.1) | 87 / 20 / 1 | 40% |
| 3D-Speaker CAM++ | 101 / 7 | 59% |

CN-Celeb — Chinese, not English, but far closer to Japanese phonetically — was clearly better,
and sherpa's clustering was rebuilt around it: deliberately over-split, then merged by
duration-weighted centroids where averaging has cancelled the per-turn noise that makes a
usable threshold impossible to find. On the 12-minute meeting that reached 86%. On the
49-minute meeting that had failed, it produced **one** speaker for all 450 utterances — worse
than what it was fixing.

So the swap was reverted, but not thrown away. Losing diarization entirely on a Mac, an AMD or
Intel GPU, or a CPU-only server would cost more than the accuracy gap costs there, and pyannote
is not an answer on those machines: it runs at roughly real time on CPU, turning a 60-minute
meeting into a 60-minute wait, and MPS is not usable. Keeping both means the accurate path
stays exactly as accurate as v1.5 was, and the portable path exists at all.

What that costs, and is accepted: the published STT image carries torch again and is large.
`--build-arg WITH_PYANNOTE=0` builds it without, for hosts where sherpa is the only backend
that would ever be selected.

The lesson that generalises: **validate a component swap on the largest real input available,
not the most convenient one.** The 105-second meeting was chosen because it was quick to run,
and every failure mode that mattered only appears at length.

## Transcription is not reproducible, and the cause is the temperature fallback

Transcribing the same audio twice does not give the same text. Measured on a 12-minute stretch
of a real meeting with the production settings — `large-v3-turbo`, CUDA, `int8_float16`,
`beam_size=5`, VAD on — six pairings of four runs diverged by **15.4% of characters and 20.3%
of words on average**, with single pairs ranging from 10.8% to 19.7%. Nothing about the input
changed between runs.

The cause is faster-whisper's temperature fallback. Its default `temperature` is a ladder
(0.0, 0.2 … 1.0): a segment that fails the compression-ratio or log-probability checks is
re-decoded with **sampling**, and sampling draws random numbers. Pinning `temperature=(0.0,)`
makes runs byte-identical — 0.00% across repeats, at `beam_size` 5 and 1 alike — which locates
the variance precisely. VAD and the CUDA kernels are not contributing; if they were, the pinned
runs would still drift.

`ctranslate2.set_random_seed()` does **not** fix it. Seeding before each call leaves the floor
at 15.4%, so whatever RNG the fallback draws from is not the one that entry seeds.

This is not a bug to be removed. The fallback is the recovery path for the failure Whisper is
most prone to on meeting audio — a segment that decodes into a repetition loop or a canned
hallucination — and it earns its place. But two consequences follow and neither was written
down.

**For anyone using this:** re-running transcription on a meeting produces materially different
text. Not different meaning, usually, but different wording, and occasionally a phrase that was
there before is gone. Re-transcribing is not a way to "get the same thing again".

**For anyone measuring this:** the noise floor is larger than most differences worth measuring,
so any A/B on recognition needs a control of the same audio against itself before its number
means anything. The **13.8%** recorded below for [whisper.cpp against faster-whisper](#what-whispercpp-costs-on-a-cpu)
has no such control and sits *below* the floor measured here. That does not make it wrong — it
was measured on different material, in Japanese, and the floor is material-dependent — but it
does mean the figure cannot presently be relied on as a quality difference between the two
engines. It should be re-measured against a control before it is quoted again.

## Opus on the wire was measured and could not be cleared

The browser streams 16 kHz signed 16-bit PCM: **256 kbps**, continuously, for the length of the
meeting. Opus would carry the same audio at **23.8 kbps** — measured, not estimated, by encoding
720 seconds and dividing — which is a 10.8x reduction on a link that is often a phone on mobile
data over Tailscale. `AudioEncoder` accepts `opus` at 16 kHz mono directly on Android Chrome, so
the existing 16 kHz pipeline would not have to be rebuilt around Opus's native 48 kHz.

It is not adopted, because the accuracy question could not be answered on the material
available. What the measurement did establish:

- **16 kbps is below the floor.** It diverges from the original by more than either noise
  floor, consistently. If Opus is ever wired in, 24 kbps is the bottom.
- **At 24 and 32 kbps no character-level effect is detectable.** Original-vs-Opus averaged
  15.99% against an original-vs-original floor of 15.44%, with fully overlapping ranges.
  At word level the cross average sat about 6 points above the floor, but the ranges still
  overlapped and the sample was six and sixteen pairs.
- **Opus audio transcribes more stably than the original**, reproducibly: its self-floor was
  14.0% of words against the original's 20.3%, in two independent experiments. The likely
  reading is that perceptual coding removes the low-level noise that trips the fallback into
  firing — which would mean Opus makes the previous section's problem smaller, not larger.
- The round trip itself is sound: identical sample count, zero lag, comparable RMS. Waveform
  SNR is a meaningless test for a perceptual codec and was discarded.

So nothing found argues against Opus and the bandwidth case is strong, but "we could not detect
harm" is not "there is no harm" — and with one English recording and a 15% noise floor, this
material cannot distinguish them. *Changes if* the floor can be removed, or enough Japanese
meeting audio accumulates to measure across several recordings, Japanese being the primary use
and the case where a lossy codec is most likely to cost something.

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

whisper.cpp (through pywhispercpp) takes a numpy array directly — so the streaming path hands
over the buffers it already builds.

**What that actually accelerates, checked against the shipped wheels rather than assumed:**

| platform | what pywhispercpp 1.5.1 bundles | GPU used |
| --- | --- | --- |
| macOS arm64 | `libggml-metal`, `libggml-blas`, `libggml-cpu` | **Metal** |
| Linux x86_64 | `libggml-cpu` only | none |
| Windows x86_64 | `ggml-cpu.dll` only | none |

whisper.cpp *upstream* supports Vulkan, and an earlier version of this document said so as if
it followed that Voxinq did. It does not: the PyPI wheels for Linux and Windows are CPU builds,
so **an AMD or Intel GPU is not used for transcription at all** — such a machine runs on its
CPU, at the RTF measured below. Only NVIDIA (faster-whisper) and Apple silicon (Metal) get
hardware acceleration.

Enabling Vulkan means building pywhispercpp from source with `GGML_VULKAN=1` and shipping those
wheels, and it is not planned: the payoff is unknown without an AMD machine to measure on, and
shipping an unmeasured claim of GPU support is the same mistake as
[the diarization swap](#diarization-has-two-backends-chosen-by-the-hardware). Documented as CPU
until someone can measure it.

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

### What whisper.cpp costs on a CPU

Measured on a real 12-minute Japanese meeting — 108 utterances, 10.3 minutes of speech — with
the meeting's own `segments.json` fed to both backends, so the VAD is held constant and only
the recogniser differs. Host: 16-core x86, 8 threads (`cpu_count() // 2`).

| | RTF | divergence |
| --- | --- | --- |
| faster-whisper `large-v3-turbo` (CUDA) | **0.09** | reference |
| whisper.cpp `small-q5_1` | **0.55** | 26.3% |
| whisper.cpp `medium-q5_0` | 1.78 | 21.8% |
| whisper.cpp `large-v3-turbo-q5_0` | 2.83 | **13.8%** |
| whisper.cpp `kotoba-whisper-v2.0-q5_0` | 2.82 | 21.4% |

**Read the second column as divergence, not error.** It is character error rate against
faster-whisper's output, because no human transcript exists for these meetings — so it answers
"does a machine without CUDA produce something different from what an RTX produces", which is
the question the second backend raises. It cannot say kotoba is *worse* than turbo: kotoba is a
different model, and any model that is not `large-v3-turbo` is penalised here for not being it.

> ⚠️ **These figures have no control and are not currently reliable.** Later work found that
> faster-whisper transcribing the *same* audio twice diverges by around 15% of characters
> ([why](#transcription-is-not-reproducible-and-the-cause-is-the-temperature-fallback)), which
> is the same order as most of this column and larger than the 13.8%. The ranking may well
> survive — feeding both backends the same `segments.json` removes one large source of drift,
> and the spread from 26.3% to 13.8% is wider than a floor alone would explain — but no number
> here should be quoted as a quality difference until each row is re-measured against the same
> audio compared with itself. The RTF column is unaffected.

The finding that matters is the first column. **Transcription is live**, so RTF above 1 means
the service falls behind the meeting and never catches up. On this CPU only `small-q5_1` fits,
at a divergence a quarter of the transcript wide; the production default at 2.83 would take
about 2.8 hours over a 60-minute meeting.

### Two STT images, because one of them could not run on a Mac at all

The published `stt` image is built on `nvidia/cuda` and carries torch for pyannote. That is
right for the machine it was written for and wrong everywhere else: linux/amd64 only, ~21 GB,
and none of the CUDA half usable without a device. It runs fine on a GPU-less x86 box — which
is how it was tested all along — and **not at all on Apple silicon**, where the architecture
alone rules it out. So the platform the second recognition backend exists to serve had no way
to run the result.

`stt:<tag>-cpu` is the same service with everything CUDA-shaped removed: `python:3.11-slim`,
whisper.cpp for recognition, sherpa-onnx for diarization, no torch. **1.76 GB against
20.9 GB**, built for linux/amd64 and linux/arm64 (the arm64 contents come out within about
10% of the amd64 ones — mostly CTranslate2's bundled Intel libraries, which have no arm64
counterpart). `docker-compose.cpu.yml` selects it and drops the GPU
reservations, which compose otherwise refuses to start against a host with no such device.

The thing to be clear about, because the obvious assumption is wrong: **Metal is not available
inside Docker.** Docker Desktop on macOS runs a Linux VM with no GPU passthrough, so an Apple
silicon machine gets Metal from a *native* install and CPU inference from the containers — the
same laptop, two different answers, and only the native one transcribes live. The containers
are far easier to set up, which is the trade being offered rather than hidden.

### So a host that cannot keep up does not try

The alternative to falling behind is not a smaller model — it is not being live at all.
`backends.live_transcription_available()` decides from hardware acceleration (CUDA, or Apple
silicon where the wheel bundles Metal), and a host without it **records the meeting and
transcribes the whole file once, at the end**, through the same job that already backed
"Re-transcribe". The only thing lost is text *during* the meeting — not the transcript, which
is produced from the same recording by the same model. It is not the same *file* a CUDA host
would have produced, at the 13.8% divergence measured above; what deferring costs is the live
view, and what the second backend costs is that divergence. Two different prices, and the
table above is the one that measures the second.

That was chosen over defaulting those machines to `small` because the two costs are not
comparable. A smaller model is a permanent 26% divergence in the artefact people keep and
search; no live text is an inconvenience during an hour someone is usually paying attention to
the room rather than the screen. Quality is the part that cannot be recovered afterwards.

It also removes the failure it was avoiding rather than shrinking it: nothing is dropped when
recognition is slow — audio backs up through websocket flow control — but "stop" would not
return until the backlog drained, which on an hour-long meeting meant roughly another ninety
minutes. `STT_LIVE_TRANSCRIPTION=1/0` overrides the rule for a machine that knows better.

Two things this does **not** say:

- **Apple Silicon is not measured here.** whisper.cpp on Metal is a different machine
  altogether; Kotoba's published figure is 581 s for 50 minutes of audio on an M2 Pro
  (RTF 0.19), which would clear real time comfortably. Only x86 CPU was measured.
- **Threads are not the lever.** 8 versus 16 threads moved RTF by under 8% on the same audio
  (turbo 2.21 → 2.05, medium 1.29 → 1.32). It is memory-bandwidth bound, so the
  `cpu_count() // 2` default stays.

The spike also found that the backend did not work at all: `beam_search` was sent without
`patience`, so every finalized utterance raised, and the Japanese model's alias named a Hugging
Face repo that pywhispercpp silently declines to resolve. Both are fixed, and
`test_backends.py` now decodes for real rather than only testing which backend gets chosen.

## Recognition can be sent over HTTP, and it is one backend, not a list of vendors

A third recognition backend posts the audio to `/v1/audio/transcriptions` and reads the
segments back. It exists for one machine: no NVIDIA card, no Apple silicon, where recognising
an hour locally takes about three hours. A hosted `whisper-large-v3-turbo` returns it in
minutes.

**It is one implementation because the endpoint is a de-facto standard.** OpenAI defined it;
Groq, Fireworks, Mistral, Azure and OVHcloud implement it; OpenRouter and LiteLLM route on to
Deepgram and AssemblyAI through the same shape. Writing an adapter per vendor would be several
times the code for the same reach.

**Gemini turned out to be worth the second adapter, and it is the only one.** Google's models do
not answer `/v1/audio/transcriptions` — probed, it is a 404 — so they need their own request and
their own reading of the reply: audio inline as base64, `x-goog-api-key` rather than a bearer
token, and per-word annotations instead of segments, which are regrouped into utterances here.
What made it worth writing rather than declining, as it was declined when this was written, is
that it is the one widely available endpoint that returns speaker labels along with the words.
Deepgram and AssemblyAI still have their own shapes and are still not covered; the rule has not
changed, this cleared it.

The choice also pays for itself in the other direction, which is the part worth stating
plainly: **a whisper server of your own on another machine answers the same endpoint.** This is
not a cloud backend that a local server happens to be compatible with. It is an HTTP backend
that a cloud happens to answer.

**It is chosen per job, not at startup, and `choose_backend` never returns it.** The first
version did select it from the environment, which put two places in charge of the same
decision: an install that set `STT_BACKEND=openai` and then switched the app back to local
would have kept uploading audio while the screen said it did not. Now `STT_CLOUD_*` seeds the
app's settings, the app posts the credential with the job, and there is one answer to "where is
this going" — the one the settings screen shows.

Per job also suits what it can do. Live recognition streams and an HTTP round trip per chunk
does not, so this only ever applies to the after-the-meeting pass; the startup choice exists to
pick something that can stream, and this cannot.

**Not live.** `live_transcription_available` returns False for it, which puts it on the path a
CPU-only host already uses — record, then recognise once. Streaming would mean stitching
provider sessions (Gemini's live API caps them at ten minutes) across the recording pipeline,
and the continuous WAV that pipeline produces is what diarization and click-to-play are built
on. The benefit is a transcript that appears during the meeting; the cost is the foundation.

**Splitting is mandatory, not an optimisation.** Every one of these endpoints caps the upload —
25 MB at OpenAI, about thirteen minutes of 16 kHz mono — so an hour-long meeting cannot be sent
whole. Cutting on a clock would slice words in half and lose them at both ends, so each
boundary moves to the quietest 100 ms in the last fifth of the span, and each chunk's segments
are offset back onto the meeting's clock. A meeting always has pauses; if one somehow does not,
the search still finds the least-loud window.

The confidence filters do not apply here. `no_speech_prob` and `avg_logprob` are Whisper's, no
provider returns them, and `Segment`'s defaults keep a segment rather than discarding
everything a backend cannot score. These providers also do not produce the canned
silence-hallucinations those filters exist for.

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

Revisit when a single series stops fitting in the context window. That is not a meeting count,
though it was written as one here for a while: the budget is spent on characters, and minutes
vary enormously in length. Measured across the minutes on one production instance, the shortest
was 406 characters and the longest 10,993 — the median 963. Against the ~21,300 tokens Ask has
to work with on the default Ollama budget, that is 40 meetings at the median, 23 at the mean,
and three or four of the longest. A series of short stand-ups will never reach the wall; a
series of long workshops reaches it in a handful.

So the trigger is a series whose minutes approach the budget, which the Ask footer already
reports the moment it starts dropping the oldest. At that point `pgvector` on the existing
PostgreSQL is the natural step; a separate vector service would not be. Raising `ollamaNumCtx`
is the cheaper move first, where there is VRAM for it.

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

## A voiceprint records which model made it

Enrolled voiceprints are compared by cosine similarity, and until now the only guard against
comparing two incompatible ones was their length. That guard does not hold, and the measurement
is worth keeping:

| | |
| --- | --- |
| pyannote community-1 vs sherpa-onnx WeSpeaker, **same 12 s clip** | **0.39** |
| WeSpeaker, same speaker across two clips | 0.84 |
| WeSpeaker, two different speakers | 0.60 |
| Dimensions | **256 for both** |

Two different spaces wearing the same shape. `cosineSimilarity` only refuses on a length
mismatch and `mergeEmbedding` only replaced on a shape change, so swapping the embedding model
would have left every enrolled profile quietly failing to match, with nothing to explain it.

So a profile now stores the model that produced it, comparisons are refused across models, and
the match threshold belongs to the model rather than being one global number: 0.5 separates
speakers for pyannote, while for WeSpeaker two *different* people scored 0.60 — the same 0.5
would introduce false matches rather than merely be imprecise.

Profiles enrolled before this are read as pyannote, which is what they are, so recording it
costs nobody their voiceprints.

Since diarization gained a second backend there is **no single current model**: which one
produced a vector depends on the STT host's hardware, not on the build. So the id travels with
the embedding — stamped by the diarizer, returned by `/voiceprint` and `/diarize/{id}/status`,
stored on the profile and on the meeting (`diarization_embedding_model`). Nothing infers it.
The settings screen asks the STT service what it produces now and marks anything else
**re-record**; if that service cannot be reached it marks nothing, because telling someone
their voiceprints are dead over a brief outage would send them off to re-record for no reason.

This is also the machinery that made the failed backend swap visible instead of silent, and
`tests/embedding-models.test.ts` reads `EMBEDDING_MODEL_ID` out of both backend `.py` files to
check they still name models this side knows — the drift that started the whole problem.

## The launcher bundles a database, and manages nothing else

`voxinq` (in `cli/`) exists because the native install asks for four things before anything
works — Node, Python, PostgreSQL, Ollama — and PostgreSQL is the one that ends install
attempts. `embedded-postgres` ships the real server binaries per platform, so bundling it costs
no divergence: same schema, same migrations, same Prisma provider as the Docker install, and a
dump moves between them.

**Ollama is deliberately not managed.** It has its own installer on every platform, it is
optional (a cloud model works instead), and a launcher that half-owns someone else's service is
worse than one that reports whether it can see it.

Three choices worth keeping:

- **Data lives outside the install directory** (`%LOCALAPPDATA%\voxinq`,
  `~/Library/Application Support/voxinq`, `~/.local/share/voxinq`). A package manager owns the
  install directory and replaces it wholesale on upgrade — a database there would be deleted by
  an update.
- **Ports are chosen at start time.** A launcher that refuses to start over a port clash is one
  someone has to debug. The browser learns where the STT service landed through `STT_WS_URL`,
  which the web app reads per request, so nothing is rebuilt when a port moves.
- **A port counts as used if something answers on it *or* the wildcard address cannot be
  bound.** Both, because binding alone is not enough: Windows lets a socket take
  `127.0.0.1:8000` while another holds `0.0.0.0:8000`, and the newcomer then shadows the
  running service for every local client — silently. That happened during development, against
  a live install, and is the same shape as the IPv6 problem that made `127.0.0.1` mandatory
  for same-host URLs (see [Configuration](configuration.md#env)): a more specific bind wins,
  and nothing reports it.

The bundled binaries are the **server** only — `pg_ctl` and `postgres`, no `psql` and no
`pg_dump`. Backups therefore go through the app's own encrypted export, not a dump script.

What it does not do yet: bundle Node and Python. `voxinq setup` installs everything that sits
on top of those two runtimes, and packaging them is what a Homebrew or Scoop formula would add.

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

**Vulkan builds of whisper.cpp, so AMD and Intel GPUs are accelerated.** whisper.cpp supports
Vulkan upstream, so this is buildable — pywhispercpp from source with `GGML_VULKAN=1`, plus a
wheel-building CI matrix to ship it. What stops it is that nobody here has an AMD machine, and
Vulkan is not as optimised as CUDA: whether it would actually clear real time on a given
Radeon is unknown, and shipping "AMD GPU supported" without measuring it is the same mistake as
[the diarization swap](#diarization-has-two-backends-chosen-by-the-hardware) — a claim
validated on something other than the thing it claims. The docs say CPU instead, which is what
those machines really do. *Changes if* an AMD or Intel GPU machine is available to measure on,
or a contributor with one offers numbers.

**Capturing internal audio on a phone**, so a call taken on the phone records both sides.
`getDisplayMedia` is implemented by **no mobile browser at all** — not Chrome for Android,
Safari, Samsung Internet or Firefox for Android — and there is no other way for a web page to
reach what another app is playing. The recording screen hides the "PC audio" option there
rather than offering something that cannot work; the documented answer is a speakerphone with
the microphone in **Room** mode, which turns off the echo cancellation that would otherwise
remove the other party's voice.

This was declined because doing it properly means leaving the browser, and one platform's worth
of native app for one feature was not worth it. **That calculation changed**: v3.2 brings an
Android app for a different reason — background recording with the screen off, which no web
page can do — and `MediaProjection` comes almost free once that app exists. It is scheduled
there. iOS still needs ReplayKit and a paid developer account, so it stays out.

## Decided against, not deferred

The entries above have a condition that would change the answer. These do not: they were
weighed and closed.

**Tracing a line of the minutes back to the utterance it came from**, and from there to the
audio. Attractive, and it has a problem underneath it: **the minutes and the transcript are
frequently not in the same language.** `summaryLanguage` sets the output language regardless of
what was spoken, and an English meeting written up in Japanese is a primary use here — so
matching a minutes line to its source by the words in it fails hardest for the people the
feature is for. Semantic matching would cross that gap and would mean reintroducing the
embeddings [this project removed](#semantic-search--rag-was-built-then-removed); the remaining
option is asking the LLM to cite as it writes, which is where it was closed: **the pointer would
be produced by the same model whose output the feature exists to check.** A verification tool
whose central mechanism is generated by the thing under verification is not one.

**Published accuracy benchmarks** (WER/CER, diarization error rate, hallucination rate on
Japanese meetings). The most common suggestion, and closed on the corpus rather than the effort.
Real meetings here are confidential and cannot be published; public Japanese speech corpora are
read or scripted speech, and the acoustics that actually cost accuracy in this app — a room mic,
crosstalk, someone on a laptop speaker — are the ones they do not have. **A benchmark measured
on the wrong audio is worse than no benchmark, because it gets quoted.** The measurements that
do exist here are published as what they are: same-audio reproducibility, whisper.cpp against
faster-whisper, CPU throughput — each with its method and its noise floor, and none of them
dressed up as an accuracy score.

---

[Docs index](README.md) · [← Architecture](architecture.md)
