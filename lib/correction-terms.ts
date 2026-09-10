import { parseGlossaryTerms } from "./llm/correct";

/**
 * The proper nouns a transcript is checked against, from one place.
 *
 * There were two callers composing this list independently — the route that runs the check, and
 * the page that decides whether to offer it — so the button could be hidden for a meeting the
 * route would happily have checked, and offered for one it would refuse. Now they ask here.
 *
 * The list is the glossaries plus **the things the series already knows are proper nouns**: its
 * own name and the people who are always in it. That is not an extra field for somebody to
 * fill in — it is what a series is — and it is the case that started this: a series called
 * `VJSS` came back from Whisper as `VGSS`, and the glossary had no reason to contain a word the
 * app itself had stored three fields away.
 *
 * The series' shared background is deliberately **not** in here. It is prose, and a paragraph
 * handed to a term-matching prompt as if every noun in it were a term produces corrections
 * nobody asked for.
 */
export function correctionTerms(input: {
  globalGlossary: string;
  series?: { name: string; sttGlossary?: string | null; members?: string[] } | null;
}): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (term: string) => {
    const t = term.trim();
    // One character cannot be misheard into anything findable, and matching on it would
    // rewrite half the transcript.
    if (t.length < 2) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(t);
  };

  for (const t of parseGlossaryTerms(input.globalGlossary ?? "")) add(t);
  if (input.series) {
    for (const t of parseGlossaryTerms(input.series.sttGlossary ?? "")) add(t);
    add(input.series.name);
    for (const m of input.series.members ?? []) add(m);
  }
  return out;
}

/** The same list as the string the correction prompt takes. */
export function correctionGlossary(input: Parameters<typeof correctionTerms>[0]): string {
  return correctionTerms(input).join(", ");
}
