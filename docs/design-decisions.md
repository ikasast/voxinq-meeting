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
2. **Within-segment silence** — `vad_filter=True` hands each segment to faster-whisper's own
   **Silero** VAD before recognition, which is the main defence against silence-derived
   hallucinations.

On top of those, low-confidence segments are dropped by `no_speech_prob` / `avg_logprob`, and a
blocklist catches the canned phrases Whisper emits over silence. Adding another VAD library
would duplicate layer 2.

## Whisper stays; no ASR backend abstraction (yet)

faster-whisper covers both cases that matter here: `large-v3-turbo` for multilingual meetings
with glossary support, and `kotoba-whisper` for Japanese-only. The obvious 2026 alternatives do
not fit this box:

- **VibeVoice-ASR** — 7B. It cannot share 8 GB with anything, and OOMs on long audio even on
  much larger cards.
- **Parakeet** — strong on English, unproven for Japanese meetings, which is the primary use.

An abstraction layer is worth writing when there is a second real implementation to abstract
over. Until one exists that runs here, `lib/stt/models.ts` (the model registry) is the seam,
and swapping models is a settings change.

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

## Docker was removed, then brought back for a different reason

The Docker files were deleted once because the primary host runs natively (Task Scheduler,
`redeploy-*.ps1`) and nothing used them. They returned as a **distribution** mechanism: the
prerequisite list (CUDA, Node, Python, PostgreSQL, Ollama) is the biggest barrier for anyone
else adopting this. Native deployment remains what the author's own machine runs.

Desktop installers (`.exe` / `.dmg`) are out of scope: macOS has no CUDA, so a `.dmg` would mean
reimplementing the STT and diarization stack on Metal — a different project.

---

[Docs index](README.md) · [← Architecture](architecture.md)
