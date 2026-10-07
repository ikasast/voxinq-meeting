import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Emptying the trash: on a timer, recordings first, through the address the server can reach.

const db = vi.hoisted(() => ({
  findMany: vi.fn(),
  deleteMany: vi.fn(),
}));
vi.mock("../lib/prisma", () => ({ prisma: { meeting: db } }));

import { TRASH_PURGE_DAYS, purgeExpiredTrash } from "../lib/trash";

const root = path.join(__dirname, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

describe("emptying the trash", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    process.env.STT_INTERNAL_URL = "http://stt.test:8000";
    vi.stubGlobal("fetch", fetchMock);
    db.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    db.deleteMany.mockImplementation(async (args: { where: { id: { in: string[] } } }) => ({
      count: args.where.id.in.length,
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    db.findMany.mockReset();
    db.deleteMany.mockReset();
    delete process.env.STT_INTERNAL_URL;
  });

  it("takes what has been there longer than the trash keeps things", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const now = new Date("2026-10-07T00:00:00Z");
    await purgeExpiredTrash(now);
    const where = db.findMany.mock.calls[0][0].where;
    expect(where.deletedAt.lt.getTime()).toBe(now.getTime() - TRASH_PURGE_DAYS * 86_400_000);
  });

  it("asks the STT service at its internal address", async () => {
    // The browser's address is the web container's own localhost in Docker, where nothing
    // listens; deleting for good used to leave the recording behind that way.
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    expect(await purgeExpiredTrash()).toBe(2);
    expect(fetchMock.mock.calls.map((c) => [c[0], c[1].method])).toEqual([
      ["http://stt.test:8000/recordings/a", "DELETE"],
      ["http://stt.test:8000/recordings/b", "DELETE"],
    ]);
  });

  it("deletes a meeting only once its recording is gone", async () => {
    // Deleting the row is what makes the recording unfindable.
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/b")) throw new Error("connection refused");
      return new Response("{}", { status: 200 });
    });
    expect(await purgeExpiredTrash()).toBe(1);
    expect(db.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["a"] } } });
  });

  it("leaves everything for the next pass when the STT service cannot be asked", async () => {
    fetchMock.mockRejectedValue(new Error("connection refused"));
    expect(await purgeExpiredTrash()).toBe(0);
    expect(db.deleteMany).not.toHaveBeenCalled();
  });
});

describe("where it runs", () => {
  it("starts with the server, beside the queue", () => {
    expect(read("instrumentation.ts")).toContain("startTrashSweep()");
  });

  it("is what the trash screen does too", () => {
    expect(read("app/api/trash/route.ts")).toContain("await purgeExpiredTrash()");
  });

  it("leaves no server route reaching the STT service by the browser's address", () => {
    const routes: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (name === "route.ts") routes.push(p);
      }
    };
    walk(path.join(root, "app/api"));
    // By import, not by mention: the health route's comment explains that the browser checks STT.
    const offenders = routes.filter((p) =>
      /import \{[^}]*\bsttHttpBase\b[^}]*\} from "@\/lib\/stt\/client"/.test(readFileSync(p, "utf8")),
    );
    expect(offenders.map((p) => path.relative(root, p))).toEqual([]);
  });
});
