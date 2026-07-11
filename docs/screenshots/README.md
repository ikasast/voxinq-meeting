# Screenshots & demo assets

Images referenced by the main README. Filenames are fixed (below).

Capture on a desktop browser with the app open, save here, then
`git add -A && git commit && git push`.

| Filename | What to show | Notes |
| --- | --- | --- |
| `demo.gif` | The full flow: New meeting → recording with live transcript → *Generate minutes & end* → minutes appear | 20–30 s, 900–1200 px wide, **under 10 MB**. Once added, swap it into the README hero (a commented slot is ready there). |
| `dashboard.png` | Home / meeting list (left pane with search + tags, right info panel) | Used as the README header image until `demo.gif` exists. |
| `recording.png` | Recording screen: top recording bar (Start/Stop, level meter), live transcript | |
| `minutes.png` | Meeting detail: generated minutes (headings, version selector) + transcript below | |
| `settings.png` | Settings → Minutes or LLM tab | |
| `social-preview.png` | `dashboard.png` with the logo/tagline overlaid | **1280×640 px.** Upload via GitHub → repo Settings → Social preview (not referenced by the README). |

Guidelines:

- PNGs ~1200–1600 px wide, dark theme.
- Use a demo/sample meeting — **no confidential content or real names**.
- The UI is English now, so retake any stale (Japanese) screenshots.

Recording the GIF (Windows): [ScreenToGif](https://www.screentogif.com/) works well —
record the browser window, trim dead time between steps, export as GIF. If the file exceeds
10 MB, reduce the frame rate (10–15 fps is fine) or the capture width.
