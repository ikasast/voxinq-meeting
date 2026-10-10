import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Settings save themselves (v4): there is no Save button to forget, and a reply that comes back
// after another change does not put back what was just typed.

const page = readFileSync(join(__dirname, "..", "app/settings/page.tsx"), "utf8");

describe("the settings page", () => {
  it("saves a moment after a change, with no Save button", () => {
    expect(page).toContain("setTimeout(() => void saveRef.current(edits), SAVE_AFTER_MS)");
    expect(page).not.toContain('type="submit"');
    expect(page).not.toContain("<form");
  });

  it("ignores a reply when something changed while it was on its way", () => {
    expect(page).toContain("if (latest.current !== version) return;");
  });

  it("does not lock the fields while saving", () => {
    expect(page).not.toMatch(/disabled=\{saving/);
  });

  it("switches the language in place rather than asking for a reload", () => {
    expect(page).toContain("router.refresh();");
  });

  it("keeps the categories on a surface of their own", () => {
    expect(page).toMatch(/<nav[\s\S]{0,200}bg-\[var\(--panel\)\]/);
  });
});
