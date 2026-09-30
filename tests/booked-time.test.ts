import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A booked meeting's time can be changed after booking, and only while it is still a booking.

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
const route = read("app/api/meetings/[id]/route.ts");
const moving = route.slice(route.indexOf("if (body?.scheduledAt !== undefined)"));

describe("moving a booked meeting", () => {
  it("is refused once there is a recording, because every line's time hangs off the start", () => {
    expect(moving).toContain("current.scheduledAt === null");
    expect(moving).toContain("current.endedAt !== null");
    expect(moving).toContain("current._count.transcripts > 0");
    // Being recorded right now: no lines and no end yet, but a hold on the card.
    expect(moving).toContain("kind: RECORDING_KIND, meetingId: id, status: \"running\"");
    expect(moving).toContain("409");
  });

  it("moves the start with it, which is where a booking keeps its diary time", () => {
    expect(moving).toContain("data.scheduledAt = at;");
    expect(moving).toContain("data.startedAt = at;");
  });

  it("is offered on the page only for a meeting that is still a booking", () => {
    const page = read("app/[id]/page.tsx");
    expect(page).toContain("{upcoming && meeting.scheduledAt ? (");
    expect(page).toContain("<BookedTime");
  });

  it("reads the device's time zone only when editing starts, not while rendering", () => {
    const editor = read("app/[id]/booked-time.tsx");
    const render = editor.slice(editor.indexOf("if (!editing)"));
    expect(render).not.toContain("toLocalInput(");
    expect(editor).toContain("setValue(toLocalInput(at));");
  });
});
