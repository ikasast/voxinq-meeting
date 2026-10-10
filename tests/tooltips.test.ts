import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { placeTip } from "../app/tooltips";

// Explanations on hover were the browser's own `title` tooltips, drawn below and to the right of
// the pointer, where the arrow covers their first words. They are shown above the element now.

const view = { width: 1000, height: 800 };
const size = { width: 120, height: 24 };

describe("where a tip goes", () => {
  it("above the element, centred on it", () => {
    const at = placeTip({ top: 200, left: 400, width: 40, height: 30 }, size, view);
    expect(at.above).toBe(true);
    expect(at.top).toBe(200 - 6 - 24);
    expect(at.left).toBe(400 + 20 - 60);
  });

  it("under it when there is no room above", () => {
    const at = placeTip({ top: 10, left: 400, width: 40, height: 30 }, size, view);
    expect(at.above).toBe(false);
    expect(at.top).toBe(10 + 30 + 6);
  });

  it("inside the window at either edge", () => {
    expect(placeTip({ top: 200, left: 0, width: 20, height: 20 }, size, view).left).toBe(8);
    expect(placeTip({ top: 200, left: 990, width: 10, height: 20 }, size, view).left).toBe(1000 - 8 - 120);
  });
});

describe("the tips", () => {
  const root = join(__dirname, "..");
  const src = readFileSync(join(root, "app/tooltips.tsx"), "utf8");

  it("are on every page", () => {
    expect(readFileSync(join(root, "app/layout.tsx"), "utf8")).toContain("<Tooltips />");
  });

  it("take the title as soon as it is pointed at, so the browser's own never shows", () => {
    expect(src).toContain('el.removeAttribute("title")');
    expect(src).toMatch(/adopt\(el\); \/\/ at once/);
  });

  it("keep what the title told a screen reader", () => {
    expect(src).toContain('el.setAttribute("aria-label", title)');
    expect(src).toContain('el.setAttribute("aria-description", title)');
  });
});
