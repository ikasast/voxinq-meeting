import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { allKeys, keysIn, serverMessageKeys } from "../lib/i18n/keys";
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

  it("reads a sentence written with single quotes", () => {
    // Which is how a string containing a double quote has to be written, and this app has two:
    // the transcript placeholder quotes the button it names. They were invisible to the first
    // scanner, so they were neither reported as missing nor ever translated.
    expect(keysIn(`t('Press "Start recording" below.')`)).toEqual(['Press "Start recording" below.']);
  });

  it("does not mistake a slash-star inside a string for a comment", () => {
    // `accept="audio/*,video/*"` on the New meeting screen. A regex over slash-star to star-slash
    // treated that as a comment that never began and swallowed two and a half thousand characters
    // of real JSX, four `t()` calls among them — which the table then reported as rows for strings
    // nothing shows, one step from somebody deleting four good translations.
    const src = [`const a = "audio/*,video/*";`, `t("Title");`, `const b = "*/";`].join("\n");
    expect(keysIn(src)).toEqual(["Title"]);
  });

  it("does not mistake a quote inside a regex for a string", () => {
    // This module's own pattern contains one. Reading it as a string lost track of where the
    // scanner was, so the doc comment after it stopped being recognised as a comment and the
    // example inside it became two keys.
    const src = [String.raw`const re = /a'b/g;`, `/** t("one") */`, `t("Queue");`].join("\n");
    expect(keysIn(src)).toEqual(["Queue"]);
  });

  it("does not mistake a self-closing JSX tag for a regex", () => {
    // `<Elapsed … />` — the slash starts a regex literal by every other rule, and that regex
    // then runs to the next slash in the file, taking whatever is between them with it. Here
    // that was `t("waiting")`, one character later, which the table then reported as a row
    // nothing shows.
    const src = 'x ? <Elapsed since={j.at} /> : t("waiting")';
    expect(keysIn(src)).toEqual(["waiting"]);
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
    // Prose only. A proper noun that is the same in both — "Anthropic" — is a row somebody
    // wrote on purpose, and the failure this looks for is a sentence copied in as a placeholder
    // and never translated.
    const untouched = Object.entries(ja).filter(
      ([k, v]) => k === v && /[a-z]{4}/.test(k) && k.includes(" "),
    );
    expect(untouched.map(([k]) => k)).toEqual([]);
  });
});

describe("the screens somebody meets before they are signed in", () => {
  // The key scanner reads `t("…")` calls, so a screen that never calls `t` at all is not
  // reported as missing anything — it is simply invisible, and stays English while every screen
  // around it turns Japanese. That is exactly what happened to these: the i18n pass covered the
  // meeting screens and never reached the door.
  //
  // A translator import does not prove every string in a file goes through it. It proves the
  // file was wired up, which is the failure this is here for.

  const wired = [
    "app/page-header.tsx",
    "app/health-status.tsx",
    "app/confirm-dialog.tsx",
    "app/locked-banner.tsx",
    "app/login/page.tsx",
    "app/login/login-form.tsx",
    "app/setup/page.tsx",
    "app/setup/setup-form.tsx",
    "app/reset/[token]/reset-form.tsx",
    "app/recovery-code.tsx",
    "app/account/page.tsx",
    "app/account/account-form.tsx",
    "app/account/profile-form.tsx",
    "app/admin/page.tsx",
  ];

  it.each(wired)("%s asks for a translator", (file) => {
    const src = readFileSync(join(root, file), "utf8");
    expect(src).toMatch(/\buseT\(\)|\bserverT\(\)/);
  });

  it("keeps the recovery code screen's own heading out of the key", () => {
    // `context` is a sentence fragment the three callers each translate for themselves — the
    // screen interpolates it rather than owning three variants of a long paragraph.
    const screen = readFileSync(join(root, "app/recovery-code.tsx"), "utf8");
    expect(screen).toContain("{ context: context ?? t(\"This account\") }");
  });
});

describe("what the server says back", () => {
  // The routes write their errors as English sentences at the call site, and `apiError` is the
  // one place that translates them. A route answering with `NextResponse.json({ error })`
  // instead skips that, silently, in English, on a Japanese screen. Thirty of them did — the
  // translation was in the table the whole time and nobody would ever have seen it.

  const routeSources = (): [string, string][] => {
    const out: [string, string][] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (e.name.endsWith(".ts")) out.push([rel, readFileSync(join(root, rel), "utf8")]);
      }
    };
    walk("app/api");
    out.push(["proxy.ts", readFileSync(join(root, "proxy.ts"), "utf8")]);
    return out;
  };

  it("sends every message a person reads through a translating call", () => {
    const messages = serverMessageKeys(root);
    const stragglers: string[] = [];
    for (const [rel, src] of routeSources()) {
      for (const message of messages) {
        const literal = JSON.stringify(message);
        for (let at = src.indexOf(literal); at !== -1; at = src.indexOf(literal, at + 1)) {
          // Whichever call opened last is the one this literal is an argument to.
          const before = src.slice(0, at);
          const translating = Math.max(
            before.lastIndexOf("apiError("),
            before.lastIndexOf("translate("),
          );
          if (translating < before.lastIndexOf("NextResponse.json(")) {
            stragglers.push(`${rel}: ${message}`);
          }
        }
      }
    }
    expect(stragglers).toEqual([]);
  });

  it("has no message in the list that nothing sends any more", () => {
    // The same rot as an unused row in the table, one layer down: this list is what the table
    // is checked against, so a stale entry here keeps a stale translation alive there.
    const sources = routeSources().map(([, src]) => src);
    const orphans = serverMessageKeys(root).filter(
      (m) => !sources.some((src) => src.includes(JSON.stringify(m))),
    );
    expect(orphans).toEqual([]);
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

  it("is found when the condition runs over several lines", () => {
    // Which is what happens as soon as the two sentences are long: the formatter breaks the
    // condition onto its own line, and a scanner anchored to one line stops seeing either
    // form. They are then neither reported missing nor ever translated — the silent half of
    // this failure, and the one that had already happened on the series page.
    const src = [
      "t(",
      "  meetings.length === 1",
      '    ? "1 meeting in this series."',
      '    : "{n} meetings in this series.",',
      "  { n: meetings.length },",
      ")",
    ].join("\n");
    expect(keysIn(src)).toEqual(["1 meeting in this series.", "{n} meetings in this series."]);
  });

  it("does not let the condition run into the next call", () => {
    // The condition may span lines, but not parentheses — otherwise one unmatched `?` would
    // swallow whatever call came next and report its strings as a plural pair.
    expect(keysIn('t(cond(x) ? "a" : "b")')).toEqual([]);
  });

  it("still finds a plain call beside one", () => {
    expect(keysIn('t("Queue"); t(n === 1 ? "1 day" : "{n} days", { n })')).toEqual([
      "Queue",
      "1 day",
      "{n} days",
    ]);
  });
});
