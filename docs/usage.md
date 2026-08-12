# Usage & recipes

## Record a meeting

1. **New meeting** → set the title, purpose, and the recording settings for this meeting
   (model, language, mic mode, source). They are shown, not hidden behind a disclosure,
   because picking the wrong model is silent and costly.
2. **Set up meeting** → creates the meeting, opens the recording screen and starts loading
   the transcription model. Recording does *not* start yet.
3. Wait for **● Model ready** next to the button (a cold load takes tens of seconds), then
   **Start recording** → speak. Words appear about a second behind you and firm up into the
   final wording when you pause.
4. End with one of (all three end the meeting):
   - **Generate minutes** — minutes are generated in the background.
   - **Diarize** — speaker diarization starts automatically on the meeting page
     (enrolled voices get their names); generate minutes after reviewing the speakers.
   - **End only** — just stop; generate or diarize later.

All three land on the meeting itself, where the minutes appear as they finish.

Tips:
- On a phone, keep the screen on while recording.
- There is deliberately no link away from the recording screen: navigating away unmounts it
  and drops the recording. Leave via the end actions.
- Choose the source (mic / PC audio / both) from the top bar; you can switch mid-recording.
- For "both", use headphones to avoid the mic double-capturing PC audio.

## Summarize an existing recording (no live capture)

Drag an audio file (`wav`/`mp3`/`m4a`/…) onto the **New meeting** screen. Voxinq Meeting creates the
meeting, transcribes the file, and generates minutes automatically.

## Recurring series

Assign a meeting to a **Series** (on the New meeting screen, or under *Purpose & agenda →
Edit* on the meeting page). Meetings in the same series share context: when generating
minutes, the **previous meeting's minutes are given to the LLM as reference**, so remarks
like "continuing from last time" are interpreted correctly. *New with same settings* keeps
the series. A series disappears automatically when its last meeting is removed.

Click a **↻ series chip** anywhere to open the **series page**: a timeline of every
meeting with the overview section of its minutes, plus **per-series defaults** — a minutes
format and a transcription glossary that override the global Settings for this series only.

## Speaker diarization

On a meeting page → **Diarize**, in the toolbar above the transcript. Enter the participant
count for better accuracy, run it (the button becomes **Stop** while it works), then rename
the speakers in the editor that appears. Regenerate minutes to use the names.

## Voice profiles (auto-name recurring speakers)

Two ways to enroll a voiceprint; afterwards **diarization automatically names any speaker
whose voice matches an enrolled profile** (manual names are never overwritten):

1. **Guided recording (best for yourself):** Settings → **Speakers** → enter a name, read
   the displayed passage for ~20–30 s, and save. The profile list (with delete) lives there too.
2. **From a diarized meeting (for other participants):** diarize, name the speakers, then
   press **Save voice profiles** below the speaker-name editor. Needs the meeting's
   **recording (WAV) to still exist** — voiceprints are computed from audio.

**Enrolling the same person again adds to their profile rather than replacing it.** The
stored voiceprint is the average of every recording they were enrolled from, so more
samples — different rooms, microphones, moods — make matching steadier, and one poor
recording cannot undo a good profile. Settings shows `×N` once a profile holds more than one
recording. To start over, delete the profile and enroll again.

The match threshold is `voiceprintThreshold` in `settings.json` (default 0.5 — raise it if
wrong names appear).

## Re-transcribe

**Re-transcribe** (its own toggle in the transcript toolbar) re-runs recognition over the
saved recording — pick a larger model like `large-v3` for accuracy. This replaces the whole
transcript, so re-run diarization afterwards.

> Requires the recording to still exist (WAVs auto-delete after 7 days unless protected).

## Regenerate minutes

The **Regenerate** button opens a small panel to pick a **detail level** and **provider**
for that one run — handy to try a bigger model on a specific meeting without changing your
defaults. Past versions are kept; switch between them with the version selector.

## Edit minutes / transcript

- Edit minutes text inline (pencil icon) — useful to fix an LLM slip before sharing.
- Reassign a speaker per line, or rename speakers globally.
- **Edit an utterance** with the pencil on its row: fix a misheard name or term so the minutes
  are built from the right words, without re-transcribing the meeting. Enter saves,
  Shift+Enter adds a line, Esc cancels. Rewording is safe for diarization — only deleting
  changes positions.
- **Delete a single utterance** with the ✕ on its row (hover on desktop, always visible on
  touch). Use it for hallucinations and mic glitches so they cannot reach the minutes; the
  audio itself is kept. The recording's matching utterance boundary is removed at the same
  time, because diarization maps speakers onto utterances by position — if the two could not
  be kept in step, the UI says to re-run **Diarize** before trusting speaker names.

## Suggest fixes (glossary terms the recognizer missed)

**Suggest fixes**, in the transcript toolbar, appears once the meeting has a transcript and you
have a glossary (Settings → Transcription, plus any per-series terms). It asks the LLM to find
places where a glossary term was misheard — usually written as katakana — and proposes a
replacement for each line.

- **Nothing is changed until you say so.** Each suggestion shows under its utterance with
  **Apply** / **Dismiss**, and there is an **Apply all** for the whole set. Applying one is the
  same edit as typing the correction yourself.
- Only glossary terms are proposed. Suggestions that reword a line, change its length
  substantially, or quote an utterance inaccurately are discarded before you see them, so the
  model cannot quietly rewrite what was said.
- This is **the only way a glossary reaches kotoba-whisper**, which ignores the glossary during
  recognition. It also catches terms `large-v3-turbo` missed.
- It uses the GPU, so it is refused while minutes are generating. Nothing is stored.

> **The model matters here.** Measured on a small Japanese sample: `qwen3:8b` found every
> planted term with no false positives; `qwen2.5:7b-instruct` (the setup script's default)
> found none at all and simply reports nothing to fix. If you get no suggestions on a
> transcript you know contains misheard terms, try a larger model in Settings → LLM.

## Ask the minutes

**Series page → Ask about these minutes.** Questions like “前回までのTODOを教えて” are answered
from the minutes of every meeting in that series, so the answer names the meeting and date
each item came from.

- A meeting that belongs to **no series** gets the same box on its own page — a one-off is
  treated as a series of one. Meetings *inside* a series are asked about on the series page,
  where the whole history is available.
- Answers are grounded in the minutes only: the model is told to say when something is not
  recorded rather than fill the gap. The footer states what it could see — how many meetings,
  how many older ones were left out for length, how many have no minutes yet.
- Answering uses the GPU, so it is refused while minutes are generating. Nothing is stored.

## Translation

With `sttTranslate` on (Settings → Transcription), each **non-Japanese** utterance gets a
Japanese translation under it, live during the meeting and on the saved transcript. Japanese
speech is left alone, and **minutes are still generated from the original words** — the
transcript stays the record of what was actually said. A **Show translations** toggle appears
on a meeting once it has any.

Translation runs on the CPU, so it does not compete with transcription for the GPU. Turning
it on downloads a ~600MB model (NLLB-200 distilled) to the STT host on first use; that model
is **CC-BY-NC — non-commercial use only**, which is why this is off by default.

## Search, tags, filters

- Search matches titles, transcripts, and minutes; results show a snippet and where it matched.
- Tag meetings and filter by tag.

## Archive

**Archive** hides a meeting from the list but keeps it in the DB — it still appears in search,
and the **Archived** page (link under the list) shows all of them, grouped by series. Use it to
declutter without deleting. Unarchive from the meeting page, the ⋯ menu on a list card, the
Archived page, or a swipe (below).

## Swipe actions (phones)

On a touch device, swipe a row in the meeting list:

- **Swipe right → Archive** (on the Archived page it unarchives instead)
- **Swipe left → Trash** (asks for confirmation first)

A **collapsed series stack acts on the whole series** — swiping it archives or trashes every
meeting in that series at once. Expand the stack (`show N earlier`) to act on a single meeting.
Vertical scrolling is unaffected, and mouse/desktop behaviour is unchanged.

## Trash

Delete moves a meeting to **Trash** (30-day restore). Permanent delete from Trash removes the
transcript, minutes, and recording for good.

## Share / export

Copy or share minutes and transcripts, or download them as files (`.md` / `.txt`).

---

[Docs index](README.md) · [← LLM providers](llm-providers.md) · Next: [Architecture →](architecture.md)
