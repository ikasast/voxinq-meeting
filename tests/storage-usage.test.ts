import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { barWidths, formatBytes } from "@/lib/storage/usage";

// The storage page: what the reader's meetings take, and in what.

const read = (p: string) => readFileSync(path.join(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");

describe("sizes, as the file manager would say them", () => {
  it("picks the unit and keeps the digits few", () => {
    expect(formatBytes(0)).toBe("0 MB");
    expect(formatBytes(300)).toBe("1 KB");
    expect(formatBytes(36 * 1024)).toBe("36 KB");
    expect(formatBytes(4.2 * 1024 * 1024)).toBe("4.2 MB");
    expect(formatBytes(814 * 1024 * 1024)).toBe("814 MB");
    expect(formatBytes(1.34 * 1024 ** 3)).toBe("1.3 GB");
    expect(formatBytes(240 * 1024 ** 3)).toBe("240 GB");
  });
});

describe("the bar", () => {
  it("is in proportion and fills the width", () => {
    const w = barWidths([300, 100, 0, 600]);
    expect(w[0]).toBeCloseTo(30);
    expect(w[2]).toBe(0);
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(100);
  });

  it("keeps a part that is there visible beside hours of audio", () => {
    // 800 MB of audio and 2 MB of transcript: 0.25% would be a hairline nobody sees.
    const [audio, text] = barWidths([800, 2]);
    expect(text).toBeGreaterThanOrEqual(0.79);
    expect(audio + text).toBeCloseTo(100);
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
      "prisma.meeting.findMany({\n    select: { id: true, title: true, startedAt: true, deletedAt: true, archivedAt: true },\n  })",
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

  it("are reached from the account menu and from Settings → Data", () => {
    expect(read("app/account-menu.tsx")).toContain('href="/storage"');
    const settings = read("app/settings/page.tsx");
    expect(settings.indexOf('href="/storage"')).toBeGreaterThan(settings.indexOf('{tab === "data"'));
  });
});
