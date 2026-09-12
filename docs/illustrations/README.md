# Illustrations

Drawings, as opposed to `../screenshots/`, which are photographs of the running app. The three
feature drawings lead the main README's *What it does*; `hero.png` is the source of the social
preview card.

| Filename | What it shows | Where |
| --- | --- | --- |
| `capture.png` | Phone, laptop and audio file → Whisper on your machine → a transcript with speakers, a voiceprint match and a suggested fix for a misheard word. | Record, and it becomes words — and the *Who said what* after it |
| `minutes-memory.png` | Transcript → local LLM → minutes with decisions and action items; a question asked of past minutes; a weekly series handing its minutes forward to an upcoming meeting. | Minutes, written for you — and *It adds up over time* |
| `private.png` | Your machine as a house: two accounts, each with its own key; an administrator who cannot read minutes; a laptop outside that can set meetings up but not record; a crossed-out cloud. | Yours alone |
| `hero.png` | A desk, a line of sound leaving the computer and settling into pages, and a room with no way out of it. | Source of `../screenshots/social-preview.png`; not in the README |

## How they were made

Generated from written prompts with `../screenshots/workflow.png` attached as the style reference,
so the three read as close-ups of the banner at the top of the README. Every prompt carried the
same constraints:

- flat vector UI-infographic — no 3D, no isometric perspective, no glow, no photos, faces or logos
- the app's own palette: `#0B1220` ground, `#1B2536` panels, `#2F3D54` lines, `#E5E7EB` text,
  `#9CA3AF` secondary text, `#06B6D4` / `#67E8F9` accent
- 21:9, with the content filling about 70% of the height
- English labels only, **written out in the prompt word for word**, and every small label at least
  80% of the size of the main text, because the images are shown about 900px wide

**They have labels now, on purpose.** The first set had none: generators misspell, and words in a
picture cannot be searched or read aloud. That made the pictures abstract enough to need decoding,
and a reader decoding a picture is not reading about the app. Short labels written out in the
prompt came back spelled right, and what the old rule protected is kept another way — each
image's alt text says in words everything the picture shows, and the prose under it carries the
detail.

Two rules keep the labels honest:

- **Read every label at 2× before committing.** Crop the small text, enlarge it and read it; a `g`
  for a `q` is invisible at README size.
- **Every name and term in them is invented** — the app's own name misheard (`Boxinq`), and the
  fictional people the screenshots use. Nothing from a real meeting or a real glossary, ever.

## Retouching them

From a 1916×821 generation, cropped to one height so the three sit as a set:

```js
// npm i -D sharp
await sharp(src)
  .extract({ left: 0, top, width, height: 700 })  // 700px tall, centred on the content
  .resize({ width: 1400, height: 512, fit: "fill" })
  .png({ palette: true, quality: 90, effort: 10 })
  .toFile(out);
```

About 1MB each becomes 150–250KB; flat art with few colours loses nothing visible to the palette
step. Check one by eye before committing three.
