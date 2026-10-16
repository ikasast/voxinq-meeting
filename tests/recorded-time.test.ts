import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A recording made away from the server keeps its own time: ending a meeting may say when the
// recording started (an offline recording) or when its file was last written (an import).

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

describe("ending a meeting with a known time", () => {
  const route = read("app/api/meetings/[id]/end/route.ts");

  it("takes a start or an end, and the recording's length for the other", () => {
    expect(route).toContain("knownTime(asked?.startedAt)");
    expect(route).toContain("knownTime(asked?.endedAt)");
    expect(route).toContain("new Date(knownStart.getTime() + recordedMs)");
    expect(route).toContain("new Date(knownEnd.getTime() - recordedMs)");
  });

  it("refuses a time in the future or before 2000", () => {
    expect(route).toContain("t > Date.now() + 5 * 60_000");
    expect(route).toContain("t < Date.UTC(2000, 0, 1)");
  });

  it("is told the file's time when a file is dropped in", () => {
    expect(read("app/transcribe-file.ts")).toContain("endedAt: new Date(file.lastModified).toISOString()");
  });
});
