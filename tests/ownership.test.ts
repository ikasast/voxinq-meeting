import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Ownership is enforced under every query rather than at each call site, so what these tests
// hold is the shape of that arrangement: the places allowed to step around it, and the
// properties that were arrived at by watching the obvious version leak.

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(root, dir))) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const rel = `${dir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) sourceFiles(rel, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(rel);
  }
  return out;
}

describe("the unscoped client", () => {
  // Two things genuinely need it: working out who you are (a query, which cannot be scoped by
  // who you are without asking itself), and adopting rows that belong to nobody (which the
  // scoped client refuses to show by definition). Everything else goes through the rules.
  const ALLOWED = new Set([
    "lib/prisma.ts",
    "lib/prisma-raw.ts",
    "lib/db/owner.ts",
    "lib/auth/adopt.ts",
    "lib/queue/dispatcher.ts",
  ]);

  it("is imported only where it has to be", () => {
    const users = [...sourceFiles("app"), ...sourceFiles("lib")].filter((f) =>
      /from "[^"]*prisma-raw"|prismaRaw/.test(read(f)),
    );
    const unexpected = users.filter((f) => !ALLOWED.has(relative(root, join(root, f)).replace(/\\/g, "/")));
    // If this fails, the question is not "add it to the list" — it is what that file is doing
    // that the ownership rules were in the way of.
    expect(unexpected).toEqual([]);
  });
});

describe("the scoped client", () => {
  const src = read("lib/prisma.ts");

  it("refuses a model nobody has classified", () => {
    // The default has to be a refusal. A new table of meeting content that silently skipped the
    // rules is exactly the failure this file exists to prevent, and a loud error in development
    // is the cheapest possible way to find out. It has already fired once for real, on
    // speakerProfile.
    expect(src).toContain("has no ownership rule");
  });

  it("re-issues a lookup by id as a filtered one", () => {
    // `findUnique` takes only a unique field, so narrowing it with ownerId is a validation
    // error rather than a filter: the request 500s instead of 404s. Seen in a browser before it
    // was fixed.
    expect(src).toContain("BY_UNIQUE");
    expect(src).toContain("table.findFirst(narrow(a, condition))");
  });

  it("says not-found rather than not-yours", () => {
    // Which is both kinder and less informative: whether a meeting exists is not something to
    // tell somebody who cannot see it.
    expect(src).toContain("P2025");
  });

  it("narrows rather than replaces an existing where", () => {
    expect(src).toContain("args.where ? { AND: [args.where, condition] } : condition");
  });

  it("stamps the owner on creation, and refuses to create for nobody", () => {
    expect(src).toContain("stampOwner");
    expect(src).toContain("Cannot write anything while signed out.");
  });
});

describe("whether this instance has accounts", () => {
  const src = read("lib/db/owner.ts");

  it("caches yes for ever and no never", () => {
    // The version with a ten-second cache on both answers leaked: the second person's very
    // first request read a stale "no", ran unscoped, and listed the first person's meetings.
    // Server components and route handlers are bundled separately, so clearing the cache where
    // the account is created cannot reach the copy the pages use.
    expect(src).toContain("if (hasAccounts) return true;");
    expect(src).not.toContain("RECHECK_MS");
  });

  it("refuses a query that is outside a request and has not said what it is", () => {
    // Work on a timer must not inherit whoever happened to ask last.
    expect(src).toContain("A database query ran with no owner and outside a request");
  });
});

describe("work that runs outside a request", () => {
  const dispatcher = read("lib/queue/dispatcher.ts");

  it("says why it is allowed to see everything", () => {
    // The scheduler arbitrates one GPU across every account and cannot do that seeing a third
    // of the queue. Saying so in the call is what makes the exception greppable.
    expect(dispatcher).toContain("asSystem(");
    expect(dispatcher).toMatch(/asSystem\("the queue scheduler/);
  });

  it("runs each job as whoever owns it", () => {
    // Not as the system: a job's reads and writes should be scoped exactly like the person
    // whose meeting it is doing them by hand.
    expect(dispatcher).toContain("asUser(owner, () => run(job))");
  });
});

describe("counts nested inside a relation", () => {
  it("name the owner themselves, because nothing else will", () => {
    // The extension rewrites a top-level `where`. A `where` inside a `_count` is not reached,
    // so a tag's count would include other people's meetings — a number that is wrong, and that
    // says those meetings exist.
    expect(read("app/meeting-list-pane.tsx")).toContain("archivedAt: null, ...mine");
    expect(read("app/api/series/[id]/route.ts")).toContain("deletedAt: null, ...(await onlyMine())");
  });
});
