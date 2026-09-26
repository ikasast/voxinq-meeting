import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { minutesCandidates, minutesOverrides, needsMinutes } from "@/lib/meetings/bulk-minutes";

// Recording and writing the minutes are one action in the interface and two in practice: a day
// of back-to-back meetings is recorded as it happens and written up afterwards. What the list
// has to get right is which meetings are actually waiting for that — offering one that is
// already in the queue is how a queue turns into duplicates.

const meeting = (over: Partial<Parameters<typeof needsMinutes>[0]> = {}) => ({
  id: "m1",
  title: "Session 1",
  startedAt: new Date("2026-09-25T01:00:00.000Z"),
  endedAt: new Date("2026-09-25T02:00:00.000Z"),
  summaryStatus: null,
  _count: { transcripts: 40, summaries: 0 },
  ...over,
});

describe("meetings waiting to be written up", () => {
  it("is a finished meeting with something to write from and no minutes", () => {
    expect(needsMinutes(meeting())).toBe(true);
  });

  it("is not a meeting still being recorded", () => {
    // Its transcript is still arriving; minutes written now would be of half a meeting.
    expect(needsMinutes(meeting({ endedAt: null }))).toBe(false);
  });

  it("is not a meeting with nothing recorded", () => {
    expect(needsMinutes(meeting({ _count: { transcripts: 0, summaries: 0 } }))).toBe(false);
  });

  it("is not a meeting that already has minutes", () => {
    expect(needsMinutes(meeting({ _count: { transcripts: 40, summaries: 1 } }))).toBe(false);
  });

  it("is not a meeting already generating or waiting its turn", () => {
    expect(needsMinutes(meeting({ summaryStatus: "processing" }))).toBe(false);
  });

  it("is a meeting whose last attempt failed — that is a retry", () => {
    expect(needsMinutes(meeting({ summaryStatus: "error" }))).toBe(true);
  });

  it("keeps the list's own order, and carries what the panel shows", () => {
    const rows = [
      meeting({ id: "a", title: "Morning" }),
      meeting({ id: "b", _count: { transcripts: 10, summaries: 2 } }),
      meeting({ id: "c", title: "Afternoon", startedAt: new Date("2026-09-25T05:00:00.000Z") }),
    ];
    expect(minutesCandidates(rows)).toEqual([
      { id: "a", title: "Morning", startedAt: "2026-09-25T01:00:00.000Z" },
      { id: "c", title: "Afternoon", startedAt: "2026-09-25T05:00:00.000Z" },
    ]);
  });
});

describe("queueing several at once", () => {
  const route = readFileSync(join(__dirname, "..", "app/api/claude/summary/bulk/route.ts"), "utf8");

  it("leaves out what is already queued instead of failing the lot", () => {
    // The person asked for "these twelve". Refusing all of them over one that was already
    // waiting would answer a question nobody asked.
    expect(route).toContain('await openJobFor("minutes", id)');
    expect(route).toContain('skipped.push({ id, reason: "already queued" })');
  });

  it("marks each meeting before its job starts, so the list says so while it waits", () => {
    expect(route).toContain('data: { summaryStatus: "processing", summaryError: null }');
  });

  it("has a ceiling, and nudges the queue once", () => {
    expect(route).toContain("MAX_AT_ONCE");
    expect(route).toContain("if (queued.length > 0) void tick();");
  });

  it("hands the batch's own choices to every job in it", () => {
    // Not `params: {}`: that was what made the format and the model the settings' or nothing.
    expect(route).toContain("const params = minutesOverrides(body);");
    expect(route).toContain('await enqueue({ kind: "minutes", meetingId: id, params });');
  });
});

describe("a batch's own choices", () => {
  it("carries the three the single-meeting route takes", () => {
    expect(
      minutesOverrides({ detail: "brief", provider: "anthropic", templateId: "lecture" }),
    ).toEqual({ detail: "brief", provider: "anthropic", templateId: "lecture" });
  });

  it("carries nothing when nothing was chosen, so a series keeps its own format", () => {
    expect(minutesOverrides({ meetingIds: ["m1"] })).toEqual({});
    expect(minutesOverrides(null)).toEqual({});
  });

  it("drops what nobody offers rather than storing it in every job", () => {
    // The provider decides the job's price in the queue, so a made-up one is not harmless.
    expect(minutesOverrides({ detail: "verbose", provider: "gemini" })).toEqual({});
    expect(minutesOverrides({ detail: 3, provider: ["ollama"] })).toEqual({});
    expect(minutesOverrides({ templateId: "" })).toEqual({});
    expect(minutesOverrides({ templateId: "x".repeat(101) })).toEqual({});
  });
});

describe("the batch's options panel", () => {
  const bar = readFileSync(join(__dirname, "..", "app/bulk-minutes.tsx"), "utf8");

  it("is the same fields Regenerate uses, not a second copy", () => {
    expect(bar).toContain("<MinutesChoiceFields");
    const regen = readFileSync(join(__dirname, "..", "app/[id]/summary-section.tsx"), "utf8");
    expect(regen).toContain("<MinutesChoiceFields");
    // The option lists live in one place.
    expect(regen).not.toMatch(/const DETAILS/);
  });

  it("sends the choice only when it was opened", () => {
    // Closed means "as each meeting would be written on its own", which is not the same as
    // sending the saved values: a series with its own format has to keep it.
    expect(bar).toMatch(/showOptions && opts\.loaded\s*\?/);
  });
});

describe("the list", () => {
  const pane = readFileSync(join(__dirname, "..", "app/meeting-list-pane.tsx"), "utf8");

  it("says on the card when a recorded meeting has no minutes", () => {
    expect(pane).toContain("needsMinutes(m)");
    expect(pane).toContain('t("No minutes")');
  });

  it("offers the bulk action for what is on screen, and not to a read-only visitor", () => {
    expect(pane).toContain("minutesCandidates(meetings)");
    expect(pane).toMatch(/\{!readOnly \? \(\s*<BulkMinutes/);
  });
});
