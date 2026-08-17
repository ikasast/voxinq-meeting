import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
  type ISectionOptions,
} from "docx";
import { parseMarkdownBlocks, type Block, type Inline } from "./markdown-blocks";

// Minutes as a Word document, for the meeting that has to be filed rather than read on screen.
//
// No font is embedded. Word picks one from the reader's machine, which is the same bargain the
// web app makes (docs/design-decisions.md — a bundled Japanese face costs 5.4 MB and every
// platform already ships a good one). It is also why PDF is produced by printing from the
// browser instead of rendered here: a server-side PDF *would* have to carry that font.

const HEADINGS = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
} as const;

function runs(spans: Inline[]): TextRun[] {
  return spans.map(
    (s) =>
      new TextRun({
        text: s.text,
        bold: s.bold,
        italics: s.italic,
        font: s.code ? "Consolas" : undefined,
      }),
  );
}

function toParagraph(block: Block): Paragraph {
  switch (block.kind) {
    case "heading":
      return new Paragraph({ heading: HEADINGS[block.level], children: runs(block.spans) });
    case "bullet":
      return new Paragraph({
        bullet: { level: Math.min(block.depth, 4) },
        children: runs(block.spans),
      });
    case "numbered":
      return new Paragraph({
        numbering: { reference: "minutes-numbered", level: Math.min(block.depth, 4) },
        children: runs(block.spans),
      });
    case "quote":
      return new Paragraph({
        indent: { left: 480 }, // twips — about 0.33 inch
        children: runs(block.spans).map((r) => r),
        style: "IntenseQuote",
      });
    case "rule":
      return new Paragraph({ border: { bottom: { style: "single", size: 6, color: "999999" } } });
    default:
      return new Paragraph({ children: runs(block.spans) });
  }
}

export type MinutesDocInput = {
  title: string;
  /** Rendered under the title — date range, series, that sort of thing. */
  subtitle?: string;
  /** The minutes themselves, as the LLM wrote them. */
  markdown: string;
  /** Shown in small print at the end, e.g. when and by what it was generated. */
  footnote?: string;
};

/** Build the .docx and return it as bytes, ready to serve. */
export async function minutesDocx(input: MinutesDocInput): Promise<Buffer> {
  const body: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: input.title })] }),
  ];

  if (input.subtitle) {
    body.push(
      new Paragraph({
        children: [new TextRun({ text: input.subtitle, color: "666666", size: 20 })],
        spacing: { after: 240 },
      }),
    );
  }

  for (const block of parseMarkdownBlocks(input.markdown)) body.push(toParagraph(block));

  if (input.footnote) {
    body.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { before: 480 },
        children: [new TextRun({ text: input.footnote, italics: true, color: "888888", size: 18 })],
      }),
    );
  }

  const section: ISectionOptions = { properties: {}, children: body };

  const doc = new Document({
    // Word needs a numbering definition to exist before a paragraph can reference it.
    numbering: {
      config: [
        {
          reference: "minutes-numbered",
          levels: [0, 1, 2, 3, 4].map((level) => ({
            level,
            format: "decimal" as const,
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [section],
  });

  return Packer.toBuffer(doc);
}
