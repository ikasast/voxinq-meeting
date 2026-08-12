// Answering questions about a set of meetings' minutes ("what were the TODOs from last
// time?", "what did we decide about the budget?").
//
// Deliberately grounded in the minutes rather than the raw transcripts: the minutes are
// already condensed, so a whole series fits in a local model's context, and they are the
// version the user has reviewed. The model is told to answer only from them and to say when
// something is not there — an invented action item is worse than "not recorded".

import { getLlmBackground, getLlmConfig, getSummaryLanguage } from "../settings";
import { CONTEXT_BUDGET, estTokens, providerFor } from "./provider";

const ANSWER_MAX_TOKENS = 2048;
const LANG_NAME: Record<string, string> = { ja: "日本語", en: "英語", zh: "中国語" };

export type MeetingForAsk = {
  title: string;
  startedAt: Date | string;
  minutes: string | null;
};

function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

/**
 * Lay the meetings out newest-first, dropping the oldest ones if they do not fit.
 * Questions are nearly always about recent meetings ("since last time"), so when the
 * material is too long the far past is the right thing to lose — and the answer says so.
 */
export function buildAskContext(
  meetings: MeetingForAsk[],
  budgetTokens: number,
): { context: string; used: number; omitted: number } {
  const withMinutes = meetings.filter((m) => m.minutes && m.minutes.trim());
  const blocks: string[] = [];
  let tokens = 0;
  let used = 0;
  for (const m of withMinutes) {
    const block = `### ${formatDate(m.startedAt)} ${m.title}\n\n${(m.minutes ?? "").trim()}`;
    const cost = estTokens(block);
    // Always include the newest meeting, even if it alone is over budget — an answer from
    // a truncated newest meeting beats no material at all.
    if (used > 0 && tokens + cost > budgetTokens) break;
    blocks.push(block);
    tokens += cost;
    used += 1;
  }
  return {
    context: blocks.join("\n\n---\n\n"),
    used,
    omitted: withMinutes.length - used,
  };
}

export type AskResult = { answer: string; used: number; omitted: number; withoutMinutes: number };

/** Answer `question` from the minutes of `meetings` (newest first). */
export async function askMinutes(
  question: string,
  meetings: MeetingForAsk[],
  scopeLabel: string,
  signal?: AbortSignal,
): Promise<AskResult> {
  const cfg = await getLlmConfig();
  const provider = providerFor(cfg.provider);
  const language = await getSummaryLanguage();
  const background = (await getLlmBackground()).trim();
  const langName = LANG_NAME[language] ?? "日本語";

  // Leave room for the question, the instructions and the answer itself.
  const budget = CONTEXT_BUDGET[cfg.provider] - ANSWER_MAX_TOKENS - estTokens(question) - 1200;
  const { context, used, omitted } = buildAskContext(meetings, Math.max(1000, budget));
  const withoutMinutes = meetings.filter((m) => !m.minutes || !m.minutes.trim()).length;

  if (!context) {
    return {
      answer: "",
      used: 0,
      omitted: 0,
      withoutMinutes,
    };
  }

  const system = [
    `あなたは会議の記録を参照して質問に答えるアシスタントです。回答は${langName}で書いてください。`,
    "回答は与えられた議事録の内容だけを根拠にしてください。書かれていないことは推測せず、「議事録には記載がありません」と述べてください。",
    // Without this the model answers from one meeting and silently drops the rest: asked for
    // "TODOs so far" across two meetings, it returned only the older one's list.
    "質問が特定の1回に限定されていない限り、渡されたすべての回を確認し、該当する項目を漏れなく挙げてください。「前回まで」「これまで」などは、記載されている全ての回が対象です。",
    "TODO・宿題・決定事項を尋ねられた場合は、項目ごとに、どの回（日付と会議名）のものかを明記した箇条書きで示してください。",
    "議事録に無い事業名・組織・人物・数値を新たに作り出さないこと。",
    // The background exists to interpret jargon; it is not a source of facts. Without this
    // the model happily answers "what are the TODOs" from the background text itself.
    background
      ? `次は用語解釈のための業務背景です。回答の根拠にはせず、用語の理解にのみ使ってください:\n${background}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const user = [
    `以下は「${scopeLabel}」の議事録です（新しい順、${used}件）。`,
    omitted > 0
      ? `（古い${omitted}件は長さの都合で省略されています。省略分に関わる質問には、その旨を添えてください。）`
      : "",
    "",
    context,
    "",
    `上の${used}件の議事録すべてに目を通したうえで、それらだけを根拠に次の質問に答えてください。\n\n質問: ${question}`,
  ]
    .filter(Boolean)
    .join("\n");

  const answer = await provider.chat(
    { system, user, maxTokens: ANSWER_MAX_TOKENS },
    cfg,
    signal,
  );
  return { answer: answer.trim(), used, omitted, withoutMinutes };
}
