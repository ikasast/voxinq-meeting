// Builds the system prompt for minutes generation (not server-only, and holds no deps).
// DEFAULT_SUMMARY_FORMAT is exported so the settings page can show/edit it as the "default format".

/** What this meeting was called for, in the words of whoever set it up. */
function agendaSection(description?: string | null): string {
  const about = description?.trim();
  return about
    ? `\n\n会議を設定した人による、この会議の趣旨の説明です。議事録を書くときはこれを踏まえてください。\n"""\n${about}\n"""`
    : "";
}

/**
 * What the series shares, kept separate from what this meeting is about.
 *
 * Two sections rather than one concatenated blob, and labelled: the background of a project is
 * standing context — read it to understand the words — while the meeting's own agenda is what
 * today was supposed to cover. A model handed both under one heading writes the series'
 * background into every set of minutes as if it had been discussed.
 */
function seriesSection(background?: string | null): string {
  if (!background || !background.trim()) return "";
  return `\n\nこの会議は継続的なシリーズの一回です。シリーズ全体に共通する背景は以下の通りです。**用語や関係者を理解するための前提**として読み、議事録には今回話された事項だけを書いてください。\n"""\n${background.trim()}\n"""`;
}

const LANGUAGE_NAME: Record<string, string> = {
  ja: "日本語",
  en: "英語（English）",
  zh: "中国語",
};

// Default minutes format (heading structure). Used when nothing is set in settings.
// Can be loaded into the settings "minutes format" field and edited/overridden there.
export const DEFAULT_SUMMARY_FORMAT = `## 会議概要
会議全体の結論を3〜6項目の箇条書きで。主要な決定事項・課題・次回への申し送りを含める。これだけで概要が掴めるように。

## 会議の詳細
会話を議題（トピック）ごとに分け、議題ごとに「### 議題名」の小見出しを立てる。
各議題の下は、やりとりを要約した箇条書きにする（逐語の書き起こしではなく、「誰が何を報告し、何が議論され、どう決まったか」を短くまとめる）。
1発言=1項目ではなく、関連する複数の発言を1項目にまとめてよい。決定事項・重要な論点は **太字**。
例:
### 予算の見直し
- 上期の執行率が60%にとどまる見込み。要因は機材調達の遅延。
- **下期に予算を組み替え、機材費を人件費へ振替する方針を決定。**

## 次回へのTODO
次回までにやるべきことを箇条書きで。わかる場合は担当者も添える（例:「田中: 見積もりを再取得」）。`;

/**
 * How the minutes are written — the part of the prompt a template may replace.
 *
 * What is *not* here is on purpose: that the transcript is the only source, that nothing is
 * guessed, which language to write in, and the mechanics of the output (start at the first
 * heading, no code fences, only the format's headings). Those keep minutes honest and parseable
 * whatever a template says, so they stay in the fixed part of the prompt and cannot be edited
 * away by accident.
 */
export const DEFAULT_MINUTES_INSTRUCTIONS = `- 発言ログをそのままコピーしない。必ず自分の言葉で要約・整理する。認識の言い間違いや冗長な口語は正す。
- 1つの箇条書きは1〜2行。冗長な前置き・相槌・言い直しは削る。
- 書くことの無い見出しも残し、本文は「特になし」とする。
- 文体は常体・体言止め。「ですます調」を禁止（「〜です」「〜ます」「〜ました」は使わない。例:「〜を決定」「〜が課題」「次回までに〜」）。`;

// How thorough. There used to be three levels to choose from (brief / standard / detailed); v4
// keeps the fullest one for every run, and anything shorter is a format's own instructions.
const DETAIL_RULE =
  "会議の内容を充実させて詳しくまとめる。「会議の詳細」は議題ごとに、誰が何を述べ・どう議論し・どう決まったかを取りこぼさず、必要なだけ多くの箇条書きで丁寧に記述する（発言ログにある事項に限る）。";

/** What the meeting is, as recorded: its name, when it was held, who was registered for it. */
export type MeetingFacts = { title?: string; when?: string; participants?: string[] };

function meetingSection(facts?: MeetingFacts): string {
  const lines = [
    facts?.title ? `- 会議名: ${facts.title}` : "",
    facts?.when ? `- 日時: ${facts.when}` : "",
    facts?.participants?.length ? `- 参加者（登録された名前）: ${facts.participants.join("、")}` : "",
  ].filter(Boolean);
  if (lines.length === 0) return "";
  const caution = facts?.participants?.length
    ? "\n参加者は出席者として書いてよい。ただし誰が何を言ったかは発言ログの話者名からだけ判断し、参加者の名前を当てはめて推測しない。"
    : "";
  return `\n\nこの会議の記録上の情報です。会議名・日時・出席者として議事録に書いてよい事実です。\n${lines.join("\n")}${caution}`;
}

export function buildSummarySystemPrompt(
  description?: string | null,
  opts?: {
    multiSpeaker?: boolean;
    language?: string;
    format?: string;
    /** The series' shared background, if this meeting is in one. */
    seriesBackground?: string | null;
    /** How to write, from the template. Empty uses DEFAULT_MINUTES_INSTRUCTIONS. */
    instructions?: string;
    /** The meeting's name, time and participants, where the run chose to give them. */
    meeting?: MeetingFacts;
  },
): string {
  const speakerRule = opts?.multiSpeaker
    ? "誰の発言かを書くときは、発言ログに出てくる話者名（付けられた名前、または「Me」「Speaker 1」のような仮の名前）をそのまま使う。"
    : "発言ログに話者の区別はありません。「自分:」などの話者名は一切書かないでください。";

  // Always pin the output language. Default to Japanese if unspecified.
  // (Prevents the model from arbitrarily outputting another language even if speech is English.)
  const langName = LANGUAGE_NAME[opts?.language ?? "ja"] ?? "日本語";

  // Use the user-specified format if any, otherwise the default.
  const format = opts?.format?.trim() || DEFAULT_SUMMARY_FORMAT;

  const instructions = opts?.instructions?.trim() || DEFAULT_MINUTES_INSTRUCTIONS;

  const detailSection = `\n\n## 詳しさ\n${DETAIL_RULE}`;

  return `あなたは会議の議事録をまとめる担当者です。
これから渡すのは、音声認識で書き起こした未整形の発言ログです。内容を**要約して**、Markdown の議事録にしてください。${meetingSection(opts?.meeting)}${seriesSection(opts?.seriesBackground)}${agendaSection(description)}

**出力は必ず${langName}で書いてください。** 発言ログが何語であっても、議事録は${langName}で生成します（見出しも${langName}）。

## 内容の原則
- 議事録の情報源は発言ログだけ。発言ログに出てこない事項は書かない${meetingSection(opts?.meeting) ? "（会議名・日時・出席者は上の記録上の情報から書いてよい）" : ""}。
- 発言ログから読み取れない推測や補足を書き足さない。
- ${speakerRule}

## 書き方
${instructions}

## 出力フォーマット（この見出し構成に厳密に従う）
${format}${detailSection}

## 必ず守る出力ルール（最重要）
1. 出力の1行目から議事録本体（最初の見出し）を書き始める。「以下は〜」などの前置き、末尾の感想・説明文は一切書かない。
2. 全体を \`\`\` などのコードフェンスで囲まない。Markdown をそのまま出力する。
3. 見出しは上記フォーマットの見出しだけを使う。「# 議事録」「## 主な内容」など独自の見出しを作らない。フォーマットの指示文や例をそのまま書き写さない。`;
}
