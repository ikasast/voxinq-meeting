import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Questions asked about meetings are kept to be read again (lib/ask-history.ts), encrypted like
// the minutes and visible to their owner only. Read as source, like the other tests of the
// scoped client's rules.

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

describe("the questions asked about meetings", () => {
  it("are owned, and kept encrypted", () => {
    const client = read("lib/prisma.ts");
    expect(client).toContain('askTurn: { field: "body", purpose: "ask" }');
    expect(client).toMatch(/const OWNED = new Set\(\[[^\]]*"askTurn"/);
  });

  it("are kept as the answer goes back, on the meeting or the series", () => {
    const route = read("app/api/ask/route.ts");
    expect(route).toContain("const where = meetingId ? { meetingId } : { seriesId };");
    expect(route).toContain("await keep(await run((text) => send({ text })))");
    const history = read("lib/ask-history.ts");
    // From inside a stream the request may be gone: the owner is given, not looked up.
    expect(history).toContain("turn.ownerId ? await asUser(turn.ownerId, write) : await write()");
  });

  it("open the panel on its history, by day, and can be cleared", () => {
    const ui = read("app/ask-minutes.tsx");
    expect(ui).toContain("fetch(`/api/ask/history?${place}`");
    expect(ui).toContain('method: "DELETE"');
    expect(ui).toContain("dayLabel(locale, turn.at)");
    const migration = read("prisma/migrations/20261023090000_ask_turns/migration.sql");
    expect(migration).toContain('CREATE TABLE "ask_turns"');
    expect(migration).toContain('REFERENCES "meetings"("id") ON DELETE CASCADE');
  });
});
