import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ownerStamp } from "../lib/db/owner-stamp";

// What the audit of everything since v3.0.0 found, pinned where each was fixed. The audit ran two
// accounts against a throwaway instance; these are the file-level halves of what it saw.

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("a series is one person's", () => {
  const schema = read("prisma/schema.prisma");
  const at = schema.indexOf("model Series {");
  const series = schema.slice(at, schema.indexOf("\n}", at));

  it("is unique by owner and name, not by name", () => {
    expect(series).toContain("@@unique([ownerId, name])");
    expect(series).not.toMatch(/name\s+String\s+@unique/);
  });

  it("keeps one series per name where nobody owns any, and splits the shared ones", () => {
    const sql = read("prisma/migrations/20260913090000_series_per_person/migration.sql");
    // Without accounts no series has an owner; NULLS NOT DISTINCT keeps the old rule there.
    expect(sql).toContain("NULLS NOT DISTINCT");
    // A series two people had was split, not merged and not dropped.
    expect(sql).toContain('INSERT INTO "series"');
    expect(sql).toContain('UPDATE "meetings"');
  });

  it("is owned in the scoping layer, like a meeting", () => {
    expect(read("lib/prisma.ts")).toMatch(/const OWNED = new Set\(\[[^\]]*"series"/);
  });

  it("is found or made through the scoped client, never by name across the instance", () => {
    // A nested connectOrCreate by name is out of the scoping layer's reach, which is how one
    // person's 定例 became another's.
    expect(read("app/api/meetings/route.ts")).not.toContain("create: { name: seriesName }");
    expect(read("app/api/meetings/[id]/route.ts")).not.toContain(
      "{ connectOrCreate: { where: { name }, create: { name } } }",
    );
    for (const f of ["app/api/meetings/route.ts", "app/api/meetings/[id]/route.ts"]) {
      expect(read(f), f).toContain("seriesIdForName(");
    }
    expect(read("lib/series.ts")).toContain("prisma.series.findFirst({ where: { name }");
  });

  it("is adopted by the first account along with the meetings", () => {
    expect(read("lib/auth/adopt.ts")).toContain("prismaRaw.series.updateMany");
  });
});

describe("stamping the owner on a create", () => {
  it("uses a bare ownerId when the rest of the create is scalars", () => {
    expect(ownerStamp("meeting", { title: "x", seriesId: "s1" }, "u1")).toEqual({
      title: "x",
      seriesId: "s1",
      ownerId: "u1",
    });
  });

  it("connects the owner when the create writes a relation that holds its own key", () => {
    // "Unknown argument ownerId" — every meeting created with a series, whenever accounts were on.
    expect(ownerStamp("meeting", { title: "x", series: { connect: { id: "s1" } } }, "u1")).toEqual({
      title: "x",
      series: { connect: { id: "s1" } },
      owner: { connect: { id: "u1" } },
    });
  });

  it("is not moved by relations that hold no key here, like tags or transcripts", () => {
    const out = ownerStamp(
      "meeting",
      { tags: { connect: [{ name: "t" }] }, transcripts: { create: [] } },
      "u1",
    );
    expect(out).toHaveProperty("ownerId", "u1");
    expect(out).not.toHaveProperty("owner");
  });
});

describe("the first sign-in of an account somebody else made", () => {
  it("makes its key there and shows the recovery code", () => {
    const route = read("app/api/auth/login/route.ts");
    expect(route).toContain("setUpKey(user.id, password)");
    expect(route).toContain("recoveryCode");
    expect(read("app/login/login-form.tsx")).toContain("<RecoveryCode");
  });
});

describe("edits reach the encrypted search index", () => {
  it.each([
    "app/api/transcripts/[id]/route.ts",
    "app/api/meetings/[id]/replace/route.ts",
    "app/api/summaries/[id]/route.ts",
  ])("%s reindexes after it writes", (f) => {
    expect(read(f)).toContain("reindexAfterWrite(");
  });

  it("including when a line is deleted", () => {
    const r = read("app/api/transcripts/[id]/route.ts");
    expect(r.slice(r.indexOf("export async function DELETE"))).toContain(
      "reindexAfterWrite(target.meetingId)",
    );
  });
});

describe("somebody else's meeting", () => {
  it("is a 404 for its participants too", () => {
    const r = read("app/api/meetings/[id]/participants/route.ts");
    const get = r.slice(r.indexOf("export async function GET"), r.indexOf("export async function PUT"));
    expect(get).toContain('apiError("not found", 404)');
  });
});

describe("a series' regular members", () => {
  it("are offered from a meeting's candidates, plus who has attended the series", () => {
    const page = read("app/series/[id]/page.tsx");
    expect(page).toContain("prisma.speakerProfile.findMany");
    expect(page).toContain("prisma.meetingParticipant.findMany");
    expect(page).toContain("knownNames={knownNames}");
    expect(read("app/series/[id]/series-settings.tsx")).toContain("Add {name} to this series");
  });
});
