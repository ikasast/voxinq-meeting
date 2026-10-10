// Text written now and read later — a job's note, written by the queue while nobody is looking
// and read on a page in whatever language that reader has chosen.
//
// A finished sentence cannot be translated: "Found 1 speaker(s) across 12 utterance(s)." is not
// a key. So what is stored is the key and its values, and the sentence is made when it is read.
// A plain sentence stored the old way, or by a service that knows nothing of this, is still read
// through the table, and shown as it is when the table has no row for it.
//
// Every key written this way is listed in `server-messages.ts`, which is how the table's test
// sees it.

type Vars = Record<string, string | number>;
const MARK = "i18n:";

/** The key and its values, for a reader to put into words. */
export function storedText(key: string, vars?: Vars): string {
  return MARK + JSON.stringify(vars ? { k: key, v: vars } : { k: key });
}

/** Several stored texts, read one after another. */
export function storedTexts(parts: (string | undefined)[]): string | undefined {
  const kept = parts.filter((p): p is string => Boolean(p));
  return kept.length === 0 ? undefined : kept.length === 1 ? kept[0] : MARK + JSON.stringify({ all: kept });
}

/** Put a stored text into the reader's words. */
export function readStored(t: (key: string, vars?: Vars) => string, s: string): string {
  if (s.startsWith(MARK)) {
    try {
      const d = JSON.parse(s.slice(MARK.length)) as { k?: string; v?: Vars; all?: string[] };
      if (Array.isArray(d.all)) return d.all.map((p) => readStored(t, p)).join(" ");
      if (typeof d.k === "string") return t(d.k, d.v);
    } catch {
      // Not ours after all: shown as it is, below.
    }
  }
  return t(s);
}
