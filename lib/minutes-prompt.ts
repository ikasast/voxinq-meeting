// Builds the system prompt for minutes generation (not server-only, and holds no deps).
// DEFAULT_SUMMARY_FORMAT is exported so the settings page can show/edit it as the "default format".

function contextSection(description?: string | null): string {
  if (!description || !description.trim()) return "";
  return `\n\nこの会議の目的・内容（メタ情報）は以下の通りです。議事録作成の際は必ず考慮してください。\n"""\n${description.trim()}\n"""`;
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

const DETAIL_GUIDANCE: Record<string, string> = {
  brief:
    "全体を短くまとめる。各見出しは要点のみの少数の箇条書きにし、細部は省く。",
  standard: "",
  detailed:
    "会議の内容を充実させて詳しくまとめる。「会議の詳細」は議題ごとに、誰が何を述べ・どう議論し・どう決まったかを取りこぼさず、必要なだけ多くの箇条書きで丁寧に記述する（発言ログにある事項に限る）。",
};

export function buildSummarySystemPrompt(
  description?: string | null,
  opts?: { multiSpeaker?: boolean; language?: string; format?: string; detail?: string },
): string {
  const speakerRule = opts?.multiSpeaker
    ? "発言者を明示する場合は会話ログ中の話者名（例:「自分」「話者1」、または設定された名前）を使ってください。"
    : "発言ログに話者の区別はありません。「自分:」などの話者名は一切書かないでください。";

  // Always pin the output language. Default to Japanese if unspecified.
  // (Prevents the model from arbitrarily outputting another language even if speech is English.)
  const langName = LANGUAGE_NAME[opts?.language ?? "ja"] ?? "日本語";

  // Use the user-specified format if any, otherwise the default.
  const format = opts?.format?.trim() || DEFAULT_SUMMARY_FORMAT;

  // Verbosity guidance (brief / standard / detailed).
  const detailRule = DETAIL_GUIDANCE[opts?.detail ?? "standard"] ?? "";
  const detailSection = detailRule ? `\n\n## 詳しさ\n${detailRule}` : "";

  return `あなたは会議の書記アシスタントです。
渡された会議の発言ログ（音声認識の生テキスト）を読み、**要約した**議事録を Markdown で生成してください。${contextSection(description)}

**出力は必ず${langName}で書いてください。** 発言ログが何語であっても、議事録は${langName}で生成します（見出しも${langName}）。

## 内容の原則
- 議事録の情報源は発言ログだけ。発言ログに出てこない事項は書かない。
- 発言ログをそのままコピーしない。必ず自分の言葉で要約・整理する。認識の言い間違いや冗長な口語は正す。
- 1つの箇条書きは1〜2行。冗長な前置き・相槌・言い直しは削る。
- ${speakerRule}
- 事実に基づかない推測は書かない。該当が無い見出しは「特になし」。

## 出力フォーマット（この見出し構成に厳密に従う）
${format}${detailSection}

## 必ず守る出力ルール（最重要）
1. 出力の1行目から議事録本体（最初の見出し）を書き始める。「以下は〜」などの前置き、末尾の感想・説明文は一切書かない。
2. 全体を \`\`\` などのコードフェンスで囲まない。Markdown をそのまま出力する。
3. 見出しは上記フォーマットの見出しだけを使う。「# 議事録」「## 主な内容」など独自の見出しを作らない。フォーマットの指示文や例をそのまま書き写さない。
4. 文体は常体・体言止め。「ですます調」を禁止（「〜です」「〜ます」「〜ました」は使わない。例:「〜を決定」「〜が課題」「次回までに〜」）。`;
}
