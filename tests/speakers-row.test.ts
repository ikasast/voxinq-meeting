import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { separatedSpeakers, shownName } from "../lib/speakers";
import { translate } from "../lib/i18n";

// Speaker separation was a picture of two people at the top of the transcript, and nothing on the
// page said whether a meeting had been separated or what was left to do. v4 shows it as a row of
// the meeting's details, and lays the tool out as three steps.

const ja = (k: string, v?: Record<string, string | number>) => translate("ja", k, v);
const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("a speaker's name on screen", () => {
  it("is the given name, else a plain name in the reader's language", () => {
    expect(shownName("partner-0", { "partner-0": "佐藤" }, ja)).toBe("佐藤");
    expect(shownName("partner-2", {}, ja)).toBe("話者 3");
    expect(shownName("self", {}, ja)).toBe("自分");
  });
});

describe("where separation stands", () => {
  it("is not separated while every line is the microphone's", () => {
    expect(separatedSpeakers(["self", "self"], {}, ja)).toEqual({
      separated: false,
      speakers: [{ key: "self", name: "自分", named: false }],
    });
  });

  it("lists the voices lines are said by, in order, and which have names", () => {
    const s = separatedSpeakers(["partner-1", "partner-0", "partner-1"], { "partner-0": "佐藤", "partner-4": "unused" }, ja);
    expect(s.separated).toBe(true);
    expect(s.speakers).toEqual([
      { key: "partner-0", name: "佐藤", named: true },
      { key: "partner-1", name: "話者 2", named: false },
    ]);
  });
});

describe("the row and the panel", () => {
  it("talk through one channel: the panel tells, the row asks it to open", () => {
    const list = read("app/[id]/transcript-list.tsx");
    expect(list).toContain("tellSpeakers(meetingId, {");
    expect(list).toContain("useOpenSpeakers(meetingId, showSpeakers)");
    expect(read("app/[id]/meeting-body.tsx")).toContain("useOpenSpeakers(meetingId, showTranscript)");
    expect(read("app/[id]/speakers-row.tsx")).toContain("openSpeakers(meetingId)");
    expect(read("app/[id]/page.tsx")).toContain("<SpeakersRow");
  });
});
