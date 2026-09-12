import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { correctionGlossary, correctionTerms } from "../lib/correction-terms";

// What the transcript is checked against.
//
// The case this came from: a series named with an acronym came back from Whisper as a
// similar-sounding one, and the correction pass had nothing to catch it with — the glossary had
// no reason to contain a word the app had itself stored, three fields away, as the name of the
// series the meeting was in.
//
// The other half is that two callers used to compose this list separately: the route that runs
// the check, and the page that decides whether to offer the button. They could disagree, and
// the visible form of disagreeing is a button that is missing for a meeting the server would
// have checked. One function now, read by both.

const root = join(__dirname, "..");

describe("what a transcript is checked against", () => {
  it("includes the series name, which nobody types into a glossary", () => {
    const terms = correctionTerms({
      globalGlossary: "",
      series: { name: "Voxinq", sttGlossary: null, members: [] },
    });
    expect(terms).toEqual(["Voxinq"]);
  });

  it("includes the people who are always in the series", () => {
    // Whisper mishears a name it has never seen exactly as it mishears a project's.
    const terms = correctionTerms({
      globalGlossary: "",
      series: { name: "Voxinq", sttGlossary: null, members: ["佐藤 玲", "田中 悠"] },
    });
    expect(terms).toContain("佐藤 玲");
    expect(terms).toContain("田中 悠");
  });

  it("takes the glossaries in the order they override each other", () => {
    const terms = correctionTerms({
      globalGlossary: "Aurora, Acme",
      series: { name: "Voxinq", sttGlossary: "年間保守契約", members: [] },
    });
    expect(terms).toEqual(["Aurora", "Acme", "年間保守契約", "Voxinq"]);
  });

  it("says the same term once, however many places it came from", () => {
    // A series whose name is also in the global glossary is the ordinary case once somebody
    // has added it by hand, and a duplicated term wastes prompt on itself.
    const terms = correctionTerms({
      globalGlossary: "Voxinq, Aurora",
      series: { name: "voxinq", sttGlossary: "aurora", members: ["Voxinq"] },
    });
    expect(terms).toEqual(["Voxinq", "Aurora"]);
  });

  it("drops a single character", () => {
    // Nothing can be misheard *into* one character findably, and matching on one would rewrite
    // half the transcript.
    expect(correctionTerms({ globalGlossary: "A, AB", series: null })).toEqual(["AB"]);
  });

  it("is empty when there is nothing to check, which the tooltip reads", () => {
    expect(correctionTerms({ globalGlossary: "  ", series: null })).toEqual([]);
    expect(correctionGlossary({ globalGlossary: "", series: null })).toBe("");
  });

  it("leaves the series' prose out of it", () => {
    // The shared background is a paragraph. Handed to a term-matching prompt as if every noun
    // in it were a term, it produces corrections nobody asked for — so it is not in the list,
    // and the function has no way to be given it.
    const src = readFileSync(join(root, "lib/correction-terms.ts"), "utf8");
    expect(src).not.toMatch(/\bdescription\b\s*[?:]/);
  });
});

describe("the button is not hidden by the thing it configures", () => {
  // It used to render only when there was already something to check against. Measured on the
  // reporting instance: the machine glossary was `""` and no account had an override, so the
  // control did not exist and nothing on the screen said the feature did — "where is the
  // button?" was the only question available, and it took a database query to answer.
  //
  // A feature that hides itself exactly when somebody has not configured it cannot be found by
  // the people who need it.
  it("is offered whenever there is a transcript", () => {
    const list = readFileSync(join(root, "app/[id]/transcript-list.tsx"), "utf8");
    const at = list.indexOf("runSuggestions()");
    const gate = list.slice(Math.max(0, at - 300), at);
    expect(gate).toContain("transcripts.length > 0 ?");
    expect(gate).not.toContain("hasCorrectionTerms ?");
  });

  it("says what it wants instead", () => {
    // With no terms the tooltip names the two places to put them, and pressing it costs one
    // 400 and no GPU.
    const list = readFileSync(join(root, "app/[id]/transcript-list.tsx"), "utf8");
    expect(list).toContain("Needs some terms to look for.");
    expect(list).toContain("hasCorrectionTerms");
  });
});

describe("the button and the route agree", () => {
  // Two files, one question. If either stops asking `lib/correction-terms.ts`, they can drift
  // back apart and the symptom is a missing button rather than an error.
  it("both ask the same function", () => {
    const page = readFileSync(join(root, "app/[id]/page.tsx"), "utf8");
    const route = readFileSync(
      join(root, "app/api/meetings/[id]/suggest-corrections/route.ts"),
      "utf8",
    );
    expect(page).toContain("correctionTerms({");
    expect(route).toContain("correctionGlossary({");
    for (const src of [page, route]) {
      expect(src).toContain("@/lib/correction-terms");
      // Both have to pass the series through, or the series name is missing on one side.
      expect(src).toContain("members:");
    }
  });
});
