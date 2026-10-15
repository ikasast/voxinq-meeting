// The lead section of a minutes document: everything from the first "#" or "##" heading up to
// the next one (typically the overview), as plain text — the row shows two lines of it, and
// "###" or "- " at the start of them is markup, not content. The built-in format's big parts
// were "##" and are "#" now; minutes written before keep theirs.
export function plainLead(minutes: string, maxChars = 300): string {
  const text = minutes.trim();
  const m = text.match(/^#{1,2}\s[^\n]*\n([\s\S]*?)(?=\n#{1,2}\s|$)/m);
  const lead = (m ? m[1] : text)
    .split("\n")
    .map((l) => l.replace(/^\s*(#{1,6}\s+|[-*+]\s+|\d+\.\s+)/, "").replace(/\*\*/g, "").trim())
    .filter(Boolean)
    .join(" ");
  return lead.length > maxChars ? `${lead.slice(0, maxChars)}…` : lead;
}
