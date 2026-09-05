import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { signupIsOpen, signupMode } from "../lib/auth/signup";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("whether new accounts can be made", () => {
  beforeEach(() => {
    delete process.env.VOXINQ_SIGNUP;
  });

  it("is open unless it is told otherwise", () => {
    // Every release before the switch existed behaved this way, and an upgrade must not stop a
    // household's phones from working.
    expect(signupIsOpen()).toBe(true);
    process.env.VOXINQ_SIGNUP = "open";
    expect(signupIsOpen()).toBe(true);
  });

  it("closes on the words somebody would actually write", () => {
    for (const v of ["closed", "off", "false", "CLOSED", " Off "]) {
      process.env.VOXINQ_SIGNUP = v;
      expect(signupMode()).toBe("closed");
    }
  });

  it("treats a typo as open rather than locking everybody out", () => {
    // Failing closed is right for a permission check and wrong for this one: an unreadable value
    // here would shut a household out of its own recordings over a spelling mistake.
    for (const v of ["clsoed", "yes", "1", ""]) {
      process.env.VOXINQ_SIGNUP = v;
      expect(signupMode()).toBe("open");
    }
  });
});

describe("the queue shows who, and not what", () => {
  const queue = read("lib/queue/queue.ts");
  const list = read("app/queue/queue-list.tsx");
  const api = read("app/api/jobs/route.ts");

  it("redacts on the server, not in the component", () => {
    // A title that reaches the browser and is merely not rendered is a title that has been
    // sent. The listing decides, before anything is serialised.
    expect(queue).toContain("meetingId: mine ? j.meetingId : null");
    expect(queue).toContain("title: mine ? (j.meeting?.title ?? null) : null");
  });

  it("redacts the polling endpoint the same way", () => {
    // The screen refreshes every three seconds through this, so a gap here would undo the page.
    expect(api).toContain("openJobsAcrossUsers");
    expect(api).not.toContain("openJobs()");
  });

  it("lists everybody, on purpose", () => {
    // Scoped to the viewer, the screen would show an empty list beside a job that never starts,
    // which is exactly the question it exists to answer.
    expect(queue).toContain("asSystem(");
    expect(queue).toMatch(/asSystem\("the queue screen/);
  });

  it("offers actions on your own rows, and on everybody's only to an administrator", () => {
    // One GPU: somebody has to be able to clear it. Being able to stop a job is not being able
    // to see what it was — the redaction above is what holds that line, and it does not care
    // who is looking.
    expect(list).toContain("{!running && !isRecording && (job.mine || isAdmin) ? (");
    expect(list).toContain("{!isRecording && (job.mine || isAdmin) ? (");
  });

  it("numbers only the rows the reader can actually move", () => {
    // A position among rows you cannot reorder is a number in a list you are not in. For an
    // administrator that list is everybody's, because that is the order they are changing.
    expect(list).toContain('j.status === "queued" && (j.mine || isAdmin)');
  });
});

describe("pictures", () => {
  const route = read("app/api/users/[username]/avatar/route.ts");
  const profile = read("app/api/auth/profile/route.ts");
  const form = read("app/account/profile-form.tsx");
  const page = read("app/account/page.tsx");

  it("are served only to somebody signed in", () => {
    expect(route).toContain("if (!me) return new NextResponse(\"unauthorized\", { status: 401 });");
  });

  it("are resized before they are sent", () => {
    // A phone camera produces megabytes, none of which survives being drawn at 26 pixels.
    expect(form).toContain("cropToSquare");
    expect(form).toContain("const SIZE = 256;");
  });

  it("are checked again on arrival", () => {
    // An edited client is not a client to be trusted about sizes or types.
    expect(profile).toContain("TYPES.has(file.type)");
    expect(profile).toContain("file.size > MAX_BYTES");
  });

  it("are not carried inside a page that only needs to know one exists", () => {
    // Selecting the bytes to compute a boolean would put the picture in the HTML.
    expect(page).toContain("imageType: true");
    expect(page).not.toMatch(/select: \{[^}]*\bimage: true/);
  });
});

describe("signed out", () => {
  const src = read("lib/prisma.ts");

  it("reads nothing, by a condition that cannot match", () => {
    // The first version used a sentinel user id that had to never collide with a real one. It
    // was written with a NUL byte in it, which Postgres rejects outright — the file even
    // registered as binary. An empty `in` has nothing to get right.
    expect(src).toContain("{ id: { in: [] } }");
    expect(src).not.toContain("NOBODY");
  });

  it("writes nothing at all", () => {
    expect(src).toContain("Cannot write anything while signed out.");
  });
});
