import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Two ways in, for two different people: a button per enrolled name, and a plain box for
// somebody who has never been diarized here.
//
// It used to be three, and the third fought the other two. The box also carried a `<datalist>`
// of the same enrolled names — so typing a name that was *not* on the list opened a dropdown
// offering names that were, on top of the buttons already showing them. It listed all of them,
// including people already in this meeting, which the buttons correctly leave out. And on a
// phone the popup outlived the field it belonged to and sat on the page.

const src = readFileSync(join(__dirname, "..", "app/[id]/participants-card.tsx"), "utf8");
// The file's own comment names what was removed, so the assertions below read the code.
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("adding a participant", () => {
  it("offers the enrolled names as something to touch", () => {
    expect(src).toContain("const suggestions = knownNames.filter");
    // Only the ones not already here: a name in both places is a button that does nothing.
    expect(src).toContain("!people.some((p) => p.name === n)");
    expect(src).toMatch(/onClick=\{\(\) => add\(n\)\}/);
  });

  it("leaves the box free of an autocomplete", () => {
    // The box is for the name the buttons do not have. A dropdown of the buttons' own contents
    // covering it is the opposite of what it is for.
    expect(code).not.toContain("<datalist");
    expect(code).not.toMatch(/\blist=\{/);
    // And with no autocomplete there is no chosen-suggestion event to handle.
    expect(code).not.toContain("insertReplacementText");
  });

  it("still takes a name that is not enrolled", () => {
    // The whole point of the free-text box: someone who has never been diarized here.
    expect(src).toMatch(/placeholder=\{t\("Add a name"\)\}/);
    expect(src).toMatch(/if \(e\.key === "Enter"\)/);
  });
});
