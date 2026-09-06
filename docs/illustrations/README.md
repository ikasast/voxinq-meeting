# Illustrations

Drawings, as opposed to `../screenshots/`, which are photographs of the running app. These say
what the app is *for*; the screenshots say what it looks like. Both are in the main README.

| Filename | What it shows | Where |
| --- | --- | --- |
| `hero.png` | A desk, a line of sound leaving the computer and settling into pages, and a room with no way out of it. | Source of `../screenshots/social-preview.png`; it is not in the README, where the banner says more |
| `record.png` | Three devices and an audio file all arriving at one machine, and a waveform becoming lines of text. | Record, and it becomes words |
| `minutes.png` | A loose stack going into a box and one squared-up page coming out, with a question looping back in. | Minutes, written for you |
| `speakers.png` | One dense waveform combed apart into three tracks, one of them recognised. | Who said what |
| `over-time.png` | Five meetings threaded by one line, the last still an outline; a magnifier; a calendar. | It adds up over time |
| `private.png` | Sealed sheets inside a cube, one key that fits one of three keyholes, and an unbroken wall. | Yours alone |

## How they were made

Generated from written prompts, then cropped and compressed here. The prompts are worth keeping
because the next one has to match: what makes these a set is not the subject but the constraints,
and those are the same six lines every time —

- **flat vector, subtle isometric**, thin consistent line weight, generous negative space, matte
- **one palette**: `#0B1220` ground, `#1B2536` panels, `#2F3D54` lines, `#E5E7EB` paper, and
  `#06B6D4` on **exactly one element per image** — the thing the image is about
- **no text of any kind**, and no clip-art shorthand: no padlocks, shields, brains, robots,
  circuit-board texture, binary digits, mascots, or faces

**No labels are baked in, on purpose.** Image generators cannot spell, and a diagram whose labels
are wrong is worse than one with none — but the deeper reason is that words in a picture cannot be
searched, translated, read aloud by a screen reader, or fixed without regenerating the picture.
The markdown around each image does that job instead: the heading names the idea and the prose
carries the detail. If one of these ever needs a label *inside* it, that is a sign it should be an
SVG rather than a rendering.

## Retouching them

They are 1400px on the long edge, palette PNG. From a fresh generation at 1536×1024:

```js
// npm i -D sharp
await sharp(src)
  .extract({ left: 0, top, width, height })       // hero only: a banner wants less sky
  .resize({ width: 1400, withoutEnlargement: true })
  .png({ palette: true, quality: 90, effort: 10 })
  .toFile(out);
```

The palette step is what makes them fit: 1.2MB each becomes ~200KB, and flat art with a small
number of colours loses nothing visible to it — the cyan glow survives. Check one by eye before
committing six.
