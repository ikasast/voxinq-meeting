// Retake the README screenshots from a running Voxinq instance.
//
//   node scripts/seed-demo.mjs               # fictional meetings to photograph
//   node scripts/shoot-screenshots.mjs       # writes docs/screenshots/*.png
//   LOCALE=ja node scripts/shoot-screenshots.mjs   # …and docs/screenshots/ja/*.png
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

// Which language the app is photographed in. It follows the browser, so this is one header —
// the same signal a Japanese reader's own browser sends. The Japanese set lands in its own
// directory rather than beside the English one: README.ja.md points at it, and a filename that
// differs only by a suffix is the kind of thing that gets referenced wrongly once and stays
// wrong.
const LOCALE = process.env.LOCALE === "ja" ? "ja" : "en";
const OUT = path.join(process.cwd(), "docs", "screenshots", ...(LOCALE === "ja" ? ["ja"] : []));

// Wide enough for the layout the app is actually designed around: the rail, the meeting list,
// the content and the meeting's own details, all at once. Below 1536 the right-hand details
// stack above the content instead, which is a different screenshot rather than a smaller
// version of this one.
const VIEWPORT = { width: 1600, height: 900 };
const SCALE = 2; // retina, so the images stay sharp when GitHub scales them down
const MAX_HEIGHT = 1400; // past this a README image is scaled down too far to read

// What each shot waits for, per language: headings the app writes, which differ between them.
const READY = {
  en: {
    transcript: "Transcript",
    minutes: "Minutes",
    start: "Start recording",
    stop: "Stop recording",
    tooLoud: "Input too loud",
  },
  ja: {
    transcript: "発言",
    minutes: "議事録",
    start: "録音を開始",
    stop: "録音を停止",
    tooLoud: "入力が大きすぎます",
  },
};

// The README's "what it does": three phone screens side by side — recording, the transcript, the
// minutes. A phone screen stays readable at a third of the README's width, where a PC one would
// not. The recording one records for real against scripts/shots-stubs.mjs (its WebSocket), so the
// dock shows Stop, the meter and Listening.
const PHONE = { width: 390, height: 844 };
const PHONE_SHOTS = [
  { file: "phone-recording.png", url: "/demo-live-recording", record: true },
  { file: "phone-transcript.png", url: "/demo-weekly-sync", tab: "transcript" },
  { file: "phone-minutes.png", url: "/demo-weekly-sync", tab: "minutes" },
];

// Only what a README shows. A dashboard and a settings shot used to be taken too, and nothing
// displayed either — they were a megabyte of the repository kept current for nobody.
const SHOTS = [
  {
    file: "recording.png",
    url: "/demo-live-recording/recording",
    ready: (page) => page.getByText(READY[LOCALE].transcript).first().waitFor(),
    // Shot beside minutes.png in a two-column README table, so the pair is locked to one
    // height — auto-fitting each gives the columns wildly different aspect ratios.
    fixedHeight: 1000,
  },
  {
    file: "minutes.png",
    url: "/demo-weekly-sync",
    ready: (page) => page.getByRole("tab", { name: READY[LOCALE].minutes }).first().waitFor(),
    fixedHeight: 1000,
  },
];

async function main() {
  await mkdir(OUT, { recursive: true });
  // A fake microphone for the phone's recording shot.
  const browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    colorScheme: "light",
    reducedMotion: "reduce", // no half-finished transitions in the frame
    locale: LOCALE === "ja" ? "ja-JP" : "en-GB",
    extraHTTPHeaders: { "Accept-Language": LOCALE === "ja" ? "ja-JP,ja" : "en-GB,en" },
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
    console.log(`  ${LOCALE}/${shot.file}  <- ${shot.url}  (${VIEWPORT.width}x${height})`);
  }

  await phoneShots(browser);
  await browser.close();
}

async function phoneShots(browser) {
  const r = READY[LOCALE];
  const context = await browser.newContext({
    viewport: PHONE,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: "light",
    reducedMotion: "reduce",
    permissions: ["microphone"],
    locale: LOCALE === "ja" ? "ja-JP" : "en-GB",
    extraHTTPHeaders: { "Accept-Language": LOCALE === "ja" ? "ja-JP,ja" : "en-GB,en" },
  });
  await context.addInitScript(() => {
    try {
      localStorage.setItem("voxinq.theme", "light");
    } catch {}
  });
  for (const shot of PHONE_SHOTS) {
    const page = await context.newPage();
    await page.goto(`${BASE}${shot.url}`, { waitUntil: "networkidle" });
    if (shot.record) {
      await page.getByRole("button", { name: r.start }).first().click();
      await page.getByRole("button", { name: r.stop }).first().waitFor({ timeout: 15_000 });
      await page.waitForTimeout(1200);
      await page.evaluate((tooLoud) => {
        // The fake microphone is a test tone loud enough to clip, which no real room is.
        for (const el of document.querySelectorAll("span")) if (el.textContent.trim() === tooLoud) el.style.display = "none";
        document.querySelectorAll(".ring-1").forEach((el) => el.classList.remove("ring-1"));
        document.querySelectorAll('span[class*="bg-[var(--warning)]"]').forEach((el) => (el.style.background = "var(--accent-solid)"));
        document.querySelectorAll("details").forEach((d) => (d.open = false));
        window.scrollTo(0, document.body.scrollHeight);
      }, r.tooLoud);
    } else {
      const label = shot.tab === "minutes" ? r.minutes : r.transcript;
      await page.getByRole("tab", { name: new RegExp(`^${label}`) }).first().click();
      await page.waitForTimeout(500);
      // From the tabs down: the details above them are the same on every shot.
      await page.evaluate(() => {
        const tabs = document.querySelector('[role="tab"]');
        if (tabs) window.scrollTo(0, tabs.getBoundingClientRect().top + window.scrollY - 64);
      });
    }
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, shot.file) });
    console.log(`  ${LOCALE}/${shot.file}  <- ${shot.url}  (phone)`);
    if (shot.record) await page.getByRole("button", { name: r.stop }).first().click().catch(() => {});
    await page.close();
  }
  await context.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
