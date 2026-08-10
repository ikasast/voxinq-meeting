// Seed non-private demo meetings for README screenshots (light theme, test data).
//
//   node scripts/seed-demo.mjs           # insert / reset the demo meetings
//   node scripts/seed-demo.mjs --clean   # remove them again
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

const LABELS = JSON.stringify({
  self: "Alex Rivera",
  "partner-0": "Sam Chen",
  "partner-1": "Jordan Lee",
});

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

const minutesAt = (start, offsetMin) => new Date(start.getTime() + offsetMin * 60_000);

async function removeDemo() {
  await prisma.meeting.deleteMany({ where: { id: { in: Object.values(IDS) } } });
}

async function makeMeeting({ id, title, description, startedAt, endedAt, recordedMs, labels, lines, minutes, tags }) {
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
    title: "Weekly Product Sync",
    description: "Weekly cross-functional sync: onboarding redesign, launch readiness, API rate limits.",
    startedAt: syncStart,
    endedAt: minutesAt(syncStart, 22),
    recordedMs: 22 * 60_000,
    labels: LABELS,
    lines: SYNC_LINES,
    minutes: SYNC_MINUTES,
    tags: ["Product", "Weekly"],
  });

  // 2) In-progress meeting (no endedAt) with a partial transcript — for recording.png.
  const liveStart = new Date(now - 5 * 60_000);
  await makeMeeting({
    id: IDS.live,
    title: "Weekly Product Sync — standup",
    description: "Daily standup.",
    startedAt: liveStart,
    endedAt: null,
    recordedMs: null,
    labels: LABELS,
    lines: LIVE_LINES,
    minutes: null,
    tags: ["Standup"],
  });

  // 3-4) A couple of short ended meetings so the list looks realistic.
  const dStart = new Date(now - 4 * day);
  await makeMeeting({
    id: IDS.design,
    title: "Design Review — Settings",
    description: "Review the new settings layout.",
    startedAt: dStart,
    endedAt: minutesAt(dStart, 18),
    recordedMs: 18 * 60_000,
    labels: JSON.stringify({ self: "Alex Rivera", "partner-0": "Sam Chen" }),
    lines: [
      ["self", "Let's look at the grouped settings tabs."],
      ["partner-0", "Grouping by category reads much better than one long page."],
      ["self", "Agreed — let's adopt the tabbed layout."],
    ],
    minutes: DESIGN_MINUTES,
    tags: ["Design"],
  });

  const rStart = new Date(now - 7 * day);
  await makeMeeting({
    id: IDS.research,
    title: "Research Sync — on-device search",
    description: "Evaluate local embedding models.",
    startedAt: rStart,
    endedAt: minutesAt(rStart, 31),
    recordedMs: 31 * 60_000,
    labels: JSON.stringify({ self: "Alex Rivera", "partner-0": "Jordan Lee" }),
    lines: [
      ["self", "We compared three local embedding models for on-device search."],
      ["partner-0", "The smallest was accurate enough and much faster."],
      ["self", "Let's ship keyword search now and revisit semantic search next quarter."],
    ],
    minutes: RESEARCH_MINUTES,
    tags: ["Research"],
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
