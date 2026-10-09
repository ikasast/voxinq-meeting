import type { LinkStatus } from "@/lib/stt/client";

// How a recording's state is put into words and a dot, and its running time into digits: the
// same on the recording screen and on the bar that shows a recording from every other page
// (recording-bar.tsx).

export type LinkState = LinkStatus | "idle";

/** The running time: "05:09" under an hour, "1:05:09" from then on. */
export function runningTime(totalSeconds: number): string {
  const [hours, minutes, seconds] = [
    Math.floor(totalSeconds / 3600),
    Math.floor(totalSeconds / 60) % 60,
    totalSeconds % 60,
  ];
  const clock = [minutes, seconds].map((n) => String(n).padStart(2, "0")).join(":");
  return hours > 0 ? `${hours}:${clock}` : clock;
}

/**
 * What the status line says. Each word is spelled out in a t() call of its own so the
 * translation check can see all five.
 */
export function statusText(t: (k: string) => string, status: LinkState): string {
  switch (status) {
    case "connecting":
      return t("Preparing"); // the model is loading; audio is kept and caught up on once it is ready
    case "open":
      return t("Listening");
    case "reconnecting":
      return t("Reconnecting");
    case "error":
      return t("Error");
    default:
      return t("Stopped");
  }
}

/** The dot beside it: red and pulsing while listening, amber while getting there. */
export const STATUS_DOT: Record<LinkState, string> = {
  open: "bg-[var(--error)] animate-pulse",
  connecting: "bg-[var(--warning)] animate-pulse",
  reconnecting: "bg-[var(--warning)] animate-pulse",
  error: "bg-[var(--error)]",
  closed: "bg-[var(--border-strong)]",
  idle: "bg-[var(--border-strong)]",
};
