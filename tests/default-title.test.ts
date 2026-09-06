import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_TITLE_FORMAT, TITLE_FORMATS, defaultMeetingTitle, isTitleFormat } from "../lib/meeting-title";
import { dayFromKey } from "../lib/utils";

// A default title is what somebody reads in a list months later, and it is the one piece of a
// meeting the app writes on their behalf. Both properties here were wrong before: it carried a
// time the row already shows, and it carried today's date onto a meeting booked for another day.

describe("the default title", () => {
  it("is the day, not the minute", () => {
    expect(defaultMeetingTitle(new Date(2026, 6, 11, 16, 0))).toBe("20260711");
  });

  it("does not shift with the hour", () => {
    // The failure this replaces: two meetings on one afternoon got different default titles,
    // and the difference was a figure the list already prints on the same row.
    const morning = defaultMeetingTitle(new Date(2026, 6, 11, 9, 30));
    const night = defaultMeetingTitle(new Date(2026, 6, 11, 23, 59));
    expect(morning).toBe(night);
  });

  it("pads the month and the day", () => {
    expect(defaultMeetingTitle(new Date(2026, 0, 3))).toBe("20260103");
  });
});

describe("a day picked in the calendar", () => {
  it("is read where the reader is standing, not in UTC", () => {
    // `new Date("2026-09-18")` is midnight UTC, which is the 17th for anybody west of Greenwich:
    // booking a meeting on the 18th and having it titled 20260917 is the kind of wrong that gets
    // noticed months later, in a list, by somebody who no longer remembers booking it.
    const d = dayFromKey("2026-09-18");
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(8);
    expect(d?.getDate()).toBe(18);
    // Midnight *here*, which is what pins the parse. Checking only the date would pass on a
    // machine east of Greenwich even with the UTC bug present — at UTC+9 midnight UTC is still
    // the 18th, just at nine in the morning. The hour is what tells the two apart everywhere.
    expect(d?.getHours()).toBe(0);
    expect(defaultMeetingTitle(d)).toBe("20260918");
  });

  it("is ignored when it is not a day", () => {
    // Then the title falls back to today, which is what a meeting with no booked day is for.
    for (const v of [undefined, null, "", "today", "2026-9-8", "2026-09-18T09:00"]) {
      expect(dayFromKey(v), JSON.stringify(v)).toBeUndefined();
    }
  });

  it("is ignored when it is a day that does not exist", () => {
    expect(dayFromKey("2026-13-01")).toBeUndefined();
  });
});

describe("the New meeting screen", () => {
  const form = readFileSync(join(__dirname, "..", "app/new/new-meeting-form.tsx"), "utf8");

  it("titles a booked meeting for the day it was booked on", () => {
    // The calendar's "+ Add a meeting on this day" arrives here as ?date=. Filling the date in
    // and then titling the meeting *today* is the click looking as though it was ignored.
    expect(form).toContain("const bookedDay = dayFromKey(date);");
    expect(form).toContain("const dayTitle = defaultMeetingTitle(bookedDay, titleFormat);");
    expect(form).toContain("useState(dayTitle)");
  });

  it("uses the same day if the title is cleared", () => {
    // The field is editable and can be emptied. What it falls back to has to be the booked day
    // too, or clearing the box silently moves the meeting's name to today.
    expect(form).toContain("createMeeting(dayTitle)");
    expect(form).not.toContain("createMeeting(defaultMeetingTitle())");
  });

  it("is handed the shape by the server, not left to fetch it", () => {
    // The field shows the name before the meeting exists, so it has to be right on the first
    // paint. Fetching the setting in the browser would show the compact default and then swap
    // it under somebody already typing.
    expect(readFileSync(join(__dirname, "..", "app/new/page.tsx"), "utf8")).toContain(
      "titleFormat={meetingTitleFormat}",
    );
  });
});

describe("the callers that never show a title", () => {
  it("let the server name the meeting", () => {
    // Three callers, only one of which shows the name first. The other two would each have to
    // fetch the settings to learn the shape, and would each be a place for the two to drift.
    for (const p of ["app/quick-record/page.tsx", "app/[id]/clone-meeting-button.tsx"]) {
      expect(readFileSync(join(__dirname, "..", p), "utf8"), p).not.toContain("defaultMeetingTitle");
    }
    const route = readFileSync(join(__dirname, "..", "app/api/meetings/route.ts"), "utf8");
    expect(route).toContain("typed || defaultMeetingTitle(scheduledAt ?? new Date()");
  });
});

describe("the shapes on offer", () => {
  const day = new Date(2026, 6, 11);

  it("each produce their own sample", () => {
    // The settings screen shows `sample` as the label and stores `id`. If the two ever disagree
    // somebody picks one shape and gets another, and the screen is the last place that would
    // show it.
    for (const f of TITLE_FORMATS) {
      expect(defaultMeetingTitle(day, f.id), f.id).toBe(f.sample);
    }
  });

  it("cover the ways a date is written", () => {
    expect(TITLE_FORMATS.map((f) => f.sample)).toEqual([
      "20260711",
      "2026-07-11",
      "Jul 11, 2026",
      "11 Jul 2026",
      "2026年7月11日",
    ]);
  });

  it("start where this app started, so nobody's titles move under them", () => {
    expect(DEFAULT_TITLE_FORMAT).toBe("compact");
    expect(defaultMeetingTitle(day)).toBe("20260711");
  });

  it("fall back rather than throw on a shape that is not one", () => {
    // settings.json is hand-editable, and a typo there should cost a default rather than every
    // screen that names a meeting.
    expect(defaultMeetingTitle(day, "yyyy/MM/dd")).toBe("20260711");
    expect(isTitleFormat("yyyy/MM/dd")).toBe(false);
    expect(isTitleFormat("ja")).toBe(true);
  });
});
