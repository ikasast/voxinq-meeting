import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONTEXT_KEYS, normalizeInclude, resolveInclude } from "@/lib/minutes-context";
import { meetingWhen } from "@/lib/minutes-context-data";
import { buildSummarySystemPrompt } from "@/lib/minutes-prompt";
import { normalizeTemplates } from "@/lib/minutes-templates";
import { minutesOverrides } from "@/lib/meetings/bulk-minutes";
import { minutesParamsFrom } from "@/lib/stt/transcribe-defaults";

// What the minutes are given besides the transcript is chosen per run, with the template's
// defaults, rather than being whatever fields happen to be filled in.

const read = (p: string) => readFileSync(path.join(__dirname, "..", p), "utf8");

describe("the choice of context", () => {
  it("keeps known keys, in order, and tells no list from an empty one", () => {
    expect(normalizeInclude(["background", "meeting", "nonsense", 3])).toEqual(["meeting", "background"]);
    expect(normalizeInclude([])).toEqual([]);
    expect(normalizeInclude(undefined)).toBeUndefined();
    expect(normalizeInclude("meeting")).toBeUndefined();
  });

  it("defaults to the chosen template's, then the default template's, then everything", () => {
    const templates = [
      { id: "lecture", include: ["meeting" as const] },
      { id: "plain" },
    ];
    expect(resolveInclude(templates, { chosenId: "lecture" })).toEqual(["meeting"]);
    expect(resolveInclude(templates, { chosenId: "", defaultId: "lecture" })).toEqual(["meeting"]);
    // Saved before this was a choice: it keeps giving what it always gave.
    expect(resolveInclude(templates, { chosenId: "plain" })).toEqual([...CONTEXT_KEYS]);
    expect(resolveInclude(templates, { chosenId: "default", defaultId: "lecture" })).toEqual([...CONTEXT_KEYS]);
    expect(resolveInclude([], {})).toEqual([...CONTEXT_KEYS]);
  });

  it("is kept on a saved template", () => {
    const [t] = normalizeTemplates([{ id: "a", name: "A", body: "## x", include: ["purpose", "bogus"] }]);
    expect(t.include).toEqual(["purpose"]);
    const [plain] = normalizeTemplates([{ id: "b", name: "B", body: "## x" }]);
    expect("include" in plain).toBe(false);
  });

  it("travels with every way of asking for minutes", () => {
    expect(minutesOverrides({ include: ["participants", "x"] }).include).toEqual(["participants"]);
    expect("include" in minutesOverrides({})).toBe(false);
    expect(minutesParamsFrom({ include: [] })).toEqual({ include: [] });
    expect(minutesParamsFrom({ detail: "brief" })?.include).toBeUndefined();
    const route = read("app/api/claude/summary/route.ts");
    expect(route).toContain("normalizeInclude(body?.include)");
  });
});

describe("the meeting's own facts", () => {
  it("are written as a time range, crossing midnight when they do", () => {
    expect(meetingWhen(new Date(2026, 9, 5, 10, 0), new Date(2026, 9, 5, 11, 30))).toBe("2026-10-05 10:00〜11:30");
    expect(meetingWhen(new Date(2026, 9, 5, 23, 30), new Date(2026, 9, 6, 0, 15))).toBe(
      "2026-10-05 23:30〜2026-10-06 00:15",
    );
    expect(meetingWhen(new Date(2026, 9, 5, 10, 0), null)).toBe("2026-10-05 10:00〜");
  });

  it("go into the prompt only when given, and may be written as facts", () => {
    const plain = buildSummarySystemPrompt(null, {});
    expect(plain).not.toContain("会議名:");
    expect(plain).not.toContain("記録上の情報");

    const given = buildSummarySystemPrompt(null, {
      meeting: { title: "週次の作り話定例", when: "2026-10-05 10:00〜11:00", participants: ["佐藤", "鈴木"] },
    });
    expect(given).toContain("- 会議名: 週次の作り話定例");
    expect(given).toContain("- 日時: 2026-10-05 10:00〜11:00");
    expect(given).toContain("- 参加者（登録された名前）: 佐藤、鈴木");
    // The honesty rule still stands, with the one exception spelled out.
    expect(given).toContain("議事録の情報源は発言ログだけ");
    expect(given).toContain("会議名・日時・出席者は上の記録上の情報から書いてよい");
    // Names on a list are not a licence to guess who said what.
    expect(given).toContain("参加者の名前を当てはめて推測しない");
  });
});

describe("the minutes job", () => {
  const runner = read("lib/queue/runners/minutes.ts");

  it("gives each piece only when the run, or its template, chose it", () => {
    for (const key of CONTEXT_KEYS) {
      expect(runner, key).toContain(`given.has("${key}")`);
    }
    expect(runner).toContain("include ??");
    expect(runner).toContain("resolveInclude(settings.minutesTemplates");
  });

  it("reads the context the same way the preview does", () => {
    expect(runner).toContain("gatherMinutesContext(meetingId)");
    expect(read("app/api/meetings/[id]/minutes/context/route.ts")).toContain("gatherMinutesContext(id)");
  });
});
