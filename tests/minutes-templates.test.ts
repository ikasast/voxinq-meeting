import { describe, expect, it } from "vitest";
import {
  migrateMinutesTemplates,
  normalizeTemplates,
  resolveTemplate,
} from "../lib/minutes-templates";

const meeting = { id: "m", name: "会議", body: "## 会議概要" };
const lecture = { id: "l", name: "講演", body: "## 講演の主題" };

describe("resolveTemplate", () => {
  it("uses what was chosen for this run above everything", () => {
    expect(
      resolveTemplate([meeting, lecture], {
        chosenId: "l",
        seriesFormat: "series own",
        defaultId: "m",
      }),
    ).toBe(lecture.body);
  });

  it("lets a run ask for the built-in format explicitly", () => {
    // Without this there is no way back to the default once a series has its own format.
    expect(
      resolveTemplate([meeting], { chosenId: "default", seriesFormat: "series own", defaultId: "m" }),
    ).toBeUndefined();
  });

  it("keeps a series' own format above the default template", () => {
    // It was set for that series deliberately; a new default must not quietly override it.
    expect(
      resolveTemplate([meeting, lecture], { seriesFormat: "series own", defaultId: "l" }),
    ).toBe("series own");
  });

  it("falls back to the default template, then to the built-in", () => {
    expect(resolveTemplate([meeting, lecture], { defaultId: "l" })).toBe(lecture.body);
    expect(resolveTemplate([meeting], {})).toBeUndefined();
  });

  it("does not break when a chosen or default template has been deleted", () => {
    expect(resolveTemplate([meeting], { chosenId: "gone", defaultId: "m" })).toBe(meeting.body);
    expect(resolveTemplate([], { defaultId: "gone" })).toBeUndefined();
  });

  it("ignores a series format that is only whitespace", () => {
    expect(resolveTemplate([meeting], { seriesFormat: "   ", defaultId: "m" })).toBe(meeting.body);
  });
});

describe("normalizeTemplates", () => {
  it("drops entries that would produce the built-in format under someone else's name", () => {
    const got = normalizeTemplates([
      { id: "a", name: "Fine", body: "## x" },
      { id: "b", name: "Empty body", body: "   " },
      { id: "", name: "No id", body: "## x" },
      { id: "d", name: "", body: "## x" },
      null,
      "nonsense",
    ]);
    expect(got.map((t) => t.id)).toEqual(["a"]);
  });

  it("survives a settings file edited by hand", () => {
    expect(normalizeTemplates(undefined)).toEqual([]);
    expect(normalizeTemplates("[]")).toEqual([]);
  });
});

describe("migrating the single saved format", () => {
  it("becomes one template and the default", () => {
    // An install with a format set is using it for every meeting. Dropping it would change
    // what the minutes look like with nothing said.
    const got = migrateMinutesTemplates({ summaryFormat: "## 独自の形式" });
    expect(got!.minutesTemplates).toHaveLength(1);
    expect(got!.minutesTemplates[0].body).toBe("## 独自の形式");
    expect(got!.defaultMinutesTemplateId).toBe(got!.minutesTemplates[0].id);
  });

  it("does nothing when the built-in format was in use", () => {
    expect(migrateMinutesTemplates({})).toBeNull();
    expect(migrateMinutesTemplates({ summaryFormat: "  " })).toBeNull();
  });

  it("does not run again once there are templates", () => {
    expect(
      migrateMinutesTemplates({
        minutesTemplates: [meeting],
        summaryFormat: "## old",
      }),
    ).toBeNull();
  });
});

describe("a default that no longer exists", () => {
  // Found by saving a list with the default's template removed: the reply still named it, and
  // the file kept a dangling id. resolveTemplate copes, but the settings screen showed a
  // format selected that was not there.
  it("resolves to the built-in rather than to nothing", () => {
    expect(resolveTemplate([], { defaultId: "deleted" })).toBeUndefined();
    expect(resolveTemplate([meeting], { chosenId: "deleted", defaultId: "m" })).toBe(meeting.body);
  });
});
