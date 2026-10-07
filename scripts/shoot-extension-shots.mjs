// Retake the pictures on Settings → Extensions: one per extension, cut out of the screen where
// it shows up.
//
//   DATABASE_URL=… node scripts/seed-demo.mjs                       # fictional meetings
//   DATABASE_URL=… BASE_URL=http://127.0.0.1:3100 node scripts/shoot-extension-shots.mjs
//   LOCALE=ja node scripts/seed-demo.mjs && LOCALE=ja … node scripts/shoot-extension-shots.mjs
//
// Writes public/extension-shots/<locale>/<id>.webp, which the details dialog shows. Same
// throwaway instance as the README screenshots (docs/screenshots/README.md), with every
// extension on. DATABASE_URL is the instance's own: the corrections shot looks up which line it
// is fixing.
//
// What would need a model or the network is answered here instead, in the browser — the
// question's answer, the suggested fix, Tailscale Funnel's state — so nothing is woken up and no
// real host name can end up in a picture.

import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = (process.env.BASE_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
const LOCALE = process.env.LOCALE === "ja" ? "ja" : "en";
const JA = LOCALE === "ja";
const OUT = path.join(process.cwd(), "public", "extension-shots", LOCALE);

// The same 1600 as the README shots: the three-column layout the app is designed around.
const VIEWPORT = { width: 1600, height: 1000 };
const SCALE = 2;
// The dialog is at most 672 CSS px wide; twice that stays sharp on a 2× screen.
const WIDTH = 1344;

const W = JA
  ? {
      question: "決まったToDoと担当は？",
      answer:
        "- **鈴木さん** — リリース前に計測イベントの実装を完了する\n- **田中さん** — 空状態のイラストを木曜までにデザインへ渡す\n- **鈴木さん** — キャッシュの方針を月曜までにまとめる",
      misheard: "エンベリング",
      fixed: (text) => text.replace("エンベリング", "エンベディング"),
      writeAll: "まとめて作成",
      suggest: "誤変換の候補を出す",
      transcript: "発言",
      showTranslations: "翻訳を表示",
    }
  : {
      question: "Who took on what?",
      answer:
        "- **Jordan** — finish the analytics instrumentation before launch\n- **Sam** — send the empty-state illustrations to design by Thursday\n- **Jordan** — write up the caching plan by Monday",
      misheard: "in bedding",
      fixed: (text) => text.replace("in bedding", "embedding"),
      writeAll: "Write them all",
      suggest: "Suggest fixes",
      transcript: "Transcript",
      showTranslations: "Show translations",
    };

const prisma = new PrismaClient();

/**
 * The transcript from its toolbar down: the lines and what the extension put on them. The
 * speaker and search panels above belong to other features and only make the picture taller.
 */
async function transcriptLines(page) {
  const details = page.locator("details", { has: page.locator("summary", { hasText: W.transcript }) }).first();
  const d = await details.boundingBox();
  const b = await page.getByRole("button", { name: W.suggest }).boundingBox();
  const top = b.y - 12;
  return { clip: { x: d.x - 8, y: top, width: d.width + 16, height: d.y + d.height - top + 8 } };
}

const SHOTS = {
  async ask(page) {
    await page.route("**/api/ask", (route) =>
      route.fulfill({ json: { answer: W.answer, used: 1, omitted: 0, withoutMinutes: 0 } }),
    );
    await page.goto(`${BASE}/demo-weekly-sync`, { waitUntil: "networkidle" });
    const box = page.locator("section.card", { has: page.locator('input[maxlength="500"]') }).first();
    await box.locator("input").fill(W.question);
    await box.locator("input").press("Enter");
    await box.getByText(W.answer.split("**")[1]).first().waitFor();
    return box;
  },

  async bulkMinutes(page) {
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    const bar = page
      .getByRole("button", { name: W.writeAll })
      .locator("xpath=ancestor::div[contains(@class,'rounded-md')][1]");
    await bar.waitFor();
    // The bar and the cards under it, one of them marked No minutes: what the bar is about.
    const b = await bar.boundingBox();
    return { clip: { x: b.x - 16, y: b.y - 10, width: b.width + 32, height: 514 } };
  },

  async corrections(page) {
    const line = await prisma.transcript.findFirst({
      where: { meetingId: "demo-research-sync", text: { contains: W.misheard } },
    });
    if (!line) throw new Error(`no line with "${W.misheard}" — seed the ${LOCALE} demo meetings first`);
    await page.route("**/api/meetings/*/suggest-corrections", (route) =>
      route.fulfill({
        json: { suggestions: [{ transcriptId: line.id, before: line.text, after: W.fixed(line.text) }], checked: 3 },
      }),
    );
    await page.goto(`${BASE}/demo-research-sync`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: W.suggest }).click();
    await page.getByText(W.fixed(line.text)).first().waitFor();
    return transcriptLines(page);
  },

  async translation(page) {
    await page.goto(`${BASE}/demo-partner-call`, { waitUntil: "networkidle" });
    await page.getByText(W.showTranslations).first().waitFor();
    return transcriptLines(page);
  },

  async externalShare(page) {
    // An invented address: the real one would be this machine's name on its tailnet.
    await page.route("**/api/funnel", (route) =>
      route.fulfill({
        json: {
          internal: true,
          available: true,
          public: true,
          hostname: "voxinq.example.ts.net",
          url: "https://voxinq.example.ts.net",
        },
      }),
    );
    await page.goto(`${BASE}/settings?tab=remote`, { waitUntil: "networkidle" });
    const card = page.locator("section.card", { hasText: "voxinq.example.ts.net" }).first();
    await card.waitFor();
    return card;
  },
};

/** A clip measured on screen (boundingBox), moved to where it is on the whole page. */
async function onPage(page, clip) {
  const scrollY = await page.evaluate(() => window.scrollY);
  return { ...clip, y: clip.y + scrollY };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    colorScheme: "light",
    reducedMotion: "reduce",
    locale: JA ? "ja-JP" : "en-GB",
    extraHTTPHeaders: { "Accept-Language": JA ? "ja-JP,ja" : "en-GB,en" },
  });
  await context.addInitScript(() => {
    try {
      localStorage.setItem("voxinq.theme", "light");
    } catch {}
  });

  for (const [id, shoot] of Object.entries(SHOTS)) {
    const page = await context.newPage();
    const target = await shoot(page);
    await page.waitForTimeout(400);
    const png = target.clip
      ? await page.screenshot({ clip: await onPage(page, target.clip), fullPage: true })
      : await target.screenshot({ animations: "disabled" });
    const file = path.join(OUT, `${id}.webp`);
    const info = await sharp(png)
      .resize({ width: WIDTH, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(file);
    console.log(`  ${LOCALE}/${id}.webp  ${info.width}x${info.height}  ${Math.round(info.size / 1024)} KB`);
    await page.close();
  }

  await browser.close();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
