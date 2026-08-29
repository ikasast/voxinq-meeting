// Retake the README screenshots from a running Voxinq instance.
//
//   node scripts/seed-demo.mjs            # fictional meetings to photograph
//   node scripts/shoot-screenshots.mjs    # writes docs/screenshots/*.png
//
// Point it somewhere other than production with BASE_URL. The instance wants demo data and
// no password gate; docs/screenshots/README.md has the whole recipe, including how to stand
// up a throwaway database and stub the STT service so the real one is never woken up.
//
// Requires `npm i -D playwright && npx playwright install chromium` (devDependency).

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = (process.env.BASE_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
const OUT = path.join(process.cwd(), "docs", "screenshots");

// Wide enough for the layout the app is actually designed around: the rail, the meeting list,
// the content and the meeting's own details, all at once. Below 1536 the right-hand details
// stack above the content instead, which is a different screenshot rather than a smaller
// version of this one.
const VIEWPORT = { width: 1600, height: 900 };
const SCALE = 2; // retina, so the images stay sharp when GitHub scales them down
const MAX_HEIGHT = 1400; // past this a README image is scaled down too far to read

const SHOTS = [
  {
    file: "dashboard.png",
    url: "/",
    // The list is the point; let it settle before the health dots resolve.
    ready: (page) => page.getByText("Weekly Product Sync").first().waitFor(),
  },
  {
    file: "recording.png",
    url: "/demo-live-recording/recording",
    ready: (page) => page.getByText("Transcript").first().waitFor(),
    // Shot beside minutes.png in a two-column README table, so the pair is locked to one
    // height — auto-fitting each gives the columns wildly different aspect ratios.
    fixedHeight: 1000,
  },
  {
    file: "minutes.png",
    url: "/demo-weekly-sync",
    ready: (page) => page.getByText("Overview").first().waitFor(),
    fixedHeight: 1000,
  },
  {
    file: "settings.png",
    url: "/settings",
    ready: (page) => page.getByText("Transcription").first().waitFor(),
  },
];

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    colorScheme: "light",
    reducedMotion: "reduce", // no half-finished transitions in the frame
  });

  // Theme is per device (localStorage), so pin it before the first paint rather than
  // clicking through Settings on every run.
  await context.addInitScript(() => {
    try {
      localStorage.setItem("voxinq.theme", "light");
    } catch {}
  });

  const page = await context.newPage();
  for (const shot of SHOTS) {
    await page.setViewportSize({ ...VIEWPORT, height: shot.height ?? VIEWPORT.height });
    await page.goto(`${BASE}${shot.url}`, { waitUntil: "networkidle" });
    try {
      await shot.ready(page);
    } catch {
      console.warn(`  ! ${shot.file}: the element it waits for never appeared — shooting anyway`);
    }
    await page.waitForTimeout(600);

    // Fit the frame to the page instead of leaving a band of empty background under short
    // content (or cutting long content off at an arbitrary line). Measure from a short
    // viewport first: the layout is min-height:100vh, so a tall one measures itself.
    await page.setViewportSize({ width: VIEWPORT.width, height: 400 });
    await page.waitForTimeout(250);
    const needed = await page.evaluate(() => {
      const d = document.documentElement;
      return Math.ceil(Math.max(d.scrollHeight, document.body.scrollHeight));
    });
    const height = shot.fixedHeight ?? Math.min(Math.max(needed, 560), MAX_HEIGHT);
    await page.setViewportSize({ width: VIEWPORT.width, height });
    await page.waitForTimeout(250);

    const file = path.join(OUT, shot.file);
    await page.screenshot({ path: file });
    console.log(`  ${shot.file}  <- ${shot.url}  (${VIEWPORT.width}x${height})`);
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
