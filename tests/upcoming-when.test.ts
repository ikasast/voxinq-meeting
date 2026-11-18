import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatUpcomingIn } from "@/lib/i18n/format";

// When a booked meeting is, as the sidebar's Upcoming says it: by how near it is. Built from
// local dates, so the days are the test machine's own whatever its zone.

// Wednesday 18 November 2026, 14:25.
const now = new Date(2026, 10, 18, 14, 25);
const at = (day: number, h: number, m = 0, month = 10, year = 2026) => new Date(year, month, day, h, m);

describe("formatUpcomingIn", () => {
  it("counts down within the hour", () => {
    expect(formatUpcomingIn("ja", at(18, 15, 0), now)).toEqual({ text: "35分後", past: false });
    expect(formatUpcomingIn("en", at(18, 15, 0), now)).toEqual({ text: "in 35 min", past: false });
    // Seconds away is still a minute away, not "0".
    expect(formatUpcomingIn("ja", new Date(now.getTime() + 20_000), now).text).toBe("1分後");
  });

  it("gives the time later today", () => {
    expect(formatUpcomingIn("ja", at(18, 17, 30), now).text).toBe("17:30");
  });

  it("says tomorrow by the calendar, not by 24 hours", () => {
    expect(formatUpcomingIn("ja", at(19, 10), now).text).toBe("明日 10:00");
    expect(formatUpcomingIn("en", at(19, 10), now).text).toBe("Tomorrow 10:00");
    const late = new Date(2026, 10, 18, 23, 0);
    expect(formatUpcomingIn("ja", at(19, 9), late).text).toBe("明日 09:00");
  });

  it("gives the weekday within the week, and the date beyond it", () => {
    expect(formatUpcomingIn("ja", at(20, 14), now).text).toBe("金 14:00");
    expect(formatUpcomingIn("en", at(20, 14), now).text).toBe("Fri 14:00");
    expect(formatUpcomingIn("ja", at(28, 10), now).text).toBe("11/28");
    expect(formatUpcomingIn("en", at(28, 10), now).text).toBe("Nov 28");
    expect(formatUpcomingIn("ja", at(5, 10, 0, 0, 2027), now).text).toBe("2027/1/5");
  });

  it("says when a meeting was that passed with nothing recorded, marked as past", () => {
    expect(formatUpcomingIn("ja", at(17, 13), now)).toEqual({ text: "昨日 13:00", past: true });
    expect(formatUpcomingIn("ja", at(18, 9), now)).toEqual({ text: "09:00", past: true });
    expect(formatUpcomingIn("ja", at(10, 9), now)).toEqual({ text: "11/10", past: true });
  });
});

describe("the sidebar's Upcoming rows", () => {
  const sidebar = readFileSync(join(__dirname, "..", "app/sidebar.tsx"), "utf8");

  it("end with when the meeting is, drawn in the browser and again each minute", () => {
    expect(sidebar).toContain("{m.upcoming ? <When at={m.at} /> : null}");
    expect(sidebar).toContain("const timer = setInterval(tick, 60_000);");
    expect(sidebar).toContain("if (!now) return null;");
  });
});
