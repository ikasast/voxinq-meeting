import { describe, expect, it } from "vitest";
import { readStored, storedText, storedTexts } from "../lib/i18n/stored";
import { translate } from "../lib/i18n";

// A job's note is written while nobody is looking and read later, in the reader's language.

const ja = (k: string, v?: Record<string, string | number>) => translate("ja", k, v);
const en = (k: string, v?: Record<string, string | number>) => translate("en", k, v);

describe("a stored text", () => {
  it("is put into words when it is read, in either language", () => {
    const s = storedText("Found {speakers} speaker(s) across {lines} utterance(s).", { speakers: 1, lines: 12 });
    expect(readStored(en, s)).toBe("Found 1 speaker(s) across 12 utterance(s).");
    expect(readStored(ja, s)).toBe("12 件の発言から 1 人の話者が見つかりました。");
  });

  it("reads several in a row", () => {
    const s = storedTexts([storedText("{n} had no label.", { n: 2 }), undefined, storedText("Recording finished.")]);
    expect(readStored(en, s!)).toBe("2 had no label. Recording finished.");
    expect(storedTexts([undefined])).toBeUndefined();
  });

  it("still reads a plain sentence, translated when the table has it", () => {
    expect(readStored(ja, "Recording finished.")).toBe("録音が終わりました。");
    expect(readStored(ja, "something the table never heard of")).toBe("something the table never heard of");
  });
});
