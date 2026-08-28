// Rebuild docs/screenshots/demo.gif — a slideshow of the path through the app.
//
//   BASE_URL=http://127.0.0.1:3100 node scripts/shoot-demo-gif.mjs
//
// Same throwaway instance as shoot-screenshots.mjs (see docs/screenshots/README.md), plus
// ffmpeg on PATH. A real screen recording reads better than a slideshow; this exists so the
// GIF can at least be brought back in step with the UI without one.

import { chromium } from "playwright";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import path from "node:path";

const run = promisify(execFile);
const BASE = (process.env.BASE_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
const OUT = path.join(process.cwd(), "docs", "screenshots", "demo.gif");

// 960 wide keeps the file small enough for a README without going illegible.
const VIEWPORT = { width: 1280, height: 800 };
const WIDTH = 960;
const SECONDS_PER_FRAME = 2.6;

const FRAMES = [
  { url: "/", ready: (p) => p.getByText("Weekly Product Sync").first().waitFor() },
  { url: "/new", ready: (p) => p.getByText("New meeting").first().waitFor() },
  {
    url: "/demo-live-recording/recording",
    ready: (p) => p.getByText("Transcript").first().waitFor(),
  },
  { url: "/demo-weekly-sync", ready: (p) => p.getByText("Overview").first().waitFor() },
];

async function main() {
  await mkdir(path.dirname(OUT), { recursive: true });
  const dir = await mkdtemp(path.join(tmpdir(), "voxinq-gif-"));
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  await context.addInitScript(() => {
    try {
      localStorage.setItem("voxinq.theme", "light");
    } catch {}
  });

  const page = await context.newPage();
  for (const [i, frame] of FRAMES.entries()) {
    await page.goto(`${BASE}${frame.url}`, { waitUntil: "networkidle" });
    try {
      await frame.ready(page);
    } catch {
      console.warn(`  ! ${frame.url}: waited for an element that never appeared`);
    }
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(dir, `f${String(i).padStart(2, "0")}.png`) });
    console.log(`  frame ${i + 1}/${FRAMES.length}  ${frame.url}`);
  }
  await browser.close();

  // Two passes: a palette built from every frame, then the encode. One shared palette keeps
  // the flat UI colours from banding.
  const fps = 1 / SECONDS_PER_FRAME;
  const filters = `fps=${fps},scale=${WIDTH}:-1:flags=lanczos`;
  const palette = path.join(dir, "palette.png");
  await run("ffmpeg", ["-y", "-framerate", String(fps), "-i", path.join(dir, "f%02d.png"),
    "-vf", `${filters},palettegen=stats_mode=diff`, palette]);
  await run("ffmpeg", ["-y", "-framerate", String(fps), "-i", path.join(dir, "f%02d.png"),
    "-i", palette, "-lavfi", `${filters}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3`,
    "-loop", "0", OUT]);

  await rm(dir, { recursive: true, force: true });
  console.log(`  wrote ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
