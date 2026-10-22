import { describe, expect, it } from "vitest";
import { EXCERPT_FROM_TOKENS, excerptFor, questionGrams } from "@/lib/llm/excerpt";

// An invented meeting, long enough to be excerpted: mostly about the exhibition, with one
// stretch about hiring.
function meeting(): string {
  const lines: string[] = [];
  for (let i = 0; i < 400; i++) {
    const m = String(i % 60).padStart(2, "0");
    lines.push(`[10:${m}] 佐藤: 展示会のブース配置について、来週までに図面を見直します。資料も一緒に更新します。`);
    if (i === 200) {
      lines.push("[11:20] 鈴木: 採用計画は来月から二名増やす方向で進めます。");
      lines.push("[11:21] 高橋: 採用の面接官は私が担当します。");
    }
  }
  return lines.join("\n");
}

describe("the parts of a meeting a question is about", () => {
  it("keeps the words of a question and leaves its grammar", () => {
    const grams = questionGrams("採用計画について話しましたか？");
    expect(grams).toContain("採用");
    expect(grams).toContain("計画");
    // Kana-only sequences are grammar: について, ました.
    expect(grams).not.toContain("つい");
    expect(grams).not.toContain("まし");
    expect(grams).not.toContain("か？");
  });

  it("sends the stretch that answers, with its neighbours, in order", () => {
    const e = excerptFor("採用計画は誰が担当しますか？", meeting());
    expect(e).not.toBeNull();
    expect(e!.text).toContain("採用計画は来月から二名増やす");
    expect(e!.text).toContain("面接官は私が担当します");
    // Far smaller than the meeting.
    expect(e!.text.length).toBeLessThan(meeting().length / 4);
  });

  it("reads the whole meeting when the question is about all of it, or nothing matches", () => {
    expect(excerptFor("この会議の要点を教えて", meeting())).toBeNull();
    expect(excerptFor("予算はどうなりましたか？", meeting())).toBeNull();
  });

  it("reads a short meeting whole", () => {
    const short = "[10:00] 佐藤: 採用計画を進めます。";
    expect(short.length / 1.8).toBeLessThan(EXCERPT_FROM_TOKENS);
    expect(excerptFor("採用計画は？", short)).toBeNull();
  });
});
