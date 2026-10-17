// The README hero: a phone recording a meeting while a PC shows the lines as they arrive, then the
// meeting ended and the PC on its minutes. Real screens of a throwaway instance with fictional
// demo data; only the lines not yet "said" are hidden, frame by frame.
//
//   BASE_URL=http://127.0.0.1:3100 node scripts/shoot-hero.mjs            # English, light and dark
//   BASE_URL=http://127.0.0.1:3100 LOCALE=ja node scripts/shoot-hero.mjs  # …the Japanese set
//
// Writes docs/screenshots/[ja/]hero-light.gif and hero-dark.gif. Needs what shoot-screenshots.mjs
// needs (docs/screenshots/README.md), plus:
//   - DATABASE_URL, because the last frames re-seed the standup as ended (HERO_ENDED=1) and the
//     script seeds the demo back afterwards;
//   - scripts/shots-stubs.mjs running, whose WebSocket lets the phone start a recording;
//   - ffmpeg on PATH.

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = (process.env.BASE_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
const LOCALE = process.env.LOCALE === "ja" ? "ja" : "en";
const OUT = path.join(process.cwd(), "docs", "screenshots", ...(LOCALE === "ja" ? ["ja"] : []));
const MEETING = "/demo-live-recording";
const WIDTH = 1600; // of the GIF; the frames are drawn at 1.5× and scaled down

const TEXT = {
  en: { start: "Start recording", stop: "Stop recording", minutes: "Minutes", closeLines: "Close the transcript", tooLoud: "Input too loud", lang: "en-GB", accept: "en-GB,en" },
  ja: { start: "録音を開始", stop: "録音を停止", minutes: "議事録", closeLines: "発言を閉じる", tooLoud: "入力が大きすぎます", lang: "ja-JP", accept: "ja-JP,ja" },
}[LOCALE];

// The running time on the dock for each line as it arrives, matching the lines' own times.
const CLOCKS = ["00:12", "01:41", "03:08", "04:37", "06:05"];

function run(cmd, args, env = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit", env: { ...process.env, ...env } });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

const seed = (ended) => run("node", ["scripts/seed-demo.mjs"], { LOCALE, HERO_ENDED: ended ? "1" : "" });

// What a frame of the composition looks like around the two screens, per theme.
const CHROME = {
  light: {
    bg: "radial-gradient(1200px 700px at 30% 20%, #e6f6f9 0%, #eef2f7 55%, #e9edf3 100%)",
    window: "#fff", bar: "#f3f5f8", rule: "#e3e7ec", dot: "#d5dae1", url: "#fff", urlText: "#8a94a3",
    status: "#fff", statusText: "#15181d", shadow: "rgba(20,40,60,.18)",
  },
  dark: {
    bg: "radial-gradient(1200px 700px at 30% 20%, #12304a 0%, #0d1726 55%, #0a111d 100%)",
    window: "#0b1220", bar: "#1b2536", rule: "#2f3d54", dot: "#3d4d6a", url: "#0b1220", urlText: "#9ca3af",
    status: "#0b1220", statusText: "#e5e7eb", shadow: "rgba(0,0,0,.45)",
  },
};

const composition = (theme, pc, phone) => {
  const c = CHROME[theme];
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0 }
  body { width: 1600px; height: 960px; overflow: hidden; font-family: "Segoe UI", system-ui, sans-serif; background: ${c.bg}; }
  .browser { position: absolute; left: 70px; top: 70px; width: 1180px; border-radius: 14px; overflow: hidden;
    background: ${c.window}; box-shadow: 0 30px 80px ${c.shadow}, 0 2px 6px ${c.shadow}; }
  .bar { height: 40px; background: ${c.bar}; display: flex; align-items: center; gap: 8px; padding: 0 16px; border-bottom: 1px solid ${c.rule} }
  .dot { width: 12px; height: 12px; border-radius: 50%; background: ${c.dot} }
  .url { margin-left: 18px; flex: 0 0 420px; height: 24px; border-radius: 12px; background: ${c.url}; border: 1px solid ${c.rule};
    font-size: 13px; color: ${c.urlText}; display: flex; align-items: center; padding-left: 14px }
  .browser img { display: block; width: 1180px }
  .phone { position: absolute; right: 90px; top: 150px; width: 330px; padding: 11px; border-radius: 54px; background: #15181d;
    box-shadow: 0 40px 90px ${c.shadow}, inset 0 0 0 2px #2b3038 }
  .phone img { display: block; width: 308px; border-radius: 0 0 44px 44px }
  .status { height: 34px; background: ${c.status}; border-radius: 44px 44px 0 0; display: flex; justify-content: space-between;
    align-items: center; padding: 4px 30px 0; font-size: 13px; font-weight: 600; color: ${c.statusText} }
  .ind { display: flex; gap: 4px } .ind i { width: 14px; height: 9px; border-radius: 2px; background: ${c.statusText}; display: block }
  .notch { position: absolute; left: 50%; top: 19px; transform: translateX(-50%); width: 84px; height: 24px; border-radius: 13px; background: #15181d }
</style></head><body>
  <div class="browser"><div class="bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="url">voxinq.example.ts.net</span></div>
    <img src="data:image/png;base64,${pc}"></div>
  <div class="phone"><div class="status"><span>9:41</span><span class="ind"><i></i><i></i><i></i></span></div><img src="data:image/png;base64,${phone}"><span class="notch"></span></div>
</body></html>`;
};

// Show the first k lines, and put the dock's running time at `clock`. The stand-in microphone is a
// test tone loud enough to clip, which no real room is: its warning is taken off the frame.
const showLines = (page, k, clock) =>
  page.evaluate(
    ([k, clock, tooLoud]) => {
      for (const el of document.querySelectorAll("span")) {
        if (el.textContent.trim() === tooLoud) el.style.display = "none";
      }
      document.querySelectorAll(".ring-1").forEach((el) => el.classList.remove("ring-1"));
      document.querySelectorAll('span[class*="bg-[var(--warning)]"]').forEach((el) => {
        el.style.background = "var(--accent-solid)";
      });
      document.querySelectorAll('li[id^="line-"]').forEach((li, i) => (li.style.visibility = i < k ? "visible" : "hidden"));
      for (const el of document.querySelectorAll("span, div, p")) {
        if (el.children.length === 0 && /^\d\d:\d\d$/.test(el.textContent.trim())) el.textContent = clock;
      }
    },
    [k, clock, TEXT.tooLoud],
  );

// The PC only watches: the dock and the tips are for whoever records, which is the phone.
const asWatcher = (page) =>
  page.evaluate(() => {
    document.querySelectorAll(".fixed").forEach((el) => {
      if (el.getBoundingClientRect().top > window.innerHeight * 0.7) el.style.display = "none";
    });
    document.querySelectorAll("details").forEach((d) => (d.open = false));
  });

async function shoot(browser, theme) {
  const common = {
    colorScheme: theme,
    reducedMotion: "reduce",
    locale: TEXT.lang,
    extraHTTPHeaders: { "Accept-Language": TEXT.accept },
  };
  const pin = (ctx) => ctx.addInitScript((t) => { try { localStorage.setItem("voxinq.theme", t); } catch {} }, theme);

  const phoneCtx = await browser.newContext({
    ...common,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    permissions: ["microphone"],
  });
  await pin(phoneCtx);
  const pcCtx = await browser.newContext({ ...common, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await pin(pcCtx);

  await seed(false);
  const phone = await phoneCtx.newPage();
  await phone.goto(`${BASE}${MEETING}`, { waitUntil: "networkidle" });
  // Recording for real against the stub, so the dock shows Stop, the meter and Listening.
  await phone.getByRole("button", { name: TEXT.start }).first().click();
  await phone.getByRole("button", { name: TEXT.stop }).first().waitFor({ timeout: 15_000 });
  await phone.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = false)));
  await phone.waitForTimeout(800);
  await phone.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

  const pc = await pcCtx.newPage();
  await pc.goto(`${BASE}${MEETING}`, { waitUntil: "networkidle" });
  await asWatcher(pc);

  const frames = [];
  for (let k = 1; k <= CLOCKS.length; k++) {
    await showLines(phone, k, CLOCKS[k - 1]);
    await showLines(pc, k, CLOCKS[k - 1]);
    await phone.waitForTimeout(150);
    frames.push({ pc: await pc.screenshot(), phone: await phone.screenshot(), seconds: k === 1 ? 1.6 : 1.3 });
  }

  // Ended and written up: both screens on the same meeting's minutes.
  await phone.getByRole("button", { name: TEXT.stop }).first().click();
  await phone.waitForTimeout(1500);
  await seed(true);
  for (const page of [pc, phone]) {
    await page.goto(`${BASE}${MEETING}`, { waitUntil: "networkidle" });
    await asWatcher(page);
  }
  // The minutes across the PC's page: the transcript has had its frames.
  await pc.getByRole("button", { name: TEXT.closeLines }).first().click().catch(() => {});
  await pc.waitForTimeout(400);
  await phone.evaluate((label) => {
    const h = [...document.querySelectorAll("h2, h3, p, span")].find((e) => e.textContent.trim() === label);
    if (h) window.scrollTo(0, h.getBoundingClientRect().top + window.scrollY - 70);
  }, TEXT.minutes);
  await phone.waitForTimeout(300);
  frames.push({ pc: await pc.screenshot(), phone: await phone.screenshot(), seconds: 4 });

  await phoneCtx.close();
  await pcCtx.close();
  return frames;
}

async function encode(browser, theme, frames) {
  const dir = path.join(OUT, `.hero-${theme}`);
  await mkdir(dir, { recursive: true });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 960 }, deviceScaleFactor: 1.5 })).newPage();
  const list = [];
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    await page.setContent(composition(theme, f.pc.toString("base64"), f.phone.toString("base64")), { waitUntil: "load" });
    const file = `f${String(i + 1).padStart(2, "0")}.png`;
    await page.screenshot({ path: path.join(dir, file) });
    list.push(`file '${file}'`, `duration ${f.seconds}`);
  }
  // The concat demuxer drops the last duration unless the last file is listed again.
  list.push(`file 'f${String(frames.length).padStart(2, "0")}.png'`);
  await writeFile(path.join(dir, "list.txt"), list.join("\n") + "\n");

  const out = path.join(OUT, `hero-${theme}.gif`);
  const palette = path.join(dir, "palette.png");
  const scale = `scale=${WIDTH}:-1:flags=lanczos`;
  await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-i", path.join(dir, "list.txt"), "-vf", `${scale},palettegen=stats_mode=diff`, palette]);
  await run("ffmpeg", [
    "-y", "-loglevel", "error", "-f", "concat", "-i", path.join(dir, "list.txt"), "-i", palette,
    "-lavfi", `${scale}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3`, "-loop", "0", out,
  ]);
  await rm(dir, { recursive: true, force: true });
  console.log(`  wrote ${path.relative(process.cwd(), out)}`);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is needed: the last frames re-seed the demo.");
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  try {
    for (const theme of ["light", "dark"]) await encode(browser, theme, await shoot(browser, theme));
  } finally {
    await browser.close();
    await seed(false); // leave the demo as recording.png expects it
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
