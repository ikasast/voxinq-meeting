import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A booked meeting's page follows its recording once it starts. The page used to take "booked"
// from the server's drawing alone, so recording a booked meeting from its own page showed no
// lines until the page was opened again.

const list = readFileSync(join(__dirname, "..", "app/[id]/transcript-list.tsx"), "utf8");

describe("a booked meeting's page", () => {
  it("stops waiting once this tab records it, or a line arrives from elsewhere", () => {
    expect(list).toContain("const booked = upcoming && !begun;");
    expect(list).toContain("{booked ? <RecordingStartWatch meetingId={meetingId} onStart={markBegun} /> : null}");
    expect(list).toContain("if (!stopped && data && (data.transcripts.length > 0 || data.endedAt)) setBegun(true);");
  });

  it("polls and shows what is heard while it is not booked any more", () => {
    expect(list).toContain("if (endedAt || booked) return;");
    expect(list).toContain("const live = !endedAt && !booked;");
  });

  it("does not give up on a meeting recorded a day after it was booked for", () => {
    expect(list).toContain("if (!begun && Date.now() - lastSign.current > 86400_000) return;");
  });

  it("draws the page and the sidebar again at the first line, to leave Upcoming", () => {
    expect(list).toContain("if (drawnBooked.current && data.transcripts.length > 0) {");
  });
});
