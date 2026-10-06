import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { planTrim } from "@/lib/recording/trim";

// Trimming a recording left running after the meeting ended: which lines go with the audio.

const read = (p: string) => readFileSync(path.join(__dirname, "..", p), "utf8");
const row = (id: string, start: number | null, end: number | null) => ({ id, audioStartMs: start, audioEndMs: end });

describe("which lines leave", () => {
  it("are the ones entirely outside the kept range", () => {
    const rows = [row("a", 0, 900), row("b", 1500, 2500), row("c", 3000, 4000), row("d", 9000, 9500)];
    const plan = planTrim(rows, null, 1000, 5000);
    expect(plan.dropIds).toEqual(["a", "d"]);
    expect(plan.drop).toEqual([0, 3]);
  });

  it("keep a line that crosses an edge, and note one that crosses the start", () => {
    const rows = [row("a", 500, 1500), row("b", 4500, 5500)];
    const plan = planTrim(rows, null, 1000, 5000);
    expect(plan.dropIds).toEqual([]);
    expect(plan.straddling).toEqual(["a"]);
  });

  it("place older lines by the recording's boundary at the same position", () => {
    const rows = [row("a", null, null), row("b", null, null)];
    const segments = [
      { start: 0.2, end: 0.8 },
      { start: 2, end: 3 },
    ];
    expect(planTrim(rows, segments, 1000, 5000).dropIds).toEqual(["a"]);
  });

  it("keep a line nothing can place, rather than guess", () => {
    const rows = [row("a", null, null), row("b", 100, 200)];
    // The boundaries are out of step (three for two lines), so the pairing cannot be trusted.
    const segments = [
      { start: 0, end: 0.1 },
      { start: 0.1, end: 0.2 },
      { start: 0.2, end: 0.3 },
    ];
    expect(planTrim(rows, segments, 1000, 5000).dropIds).toEqual(["b"]);
  });
});

describe("the trim route", () => {
  const route = read("app/api/meetings/[id]/trim/route.ts");

  it("only trims a meeting that has ended and is not being worked on", () => {
    expect(route).toContain("if (!meeting.endedAt)");
    expect(route).toContain('["transcribe", "diarize"]');
  });

  it("counts before it cuts, so the confirmation can say how many lines go", () => {
    expect(route.indexOf("dryRun === true")).toBeGreaterThan(-1);
    expect(route.indexOf("dryRun === true")).toBeLessThan(route.indexOf("/trim`"));
  });

  it("changes the transcript only after the audio was cut", () => {
    expect(route.indexOf("prisma.$transaction")).toBeGreaterThan(route.indexOf("/trim`"));
    expect(route).toContain("if (res instanceof Error || !res.ok)");
  });

  it("is reached from the player, but not while the meeting is still recording", () => {
    const list = read("app/[id]/transcript-list.tsx");
    expect(list).toContain("!readOnly && !live && recInfo.durationSec");
  });

  it("asks before it deletes anything", () => {
    const ui = read("app/[id]/trim-recording.tsx");
    expect(ui.indexOf("await confirm(")).toBeLessThan(ui.indexOf("body: JSON.stringify(range)"));
    expect(ui).toContain("danger: true");
  });
});
