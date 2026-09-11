import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXTERNAL_WRITES, allowedFromOutside } from "../lib/external-writes";
import { isAuthPath } from "../app/auth-paths";

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
    // A series' shared background and regular members — what its next meeting is set up from.
    expect(allowedFromOutside("PATCH", "/api/series/abc")).toBe(true);
    // Not /api/series: it answers GET only, and a series is created by naming it in the
    // meeting's PATCH. An entry for a method that does not exist reads as permission.
    expect(allowedFromOutside("POST", "/api/series")).toBe(false);
    expect(allowedFromOutside("DELETE", "/api/series/abc")).toBe(false);
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
    expect(allowedFromOutside("PATCH", "/api/series/abc/members")).toBe(false);
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

describe("the screen agrees with the list", () => {
  // The half that was missing for a release and a half. `EXTERNAL_WRITES` opened up the title,
  // the agenda and the participants on purpose — and the meeting page went on handing those
  // three components `readOnly={external}`, so from outside the API allowed the write and the
  // UI offered no way to make it. A booked meeting could be created from a laptop and then not
  // filled in, which is the whole reason for booking it from a laptop.
  //
  // Two lists, one file each, and nothing but this test holding them together.

  const page = readFileSync(join(root, "app/[id]/page.tsx"), "utf8");

  const editableFromOutside = ["MeetingTitle", "MeetingMeta", "ParticipantsCard"];
  const readOnlyFromOutside = ["SummarySection", "TranscriptList", "MeetingListPane"];

  /** The props passed to `<Name …>` on the meeting page. */
  function props(name: string): string {
    const at = page.indexOf(`<${name}`);
    expect(at, `${name} is not on the meeting page`).toBeGreaterThan(-1);
    return page.slice(at, page.indexOf("/>", at) + 2);
  }

  it.each(editableFromOutside)("%s is editable from outside", (name) => {
    // Its write is on the allow-list, so hiding the control is the app refusing something it
    // permits.
    expect(props(name)).not.toContain("readOnly={external}");
  });

  it.each(readOnlyFromOutside)("%s stays read-only from outside", (name) => {
    // Minutes and diarization run on the GPU; the transcript belongs to a recording made in
    // there. None of those writes are on the list, so offering them is a button that 403s.
    expect(props(name)).toContain("readOnly={external}");
  });

  it("does not offer to keep a recording from outside", () => {
    // `POST /api/recordings/…/protect` is not on the list either, and the button was rendered
    // regardless — it answered 403.
    const list = readFileSync(join(root, "app/[id]/transcript-list.tsx"), "utf8");
    const at = list.indexOf("toggleProtect()");
    expect(list.slice(Math.max(0, at - 400), at)).toContain("!readOnly");
    expect(allowedFromOutside("POST", "/api/recordings/abc/protect")).toBe(false);
  });
});

describe("the way to a new meeting, from outside", () => {
  // The other half that was missing. `/new` and `POST /api/meetings` were opened to outside,
  // and every link to `/new` stayed behind `!external` — the rail, the phone header, the home
  // screen and the calendar's "add a meeting on this day". Allowed, and unreachable except by
  // typing the address.
  const read = (p: string) => readFileSync(join(root, p), "utf8");

  it("is on the rail, before the internal-only block", () => {
    const rail = read("app/side-rail.tsx");
    const link = rail.indexOf('href="/new"');
    expect(link).toBeGreaterThan(-1);
    expect(link).toBeLessThan(rail.indexOf("{!external ? ("));
  });

  it("is in the phone header, which is the only way to it on a phone outside", () => {
    // The bottom bar is all recording and is not rendered for an external visitor.
    const layout = read("app/layout.tsx");
    const header = layout.slice(layout.indexOf("function HeaderNav"), layout.indexOf("</header>"));
    expect(header).toContain("<NewMeetingLink");
    expect(header).not.toContain("external ? null");
  });

  it("is not offered on the sign-in screens, where it would lead back to them", () => {
    // Who stands on the sign-in screen is exactly the external visitor this link now shows to.
    // The first walk-through with a real browser session found it there.
    const link = read("app/new-meeting-link.tsx");
    expect(link).toContain('href="/new"');
    expect(link).toContain("isAuthPath(pathname)");
    const rail = read("app/side-rail.tsx");
    const at = rail.indexOf('href="/new"');
    expect(rail.slice(Math.max(0, at - 200), at)).toContain("isAuthPath(pathname)");
    expect(isAuthPath("/login")).toBe(true);
    expect(isAuthPath("/setup")).toBe(true);
    expect(isAuthPath("/reset/abc")).toBe(true);
    expect(isAuthPath("/new")).toBe(false);
    expect(isAuthPath("/")).toBe(false);
  });

  it("is on the home screen, with only recording behind the condition", () => {
    const home = read("app/page.tsx");
    const link = home.indexOf('href="/new"');
    expect(link).toBeGreaterThan(-1);
    expect(link).toBeLessThan(home.indexOf("external ?"));
  });

  it("is on a day of the calendar", () => {
    const pane = read("app/meeting-list-pane.tsx");
    const at = pane.indexOf("/new?date=");
    expect(at).toBeGreaterThan(-1);
    expect(pane.slice(Math.max(0, at - 300), at)).not.toContain("!readOnly");
  });
});

describe("a series, from outside", () => {
  it("offers its defaults for editing, because the write is allowed", () => {
    const page = readFileSync(join(root, "app/series/[id]/page.tsx"), "utf8");
    const at = page.indexOf("<SeriesSettings");
    expect(at).toBeGreaterThan(-1);
    expect(page.slice(at, page.indexOf("/>", at))).not.toContain("readOnly={external}");
    expect(allowedFromOutside("PATCH", "/api/series/abc")).toBe(true);
  });
});
