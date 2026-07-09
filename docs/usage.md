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

## Speaker diarization

On a meeting page → **Edit tools → Auto-diarize**. Enter the participant count for better
accuracy, run it, then rename speakers. Regenerate minutes to use the names.

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
