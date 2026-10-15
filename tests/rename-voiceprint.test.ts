import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Renaming a voiceprint renames the person everywhere they are named — the meetings' speakers,
// their participants, the series' members — after a count of how much that is.

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

describe("renaming a voice profile", () => {
  const route = read("app/api/speaker-profiles/route.ts");
  const lib = read("lib/rename-person.ts");

  it("counts first, and changes only when asked to", () => {
    expect(route).toContain("const apply = body?.dryRun !== true;");
    expect(route).toContain("renamePerson(from, to, apply)");
    expect(lib).toMatch(/if \(apply\) \{/);
  });

  it("refuses a name another voice profile already has", () => {
    expect(route).toContain('apiError("A voice profile with that name already exists.", 409)');
  });

  it("reaches the speakers, the participants and the series' members", () => {
    expect(lib).toContain("prisma.meeting.update");
    expect(lib).toContain("prisma.meetingParticipant.update");
    expect(lib).toContain("prisma.seriesMember.update");
  });

  it("does not leave the same person listed twice in one meeting", () => {
    expect(lib).toContain("findFirst({ where: { meetingId: p.meetingId, name: to } })");
    expect(lib).toContain("prisma.meetingParticipant.delete");
  });

  it("is confirmed with what it will change", () => {
    const ui = read("app/settings/voice-profiles.tsx");
    expect(ui.indexOf("await ask(true)")).toBeLessThan(ui.indexOf("await confirm("));
    expect(ui.indexOf("await confirm(")).toBeLessThan(ui.indexOf("await ask(false)"));
  });
});
