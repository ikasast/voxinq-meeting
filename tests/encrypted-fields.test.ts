import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// What is encrypted is one map in lib/prisma.ts, and what was there before an account had a key is
// encrypted by one job (lib/queue/runners/encrypt.ts). A field added to the first and not the
// second is encrypted for new rows and left in the clear for every old one, with nothing to say so.

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

describe("translations", () => {
  it("are encrypted like the lines they translate", () => {
    expect(read("lib/prisma.ts")).toMatch(/transcript: \[[\s\S]*?\{ field: "translation", purpose: "translation" \}/);
  });

  it("left in the clear before 4.9 are found and encrypted at the next sign-in", () => {
    const job = read("lib/queue/runners/encrypt.ts");
    expect(job).toContain('encryptField(r.translation!, master, "translation")');
    expect(job).toMatch(/needsEncryptionPass[\s\S]*PLAIN_TRANSLATION\(ownerId\)/);
  });
});
