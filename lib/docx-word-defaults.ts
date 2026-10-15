import JSZip from "jszip";
import type { Locale } from "@/lib/i18n";

// What a blank document made in Word looks like, for the minutes' .docx.
//
// A .docx carries its own styles: Word does not restyle an opened file after the reader's own
// template. So "follow the PC's defaults" can only mean this — the styles a new Word document is
// given, and fonts named through the document's theme (+Body / +Headings) rather than by name.
// Then the minutes look like any other document on that machine, and changing Design → Fonts or
// the style set restyles all of it at once, as it would in a document typed there.
//
// The docx library writes styles of its own (blue headings, a size scale) and no theme; Word,
// given no theme and no font, falls back to MS Mincho for Japanese. So the file is finished here:
// its defaults and heading styles replaced with Word's, and the Office theme added.
//
// Word's defaults differ by language: a Japanese Word sets 10.5 pt body text, justified, with
// headings in the headings font at modest sizes; an English Word sets 11 pt with blue headings.
// The file follows the language the person reads the app in.

const MAJOR = '<w:rFonts w:asciiTheme="majorHAnsi" w:eastAsiaTheme="majorEastAsia" w:hAnsiTheme="majorHAnsi" w:cstheme="majorBidi"/>';
const MINOR = '<w:rFonts w:asciiTheme="minorHAnsi" w:eastAsiaTheme="minorEastAsia" w:hAnsiTheme="minorHAnsi" w:cstheme="minorBidi"/>';

const para = (id: string, name: string, pPr: string, rPr: string, extra = "") =>
  `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>${extra}<w:qFormat/>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${rPr ? `<w:rPr>${rPr}</w:rPr>` : ""}</w:style>`;

const STYLES: Record<Locale, { defaults: string; styles: string[] }> = {
  ja: {
    defaults: `<w:docDefaults><w:rPrDefault><w:rPr>${MINOR}<w:kern w:val="2"/><w:sz w:val="21"/><w:szCs w:val="22"/><w:lang w:val="en-US" w:eastAsia="ja-JP" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault/></w:docDefaults>`,
    styles: [
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:widowControl w:val="0"/><w:jc w:val="both"/></w:pPr></w:style>',
      para("Title", "Title", '<w:spacing w:before="240" w:after="120"/><w:jc w:val="center"/><w:outlineLvl w:val="0"/>', `${MAJOR}<w:sz w:val="32"/><w:szCs w:val="32"/>`),
      para("Heading1", "heading 1", '<w:keepNext/><w:outlineLvl w:val="0"/>', `${MAJOR}<w:sz w:val="24"/><w:szCs w:val="24"/>`),
      para("Heading2", "heading 2", '<w:keepNext/><w:outlineLvl w:val="1"/>', MAJOR),
      para("Heading3", "heading 3", '<w:keepNext/><w:ind w:leftChars="400" w:left="840"/><w:outlineLvl w:val="2"/>', MAJOR),
      para("Heading4", "heading 4", '<w:keepNext/><w:ind w:leftChars="400" w:left="840"/><w:outlineLvl w:val="3"/>', "<w:b/><w:bCs/>"),
      para("Quote", "Quote", '<w:spacing w:before="200" w:after="160"/><w:ind w:left="864" w:right="864"/><w:jc w:val="center"/>', '<w:i/><w:iCs/><w:color w:val="404040" w:themeColor="text1" w:themeTint="BF"/>'),
      para("ListParagraph", "List Paragraph", '<w:ind w:leftChars="400" w:left="840"/>', ""),
    ],
  },
  en: {
    defaults: `<w:docDefaults><w:rPrDefault><w:rPr>${MINOR}<w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>`,
    styles: [
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>',
      para("Title", "Title", '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:contextualSpacing/>', `${MAJOR}<w:spacing w:val="-10"/><w:kern w:val="28"/><w:sz w:val="56"/><w:szCs w:val="56"/>`),
      para("Heading1", "heading 1", '<w:keepNext/><w:keepLines/><w:spacing w:before="240" w:after="0"/><w:outlineLvl w:val="0"/>', `${MAJOR}<w:color w:val="2F5496" w:themeColor="accent1" w:themeShade="BF"/><w:sz w:val="32"/><w:szCs w:val="32"/>`),
      para("Heading2", "heading 2", '<w:keepNext/><w:keepLines/><w:spacing w:before="40" w:after="0"/><w:outlineLvl w:val="1"/>', `${MAJOR}<w:color w:val="2F5496" w:themeColor="accent1" w:themeShade="BF"/><w:sz w:val="26"/><w:szCs w:val="26"/>`),
      para("Heading3", "heading 3", '<w:keepNext/><w:keepLines/><w:spacing w:before="40" w:after="0"/><w:outlineLvl w:val="2"/>', `${MAJOR}<w:color w:val="1F3763" w:themeColor="accent1" w:themeShade="7F"/><w:sz w:val="24"/><w:szCs w:val="24"/>`),
      para("Heading4", "heading 4", '<w:keepNext/><w:keepLines/><w:spacing w:before="40" w:after="0"/><w:outlineLvl w:val="3"/>', `${MAJOR}<w:i/><w:iCs/><w:color w:val="2F5496" w:themeColor="accent1" w:themeShade="BF"/>`),
      para("Quote", "Quote", '<w:spacing w:before="200" w:after="160"/><w:ind w:left="864" w:right="864"/><w:jc w:val="center"/>', '<w:i/><w:iCs/><w:color w:val="404040" w:themeColor="text1" w:themeTint="BF"/>'),
      para("ListParagraph", "List Paragraph", '<w:ind w:left="720"/><w:contextualSpacing/>', ""),
    ],
  },
};

const styleId = (xml: string) => /w:styleId="([^"]+)"/.exec(xml)?.[1];

/** styles.xml with Word's defaults and Word's own versions of the styles the minutes use. */
export function withWordStyles(stylesXml: string, locale: Locale): string {
  const { defaults, styles } = STYLES[locale];
  const ours = new Set(styles.map(styleId));
  let xml = stylesXml.replace(/<w:docDefaults>[\s\S]*?<\/w:docDefaults>|<w:docDefaults\/>/, defaults);
  // Take out the library's versions of ours (and its Heading5/6, which Word defines latently).
  xml = xml.replace(/<w:style\b[^>]*>[\s\S]*?<\/w:style>/g, (s) => {
    const id = styleId(s);
    return id && (ours.has(id) || /^Heading[56]$/.test(id)) ? "" : s;
  });
  return xml.replace("</w:styles>", `${styles.join("")}</w:styles>`);
}

// The Office theme (2013–2022): its colours, and the fonts it names for each script — for
// Japanese, Yu Mincho for text and Yu Gothic Light for headings, which is what a new document in
// a Japanese Word uses.
const THEME = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/><a:font script="Jpan" typeface="游ゴシック Light"/><a:font script="Hang" typeface="맑은 고딕"/><a:font script="Hans" typeface="等线 Light"/><a:font script="Hant" typeface="新細明體"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/><a:font script="Jpan" typeface="游明朝"/><a:font script="Hang" typeface="맑은 고딕"/><a:font script="Hans" typeface="等线"/><a:font script="Hant" typeface="新細明體"/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`;

/** Finish a .docx from the docx library as a document typed in Word would be. */
export async function asWordDocument(buf: Buffer, locale: Locale): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buf);
  const styles = zip.file("word/styles.xml");
  if (styles) zip.file("word/styles.xml", withWordStyles(await styles.async("string"), locale));

  zip.file("word/theme/theme1.xml", THEME);
  const rels = zip.file("word/_rels/document.xml.rels");
  if (rels) {
    const xml = await rels.async("string");
    if (!xml.includes("relationships/theme")) {
      zip.file(
        "word/_rels/document.xml.rels",
        xml.replace(
          "</Relationships>",
          '<Relationship Id="rIdVoxinqTheme" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/></Relationships>',
        ),
      );
    }
  }
  const types = zip.file("[Content_Types].xml");
  if (types) {
    const xml = await types.async("string");
    if (!xml.includes("/word/theme/theme1.xml")) {
      zip.file(
        "[Content_Types].xml",
        xml.replace(
          "</Types>",
          '<Override PartName="/word/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>',
        ),
      );
    }
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
