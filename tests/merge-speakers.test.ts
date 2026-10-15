import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Two voices given one name are one person the separation heard as two. Making them one speaker
// needs only the lines, not the recording — and cannot be undone without separating again.

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

describe("making same-named speakers one", () => {
  const route = read("app/api/meetings/[id]/merge-speakers/route.ts");
  const list = read("app/[id]/transcript-list.tsx");

  it("moves the lines and drops the merged names, for this meeting only", () => {
    expect(route).toContain("where: { meetingId: id, speakerType: { in: from } }");
    expect(route).toContain("for (const k of from) delete names[k];");
    expect(route).toContain('apiError("meeting not found", 404)');
  });

  it("is offered only where one name is on two voices, and warned about first", () => {
    expect(list).toContain(".filter(([, keys]) => keys.length > 1)");
    const merge = list.slice(list.indexOf("const mergeSpeakers"));
    expect(merge.indexOf("await confirm(")).toBeLessThan(merge.indexOf("/merge-speakers"));
    expect(merge).toContain("danger: true");
  });
});
