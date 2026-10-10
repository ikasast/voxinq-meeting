"use client";

import { emotionMark, readEmotion } from "@/lib/emotion";
import { formatOffset } from "@/lib/utils";
import { useT } from "@/app/locale-provider";

// The meeting at a glance: one bar a minute, as tall as the minute was busy, coloured where the
// minute sounded unlike the rest of the meeting (Emotion). A bar takes you to the minute's first
// line.
//
// It was one bar per line, coloured by what that line sounded like. The model judges a line on
// its own and is unsure of most of them, so in a real meeting two lines in three came out joyful,
// angry or sad, and neighbouring bars changed colour almost every line — a stripe that said
// nothing. So the lines are taken a minute at a time, and a minute is coloured only when one
// feeling is clearly more of it than of the meeting as a whole: measured against the meeting
// itself, the way Voice cues measures a speaker against their own usual.

type Line = { id: string; text: string; emotion?: string | null };
type Feeling = "joy" | "anger" | "sadness";

const MOOD_COLOR: Record<Feeling, string> = { joy: "--mood-joy", anger: "--mood-anger", sadness: "--mood-sad" };
const FEELINGS: Feeling[] = ["joy", "anger", "sadness"];

/** A minute (or half of one, in a short meeting) and what it held. */
export type MoodBucket = {
  start: number;
  end: number;
  /** Lines said in it. */
  count: number;
  /** The first of them, to go to. */
  firstId: string | null;
  /** The feeling that stands out in it against the whole meeting, and its share of the lines. */
  standout: { feeling: Feeling; share: number; of: number } | null;
};

/** A bucket is coloured only with at least this many lines in it… */
const MIN_LINES = 3;
/** …and when the feeling is at least this share of them, more than its share of the meeting. */
const MIN_SHARE = 0.4;

/** How long a bar is: half a minute in a short meeting, a minute, or longer so there are at most 60. */
export function bucketSeconds(duration: number): number {
  if (duration < 600) return 30;
  return Math.max(60, Math.ceil(duration / 60 / 60) * 60);
}

/** The lines, a bucket at a time, with what stands out in each. Lines with no time are left out. */
export function moodBuckets(points: { id: string; at: number | null; feeling: Feeling | null }[]): MoodBucket[] {
  const placed = points.filter((p): p is { id: string; at: number; feeling: Feeling | null } => p.at !== null);
  if (placed.length === 0) return [];
  const duration = Math.max(...placed.map((p) => p.at)) + 1;
  const size = bucketSeconds(duration);
  const n = Math.ceil(duration / size);

  // The meeting's own mix: how much of it sounded each way.
  const overall = Object.fromEntries(
    FEELINGS.map((f) => [f, placed.filter((p) => p.feeling === f).length / placed.length]),
  ) as Record<Feeling, number>;

  return Array.from({ length: n }, (_, i) => {
    const inIt = placed.filter((p) => Math.floor(p.at / size) === i);
    let standout: MoodBucket["standout"] = null;
    if (inIt.length >= MIN_LINES) {
      let lift = 0;
      for (const f of FEELINGS) {
        const of = inIt.filter((p) => p.feeling === f).length;
        const share = of / inIt.length;
        if (share >= MIN_SHARE && share - overall[f] > lift) {
          lift = share - overall[f];
          standout = { feeling: f, share, of };
        }
      }
    }
    return { start: i * size, end: (i + 1) * size, count: inIt.length, firstId: inIt[0]?.id ?? null, standout };
  });
}

export function MoodStrip({
  lines,
  elapsed,
  showEmotion,
}: {
  lines: Line[];
  /** Seconds from the start of the meeting to each line, by index. */
  elapsed: (i: number) => number | null;
  showEmotion: boolean;
}) {
  const t = useT();
  if (!showEmotion) return null;
  const points = lines.map((l, i) => ({
    id: l.id,
    at: elapsed(i),
    feeling: (emotionMark(readEmotion(l.emotion))?.emotion ?? null) as Feeling | null,
  }));
  // Nothing judged yet: no strip, rather than a row of grey bars that looks like a finding.
  if (!lines.some((l) => readEmotion(l.emotion))) return null;
  const buckets = moodBuckets(points);
  // Nothing stood out anywhere — a short or even meeting: no strip, rather than a row of grey
  // bars that reads as a finding and says only how busy each minute was.
  if (!buckets.some((b) => b.standout)) return null;
  const busiest = Math.max(1, ...buckets.map((b) => b.count));

  const jump = (id: string) => {
    const row = document.getElementById(`line-${id}`);
    if (!row) return;
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    row.classList.add("ring-2", "ring-[var(--accent)]");
    setTimeout(() => row.classList.remove("ring-2", "ring-[var(--accent)]"), 1600);
  };

  const feeling = (f: Feeling) => (f === "joy" ? t("Sounded joyful") : f === "anger" ? t("Sounded angry") : t("Sounded sad"));

  // A thin strip above the lines and nothing more: no box, no heading, no key. What a bar stands
  // for is in its tooltip.
  return (
    <div
      className="mt-3 flex h-8 items-end gap-0.5"
      role="list"
      aria-label={t("How the meeting went")}
      title={t("Click a bar to go to its line")}
    >
      {buckets.map((b) => {
        const label = [
          `${formatOffset(b.start)}–${formatOffset(b.end)}`,
          t(b.count === 1 ? "1 utterance" : "{n} utterances", { n: b.count }),
          b.standout
            ? t("{feeling} more than the rest of the meeting ({of} of {n})", {
                feeling: feeling(b.standout.feeling),
                of: b.standout.of,
                n: b.count,
              })
            : null,
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <button
            key={b.start}
            type="button"
            role="listitem"
            onClick={() => b.firstId && jump(b.firstId)}
            disabled={!b.firstId}
            title={label}
            aria-label={label}
            className="min-w-0 flex-1 rounded-sm transition-opacity hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:cursor-default"
            style={{
              height: b.count === 0 ? "2px" : `${6 + Math.round((b.count / busiest) * 26)}px`,
              background: b.standout
                ? `var(${MOOD_COLOR[b.standout.feeling]})`
                : "color-mix(in srgb, var(--text-muted) 35%, transparent)",
            }}
          />
        );
      })}
    </div>
  );
}
