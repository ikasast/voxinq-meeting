import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("what an administrator can do to an account", () => {
  const list = read("app/api/admin/users/route.ts");
  const one = read("app/api/admin/users/[id]/route.ts");
  const guard = read("lib/auth/admin.ts");

  it("cannot delete one", () => {
    // An account holds meetings. Deleting it would either destroy them or hand them to somebody
    // who was never in the room, and both are worse than an account that simply cannot sign in.
    expect(one).not.toMatch(/prisma\.user\.delete/);
    expect(one).toContain("There is no delete.");
  });

  it("cannot leave the server with no administrator", () => {
    // There is no password to recover with and no console to fix it from: an instance in that
    // state is one whose accounts, settings and queue nobody can touch again.
    expect(guard).toContain("export async function isLastAdmin");
    expect(one.match(/isLastAdmin\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("cannot lock itself out of the room it is standing in", () => {
    expect(one).toContain("You cannot disable your own account.");
  });

  it("signs a disabled account out rather than waiting for the cookie to lapse", () => {
    // Otherwise "disabled" would mean "cannot sign in again", and somebody already signed in
    // would stay so for a month.
    expect(one).toContain("prisma.session.deleteMany({ where: { userId: id } })");
  });

  it("lists how much of the machine each person uses, and nothing about what", () => {
    expect(list).toContain("_count: { select: { meetings: true, sessions: true } }");
    // The hash never leaves; only whether there is one.
    expect(list).toContain("hasPassword: u.passwordHash !== null");
    expect(list).not.toMatch(/passwordHash: u\.passwordHash,/);
  });
});

describe("the one-time link", () => {
  const reset = read("lib/auth/reset.ts");
  const issue = read("app/api/admin/users/[id]/reset/route.ts");
  const spend = read("app/api/auth/reset/route.ts");

  it("is fifteen minutes", () => {
    expect(reset).toContain("RESET_TTL_MS = 15 * 60 * 1000");
  });

  it("stores a hash, not the link", () => {
    // A copy of the database is then not a set of working links.
    expect(reset).toContain('createHash("sha256")');
    // Both the write and the lookup. Checking only that `hash(token)` appears somewhere passes
    // even when the row is written with the raw token, because the lookup still hashes.
    expect(reset.match(/tokenHash: hash\(token\)/g)?.length ?? 0).toBe(2);
    expect(reset).not.toMatch(/tokenHash: token/);
  });

  it("is spent once, and cannot be spent twice by two browsers at the same moment", () => {
    // The update is conditional on the row still being unused, so the second changes no rows.
    expect(reset).toContain("where: { id: check.id, usedAt: null }");
    expect(reset).toContain("count === 1");
  });

  it("says the same thing about a wrong link as about an expired one", () => {
    // Telling somebody their guessed token exists but has expired tells them it exists.
    expect(reset).toContain("That link has expired or has already been used.");
  });

  it("replaces any earlier link for the same person", () => {
    expect(reset).toContain("deleteMany({ where: { userId, usedAt: null } })");
  });

  it("is never shown twice, and the administrator never sets the password", () => {
    expect(issue).toContain("issueReset(target.id, guard.me.id)");
    expect(issue).not.toContain("hashPassword");
  });

  it("ends every other session when it is used", () => {
    // If the reason for the reset was that somebody else had the account, leaving their browser
    // signed in would make the whole exercise pointless.
    expect(spend).toContain("prisma.session.deleteMany({ where: { userId: spent.userId } })");
  });

  it("is reachable while signed out", () => {
    // Somebody who could sign in would not be holding one.
    expect(read("proxy.ts")).toContain('pathname.startsWith("/reset/")');
  });
});

describe("an administrator and the shared queue", () => {
  const cancel = read("app/api/jobs/[id]/cancel/route.ts");
  const reorder = read("app/api/jobs/reorder/route.ts");
  const list = read("app/queue/queue-list.tsx");

  it("can stop and reorder anybody's row", () => {
    // It is one GPU. Somebody has to be able to clear it.
    expect(cancel).toContain("me?.isAdmin");
    expect(reorder).toContain("me?.isAdmin");
  });

  it("still sees no meeting on it", () => {
    // Running the machine is not the same as reading what is on it — verified in a browser too:
    // an administrator stopping another person's job still gets 404 on that meeting.
    expect(read("lib/queue/queue.ts")).toContain("title: mine ? (j.meeting?.title ?? null) : null");
  });

  it("is offered the controls the rest of us are not", () => {
    expect(list).toContain("(job.mine || isAdmin)");
  });
});
