import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { barWidths, daysUntil, fateOf, formatMB } from "@/lib/storage/usage";

// The storage page: what the reader's meetings take, and in what.

const read = (p: string) => readFileSync(path.join(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");
const MB = 1024 * 1024;

describe("sizes, always in MB so any two can be compared", () => {
  it("keeps the digits few at every size", () => {
    expect(formatMB(0)).toBe("0 MB");
    expect(formatMB(3 * 1024)).toBe("< 0.01 MB");
    expect(formatMB(0.21 * MB)).toBe("0.21 MB");
    expect(formatMB(3.84 * MB)).toBe("3.8 MB");
    expect(formatMB(814.4 * MB)).toBe("814 MB");
    expect(formatMB(1247 * MB)).toBe("1,247 MB");
  });
});

describe("what becomes of a recording", () => {
  const later = "2026-10-13T00:00:00+00:00";

  it("goes with the trash, protected or not", () => {
    expect(fateOf({ protected: true, expiresAt: null }, true)).toBe("trash");
  });

  it("stays when protected, and goes with the sweep when not", () => {
    expect(fateOf({ protected: true, expiresAt: null }, false)).toBe("protected");
    expect(fateOf({ protected: false, expiresAt: later }, false)).toBe("expiring");
  });

  it("stays when the sweep is turned off", () => {
    expect(fateOf({ protected: false, expiresAt: null }, false)).toBe("kept");
  });

  it("counts whole days, and never says within zero", () => {
    const now = new Date("2026-10-07T12:00:00Z");
    expect(daysUntil(new Date("2026-10-13T11:00:00Z"), now)).toBe(6);
    expect(daysUntil(new Date("2026-10-07T12:30:00Z"), now)).toBe(1);
    expect(daysUntil(new Date("2026-10-01T00:00:00Z"), now)).toBe(1);
  });
});

describe("the bar", () => {
  it("is in proportion and fills the width", () => {
    const w = barWidths([300, 100, 0, 600]);
    expect(w[0]).toBeCloseTo(30);
    expect(w[2]).toBe(0);
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(100);
  });

  it("keeps a part that is there visible", () => {
    const [big, small] = barWidths([800, 2]);
    expect(small).toBeGreaterThanOrEqual(0.79);
    expect(big + small).toBeCloseTo(100);
  });

  it("is empty with nothing stored", () => {
    expect(barWidths([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe("where the numbers come from", () => {
  const page = read("app/storage/page.tsx");
  const stt = read("stt-service/server.py");

  it("are the reader's own meetings, trash included", () => {
    expect(page).toContain('from "@/lib/prisma"');
    expect(page).not.toContain("prismaRaw");
    // No `where`: a meeting in the trash keeps its recording until it is purged.
    expect(page).toContain(
      "prisma.meeting.findMany({\n    select: { id: true, title: true, startedAt: true, deletedAt: true },\n  })",
    );
  });

  it("ask the STT service about those meetings only, never for a listing", () => {
    // An id is all it takes to fetch a recording from the STT service, so a listing of the
    // folder would be a listing of everybody's audio.
    expect(page).toContain("body: JSON.stringify({ ids })");
    expect(stt).toContain('@app.post("/recordings/sizes")');
    expect(stt).not.toContain('@app.get("/recordings/sizes")');
    expect(stt).not.toMatch(/@app\.get\("\/recordings"\)/);
  });

  it("show the audio and the text apart, each on its own scale", () => {
    // Together, a thousand to one, the bar only ever said "it is the audio".
    expect(page).toContain("title={t(\"Audio recordings\")}");
    expect(page).toContain("<Panel title={t(\"Text\")}");
  });

  it("put the trash's room back on the trash's own schedule", () => {
    expect(page).toContain('from "@/lib/trash"');
    expect(read("app/api/trash/route.ts")).toContain('from "@/lib/trash"');
  });

  it("are reached from the account menu and from Settings → Data", () => {
    expect(read("app/account-menu.tsx")).toContain('href="/storage"');
    const settings = read("app/settings/page.tsx");
    expect(settings.indexOf('href="/storage"')).toBeGreaterThan(settings.indexOf('{tab === "data"'));
  });
});
