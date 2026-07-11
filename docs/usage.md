# Usage & recipes

## Record a meeting

1. **New meeting** → optionally set title, purpose, and per-meeting recording settings.
2. **Start recording** → speak. The live transcript appears as you go.
3. **Generate minutes & end** → minutes are generated in the background; you land on the
   meeting page.

Tips:
- On a phone, keep the screen on while recording.
- Choose the source (mic / PC audio / both) from the top bar; you can switch mid-recording.
- For "both", use headphones to avoid the mic double-capturing PC audio.

## Summarize an existing recording (no live capture)

Drag an audio file (`wav`/`mp3`/`m4a`/…) onto the **New meeting** screen. Voxinq creates the
meeting, transcribes the file, and generates minutes automatically.

## Recurring series

Assign a meeting to a **Series** (on the New meeting screen, or under *Purpose & agenda →
Edit* on the meeting page). Meetings in the same series share context: when generating
minutes, the **previous meeting's minutes are given to the LLM as reference**, so remarks
like "continuing from last time" are interpreted correctly. *New with same settings* keeps
the series. A series disappears automatically when its last meeting is removed.

## Speaker diarization

On a meeting page → **Edit tools → Auto-diarize**. Enter the participant count for better
accuracy, run it, then rename speakers. Regenerate minutes to use the names.

## Voice profiles (auto-name recurring speakers)

After diarizing and naming speakers, press **Save voice profiles** (below the speaker-name
editor). Each named speaker's voiceprint is enrolled; from then on, **Auto-diarize
automatically names any speaker whose voice matches an enrolled profile** (manual names are
never overwritten). Notes:

- Enrollment needs the meeting's **recording (WAV) to still exist** — a voiceprint is
  computed from audio, so meetings whose WAV already expired cannot be used.
- Anyone can be enrolled (not just you) — name them, then save.
- Delete a profile from the "Enrolled" list; the match threshold is
  `voiceprintThreshold` in `settings.json` (default 0.5 — raise it if wrong names appear).

## AI (semantic) search

Tick **AI** next to the search box and describe what you remember ("the meeting where we
discussed GPU memory") — meetings are ranked by meaning, not exact words. Requires the
embedding model once: `ollama pull bge-m3`. New meetings are indexed automatically after
minutes generation; if older meetings are missing from the index, a **Build index** button
appears.

## Re-transcribe

**Edit tools → Re-transcribe** re-runs recognition over the saved recording (pick a larger
model like `large-v3` for accuracy). This replaces the transcript; re-run diarization after.

> Requires the recording to still exist (WAVs auto-delete after 7 days unless protected).

## Regenerate minutes (with options)

The **Regenerate** button remakes minutes from the current transcript. The **sliders icon**
next to it opens options to pick a **detail level** and **provider** for that one run — handy
to try a bigger model on a specific meeting without changing your defaults. Past versions are
kept; switch between them with the version selector.

## Edit minutes / transcript

- Edit minutes text inline (pencil icon) — useful to fix an LLM slip before sharing.
- Reassign a speaker per line, or rename speakers globally.

## Search, tags, filters

- Search matches titles, transcripts, and minutes; results show a snippet and where it matched.
- Tag meetings and filter by tag or period (today / this week / this month).

## Archive

**Archive** hides a meeting from the list but keeps it in the DB — it still appears in search.
Use it to declutter without deleting. Unarchive from the meeting page.

## Trash

Delete moves a meeting to **Trash** (30-day restore). Permanent delete from Trash removes the
transcript, minutes, and recording for good.

## Share / export

Copy or share minutes and transcripts, or download them as files (`.md` / `.txt`).

---

[Docs index](README.md) · [← LLM providers](llm-providers.md) · Next: [Architecture →](architecture.md)
