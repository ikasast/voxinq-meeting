import { describe, expect, it } from "vitest";
import {
  buildGrid,
  dayKey,
  dayRange,
  monthKey,
  monthLabel,
  monthRange,
  parseDay,
  parseMonth,
  shiftMonth,
} from "../lib/calendar-month";

// Calendar arithmetic, which is the kind of code that looks obviously right and is off by one.
// Every case here is a month boundary, a year boundary, or a day that does not exist.

describe("reading the month out of a URL", () => {
  const now = new Date(2026, 8, 5); // September 2026

  it("takes a well-formed one", () => {
    expect(parseMonth("2026-01", now)).toEqual({ year: 2026, month: 1 });
    expect(parseMonth("2026-12", now)).toEqual({ year: 2026, month: 12 });
  });

  it("falls back to the month we are in", () => {
    for (const bad of [undefined, "", "  ", "2026-13", "2026-00", "2026-9", "September", "0000-01"]) {
      expect(parseMonth(bad, now)).toEqual({ year: 2026, month: 9 });
    }
  });
});

describe("stepping months", () => {
  it("crosses both year boundaries", () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
  });

  it("stays put at zero", () => {
    expect(shiftMonth({ year: 2026, month: 6 }, 0)).toEqual({ year: 2026, month: 6 });
  });
});

describe("reading a day out of a URL", () => {
  it("takes a real date", () => {
    expect(parseDay("2026-09-18")).toBe("2026-09-18");
    expect(parseDay("2024-02-29")).toBe("2024-02-29"); // leap year
  });

  it("rejects a day that does not exist rather than rolling it forward", () => {
    // `new Date(2026, 8, 31)` is the 1st of October. Accepting it would filter for a day the
    // calendar never drew, and show another day's meetings under its heading.
    expect(parseDay("2026-09-31")).toBeNull();
    expect(parseDay("2026-02-30")).toBeNull();
    expect(parseDay("2025-02-29")).toBeNull(); // not a leap year
  });

  it("rejects anything malformed", () => {
    for (const bad of [undefined, "", "2026-09", "2026-9-18", "18/09/2026", "2026-09-18T10:00"]) {
      expect(parseDay(bad)).toBeNull();
    }
  });
});

describe("the ranges the queries use", () => {
  it("covers a month half-open, so the last day is included and the next is not", () => {
    const { start, end } = monthRange({ year: 2026, month: 9 });
    expect(dayKey(start)).toBe("2026-09-01");
    expect(dayKey(end)).toBe("2026-10-01");
    expect(dayKey(new Date(end.getTime() - 1))).toBe("2026-09-30");
  });

  it("wraps a December month into the next year", () => {
    expect(dayKey(monthRange({ year: 2026, month: 12 }).end)).toBe("2027-01-01");
  });

  it("covers one day half-open", () => {
    const r = dayRange("2026-09-18")!;
    expect(dayKey(r.start)).toBe("2026-09-18");
    expect(dayKey(r.end)).toBe("2026-09-19");
    expect(r.start.getHours()).toBe(0);
  });

  it("crosses a month end", () => {
    expect(dayKey(dayRange("2026-09-30")!.end)).toBe("2026-10-01");
  });

  it("has no range for a day that does not exist", () => {
    expect(dayRange("2026-09-31")).toBeNull();
  });
});

describe("the grid", () => {
  it("starts on Monday and pads both ends", () => {
    // 1 September 2026 is a Tuesday, so Monday leads with one blank.
    const weeks = buildGrid({ year: 2026, month: 9 });
    expect(weeks[0][0]).toBeNull();
    expect(weeks[0][1]).toEqual({ key: "2026-09-01", day: 1 });
    for (const w of weeks) expect(w).toHaveLength(7);
    expect(weeks.flat().filter(Boolean)).toHaveLength(30);
    expect(weeks.at(-1)!.at(-1)).toBeNull();
  });

  it("needs no lead when the month opens on a Monday", () => {
    // 1 June 2026 is a Monday.
    expect(buildGrid({ year: 2026, month: 6 })[0][0]).toEqual({ key: "2026-06-01", day: 1 });
  });

  it("holds February exactly in four weeks when it can", () => {
    // February 2027 has 28 days and starts on a Monday: no padding at all.
    const weeks = buildGrid({ year: 2027, month: 2 });
    expect(weeks).toHaveLength(4);
    expect(weeks.flat().every(Boolean)).toBe(true);
  });

  it("keys every cell the way the URL and the counts do", () => {
    const keys = buildGrid({ year: 2026, month: 1 }).flat().filter(Boolean).map((c) => c!.key);
    expect(keys[0]).toBe("2026-01-01");
    expect(keys.at(-1)).toBe("2026-01-31");
  });
});

describe("labels", () => {
  it("names the month and pads the key", () => {
    expect(monthLabel({ year: 2026, month: 9 })).toBe("September 2026");
    expect(monthKey({ year: 2026, month: 9 })).toBe("2026-09");
    expect(monthKey({ year: 2026, month: 12 })).toBe("2026-12");
  });
});
