# Usage & recipes

## Finding your way round

Navigation is a rail down the left edge on a desktop-sized window, and the bar along the top on
anything narrower. **Meetings** is the list, **New meeting** and **Record NOW** both start one —
the second skips the setup screen — and **Help** opens this documentation.

A meeting's own page puts the minutes and the transcript in the middle, and everything *about*
the meeting in a column to its right: how far it has got, the agenda and tags, who was there,
and what it was recorded and written with. On a window narrower than about 1536px that column
moves above the content rather than beside it.

**Progress** answers the question that otherwise takes reading the whole screen — is this
finished, and what is left:

```
✓ Recorded              22 min
✓ Transcribed           14 utterances
○ Speakers separated
✓ Minutes
```

A circle is "not run", not "failed". Separating speakers and writing minutes are both optional
and can be done in either order, so a meeting you never intended to diarize is not being nagged
at.

## Booking a meeting before it happens

**New meeting → When** puts a meeting in the diary instead of recording it now. It appears
under **Upcoming** at the top of the list, soonest first, and opens on its own page rather than
the recording screen — because the point of booking it is to settle the title, agenda, series
and participants calmly beforehand, rather than while everyone waits to start.

When the meeting comes round, open it and press **Recording screen**. Nothing else differs: it
is an ordinary meeting from the moment anything is said into it.

The date shown is the one it is booked for. Once it has been recorded, the start time is
corrected to when the recording actually began — a meeting booked for Tuesday and recorded on
Wednesday would otherwise read "Tue 14:00 – Wed 15:20".

Leave **When** empty and everything behaves as it always has: the meeting is created and
recording starts immediately.

## Record a meeting

1. **New meeting** → set the title, purpose, and the recording settings for this meeting
   (model, language, mic mode, source). They are shown, not hidden behind a disclosure,
   because picking the wrong model is silent and costly.
2. **Set up meeting** → creates the meeting, opens the recording screen and starts loading
   the transcription model. Recording does *not* start yet.
3. Wait for **● Model ready** in the bar at the top (a cold load takes tens of seconds), then
   **Start recording** — the wide button at the bottom of the screen — and speak. Words appear
   about a second behind you and firm up into the final wording when you pause.

   On a machine with no GPU acceleration the badge instead reads **● Transcribes when the
   meeting ends**, and no text appears while you record. That is the design, not a fault:
   recognition there is slower than speech, so the meeting is recorded and transcribed in one
   pass at the end. The model is the same, though the weights are quantised differently for
   that runtime and the transcript is not identical to a CUDA one — see
   [what runs on what](setup.md#what-runs-on-what).
4. End with one of the three quiet buttons above it (all three end the meeting):
   - **Generate minutes** — minutes are generated in the background.
   - **Diarize** — speaker diarization starts automatically on the meeting page
     (enrolled voices get their names); generate minutes after reviewing the speakers.
   - **End only** — just stop; generate or diarize later.

All three land on the meeting itself, where the minutes appear as they finish.

Tips:
- **Start and Stop are at the bottom**, where a thumb reaches them; the status, the input level
  and the recording source stay at the top, where they are read rather than pressed.
- On a phone the screen is kept on for you, because letting it sleep stops the microphone on
  some devices. That is also what empties the battery, so the screen can **rest**: black, with
  the running time still counting. **Rest screen** in the top bar does it now, and
  *Settings → Appearance* can do it by itself after 30 seconds, 1, 5 or 10 minutes of nobody
  touching it (never, by default). A touch brings it back. Recording is not affected — what you
  lose while it rests is the live transcript.
- There is deliberately no link away from the recording screen: navigating away unmounts it
  and drops the recording. Leave via the end actions.
- Choose the source (mic / PC audio / both) from the top bar; you can switch mid-recording.
- For "both", use headphones to avoid the mic double-capturing PC audio.

### Recording an online meeting you are attending on a phone

"PC audio" does not appear on a phone, and cannot: `getDisplayMedia` is implemented by no
mobile browser at all — not Chrome for Android, Safari, Samsung Internet or Firefox — so there
is no way for a web page to reach the audio another app is playing.

What works instead is the speakerphone, and **it needs one setting changed first**:

1. **Settings → Mic mode → Room.**
2. Put the call on speakerphone, and record with **Microphone**.

The Room setting is not about distance here. In the normal mode the browser's echo
cancellation is on, and its whole job is to remove sound coming from this device's own speaker
from the microphone signal — which on a speakerphone call is precisely the other person's
voice. Recording that way captures your half of the conversation and quietly deletes the rest.
Room mode turns echo cancellation off, so both halves are recorded.

Quality is lower than capturing the audio directly, since it has been through a speaker and a
microphone, but it transcribes well enough to be useful. Capturing internal audio properly
would take a native Android app (MediaProjection); on iOS it would need ReplayKit and a paid
developer account, which is outside what this project does.

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

## Participants

The rail beside a meeting holds who was there. It is worth filling in, because two things hang
off it and neither is obvious:

- **The tick beside each name is "expected to speak", not "attended".** The number of ticked
  names is what diarization is told to look for, and the speaker *count* is the thing it is
  worst at guessing on its own. Someone who sat through the meeting without saying anything
  should be listed and unticked — they stay in the record, and the diarizer stops looking for
  a voice that is not there.
- **A name that matches an enrolled voice profile becomes a candidate for automatic naming, and
  a name that is absent stops being one.** Without a participant list every profile is a
  candidate, so a cluster can be handed the name of someone who was not in the room.

Enrolled profiles appear as buttons — `+ 田中` — and **touching one adds it**; any other name
is typed into the box. Someone who has never been enrolled still counts toward the speaker
count.

Getting a tick wrong is recoverable — **Diarize** can be re-run, and the **Speakers** box above
the transcript overrides the count for one run. Under-counting is the direction that hurts:
telling it to find two voices when three people spoke merges two of them.

## Speaker diarization

On a meeting page → **Diarize**, in the toolbar above the transcript. Enter the participant
count for better accuracy, run it (the button becomes **Stop** while it works), then rename
the speakers in the editor that appears — it sits directly below the button, because it is what
the button produced. Regenerate minutes to use the names.

It reads the saved recording, so **the button is there only while the recording is** — once the
WAV has expired there is nothing left to separate, and speakers can only be set per line.
Re-transcribe disappears at the same moment, for the same reason.

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

**Re-transcribe** — its own row below the speaker names, which opens where it is — re-runs
recognition over the saved recording. Pick a larger model like `large-v3` for accuracy. This
replaces the whole transcript, so re-run diarization afterwards.

> Requires the recording to still exist (WAVs auto-delete after 7 days unless protected).

**Recognition can be done elsewhere, and the choice is per run.** *Settings → Transcription*
holds a list of saved endpoints beside this machine, and the picker here offers all of them —
so a meeting can go to a hosted model once without changing what anything else uses. Two kinds
are understood: anything speaking `/v1/audio/transcriptions` (Groq, OpenAI, or **a whisper
server of your own on another machine**), and Google's own API, which does not.

It is for a host with no NVIDIA card and no Apple silicon, where recognising an hour takes
about three; a hosted model returns it in minutes. It applies to this pass and to the
after-the-meeting one, never to live recognition, which has to stream. Long recordings are
split at a silent moment because these endpoints cap the upload.

For Gemini, use **`gemini-3.5-transcribe`**: a general model such as `gemini-3.5-flash` answers
with prose and no word timings at all, which arrives as one unbroken utterance and leaves
speaker separation with a single line to attribute. Voxinq says so when that happens rather
than leaving you to work it out.

Sending a recording off this machine is named where it is chosen — in the confirmation, and as
the host under each endpoint in Settings. See
[configuration](configuration.md#recognising-speech-somewhere-else).

**Expect different wording even with the same model.** Recognition is not reproducible: on a
12-minute meeting, two runs over identical audio differed in about 15% of characters. That is
by design — a segment Whisper is unsure about is re-decoded with sampling, which is how it
escapes repetition loops — but it means re-transcribing is not a way to get the same transcript
back, and a passage that came out right last time may not this time. If one line is wrong, edit
it; re-transcribing rerolls the whole meeting. See
[design notes](design-decisions.md#transcription-is-not-reproducible-and-the-cause-is-the-temperature-fallback).

## Regenerate minutes

The **Regenerate** button opens a small panel to pick a **detail level**, a **provider** and a
**format** for that one run — handy to try a bigger model on a specific meeting, or to write a
talk up as a lecture rather than as a meeting, without changing your defaults. Formats are
saved in *Settings → Minutes*; a series with its own format keeps using that unless one is
chosen here. Past versions are kept; switch between them with the version selector.

## Play back the recording

While the meeting's WAV still exists, a player sits above the transcript. Each utterance shows
its elapsed time within the recording — **click the timestamp to jump the audio there**. Use it
to check what was actually said before correcting a line, or to settle what a decision was.

> Recordings auto-delete after 7 days unless protected; once the WAV is gone the player and the
> timestamps go with it (the text stays).

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

## Find & replace

**Find & replace** — a row below the speaker names, which opens where it is — fixes a term the
recognizer got wrong the same way throughout: a company name heard as "ネクサス" in forty places
rather than NEXUS.

Type the term and its replacement, then **Preview**: it reports how many utterances match and
shows the first few before/after. Nothing is written until you press replace.

- Matching ignores case by default (**Match case** turns that off), and the replacement is
  written exactly as you typed it — searching `nexus` and replacing with `NEXUS` fixes `Nexus`
  too.
- The term is plain text, never a pattern. `(JPY)` finds those characters, not a group.
- Rewording is safe for diarization; only deleting an utterance changes positions.
- A replacement that would **empty** an utterance is skipped rather than turned into a deletion
  — deleting has to remove the matching boundary in the recording, so it stays a deliberate act
  (the ✕ on the row).

The preview and the write are planned server-side from the stored transcript, so a tab left
open while someone edited a line cannot write back a stale copy.

For a misheard **glossary** term specifically, **Suggest fixes** below is usually better: it
finds the mistakes for you rather than needing to be told what they are.

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

The meeting's ⬇ button (top right) bundles the parts of a meeting: minutes, transcript, a
metadata sheet, the recording. Tick what you want; several parts arrive as a zip.

The **minutes' own ⬇**, in the toolbar on the Minutes card, downloads that one document in
whichever format you need it — Markdown for another tool, and for minutes that have to be filed
or sent to someone rather than read in the app:

- **Word (`.docx`)** — headings, bullets, numbered lists and bold come across as real Word
  formatting, not as Markdown characters. No font is embedded, so Word uses the reader's own —
  Japanese included.
- **PDF (print)** — opens a print view; choose **Save as PDF** as the destination.

> Why PDF goes through your browser rather than being generated on the server: a PDF has to
> carry its own fonts, and a Japanese face is 5.4 MB that this project deliberately does not
> ship (see [Design decisions](design-decisions.md)). Your browser already has the fonts and a
> PDF writer, so it produces better Japanese output than we could.

## Backup & restore

**Settings → Data** exports everything the instance holds — meetings, transcripts, minutes,
series, tags, voice profiles, your settings, and optionally the audio — as a single encrypted
`.voxbak` file.

The file is encrypted with a password you choose there. That is not decoration: the export
contains every transcript and your API keys in the clear, and it is meant to be copied to
another machine or a drive, where this server's login no longer protects it. **There is no way
to recover the password** — nothing on the server can open the file either.

Restoring is a **merge**. Meetings the instance does not already have are added; existing
meetings, series, tags and voice profiles are left exactly as they are. So it is safe to run
against a live install, and running the same file twice does nothing the second time. Settings
are only replaced if you tick the box.

Use it to move an instance to a new machine, or as a backup that — unlike a database dump —
also carries the audio, without which a restored meeting cannot be played, re-transcribed or
diarized.

> Both export and restore are refused for anyone reaching the app from outside your private
> network, even with the password: the file is the whole database.

For an unattended nightly database dump alongside this, see
[Setup → Moving or rebuilding an instance](setup.md#moving-or-rebuilding).

---

[Docs index](README.md) · [← LLM providers](llm-providers.md) · Next: [Architecture →](architecture.md)
