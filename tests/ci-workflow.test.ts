import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// CI was split into parallel jobs to make it faster. What must not happen along the way is a
// check quietly going missing, or a failing one no longer blocking a merge.

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
const ci = read(".github/workflows/ci.yml");

/** The text of one job, from its name to the next job at the same indent. */
function job(name: string): string {
  const start = ci.indexOf(`\n  ${name}:\n`);
  expect(start, `job ${name}`).toBeGreaterThan(-1);
  const rest = ci.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z-]+:\n/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

describe("the web app's checks", () => {
  it("still runs every one of them", () => {
    expect(job("lint")).toContain("npm run lint");
    expect(job("typecheck")).toContain("npm run typecheck");
    expect(job("build")).toContain("npm run build");
    const test = job("test");
    expect(test).toContain("npm test");
    expect(test).toContain("npx prisma migrate deploy");
    // Without this the queue's database tests are skipped, and the count looks the same.
    expect(test).toContain('VOXINQ_QUEUE_DB_TESTS: "1"');
  });

  it("generates the route types before checking types, since the build no longer comes first", () => {
    const t = job("typecheck");
    expect(t.indexOf("npx next typegen")).toBeGreaterThan(-1);
    expect(t.indexOf("npx next typegen")).toBeLessThan(t.indexOf("npm run typecheck"));
  });

  it("waits for the database over TCP before migrating", () => {
    const t = job("test");
    expect(t).toContain("pg_isready -h 127.0.0.1");
    expect(t.indexOf("pg_isready")).toBeLessThan(t.indexOf("npx prisma migrate deploy"));
  });
});

describe("the check the branch ruleset requires", () => {
  const web = job("web");

  it("waits for all four jobs", () => {
    expect(web).toContain("needs: [lint, typecheck, build, test]");
  });

  it("runs even when one of them failed, and fails with it", () => {
    // A job skipped because something it needs failed reports success to a required check.
    expect(web).toContain("if: always()");
    expect(web).toContain('[ "$r" = success ] || exit 1');
  });
});

describe("dependencies restored from the cache", () => {
  const setup = read(".github/actions/node-setup/action.yml");

  it("are keyed on the Prisma schema too, because the generated client lives in node_modules", () => {
    expect(setup).toContain("hashFiles('package-lock.json', 'prisma/schema.prisma')");
  });

  it("always include a generated client, whichever job saved them", () => {
    // The install hook needs DATABASE_URL and only warns without it; lint and typecheck have none.
    expect(setup).toContain("npx prisma generate");
    expect(setup).toContain("DATABASE_URL: ${{ env.DATABASE_URL || 'postgresql://ci:ci@localhost:5432/ci' }}");
  });
});
