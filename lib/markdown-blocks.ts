// A small Markdown reader for turning minutes into a Word document.
//
// Deliberately not a general Markdown parser. The input is minutes written by an LLM against a
// format this app defines, so it is headings, paragraphs, bullets, numbered lists and the odd
// bold run — and being narrow means the failure mode is "some markup shows through as text"
// rather than a parser that mangles a document nobody can re-generate.
//
// Anything unrecognised stays as a paragraph with its characters intact.

export type Inline = { text: string; bold?: boolean; italic?: boolean; code?: boolean };

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3 | 4; spans: Inline[] }
  | { kind: "paragraph"; spans: Inline[] }
  | { kind: "bullet"; depth: number; spans: Inline[] }
  | { kind: "numbered"; depth: number; spans: Inline[] }
  | { kind: "quote"; spans: Inline[] }
  | { kind: "rule" };

/**
 * Split one line into styled runs.
 *
 * Handled: `**bold**`, `*italic*`/`_italic_`, `` `code` ``. Markers that never close are left
 * as literal text — a stray asterisk in someone's sentence should survive as an asterisk.
 */
export function parseInline(line: string): Inline[] {
  const spans: Inline[] = [];
  let text = "";
  let i = 0;

  const flush = () => {
    if (text) spans.push({ text });
    text = "";
  };

  while (i < line.length) {
    const rest = line.slice(i);

    const bold = /^\*\*([^*]+)\*\*/.exec(rest);
    if (bold) {
      flush();
      spans.push({ text: bold[1], bold: true });
      i += bold[0].length;
      continue;
    }

    const code = /^`([^`]+)`/.exec(rest);
    if (code) {
      flush();
      spans.push({ text: code[1], code: true });
      i += code[0].length;
      continue;
    }

    const italic = /^([*_])([^*_]+)\1/.exec(rest);
    if (italic) {
      flush();
      spans.push({ text: italic[2], italic: true });
      i += italic[0].length;
      continue;
    }

    text += line[i];
    i += 1;
  }

  flush();
  return spans.length > 0 ? spans : [{ text: "" }];
}

const INDENT_PER_LEVEL = 2; // spaces; Markdown convention, and what the LLM emits

/** Read minutes into blocks. Blank lines separate; fenced code is kept verbatim. */
export function parseMarkdownBlocks(md: string): Block[] {
  const blocks: Block[] = [];
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  let paragraph: string[] = [];
  let inFence = false;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: "paragraph", spans: parseInline(paragraph.join(" ")) });
    paragraph = [];
  };

  for (const raw of lines) {
    // Inside a fence every line is literal, including things that look like headings.
    if (/^\s*```/.test(raw)) {
      flushParagraph();
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      blocks.push({ kind: "paragraph", spans: [{ text: raw, code: true }] });
      continue;
    }

    const line = raw.trimEnd();
    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      flushParagraph();
      blocks.push({ kind: "rule" });
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      blocks.push({
        kind: "heading",
        level: heading[1].length as 1 | 2 | 3 | 4,
        spans: parseInline(heading[2].trim()),
      });
      continue;
    }

    const bullet = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      blocks.push({
        kind: "bullet",
        depth: Math.floor(bullet[1].length / INDENT_PER_LEVEL),
        spans: parseInline(bullet[2]),
      });
      continue;
    }

    const numbered = /^(\s*)\d+[.)]\s+(.*)$/.exec(line);
    if (numbered) {
      flushParagraph();
      blocks.push({
        kind: "numbered",
        depth: Math.floor(numbered[1].length / INDENT_PER_LEVEL),
        spans: parseInline(numbered[2]),
      });
      continue;
    }

    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      flushParagraph();
      blocks.push({ kind: "quote", spans: parseInline(quote[1]) });
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  return blocks;
}

/** Flatten spans back to plain text — for alt text, previews and tests. */
export function blockText(block: Block): string {
  return "spans" in block ? block.spans.map((s) => s.text).join("") : "";
}
