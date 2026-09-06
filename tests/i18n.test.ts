import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { allKeys, keysIn } from "../lib/i18n/keys";
import { preferredFromHeader, resolveLocale, translate } from "../lib/i18n";
import { ja } from "../lib/i18n/ja";

const root = join(__dirname, "..");

// The key is the English sentence, which keeps the components readable and makes the table an
// English-to-Japanese list anybody can check. What it costs is that editing the English breaks
// the mapping silently — so this is where that stops being silent.

describe("every string the app shows has a Japanese one", () => {
  it("no key is missing from the table", () => {
    const missing = allKeys(root).filter((k) => !(k in ja));
    // If this fails, the fix is a row in lib/i18n/ja.ts. A missing row does not crash: it shows
    // the English, which is legible — it is just not what the person asked for.
    expect(missing).toEqual([]);
  });

  it("no row in the table is for a string nothing shows any more", () => {
    // The other direction, which rots quietly: a sentence gets rewritten, its old translation
    // stays, and the table slowly fills with answers to questions nobody asks.
    const used = new Set(allKeys(root));
    expect(Object.keys(ja).filter((k) => !used.has(k))).toEqual([]);
  });
});

describe("finding the strings", () => {
  it("does not mistake other functions ending in t", () => {
    // `get("…")`, `set("…")`, `format("…")`. The first version of this decided
    // "Content-Disposition" and "autostart" were prose.
    expect(keysIn('t("Meetings"); get("Content-Disposition"); format("autostart")')).toEqual([
      "Meetings",
    ]);
  });

  it("does not mistake an example in a comment for a call", () => {
    // This module's own documentation says `t("Start recording")`, and a scanner that cannot
    // tell the two apart puts phantom rows in the table.
    expect(keysIn('// like t("Start recording")\nt("Queue")')).toEqual(["Queue"]);
    expect(keysIn('/** t("Log out") */ t("People")')).toEqual(["People"]);
  });
});

describe("which language to show", () => {
  it("follows the setting when there is one", () => {
    expect(resolveLocale("ja", "en-GB")).toBe("ja");
    expect(resolveLocale("en", "ja")).toBe("en");
  });

  it("follows the browser when the setting says auto", () => {
    // Which is the only signal for a read-only visitor: no account, so no setting.
    expect(resolveLocale("auto", "ja-JP,ja;q=0.9,en;q=0.8")).toBe("ja");
    expect(resolveLocale("auto", "en-US,en;q=0.9")).toBe("en");
    expect(resolveLocale(undefined, "ja")).toBe("ja");
  });

  it("reads the header by weight, not by order", () => {
    expect(preferredFromHeader("en;q=0.2,ja;q=0.9")).toBe("ja");
  });

  it("falls back to English for a language this app does not have", () => {
    expect(preferredFromHeader("fr-FR,fr;q=0.9")).toBe("en");
    expect(preferredFromHeader("")).toBe("en");
    expect(preferredFromHeader(null)).toBe("en");
  });
});

describe("the strings themselves", () => {
  it("returns the English when there is no translation", () => {
    // An English sentence among Japanese ones is legible. A raw key is not.
    expect(translate("ja", "Something nobody has translated")).toBe(
      "Something nobody has translated",
    );
  });

  it("fills in the values", () => {
    expect(translate("en", "{n} utterances", { n: 3 })).toBe("3 utterances");
    expect(translate("ja", "{n} utterances", { n: 3 })).toBe("発言 3件");
  });

  it("fills them in for a key with no translation too", () => {
    // Which is what keeps a half-translated screen legible rather than littered with braces.
    expect(translate("ja", "{n} of these are not translated", { n: 2 })).toBe(
      "2 of these are not translated",
    );
  });

  it("leaves a placeholder alone when nothing was passed for it", () => {
    // Better a visible `{n}` than the word silently disappearing.
    expect(translate("en", "{n} of {total}", { n: 1 })).toBe("1 of {total}");
  });

  it("has no Japanese row that is still the English", () => {
    // A row copied in as a placeholder and never translated looks done from the outside.
    const untouched = Object.entries(ja).filter(([k, v]) => k === v && /[a-z]{4}/.test(k));
    expect(untouched.map(([k]) => k)).toEqual([]);
  });
});

describe("the plural shape", () => {
  it("is found by the scanner", () => {
    // English agrees and Japanese does not, so the choice is made at the call site and both
    // forms are keys. A scanner that only understood a literal first argument reported both as
    // missing while they sat in the table — which reads as a broken translation when nothing is.
    expect(keysIn('t(n === 1 ? "1 utterance" : "{n} utterances", { n })')).toEqual([
      "1 utterance",
      "{n} utterances",
    ]);
  });

  it("still finds a plain call beside one", () => {
    expect(keysIn('t("Queue"); t(n === 1 ? "1 day" : "{n} days", { n })')).toEqual([
      "Queue",
      "1 day",
      "{n} days",
    ]);
  });
});
