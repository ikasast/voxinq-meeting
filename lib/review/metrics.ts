// What can be counted about one person in a meeting, before any model reads it: how much of the
// talking was theirs, how many times they spoke, how many of their lines were questions, their
// longest turn, and how evenly everybody else got to speak. Given to the model as facts, so its
// judgement rests on them rather than on an impression of a long transcript, and shown beside
// the score.

export type MetricLine = { speaker: string; text: string; startSec: number | null; endSec: number | null };

export type ReviewMetrics = {
  /** Minutes the meeting ran, from the first line to the last. */
  minutes: number;
  speakers: number;
  /** This person's share of everything said, 0–100, by characters. */
  share: number;
  turns: number;
  questions: number;
  /** Their longest run of consecutive lines, in seconds when the lines are placed. */
  longestTurnSec: number | null;
  /** The quietest other speaker's share, 0–100: low means somebody barely spoke. */
  quietestOtherShare: number | null;
};

const QUESTION = /[?？]\s*$|(?:ですか|ますか|でしょうか|かな|ません?か)[。.]?\s*$/;

export function reviewMetrics(lines: MetricLine[], person: string): ReviewMetrics {
  const chars = new Map<string, number>();
  let total = 0;
  for (const l of lines) {
    const n = l.text.length;
    chars.set(l.speaker, (chars.get(l.speaker) ?? 0) + n);
    total += n;
  }
  const mine = chars.get(person) ?? 0;

  let turns = 0;
  let questions = 0;
  let longest = 0;
  let runStart: number | null = null;
  let runEnd: number | null = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.speaker !== person) {
      runStart = null;
      continue;
    }
    if (i === 0 || lines[i - 1].speaker !== person) {
      turns += 1;
      runStart = l.startSec;
    }
    if (QUESTION.test(l.text)) questions += 1;
    runEnd = l.endSec ?? l.startSec;
    if (runStart !== null && runEnd !== null) longest = Math.max(longest, runEnd - runStart);
  }

  const placed = lines.filter((l) => l.startSec !== null);
  const first = placed[0]?.startSec ?? 0;
  const last = placed.length > 0 ? (placed[placed.length - 1].endSec ?? placed[placed.length - 1].startSec ?? 0) : 0;
  const others = [...chars.entries()].filter(([s]) => s !== person).map(([, n]) => n);

  return {
    minutes: Math.max(0, Math.round((last - first) / 60)),
    speakers: chars.size,
    share: total > 0 ? Math.round((mine / total) * 100) : 0,
    turns,
    questions,
    longestTurnSec: placed.length > 0 ? Math.round(longest) : null,
    quietestOtherShare: others.length > 0 && total > 0 ? Math.round((Math.min(...others) / total) * 100) : null,
  };
}
