"use client";

import { emotionMark, readEmotion } from "@/lib/emotion";
import { STANDS_OUT, readCues } from "@/lib/voice-cues";
import { formatOffset } from "@/lib/utils";
import { useT } from "@/app/locale-provider";

// The meeting at a glance: one bar per line, in the order they were said. Its colour is what the
// line sounded like (Emotion) and its height how loud it was against that speaker's usual (Voice
// cues), so where a discussion rose, fell or turned shows before any line is read. A bar takes
// you to its line.
//
// Shown only once one of the two has something to show; either alone is enough — no colour
// without Emotion, an even height without Voice cues.

type Line = { id: string; text: string; voice?: string | null; emotion?: string | null };

const MOOD_COLOR = { joy: "--mood-joy", anger: "--mood-anger", sadness: "--mood-sad" } as const;

/** Bar heights in px, from quiet to loud. Loudness is clamped at two deviations either way. */
const MIN_H = 6;
const MID_H = 14;
const MAX_H = 28;

export function heightFor(loud: number | undefined): number {
  if (typeof loud !== "number") return MID_H;
  const z = Math.max(-2, Math.min(2, loud));
  return Math.round(z >= 0 ? MID_H + (z / 2) * (MAX_H - MID_H) : MID_H + (z / 2) * (MID_H - MIN_H));
}

export function MoodStrip({
  lines,
  elapsed,
  showEmotion,
  showVoice,
}: {
  lines: Line[];
  /** Seconds from the start of the meeting to each line, by index. */
  elapsed: (i: number) => number | null;
  showEmotion: boolean;
  showVoice: boolean;
}) {
  const t = useT();
  const bars = lines.map((l) => ({
    id: l.id,
    text: l.text,
    mood: showEmotion ? emotionMark(readEmotion(l.emotion)) : null,
    loud: showVoice ? readCues(l.voice)?.loud : undefined,
  }));
  const anything = bars.some((b) => b.mood || typeof b.loud === "number");
  if (!anything) return null;

  const jump = (id: string) => {
    const row = document.getElementById(`line-${id}`);
    if (!row) return;
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    row.classList.add("ring-2", "ring-[var(--accent)]");
    setTimeout(() => row.classList.remove("ring-2", "ring-[var(--accent)]"), 1600);
  };

  const feeling = (e: NonNullable<(typeof bars)[number]["mood"]>["emotion"]) =>
    e === "joy" ? t("Sounded joyful") : e === "anger" ? t("Sounded angry") : t("Sounded sad");

  // A thin strip above the lines and nothing more: no box, no heading, no key. What a colour or a
  // height means is in each bar's tooltip, with the line it stands for.
  return (
    <div
      className="mt-3 flex h-7 items-end gap-px"
      role="list"
      aria-label={t("How the meeting went")}
      title={t("Click a bar to go to its line")}
    >
      {bars.map((b, i) => {
        const at = elapsed(i);
        const label = [
          at !== null ? formatOffset(at) : null,
          b.mood ? feeling(b.mood.emotion) : null,
          typeof b.loud === "number" && Math.abs(b.loud) >= STANDS_OUT ? (b.loud > 0 ? t("Louder") : t("Quieter")) : null,
          b.text.length > 40 ? `${b.text.slice(0, 40)}…` : b.text,
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <button
            key={b.id}
            type="button"
            role="listitem"
            onClick={() => jump(b.id)}
            title={label}
            aria-label={label}
            className="min-w-0 flex-1 rounded-sm transition-opacity hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            style={{
              height: `${heightFor(b.loud)}px`,
              background: b.mood
                ? `var(${MOOD_COLOR[b.mood.emotion]})`
                : "color-mix(in srgb, var(--text-muted) 35%, transparent)",
            }}
          />
        );
      })}
    </div>
  );
}
