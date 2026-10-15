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
        info: [{ label: "When", value: "2026-08-17" }],
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

  it("looks like a blank Word document: theme fonts and Word's own styles, no font named", async () => {
    const buf = await minutesDocx({ title: "定例会議", markdown: "# 議題\n\n本文", locale: "ja" });
    const zip = await JSZip.loadAsync(buf);
    const styles = await zip.file("word/styles.xml")!.async("text");
    // Fonts through the theme (+Body / +Headings), so Design → Fonts restyles the whole file.
    expect(styles).toMatch(/<w:docDefaults>[\s\S]*w:eastAsiaTheme="minorEastAsia"/);
    expect(styles).not.toContain("游ゴシック");
    // A Japanese Word's: 10.5 pt text, headings in the headings font, none of the library's blue.
    expect(styles).toContain('<w:sz w:val="21"/>');
    expect(styles).toMatch(/w:styleId="Heading1"[\s\S]*?majorEastAsia/);
    expect(styles).not.toContain("2E74B5");
    expect(styles.match(/w:styleId="Heading1"/g)).toHaveLength(1);
    // And the theme those names point at, where Word looks for it.
    expect(Object.keys(zip.files)).toContain("word/theme/theme1.xml");
    expect(await zip.file("word/_rels/document.xml.rels")!.async("text")).toContain("theme/theme1.xml");
    expect(await zip.file("[Content_Types].xml")!.async("text")).toContain("/word/theme/theme1.xml");
  });

  it("follows an English Word's defaults for an English reader", async () => {
    const buf = await minutesDocx({ title: "Weekly", markdown: "# Agenda", locale: "en" });
    const styles = await (await JSZip.loadAsync(buf)).file("word/styles.xml")!.async("text");
    expect(styles).toContain('<w:sz w:val="22"/>');
    expect(styles).toMatch(/w:styleId="Heading1"[\s\S]*?2F5496/);
  });

  it("puts the meeting's details under the title", async () => {
    const xml = await documentXml(
      await minutesDocx({
        title: "定例会議",
        markdown: "本文",
        info: [
          { label: "日時", value: "2026年10月15日 10:00" },
          { label: "参加者", value: "佐藤、田中" },
        ],
      }),
    );
    expect(xml.indexOf("参加者")).toBeGreaterThan(xml.indexOf("定例会議"));
    expect(xml.indexOf("佐藤、田中")).toBeLessThan(xml.indexOf("本文"));
  });

  it("handles minutes that are empty", async () => {
    const buf = await minutesDocx({ title: "no content", markdown: "" });
    expect(buf.length).toBeGreaterThan(0);
    expect(await documentXml(buf)).toContain("no content");
  });
});
