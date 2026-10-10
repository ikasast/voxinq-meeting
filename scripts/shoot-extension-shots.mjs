// Retake the pictures on Settings → Extensions: one per extension, cut out of the screen where
// it shows up.
//
//   DATABASE_URL=… node scripts/seed-demo.mjs                       # fictional meetings
//   DATABASE_URL=… BASE_URL=http://127.0.0.1:3100 node scripts/shoot-extension-shots.mjs
//   LOCALE=ja node scripts/seed-demo.mjs && LOCALE=ja … node scripts/shoot-extension-shots.mjs
//   ONLY=ask,translation …                                      # just those
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

// The same 1600 as the README shots: sidebar, minutes and the transcript panel side by side.
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
      askTitle: "この議事録について質問する",
      fixWording: "表記の修正",
      suggest: "用語集から候補を出す",
      glossary: "エンベディング、計測イベント",
      transcript: "発言",
      regenerate: "作り直す",
      upcoming: "予定",
      seriesGlossary: "ステージング、テナント、レート制限",
      speakerSeparation: "話者分離",
      more: "その他",
      booked: "デザインレビュー — 第2回",
      templates: [
        { id: "t-weekly", name: "定例会議（決定事項と ToDo）", body: "## 決定事項\n## ToDo", instructions: "" },
        { id: "t-client", name: "取引先との打ち合わせ", body: "## 合意事項\n## 宿題", instructions: "" },
      ],
    }
  : {
      question: "Who took on what?",
      answer:
        "- **Jordan** — finish the analytics instrumentation before launch\n- **Sam** — send the empty-state illustrations to design by Thursday\n- **Jordan** — write up the caching plan by Monday",
      misheard: "in bedding",
      fixed: (text) => text.replace("in bedding", "embedding"),
      writeAll: "Write them all",
      askTitle: "Ask about these minutes",
      fixWording: "Fix wording",
      suggest: "Suggest from the glossary",
      glossary: "embedding, analytics events",
      transcript: "Transcript",
      regenerate: "Regenerate",
      upcoming: "Upcoming",
      seriesGlossary: "staging, tenant, rate limit",
      speakerSeparation: "Speaker separation",
      more: "More",
      booked: "Design Review — round two",
      templates: [
        { id: "t-weekly", name: "Weekly meeting (decisions and to-dos)", body: "## Decisions\n## To-dos", instructions: "" },
        { id: "t-client", name: "Client meeting", body: "## Agreed\n## Follow-ups", instructions: "" },
      ],
    };

const prisma = new PrismaClient();

/** The transcript of a meeting (v4): the panel at the right, or — on a meeting with no minutes
 *  yet — the page itself, below the empty minutes. */
async function transcriptBox(page) {
  const panel = page.locator(`aside[aria-label="${W.transcript}"]`);
  await page.locator('li[id^="line-"]').first().waitFor();
  if (await panel.count()) return { box: panel, panel: true };
  return { box: page.locator("section", { has: page.locator('li[id^="line-"]') }).last(), panel: false };
}

/** From the transcript's heading down to its `rows`-th line, or its last if it has fewer. The
 *  panel scrolls inside itself, so its picture is cut from the screen. */
async function panelDown(page, rows) {
  // Nothing pointed at or focused: a line's tools would float over its text.
  await page.mouse.move(1, 1);
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  const { box, panel } = await transcriptBox(page);
  const b = await box.boundingBox();
  const lines = box.locator('li[id^="line-"]');
  const n = Math.min(rows, await lines.count());
  const last = await lines.nth(n - 1).boundingBox();
  const top = panel ? 0 : b.y - 12;
  // In the page it is as wide as the page; at most 1000px keeps the text readable in the dialog.
  const width = panel ? b.width : Math.min(b.width + 16, 1000);
  return { clip: { x: b.x - (panel ? 0 : 8), y: top, width, height: last.y + last.height + 16 - top } };
}

/** The transcript's "…" menu, where the checks and the translation toggle live. */
async function transcriptMenuItem(page, name) {
  const { box } = await transcriptBox(page);
  await box.getByRole("button", { name: W.more, exact: true }).first().click();
  return page.getByRole("menuitem", { name }).or(page.getByRole("menuitemcheckbox", { name }));
}

async function transcriptLines(page) {
  return panelDown(page, 6);
}

/** Something drawn without a card of its own, with room left around it. */
async function padded(locator, by = 16) {
  const b = await locator.boundingBox();
  return { clip: { x: b.x - by, y: b.y - by, width: b.width + 2 * by, height: b.height + 2 * by } };
}

/** Answer the settings with some of them changed: what a screen is shown, not what is stored. */
async function settingsWith(page, change) {
  await page.route("**/api/settings", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    route.fulfill({ response, json: { ...(await response.json()), ...change } });
  });
}

const SHOTS = {
  async ask(page) {
    await page.route("**/api/ask", (route) =>
      route.fulfill({ json: { answer: W.answer, used: 1, omitted: 0, withoutMinutes: 0 } }),
    );
    // The chat at the bottom right (v4), on a meeting outside a series: its own minutes.
    await page.goto(`${BASE}/demo-research-sync`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: W.askTitle }).click();
    const box = page.getByRole("dialog", { name: W.askTitle });
    await box.locator("input").fill(W.question);
    await box.locator("input").press("Enter");
    await box.getByText(W.answer.split("**")[1]).first().waitFor();
    return box;
  },

  async bulkMinutes(page) {
    await page.goto(`${BASE}/?list=1`, { waitUntil: "networkidle" });
    const bar = page
      .getByRole("button", { name: W.writeAll })
      .locator("xpath=ancestor::div[contains(@class,'border-y')][1]");
    await bar.waitFor();
    // The bar and the cards under it, one of them marked No minutes: what the bar is about.
    const b = await bar.boundingBox();
    return { clip: { x: b.x - 16, y: b.y - 10, width: b.width + 32, height: 514 } };
  },

  async speakers(page) {
    // The panel opened from its icon above the transcript — the run, the names it found — and
    // the first lines with their speakers.
    await page.goto(`${BASE}/demo-weekly-sync`, { waitUntil: "networkidle" });
    await (await transcriptBox(page)).box.getByRole("button", { name: W.speakerSeparation, exact: true }).click();
    await page.waitForTimeout(200);
    return panelDown(page, 3);
  },

  async series(page) {
    // The series page (v4): its details as a table under the title, and its meetings as rows.
    await page.goto(`${BASE}/series/demo-series-sync`, { waitUntil: "networkidle" });
    const paper = await page.locator("[data-paper]").first().boundingBox();
    const title = await page.locator("h1").first().boundingBox();
    // Down to the second of its meetings.
    const rows = page.locator("[data-paper] ul > li");
    const last = await rows.nth(Math.min(1, (await rows.count()) - 1)).boundingBox();
    return { clip: { x: paper.x - 16, y: title.y - 16, width: paper.width + 32, height: last.y + last.height - title.y + 32 } };
  },

  async schedule(page) {
    // The calendar, and under it Upcoming with tomorrow's booked meeting in it.
    await page.goto(`${BASE}/?list=1`, { waitUntil: "networkidle" });
    // In the page, not the sidebar, which lists the same meeting under Upcoming.
    const booked = page.locator("main").getByText(W.booked).first();
    await booked.waitFor();
    // Folded behind its month (v4): opened, as it is when a day is picked.
    const fold = page.locator("main details").first();
    await fold.evaluate((d) => {
      d.open = true;
    });
    await page.waitForTimeout(200);
    const c = await fold.boundingBox();
    const card = await booked.locator("xpath=ancestor::li[1]").boundingBox();
    return { clip: { x: c.x - 16, y: c.y - 10, width: c.width + 32, height: card.y + card.height - c.y + 20 } };
  },

  async minutesFormats(page) {
    // Two formats of the kind somebody makes, so the choice has something in it.
    await settingsWith(page, { minutesTemplates: W.templates, defaultMinutesTemplateId: "" });
    await page.goto(`${BASE}/demo-weekly-sync`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: W.regenerate, exact: true }).first().click();
    const select = page.locator("#regen-template");
    await select.locator('option[value="t-weekly"]').waitFor({ state: "attached" });
    await select.selectOption("t-weekly");
    return padded(select.locator("xpath=ancestor::div[contains(@class,'border-y')][1]"));
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
    // The glossary has to have something in it for its button to be offered.
    await page.request.patch(`${BASE}/api/settings`, { data: { sttGlossary: W.glossary } });
    await page.goto(`${BASE}/demo-research-sync`, { waitUntil: "networkidle" });
    const { box } = await transcriptBox(page);
    await box.getByRole("button", { name: W.fixWording, exact: true }).click();
    await box.getByRole("button", { name: W.suggest }).click();
    await box.locator("ins").first().waitFor();
    // From the transcript's heading down to the end of Fix wording's list of changes.
    await page.mouse.move(1, 1);
    const b = await box.boundingBox();
    const list = await box.locator("ul").first().boundingBox();
    const bottom = list.y + list.height + 56;
    return { clip: { x: b.x, y: b.y, width: b.width, height: bottom - b.y } };
  },

  async translation(page) {
    // Translations are shown by default; the toggle is in the transcript's "…" menu.
    await page.goto(`${BASE}/demo-partner-call`, { waitUntil: "networkidle" });
    return panelDown(page, 3);
  },

  async voiceCues(page) {
    // The strip over the transcript and the first lines, with the marks two of them carry.
    await page.goto(`${BASE}/demo-weekly-sync`, { waitUntil: "networkidle" });
    return panelDown(page, 6);
  },

  async emotion(page) {
    // The strip over the transcript and the first lines: one that sounded joyful, one sad.
    await page.goto(`${BASE}/demo-weekly-sync`, { waitUntil: "networkidle" });
    return panelDown(page, 6);
  },

  async externalAi(page) {
    // Shown with Anthropic chosen: the choice, and the warning that meetings leave the machine.
    await settingsWith(page, { llmProvider: "anthropic" });
    await page.goto(`${BASE}/settings?tab=llm`, { waitUntil: "networkidle" });
    // The provider's row of the settings table (v4), with the warning under it.
    const row = page.locator("#llmProvider").locator("xpath=ancestor::div[contains(@class,'border-b')][1]");
    await row.getByText("api.anthropic.com").first().waitFor();
    return padded(row, 12);
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
    const section = page.locator("section", { hasText: "voxinq.example.ts.net" }).last();
    await section.waitFor();
    // Close at the top: the page's own heading sits right above it.
    const b = await section.boundingBox();
    return { clip: { x: b.x - 16, y: b.y - 4, width: b.width + 32, height: b.height + 20 } };
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
      localStorage.setItem("voxinq.transcriptPanel", "open");
      localStorage.setItem("voxinq.transcriptWidth", "640");
    } catch {}
  });

  // ONLY=ask,translation retakes just those: the others carry dates and would change for nothing.
  const only = process.env.ONLY?.split(",").filter(Boolean);
  for (const [id, shoot] of Object.entries(SHOTS)) {
    if (only && !only.includes(id)) continue;
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
