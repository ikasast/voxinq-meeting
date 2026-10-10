import { describe, expect, it } from "vitest";
import { diffText } from "@/lib/text-diff";

const show = (before: string, after: string) =>
  diffText(before, after)
    .map((p) => (p.kind === "same" ? p.text : p.kind === "del" ? `[-${p.text}]` : `{+${p.text}}`))
    .join("");

describe("diffText", () => {
  it("marks one replaced term in the middle of a line", () => {
    expect(show("次のネクサスのリリースは来週", "次のNexusのリリースは来週")).toBe("次の[-ネクサス]{+Nexus}のリリースは来週");
  });

  it("marks an insertion on its own", () => {
    expect(show("ステージンで確かめる", "ステージングで確かめる")).toBe("ステージン{+グ}で確かめる");
  });

  it("marks every place a term was replaced", () => {
    expect(show("ネクサスとネクサスの間", "NexusとNexusの間")).toBe("[-ネクサス]{+Nexus}と[-ネクサス]{+Nexus}の間");
  });

  it("puts what goes before what comes in", () => {
    expect(show("会議を延期する", "会議を中止する")).toBe("会議を[-延期]{+中止}する");
  });

  it("gives back both texts whole", () => {
    for (const [a, b] of [
      ["abc", "abc"],
      ["", "x"],
      ["x", ""],
      ["名前を変える", "名前を変更する"],
    ]) {
      const parts = diffText(a, b);
      expect(parts.filter((p) => p.kind !== "ins").map((p) => p.text).join("")).toBe(a);
      expect(parts.filter((p) => p.kind !== "del").map((p) => p.text).join("")).toBe(b);
    }
  });

  it("stays right on a line too long to compare closely", () => {
    const a = "あ".repeat(800) + "い" + "う".repeat(800);
    const b = "あ".repeat(800) + "え" + "う".repeat(800);
    expect(show(a, b)).toBe("あ".repeat(800) + "[-い]{+え}" + "う".repeat(800));
    const c = Array.from({ length: 900 }, (_, i) => String.fromCharCode(0x3041 + (i % 80))).join("");
    const d = Array.from({ length: 900 }, (_, i) => String.fromCharCode(0x30a1 + (i % 80))).join("");
    const parts = diffText(c, d);
    expect(parts.filter((p) => p.kind !== "ins").map((p) => p.text).join("")).toBe(c);
    expect(parts.filter((p) => p.kind !== "del").map((p) => p.text).join("")).toBe(d);
  });
});
