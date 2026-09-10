import type { Locale } from "./i18n";

/**
 * A meeting to learn on.
 *
 * Not the same thing as `scripts/seed-demo.mjs`, which fills a throwaway instance with four
 * meetings for the README photographs. This is one meeting, created inside somebody's own
 * account, chosen for what it lets them press:
 *
 *   - **Speakers, already separated.** Three of them, with names, because that is what
 *     diarization *produces* — and renaming them is the part somebody actually does.
 *   - **Two proper nouns Whisper would mishear**, written the way it mishears them. `Suggest
 *     fixes` and `Find & replace` both have something real to find.
 *   - **No minutes.** Pressing `Generate minutes` runs the actual model on the actual text; a
 *     sample that arrived with minutes already written would demonstrate nothing.
 *   - **Short.** Twelve lines through a 7B model is seconds, not the minutes a real meeting
 *     takes, so the first thing a new person waits for is not a long wait.
 *
 * What it cannot teach is recording and diarization: both need the audio, and this meeting has
 * none. The guide card says so rather than offering a button that would not appear.
 */

export type DemoLine = { speaker: "self" | "partner-0" | "partner-1"; text: string };

export type DemoMeeting = {
  title: string;
  description: string;
  labels: Record<string, string>;
  participants: string[];
  glossary: string;
  lines: DemoLine[];
};

const JA: DemoMeeting = {
  title: "サンプル会議 — 新製品の名前を決める",
  description:
    "サンプルデータです。自由に編集・削除してかまいません。" +
    "議題: 新製品の名称候補、発表時期、価格の方針。",
  labels: { self: "自分", "partner-0": "田中 悠", "partner-1": "鈴木 千夏" },
  participants: ["自分", "田中 悠", "鈴木 千夏"],
  // The two terms the transcript below gets wrong, so the correction pass has something to do.
  glossary: "Voxinq, ハーモニクス",
  lines: [
    { speaker: "self", text: "では始めます。新製品の名前の候補から。田中さん、まとめてくれましたか。" },
    { speaker: "partner-0", text: "3案あります。ボクシンク、ハモニックス、それからノクターンです。" },
    { speaker: "partner-1", text: "ボクシンクは既存製品と混ざりませんか。読みが近いです。" },
    { speaker: "partner-0", text: "そこは気にしていました。商標も一度調べたほうがよさそうです。" },
    { speaker: "self", text: "では田中さんが商標を確認して、来週までに2案に絞りましょう。" },
    { speaker: "partner-1", text: "発表時期はどうしますか。展示会に合わせるなら11月です。" },
    { speaker: "self", text: "展示会に合わせましょう。逆算すると10月中旬には資料が要ります。" },
    { speaker: "partner-0", text: "資料は私が作ります。10月10日を目標にします。" },
    { speaker: "partner-1", text: "価格はどうでしょう。ハモニックスの路線なら少し高めでも通ると思います。" },
    { speaker: "self", text: "価格は次回に持ち越します。原価の見積もりが出てからにしましょう。" },
    { speaker: "partner-0", text: "承知しました。原価は来週中に出せる見込みです。" },
    {
      speaker: "self",
      text: "まとめます。田中さんが商標確認と資料、鈴木さんが展示会の枠、価格は次回。以上です。",
    },
  ],
};

const EN: DemoMeeting = {
  title: "Sample meeting — naming the new product",
  description:
    "Sample data. Edit or delete it freely. " +
    "Agenda: candidate names, launch timing, pricing approach.",
  labels: { self: "Me", "partner-0": "Sam Chen", "partner-1": "Priya Nair" },
  participants: ["Me", "Sam Chen", "Priya Nair"],
  glossary: "Voxinq, Harmonics",
  lines: [
    { speaker: "self", text: "Let's start with the names. Sam, did you get a shortlist together?" },
    { speaker: "partner-0", text: "Three of them: Vocsink, Harmonix, and Nocturne." },
    { speaker: "partner-1", text: "Vocsink is awfully close to the existing product when you say it out loud." },
    { speaker: "partner-0", text: "That worried me too. We should get the trademarks checked." },
    { speaker: "self", text: "Sam checks the trademarks, and we cut it to two by next week." },
    { speaker: "partner-1", text: "What about timing? If we tie it to the trade show, that is November." },
    { speaker: "self", text: "Tie it to the show. Working backwards, the material is due mid-October." },
    { speaker: "partner-0", text: "I'll write the material. Aiming for the tenth." },
    { speaker: "partner-1", text: "And price? If we go the Harmonix route I think a little higher lands." },
    { speaker: "self", text: "Price waits for the costing. We'll take it next time." },
    { speaker: "partner-0", text: "Understood — costing should be ready within the week." },
    {
      speaker: "self",
      text: "To recap: Sam has trademarks and the material, Priya has the show slot, price next time.",
    },
  ],
};

export function demoMeeting(locale: Locale): DemoMeeting {
  return locale === "ja" ? JA : EN;
}
