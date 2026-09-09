// Seed non-private demo meetings for README screenshots (light theme, test data).
//
//   node scripts/seed-demo.mjs              # insert / reset the demo meetings
//   LOCALE=ja node scripts/seed-demo.mjs    # …in Japanese, for the ja screenshots
//   node scripts/seed-demo.mjs --clean      # remove them again
//
// Point DATABASE_URL at a THROWAWAY database if you don't want demo rows in your real one:
//   (bash)  DATABASE_URL="postgresql://voxinq:pw@localhost:5432/voxinq_demo" node scripts/seed-demo.mjs
// Everything below is fictional — safe to publish.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Fixed ids so re-running is idempotent (and easy to clean up).
const IDS = {
  sync: "demo-weekly-sync",
  live: "demo-live-recording",
  design: "demo-design-review",
  research: "demo-research-sync",
};

// English or Japanese demo content.
//
// The Japanese set is not a translation of the English one — it is a meeting of the kind this
// app is actually used for. A Japanese README showing an English meeting demonstrates the one
// thing a reader does not need to be shown.
const JA = process.env.LOCALE === "ja";

const LABELS = JSON.stringify(
  JA
    ? { self: "佐藤 玲", "partner-0": "田中 悠", "partner-1": "鈴木 千夏" }
    : { self: "Alex Rivera", "partner-0": "Sam Chen", "partner-1": "Jordan Lee" },
);

const PEOPLE = JA ? ["佐藤 玲", "田中 悠", "鈴木 千夏"] : ["Alex Rivera", "Sam Chen", "Jordan Lee"];

// A meeting's spoken lines: [speakerKey, text]. createdAt is spaced out from startedAt.
const SYNC_LINES = [
  ["self", "Thanks for joining, everyone. Let's start with the onboarding redesign — Sam, where are we?"],
  ["partner-0", "The new three-step flow is live in staging. In testing, drop-off fell from 40% to 18%."],
  ["partner-1", "That's a big jump. The empty-state illustrations still need final copy, though."],
  ["partner-0", "Right — I'll get those to design by Thursday."],
  ["self", "Let's aim to ship the redesign next Wednesday. Any blockers?"],
  ["partner-1", "Just the analytics events — they're only half instrumented right now."],
  ["self", "Okay, Jordan, you own finishing the analytics before launch."],
  ["partner-0", "One more thing: on small screens the third step feels cramped."],
  ["partner-1", "We could collapse the summary card under a toggle."],
  ["self", "Do it. Next — the API rate limits. We're hitting the 10k-per-minute ceiling at peak."],
  ["partner-0", "Short term we can cache the profile endpoint. Long term, move to per-tenant limits."],
  ["self", "Let's cache now and design per-tenant limits for next quarter."],
  ["partner-1", "I'll write up the caching plan by Monday."],
  ["self", "Great. Recap: ship onboarding Wednesday, Jordan finishes analytics, Sam sends illustrations Thursday, caching plan Monday. Thanks all."],
];

const LIVE_LINES = [
  ["self", "Okay, we're recording. Let's do a quick standup — Sam, want to start?"],
  ["partner-0", "Sure. Yesterday I wrapped the staging deploy for the onboarding flow."],
  ["partner-0", "Today I'm finishing the empty-state copy and handing off to design."],
  ["partner-1", "I'm instrumenting the analytics events — should be done by end of day."],
  ["self", "Nice. I'll review the caching proposal this afternoon."],
];

const SYNC_MINUTES = `## Overview
- The onboarding redesign is ready in staging; testing drop-off fell from **40% to 18%**. Target ship date: **next Wednesday**.
- Remaining launch blockers: finishing analytics instrumentation and final empty-state copy.
- API rate limits are being hit at peak — short-term caching approved; per-tenant limits planned for next quarter.

## Discussion
### Onboarding redesign
- The new three-step flow is live in staging with a large drop in testing drop-off (40% → 18%).
- Empty-state illustrations still need final copy. On small screens the third step is cramped, so the summary card will collapse under a toggle.

### Analytics & launch readiness
- Analytics events are only half instrumented — this is the main blocker for launch.

### API rate limits
- Peak traffic hits the 10k/min ceiling. **Decision: cache the profile endpoint now; design per-tenant limits next quarter.**

## Decisions
- Ship the onboarding redesign next **Wednesday**.
- Cache the profile endpoint as the short-term rate-limit fix.

## Action items
- **Jordan** — finish analytics instrumentation before launch.
- **Sam** — send final empty-state illustrations to design by **Thursday**.
- **Jordan** — write up the caching plan by **Monday**.
`;

const DESIGN_MINUTES = `## Overview
- Reviewed the new settings layout; the grouped-tabs approach was approved.
- One open question on mobile spacing, to be resolved in the next iteration.

## Decisions
- Adopt the tabbed settings layout.

## Action items
- **Sam** — tighten mobile spacing and share a revised mock.
`;

const RESEARCH_MINUTES = `## Overview
- Compared three local embedding models for on-device search; the smallest was accurate enough.
- Agreed to defer semantic search until after the onboarding launch.

## Decisions
- Ship keyword search now; revisit semantic search next quarter.
`;


// ---- 日本語版 ----------------------------------------------------------------------------
// README.ja.md のスクリーンショット用。英語版の訳ではなく、日本語で行われた別の会議です。

const SYNC_LINES_JA = [
  ["self", "では始めます。まず新規登録フローの作り直しから。田中さん、状況は？"],
  ["partner-0", "新しい3ステップの画面をステージングに上げました。テストでは離脱が40%から18%まで下がっています。"],
  ["partner-1", "だいぶ効きましたね。ただ空状態のイラストの文言がまだ確定していません。"],
  ["partner-0", "そこは木曜までにデザインに渡します。"],
  ["self", "来週の水曜リリースを目標にしましょう。止まりそうなところはありますか。"],
  ["partner-1", "計測イベントの実装が半分残っています。"],
  ["self", "では鈴木さん、リリース前に計測の実装を仕上げてください。"],
  ["partner-0", "もう一点、スマホの狭い画面だと3ステップ目が窮屈です。"],
  ["partner-1", "サマリーのカードを折りたたみにするのはどうでしょう。"],
  ["self", "それでいきましょう。次は API のレート制限です。ピーク時に毎分1万件の上限に当たっています。"],
  ["partner-0", "短期的にはプロフィールの取得をキャッシュできます。中長期はテナントごとの上限に移すのが筋かと。"],
  ["self", "まずキャッシュを入れて、テナント別の上限は来期に設計しましょう。"],
  ["partner-1", "キャッシュの方針は月曜までにまとめます。"],
  ["self", "ありがとうございます。まとめると、水曜に新規登録フローをリリース、鈴木さんが計測、田中さんが木曜にイラスト、月曜にキャッシュの方針。以上です。"],
];

const LIVE_LINES_JA = [
  ["self", "録音を開始しました。朝会を始めます。田中さんからお願いします。"],
  ["partner-0", "昨日は新規登録フローのステージング反映まで終わりました。"],
  ["partner-0", "今日は空状態の文言を仕上げて、デザインに渡します。"],
  ["partner-1", "私は計測イベントを実装中です。今日中には終わる見込みです。"],
  ["self", "ありがとうございます。私は午後にキャッシュの提案を確認します。"],
];

const SYNC_MINUTES_JA = `## 概要
- 新規登録フローの作り直しがステージングで確認でき、テストでの離脱が **40% から 18%** に低下。リリース目標は **来週水曜**。
- 残る課題は計測イベントの実装と、空状態の文言の確定。
- ピーク時に API のレート制限に到達。短期はキャッシュで対応し、テナント別の上限は来期に設計する。

## 議論
### 新規登録フローの作り直し
- 新しい3ステップの画面をステージングに反映済み。テストでの離脱が 40% → 18% に低下。
- 空状態のイラストは文言が未確定。スマホの狭い画面では3ステップ目が窮屈なため、サマリーのカードを折りたたみに変更する。

### 計測とリリース準備
- 計測イベントの実装が半分残っており、これがリリースの主な障害。

### API のレート制限
- ピーク時に毎分1万件の上限に到達。**決定: まずプロフィール取得をキャッシュし、テナント別の上限は来期に設計する。**

## 決定事項
- 新規登録フローの作り直しを **来週水曜** にリリースする。
- 短期のレート制限対策として、プロフィール取得をキャッシュする。

## ToDo
- **鈴木** — リリース前に計測イベントの実装を完了する。
- **田中** — 空状態のイラストを **木曜** までにデザインへ渡す。
- **鈴木** — キャッシュの方針を **月曜** までにまとめる。
`;

const DESIGN_MINUTES_JA = `## 概要
- 新しい設定画面のレイアウトを確認し、タブでまとめる方式を採用することにした。
- スマホでの余白について1点未決。次の反復で解消する。

## 決定事項
- 設定画面はタブ方式を採用する。

## ToDo
- **田中** — スマホの余白を詰めた案を共有する。
`;

const RESEARCH_MINUTES_JA = `## 概要
- 端末内検索のために、ローカルで動く埋め込みモデルを3種類比較。最も小さいもので精度は十分だった。
- 意味検索の導入は、新規登録フローのリリース後に見送る。

## 決定事項
- まずキーワード検索を出し、意味検索は来期に再検討する。
`;

const DESIGN_LINES_JA = [
  ["self", "新しい設定画面のタブ分けを見ていきましょう。"],
  ["partner-0", "1枚の長いページより、カテゴリごとに分かれている方がずっと読みやすいです。"],
  ["self", "ではタブ方式を採用しましょう。"],
];

const RESEARCH_LINES_JA = [
  ["self", "端末内検索のために、ローカルの埋め込みモデルを3種類比較しました。"],
  ["partner-0", "一番小さいモデルでも精度は十分で、速度はかなり上でした。"],
  ["self", "ではキーワード検索を先に出して、意味検索は来期に再検討しましょう。"],
];

const minutesAt = (start, offsetMin) => new Date(start.getTime() + offsetMin * 60_000);

async function removeDemo() {
  await prisma.meeting.deleteMany({ where: { id: { in: Object.values(IDS) } } });
}

async function makeMeeting({ id, title, description, startedAt, endedAt, recordedMs, labels, lines, minutes, tags, people }) {
  await prisma.meeting.create({
    data: {
      id,
      title,
      description,
      startedAt,
      endedAt,
      recordedMs,
      speakerLabels: labels ?? null,
      sttLanguage: "en",
      summaryStatus: minutes ? "done" : null,
      tags: tags?.length
        ? { connectOrCreate: tags.map((name) => ({ where: { name }, create: { name } })) }
        : undefined,
      // Everyone here speaks, which is the ordinary case. Somebody who attends and says
      // nothing is `speaking: false`, and the seed has no reason to show that.
      participants: people?.length
        ? { create: people.map((name, position) => ({ name, position, speaking: true })) }
        : undefined,
      transcripts: {
        create: lines.map(([speakerType, text], i) => ({
          speakerType,
          text,
          createdAt: new Date(startedAt.getTime() + i * 90_000),
        })),
      },
      ...(minutes
        ? {
            summaries: {
              create: { summaryText: minutes, provider: "ollama", model: "qwen2.5:7b-instruct" },
            },
          }
        : {}),
    },
  });
}

async function main() {
  await removeDemo();
  if (process.argv.includes("--clean")) {
    console.log("Removed demo meetings.");
    return;
  }

  const now = Date.now();
  const day = 86_400_000;

  // 1) Ended meeting with full minutes — for minutes.png.
  const syncStart = new Date(now - 2 * day);
  await makeMeeting({
    id: IDS.sync,
    title: JA ? "プロダクト定例" : "Weekly Product Sync",
    description: JA
      ? "週次の合同定例。新規登録フローの作り直し、リリース準備、API のレート制限。"
      : "Weekly cross-functional sync: onboarding redesign, launch readiness, API rate limits.",
    startedAt: syncStart,
    endedAt: minutesAt(syncStart, 22),
    recordedMs: 22 * 60_000,
    labels: LABELS,
    lines: JA ? SYNC_LINES_JA : SYNC_LINES,
    minutes: JA ? SYNC_MINUTES_JA : SYNC_MINUTES,
    tags: JA ? ["プロダクト", "定例"] : ["Product", "Weekly"],
    people: PEOPLE,
  });

  // 2) In-progress meeting (no endedAt) with a partial transcript — for recording.png.
  const liveStart = new Date(now - 5 * 60_000);
  await makeMeeting({
    id: IDS.live,
    title: JA ? "プロダクト定例 — 朝会" : "Weekly Product Sync — standup",
    description: JA ? "毎日の朝会。" : "Daily standup.",
    startedAt: liveStart,
    endedAt: null,
    recordedMs: null,
    labels: LABELS,
    lines: JA ? LIVE_LINES_JA : LIVE_LINES,
    minutes: null,
    tags: JA ? ["朝会"] : ["Standup"],
    people: PEOPLE,
  });

  // 3-4) A couple of short ended meetings so the list looks realistic.
  const dStart = new Date(now - 4 * day);
  await makeMeeting({
    id: IDS.design,
    title: JA ? "デザインレビュー — 設定画面" : "Design Review — Settings",
    description: JA ? "新しい設定画面のレイアウトを確認する。" : "Review the new settings layout.",
    startedAt: dStart,
    endedAt: minutesAt(dStart, 18),
    recordedMs: 18 * 60_000,
    labels: JSON.stringify(
      JA
        ? { self: "佐藤 玲", "partner-0": "田中 悠" }
        : { self: "Alex Rivera", "partner-0": "Sam Chen" },
    ),
    lines: JA
      ? DESIGN_LINES_JA
      : [
          ["self", "Let's look at the grouped settings tabs."],
          ["partner-0", "Grouping by category reads much better than one long page."],
          ["self", "Agreed — let's adopt the tabbed layout."],
        ],
    minutes: JA ? DESIGN_MINUTES_JA : DESIGN_MINUTES,
    tags: JA ? ["デザイン"] : ["Design"],
    people: PEOPLE.slice(0, 2),
  });

  const rStart = new Date(now - 7 * day);
  await makeMeeting({
    id: IDS.research,
    title: JA ? "技術調査 — 端末内検索" : "Research Sync — on-device search",
    description: JA ? "ローカルで動く埋め込みモデルを評価する。" : "Evaluate local embedding models.",
    startedAt: rStart,
    endedAt: minutesAt(rStart, 31),
    recordedMs: 31 * 60_000,
    labels: JSON.stringify(
      JA
        ? { self: "佐藤 玲", "partner-0": "鈴木 千夏" }
        : { self: "Alex Rivera", "partner-0": "Jordan Lee" },
    ),
    lines: JA
      ? RESEARCH_LINES_JA
      : [
          ["self", "We compared three local embedding models for on-device search."],
          ["partner-0", "The smallest was accurate enough and much faster."],
          ["self", "Let's ship keyword search now and revisit semantic search next quarter."],
        ],
    minutes: JA ? RESEARCH_MINUTES_JA : RESEARCH_MINUTES,
    tags: JA ? ["調査"] : ["Research"],
    people: [PEOPLE[0], PEOPLE[2]],
  });

  console.log("Seeded demo meetings:");
  console.log(`  minutes.png   -> open  /${IDS.sync}`);
  console.log(`  recording.png -> open  /${IDS.live}/recording`);
  console.log("Switch the app to Light theme (Settings -> Appearance) before capturing.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
