import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { jobLabel } from "@/lib/queue/job-label";
import { translate } from "@/lib/i18n";

// Account, Storage and Trash in the v4 layout: a plain page (data-paper), rows between rules,
// no cards.

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

describe("the v4 pages", () => {
  it.each(["app/account/page.tsx", "app/storage/page.tsx", "app/trash/trash-list.tsx"])("%s is a plain page", (p) => {
    const src = read(p);
    expect(src).toContain("data-paper");
    expect(src).not.toMatch(/className="card\b/);
  });

  it("lay the account out in rows like Settings", () => {
    expect(read("app/account/profile-form.tsx")).toContain("<FieldRow");
    expect(read("app/account/account-form.tsx")).toContain("<FieldRow");
    expect(read("app/settings/page.tsx")).toContain("const Field = FieldRow;");
  });
});

describe("the queue's history", () => {
  it("names an emotion job in the reader's language", () => {
    expect(jobLabel((k) => translate("ja", k), "emotion")).toBe("感情推定");
  });
});
