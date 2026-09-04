import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Picking an enrolled name adds it. It used to fill the box and wait for Add to be pressed,
// which on a phone is one tap too many and reads as the tap not having registered.
//
// Two routes in, because the browser decides which one a person gets: a button per name, which
// works everywhere, and the autocomplete on the box, which reports a chosen suggestion as
// `insertReplacementText`. Where a browser does not report it, the name is simply left in the
// box and Add still works — so the fallback has to stay too.

const src = readFileSync(join(__dirname, "..", "app/[id]/participants-card.tsx"), "utf8");

describe("adding a participant", () => {
  it("offers the enrolled names as something to touch", () => {
    expect(src).toContain("const suggestions = knownNames.filter");
    // Only the ones not already here: a name in both places is a button that does nothing.
    expect(src).toContain("!people.some((p) => p.name === n)");
    expect(src).toMatch(/onClick=\{\(\) => add\(n\)\}/);
  });

  it("adds on choosing from the autocomplete, not on pressing Add afterwards", () => {
    expect(src).toContain('native.inputType === "insertReplacementText"');
    // Guarded by the known list: a paste is also a replacement, and pasting half a sentence
    // into the box must not put it in the meeting.
    expect(src).toContain("knownNames.includes(value)");
  });

  it("still takes a name that is not enrolled", () => {
    // The whole point of the free-text box: someone who has never been diarized here.
    expect(src).toMatch(/placeholder="Add a name"/);
    expect(src).toMatch(/if \(e\.key === "Enter"\)/);
  });
});
