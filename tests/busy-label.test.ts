import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { busyLabel } from "../lib/queue/job-label";

// What the screens say is using the card. /api/busy reports every kind of job, under a field
// called `minutes` for history's sake, and every screen used to call whatever it reported
// "Generating minutes…" — a diarization included.

const echo = (k: string) => k;

describe("what is using the card", () => {
  it("is named by the kind of job", () => {
    expect(busyLabel(echo, "minutes")).toBe("Generating minutes…");
    expect(busyLabel(echo, "diarize")).toBe("Diarizing…");
    expect(busyLabel(echo, "transcribe")).toBe("Transcribing…");
    expect(busyLabel(echo, "recording")).toBe("Recording in progress…");
  });

  it("is something neutral when the kind is unknown or missing", () => {
    expect(busyLabel(echo, undefined)).toBe("A GPU task is running");
    expect(busyLabel(echo, "a-kind-from-a-newer-server")).toBe("A GPU task is running");
  });

  it("is never decided without looking at the kind", () => {
    const hook = readFileSync(join(__dirname, "..", "app/use-gpu-busy.ts"), "utf8");
    expect(hook).not.toContain('"Generating minutes…"');
    expect(hook).toContain("kind = minutes?.minutes?.kind ?? null");
  });
});
