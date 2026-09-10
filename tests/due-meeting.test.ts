import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// "Your meeting is starting."
//
// A meeting booked from the calendar had a time and nothing that used it: the row moved to
// Upcoming and then sat there while the meeting happened in the room.
//
// Four ways a meeting is *not* worth interrupting for, and each one is a `where` clause rather
// than a flag — nothing is written down when somebody is told, so nothing can disagree with
// what actually happened.

const root = join(__dirname, "..");
const route = readFileSync(join(root, "app/api/meetings/due/route.ts"), "utf8");
const alert = readFileSync(join(root, "app/due-meeting-alert.tsx"), "utf8");
const sw = readFileSync(join(root, "public/sw.js"), "utf8");

describe("which meetings are worth interrupting for", () => {
  it("only ones whose time has passed", () => {
    expect(route).toContain("scheduledAt: { lte: new Date(now)");
  });

  it("not ones that are hours late", () => {
    // Otherwise opening the app after a fortnight away announces every meeting anybody booked
    // and did not record, which is a list of regrets rather than a reminder.
    expect(route).toContain("STALE_AFTER_MS");
    expect(route).toContain("gte: new Date(now - STALE_AFTER_MS)");
  });

  it("not ones already being recorded, or over", () => {
    // Acting on the reminder is what clears it: a meeting stops being due the moment it has a
    // transcript. That is why there is no "notified" column to get out of step.
    expect(route).toContain("transcripts: { none: {} }");
    expect(route).toContain("endedAt: null");
    expect(route).toContain("deletedAt: null");
    expect(route).not.toMatch(/notifiedAt|seenAt|dismissedAt/);
  });

  it("is cheap enough to poll from every page", () => {
    expect(route).toContain("take: 5");
    // No joins, and only what the banner draws.
    expect(route).toMatch(/select: \{ id: true, title: true, scheduledAt: true \}/);
  });
});

describe("what the reminder offers", () => {
  it("does not offer to record from outside the private network", () => {
    // Recording needs the transcription service, which an external browser cannot reach. From
    // out there the reminder is a reminder and nothing more.
    const at = alert.indexOf('t("Start recording")');
    expect(at).toBeGreaterThan(-1);
    expect(alert.slice(Math.max(0, at - 400), at)).toContain("!external ?");
  });

  it("points the notification at whichever page that browser can use", () => {
    expect(alert).toContain('external ? `/${m.id}` : `/${m.id}/recording`');
  });

  it("asks for notification permission on a tap, never on load", () => {
    // A prompt nobody asked for is how a browser decides to stop asking on this site's behalf
    // for good. So the banner comes first and carries the offer.
    const ask = alert.slice(alert.indexOf("const ask ="));
    expect(ask).toContain("Notification.requestPermission()");
    const effects = alert.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[[^\]]*\]\);/g) ?? [];
    for (const e of effects) expect(e).not.toContain("requestPermission");
  });

  it("does not re-notify the same meeting on every poll", () => {
    // The poller runs every thirty seconds and the meeting stays due until it is recorded.
    expect(alert).toContain("notified.current.has(m.id)");
  });

  it("remembers a dismissal per device, and does not grow forever", () => {
    // Per device like the theme: seeing it on a phone should not silence the laptop in the
    // room. Capped, because an unbounded localStorage key is a leak nobody goes looking for.
    expect(alert).toContain("voxinq.dueDismissed");
    expect(alert).toContain("ids.slice(-50)");
  });
});

describe("clicking the notification", () => {
  it("lands on what it is about, in a window that is already open", () => {
    expect(sw).toContain('addEventListener("notificationclick"');
    expect(sw).toContain("clients.matchAll");
    expect(sw).toContain("client.focus()");
    expect(sw).toContain("clients.openWindow");
  });

  it("takes the URL from the notification rather than rebuilding it", () => {
    // The page knows whether this browser can record; the worker must not have to know it
    // twice, or the two answers can differ.
    expect(sw).toContain("event.notification.data?.url");
    expect(sw).not.toContain("/recording");
  });
});
