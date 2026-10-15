import type { ReviewCriterion, ReviewRole } from "./criteria";
import type { ReviewMetrics } from "./metrics";

// The model's side of a meeting review: what it is asked, and what of its answer is kept.
//
// It is given the criteria, the counted facts (metrics.ts), the minutes if there are any, and
// the lines — numbered, so a point it makes can name the lines it rests on, which the page turns
// into links to that moment. Everything it returns is checked: an id that is not a criterion, a
// score off the scale, a line number that was not shown are dropped rather than trusted, the
// same stance as lib/llm/correct.ts takes with a small model asked for JSON.

export type ReviewLine = { id: string; speaker: string; text: string; at: string | null };

export type ReviewPoint = { text: string; lineIds: string[] };

export type ReviewResult = {
  criteria: { id: string; score: number; comment: string }[];
  strengths: ReviewPoint[];
  improvements: ReviewPoint[];
  summary: string;
};

const MAX_POINTS = 4;

export function reviewSystemPrompt(role: ReviewRole, language: "ja" | "en"): string {
  const who =
    role === "facilitator"
      ? language === "ja"
        ? "この会議のファシリテーター（進行役）"
        : "the facilitator who ran this meeting"
      : language === "ja"
        ? "この会議の参加者の一人"
        : "one participant of this meeting";
  if (language === "ja") {
    return `あなたは会議の進め方を振り返るコーチです。${who}が、次の会議をより良くするための振り返りを書きます。
人事評価ではなく、本人が読んで次に活かすための材料です。具体的に、敬意をもって、行動に移せる形で書いてください。

## 守ること
- 判断の根拠は、渡された発言と数値だけ。発言に無いことを推測で補わない。
- 各基準を 1〜5 の整数で採点する（1=できていない、3=ふつう、5=とても良い）。根拠が乏しい基準は 3 とし、コメントでそう書く。
- 良かった点・もっと良くするには、それぞれ最大${MAX_POINTS}つ。根拠になった発言の番号を lines に入れる。
- 「もっと良くするには」は「〜すると、〜になった」のように、次に取れる行動で書く。
- 出力は JSON だけ。前置きやコードフェンスは書かない。`;
  }
  return `You are a coach reviewing how a meeting was run. You are writing feedback for ${who}, to help their next meeting go better.
This is not a performance appraisal: it is for them to read and act on. Be specific, respectful and practical.

## Rules
- Base every judgement only on the lines and the figures given. Do not guess at anything not in them.
- Score each criterion as an integer from 1 to 5 (1 = not done, 3 = adequate, 5 = very good). Where there is little evidence, give 3 and say so in the comment.
- At most ${MAX_POINTS} strengths and ${MAX_POINTS} improvements, each with the numbers of the lines it rests on in "lines".
- Write improvements as something to do next time ("doing X would have …").
- Output JSON only: no preamble, no code fence.`;
}

export function reviewUserPrompt(input: {
  role: ReviewRole;
  person: string;
  language: "ja" | "en";
  criteria: ReviewCriterion[];
  metrics: ReviewMetrics;
  purpose?: string;
  minutes?: string;
  lines: ReviewLine[];
  /** Some lines were left out to fit: the ones around this person's were kept. */
  focused: boolean;
}): string {
  const ja = input.language === "ja";
  const m = input.metrics;
  const facts = ja
    ? [
        `- 会議の長さ: 約${m.minutes}分 / 話者 ${m.speakers}人`,
        `- ${input.person}の発言の割合: ${m.share}% / 発言の回数: ${m.turns} / 質問: ${m.questions}`,
        m.longestTurnSec !== null ? `- いちばん長い発言: ${m.longestTurnSec}秒` : null,
        m.quietestOtherShare !== null ? `- 最も発言の少なかった他の参加者の割合: ${m.quietestOtherShare}%` : null,
      ]
    : [
        `- Length: about ${m.minutes} min / ${m.speakers} speakers`,
        `- ${input.person}'s share of the talking: ${m.share}% / turns: ${m.turns} / questions: ${m.questions}`,
        m.longestTurnSec !== null ? `- Longest turn: ${m.longestTurnSec} s` : null,
        m.quietestOtherShare !== null ? `- Share of the quietest other participant: ${m.quietestOtherShare}%` : null,
      ];
  const criteria = input.criteria.map((c) => `- ${c.id}: ${c.name} — ${c.description}`).join("\n");
  const lines = input.lines
    .map((l, i) => `[${i}]${l.at ? ` ${l.at}` : ""} ${l.speaker}: ${l.text}`)
    .join("\n");
  const role = ja
    ? input.role === "facilitator"
      ? "ファシリテーター"
      : "参加者"
    : input.role;
  const shape = `{"criteria":[{"id":"<id>","score":1-5,"comment":"…"}],"strengths":[{"text":"…","lines":[0]}],"improvements":[{"text":"…","lines":[0]}],"summary":"…"}`;

  return ja
    ? `## 振り返る人
${input.person}（${role}）

## 評価の基準（id: 名前 — 内容）
${criteria}

## 数値
${facts.filter(Boolean).join("\n")}
${input.purpose?.trim() ? `\n## 会議の目的・議題\n${input.purpose.trim()}\n` : ""}${input.minutes?.trim() ? `\n## 議事録\n${input.minutes.trim()}\n` : ""}
## 発言${input.focused ? `（長いため、${input.person}の発言とその前後に絞っています）` : ""}
${lines}

## 出力（この形の JSON、各基準を1回ずつ）
${shape}`
    : `## Whom the feedback is for
${input.person} (${role})

## Criteria (id: name — what it means)
${criteria}

## Figures
${facts.filter(Boolean).join("\n")}
${input.purpose?.trim() ? `\n## Purpose and agenda\n${input.purpose.trim()}\n` : ""}${input.minutes?.trim() ? `\n## Minutes\n${input.minutes.trim()}\n` : ""}
## Lines${input.focused ? ` (long meeting: ${input.person}'s lines and those around them)` : ""}
${lines}

## Output (JSON of this shape, each criterion once)
${shape}`;
}

/**
 * The lines to show, within a budget of characters: all of them if they fit, otherwise this
 * person's lines with the one before and after each (what they answered, what answered them),
 * and if even that is too long, an even spread of those.
 */
export function focusLines(lines: ReviewLine[], person: string, budgetChars: number): { lines: ReviewLine[]; focused: boolean } {
  const size = (ls: ReviewLine[]) => ls.reduce((a, l) => a + l.text.length + l.speaker.length + 12, 0);
  if (size(lines) <= budgetChars) return { lines, focused: false };
  const keep = new Set<number>();
  lines.forEach((l, i) => {
    if (l.speaker !== person) return;
    for (const j of [i - 1, i, i + 1]) if (j >= 0 && j < lines.length) keep.add(j);
  });
  let picked = [...keep].sort((a, b) => a - b).map((i) => lines[i]);
  if (size(picked) > budgetChars) {
    const ratio = budgetChars / size(picked);
    const step = Math.max(1, Math.ceil(1 / ratio));
    picked = picked.filter((_, i) => i % step === 0);
  }
  return { lines: picked, focused: true };
}

function stripFence(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (m ? m[1] : s).trim();
  // Some models put a sentence before the object despite being asked not to.
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

/** What of the model's answer can be kept, or null when nothing of it is usable. */
export function parseReview(raw: string, criteria: ReviewCriterion[], shown: ReviewLine[]): ReviewResult | null {
  let v: unknown;
  try {
    v = JSON.parse(stripFence(raw));
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const known = new Set(criteria.map((c) => c.id));
  const seen = new Set<string>();
  const scored: ReviewResult["criteria"] = [];
  for (const item of Array.isArray(o.criteria) ? o.criteria : []) {
    if (!item || typeof item !== "object") continue;
    const { id, score, comment } = item as Record<string, unknown>;
    if (typeof id !== "string" || !known.has(id) || seen.has(id)) continue;
    const n = typeof score === "number" ? score : typeof score === "string" ? Number(score) : NaN;
    if (!Number.isFinite(n)) continue;
    seen.add(id);
    scored.push({ id, score: Math.min(5, Math.max(1, Math.round(n))), comment: typeof comment === "string" ? comment.trim().slice(0, 200) : "" });
  }
  if (scored.length === 0) return null;
  const points = (list: unknown): ReviewPoint[] =>
    (Array.isArray(list) ? list : [])
      .map((p): ReviewPoint | null => {
        if (!p || typeof p !== "object") return null;
        const { text, lines } = p as Record<string, unknown>;
        if (typeof text !== "string" || !text.trim()) return null;
        const lineIds = (Array.isArray(lines) ? lines : [])
          .filter((i): i is number => typeof i === "number" && Number.isInteger(i) && i >= 0 && i < shown.length)
          .slice(0, 3)
          .map((i) => shown[i].id);
        return { text: text.trim().slice(0, 300), lineIds: [...new Set(lineIds)] };
      })
      .filter((p): p is ReviewPoint => p !== null)
      .slice(0, MAX_POINTS);
  return {
    criteria: criteria.flatMap((c) => scored.filter((s) => s.id === c.id)),
    strengths: points(o.strengths),
    improvements: points(o.improvements),
    summary: typeof o.summary === "string" ? o.summary.trim().slice(0, 300) : "",
  };
}
