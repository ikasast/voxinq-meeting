import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_DISPLAY_SIZE, DISPLAY_SIZE_KEY, DISPLAY_SIZES, displaySizeFrom, viewportFor } from "@/app/display-size";
import { formatShortDateTimeIn } from "@/lib/i18n/format";

describe("the Android app's display size", () => {
  it("draws larger by laying the page out narrower", () => {
    expect(viewportFor(100, 412)).toBe("width=device-width, initial-scale=1");
    expect(viewportFor(115, 412)).toBe("width=358, initial-scale=1.15");
    expect(viewportFor(130, 412)).toBe("width=317, initial-scale=1.3");
    // A screen that says nothing about its width is left alone.
    expect(viewportFor(115, 0)).toBe("width=device-width, initial-scale=1");
  });

  it("takes only the sizes it offers, and starts at the larger one", () => {
    expect(DEFAULT_DISPLAY_SIZE).toBe(115);
    expect(displaySizeFrom(null)).toBe(115);
    expect(displaySizeFrom("130")).toBe(130);
    expect(displaySizeFrom("100")).toBe(100);
    expect(displaySizeFrom("150")).toBe(115);
    expect(displaySizeFrom("big")).toBe(115);
  });

  // The layout applies it before the first paint with a copy of the same rule.
  it("is applied before the first paint with the same sizes, key and default", () => {
    const layout = readFileSync(join(__dirname, "..", "app", "layout.tsx"), "utf8");
    expect(layout).toContain(`localStorage.getItem("${DISPLAY_SIZE_KEY}")`);
    expect(layout).toContain(`[${DISPLAY_SIZES.join(",")}].indexOf(s)<0)s=${DEFAULT_DISPLAY_SIZE}`);
  });
});

describe("a list's date on a phone", () => {
  const now = new Date(2026, 9, 17, 9, 0);
  it("is month, day and time this year", () => {
    expect(formatShortDateTimeIn("ja", new Date(2026, 9, 16, 14, 58), now)).toBe("10/16 14:58");
    expect(formatShortDateTimeIn("en", new Date(2026, 9, 16, 14, 58), now)).toBe("Oct 16, 14:58");
  });
  it("is the date alone in another year", () => {
    expect(formatShortDateTimeIn("ja", new Date(2025, 11, 3, 9, 5), now)).toBe("2025/12/3");
    expect(formatShortDateTimeIn("en", new Date(2025, 11, 3, 9, 5), now)).toBe("Dec 3, 2025");
  });
});
