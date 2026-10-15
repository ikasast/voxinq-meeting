import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { meetingInfoRows, minutesWithInfo } from "../lib/meeting-info";

// The minutes, wherever they leave the app — Word, Markdown, the printed sheet, the clipboard —
// open with the meeting's details: when, who, the series. Speakers are not among them: they are
// the participants again.

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

describe("the meeting's details", () => {
  const m = {
    startedAt: new Date("2026-10-15T01:00:00Z"),
    endedAt: new Date("2026-10-15T02:00:00Z"),
    participants: ["佐藤", "田中"],
    series: "週次定例",
  };

  it("are when, who and the series, in the reader's language", () => {
    const ja = meetingInfoRows(m, "ja");
    expect(ja.map((r) => r.label)).toEqual(["日時", "参加者", "シリーズ"]);
    expect(ja[1].value).toBe("佐藤、田中");
    expect(meetingInfoRows(m, "en").map((r) => r.label)).toEqual(["When", "Participants", "Series"]);
  });

  it("leave out what the meeting does not have", () => {
    expect(meetingInfoRows({ ...m, participants: [], series: null }, "ja")).toHaveLength(1);
  });

  it("head the minutes as a list under the title", () => {
    const md = minutesWithInfo("定例", meetingInfoRows(m, "ja"), "# 概要\n\n本文");
    expect(md.startsWith("# 定例\n\n- **日時:** ")).toBe(true);
    expect(md).toContain("- **参加者:** 佐藤、田中");
    expect(md.indexOf("# 概要")).toBeGreaterThan(md.indexOf("---"));
  });

  it("go into every file the minutes are taken away as", () => {
    const route = read("app/api/meetings/[id]/export/route.ts");
    expect(route).toContain("minutesWithInfo(meeting.title, info, latest.summaryText)");
    expect(route).toMatch(/minutesDocx\(\{[\s\S]*?\binfo,/);
    expect(read("app/[id]/print/page.tsx")).toContain("meetingInfoRows(");
  });

  it("can be copied with the minutes from the download menu", () => {
    const menu = read("app/[id]/download-meeting-button.tsx");
    expect(menu).toContain('t("Copy with meeting info")');
    expect(menu).toContain('fetch(file("minutes")');
  });
});

describe("regenerating the minutes", () => {
  it("offers one Stop, in the heading, not a second beside the notice", () => {
    const s = read("app/[id]/summary-section.tsx");
    const notice = s.indexOf('t("Generating new minutes. A new version will be added below when done…")');
    const line = s.slice(notice, s.indexOf("</div>", notice));
    expect(line).not.toContain("<StopButton");
  });
});
