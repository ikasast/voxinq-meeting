import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXTERNAL_WRITES, allowedFromOutside } from "../lib/external-writes";

// What a browser outside the private network may change.
//
// It used to be nothing at all, which is easy to reason about and wrong for one case: setting
// a meeting up needs no GPU, no audio and no transcription service. So there is a list now,
// and a list is the thing that rots — an endpoint added later, a pattern loosened by one
// character. These check the real object rather than a description of it.

const root = join(__dirname, "..");

describe("writes allowed from outside", () => {
  it("is short enough to read in one glance", () => {
    expect(EXTERNAL_WRITES.length).toBeGreaterThan(0);
    // Not a limit for its own sake: this is the whole of what an external browser can change.
    expect(EXTERNAL_WRITES.length).toBeLessThanOrEqual(6);
  });

  it("covers exactly the setting-up calls", () => {
    expect(allowedFromOutside("POST", "/api/meetings")).toBe(true);
    expect(allowedFromOutside("PATCH", "/api/meetings/abc")).toBe(true);
    expect(allowedFromOutside("PUT", "/api/meetings/abc/participants")).toBe(true);
    // Not /api/series: it answers GET only, and a series is created by naming it in the
    // meeting's PATCH. An entry for a method that does not exist reads as permission.
    expect(allowedFromOutside("POST", "/api/series")).toBe(false);
    // A meeting can be created and edited from out there, never removed.
    expect(allowedFromOutside("DELETE", "/api/meetings/abc")).toBe(false);
  });

  it("touches nothing that runs on the GPU or cannot be undone", () => {
    const forbidden = [
      "/api/meetings/abc/transcribe",
      "/api/meetings/abc/apply-transcript",
      "/api/meetings/abc/apply-speakers",
      "/api/meetings/abc/diarization-embeddings",
      "/api/meetings/abc/end",
      "/api/meetings/abc/reopen",
      "/api/meetings/abc/replace",
      "/api/meetings/abc/restore",
      "/api/meetings/abc/save-voice-profiles",
      "/api/meetings/abc/suggest-corrections",
      "/api/meetings/bulk",
      "/api/claude/summary",
      "/api/ask",
      "/api/settings",
      "/api/backup/import",
      "/api/trash",
      "/api/speaker-profiles",
      "/api/transcripts/abc",
      "/api/funnel",
    ];
    for (const path of forbidden) {
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        expect(allowedFromOutside(method, path), `${method} ${path} is allowed`).toBe(false);
      }
    }
  });

  it("does not let a meeting id smuggle a path segment past the pattern", () => {
    // `[^/]+` rather than `.+`, so a crafted id cannot walk into a sub-route.
    expect(allowedFromOutside("PATCH", "/api/meetings/abc/end")).toBe(false);
    // `bulk` sits where an id sits and archives or trashes a list of meetings. It answers only
    // POST today, so this was not reachable — the pattern was wrong, not the app.
    expect(allowedFromOutside("PATCH", "/api/meetings/bulk")).toBe(false);
    expect(allowedFromOutside("PUT", "/api/meetings/abc/participants/x")).toBe(false);
  });
});

describe("the recording screens", () => {
  it("stay closed from outside, and /new no longer does", () => {
    const proxy = readFileSync(join(root, "proxy.ts"), "utf8");
    const from = proxy.indexOf("const WRITER_PAGES");
    const block = proxy.slice(from, proxy.indexOf("];", from));
    expect(block).toContain("quick-record");
    expect(block).toContain("recording");
    expect(block, "/new is where a meeting is set up, which is allowed now").not.toContain(
      "\\/new$",
    );
  });
});

describe("editing a meeting from outside", () => {
  const route = readFileSync(join(root, "app/api/meetings/[id]/route.ts"), "utf8");

  it("refuses the fields that are not part of setting one up", () => {
    // The allow-list opens the route; the route decides what the route may do. Archiving takes
    // a meeting off the list and speaker names belong to a transcript made in here — neither
    // is setup, and both would otherwise ride in on the same PATCH.
    expect(route).toContain("isExternalRequest");
    expect(route).toMatch(/\["archived", "speakerLabels"\]/);
    expect(route).toContain("403");
  });
});

describe("the new-meeting screen", () => {
  const form = readFileSync(join(root, "app/new/new-meeting-form.tsx"), "utf8");

  it("is told where the request came from, by the server", () => {
    const page = readFileSync(join(root, "app/new/page.tsx"), "utf8");
    expect(page).toContain("isExternalRequest");
    expect(page).toMatch(/external=\{external\}/);
  });

  it("never walks an external visitor to the recording screen", () => {
    // The STT service is unreachable from out there; landing on the recording page would be a
    // dead end with a microphone button on it.
    expect(form).toContain("if (external) {");
    expect(form).toMatch(/router\.push\(`\/\$\{meeting\.id\}`\)/);
  });
});
