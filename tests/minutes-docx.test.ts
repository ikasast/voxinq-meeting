import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { minutesDocx } from "../lib/minutes-docx";

/** A .docx is a zip of XML parts; read one back out to see what was written. */
async function documentXml(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const doc = zip.file("word/document.xml");
  expect(doc, "word/document.xml must exist").not.toBeNull();
  return doc!.async("text");
}

describe("minutesDocx", () => {
  it("produces a zip with the parts Word needs to open the file", async () => {
    const buf = await minutesDocx({ title: "定例会議", markdown: "## 決定事項\n\n- 承認" });
    const zip = await JSZip.loadAsync(buf);
    const names = Object.keys(zip.files);
    // Anything missing from this set and Word refuses the document outright.
    expect(names).toContain("[Content_Types].xml");
    expect(names).toContain("_rels/.rels");
    expect(names).toContain("word/document.xml");
    expect(names).toContain("word/_rels/document.xml.rels");
  });

  it("carries the title, the headings and the text", async () => {
    const xml = await documentXml(
      await minutesDocx({
        title: "定例会議",
        subtitle: "2026-08-17",
        markdown: "## 決定事項\n\n- 予算を承認\n\n本文。",
        footnote: "Exported from Voxinq Meeting",
      }),
    );
    for (const s of ["定例会議", "2026-08-17", "決定事項", "予算を承認", "本文。", "Exported"]) {
      expect(xml).toContain(s);
    }
  });

  it("marks bold runs as bold rather than printing the asterisks", async () => {
    const xml = await documentXml(await minutesDocx({ title: "t", markdown: "**重要**な決定" }));
    expect(xml).toContain("重要");
    expect(xml).toContain("<w:b");
    expect(xml).not.toContain("**");
  });

  it("emits numbering for a numbered list", async () => {
    const buf = await minutesDocx({ title: "t", markdown: "1. first\n2. second" });
    const zip = await JSZip.loadAsync(buf);
    // A numbered paragraph referencing a definition that does not exist opens as plain text.
    expect(Object.keys(zip.files)).toContain("word/numbering.xml");
    expect(await documentXml(buf)).toContain("<w:numPr>");
  });

  it("escapes characters that would otherwise break the XML", async () => {
    const xml = await documentXml(
      await minutesDocx({ title: "A & B <tag>", markdown: "5 < 6 & 7 > 6" }),
    );
    expect(xml).toContain("&amp;");
    expect(xml).not.toMatch(/<w:t[^>]*>[^<]*<tag>/);
  });

  it("handles minutes that are empty", async () => {
    const buf = await minutesDocx({ title: "no content", markdown: "" });
    expect(buf.length).toBeGreaterThan(0);
    expect(await documentXml(buf)).toContain("no content");
  });
});
