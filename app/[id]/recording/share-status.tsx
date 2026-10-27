"use client";

import { useSyncExternalStore } from "react";
import { useT } from "@/app/locale-provider";
import { lastSharedSurface, type SharedAudio, type SharedSurface, type SourceLevels } from "@/lib/stt/client";

// PC audio around a recording: what to choose in the share dialog before it opens, whether the
// audio is arriving while it records, and putting it right without stopping.
//
// The share dialog is the browser's, and whether its audio box starts ticked is too — Chrome
// ticks a tab's and leaves "Share system audio" for the whole screen to be ticked by hand, which
// is the box people forget. So the page says which to choose just before the dialog, and when
// the audio did not come, the recording goes on and the dialog can be opened again from here.

const box =
  "rounded-md border px-3 py-2 text-sm text-[var(--foreground)] border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,var(--paper))]";

// Read once; it changes only when a share is made, and the hint is gone by then.
const noChanges = () => () => {};

/** Before recording: which choice in the dialog brings the audio with it. */
export function ShareHint() {
  const t = useT();
  // This browser's, which the server rendering the page cannot know: nothing until hydrated.
  const last = useSyncExternalStore(noChanges, lastSharedSurface, () => null);
  const name: Record<SharedSurface, string> = {
    browser: t("a tab"),
    window: t("a window"),
    monitor: t("the entire screen"),
  };
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text-secondary)]">
      <p className="font-medium text-[var(--foreground)]">{t("Next, the browser asks what to share")}</p>
      <p className="mt-0.5">
        {t("A meeting in the browser (Meet, Teams on the web): choose its tab — the tab's audio is on from the start. A meeting app (Zoom, Teams): choose the entire screen and tick “Share system audio”.")}
      </p>
      {last ? (
        <p className="mt-0.5 text-[var(--text-muted)]">
          {t("Last time you shared {what}; the dialog opens there.", { what: name[last] })}
        </p>
      ) : null}
    </div>
  );
}

function Meter({ label, value }: { label: string; value: number | null }) {
  if (value === null) return null;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span aria-hidden className="h-1.5 w-12 overflow-hidden rounded-full bg-[var(--hover-surface)]">
        <span className="block h-full rounded-full bg-[var(--accent-solid)]" style={{ width: `${Math.min(100, Math.round(value * 300))}%` }} />
      </span>
    </span>
  );
}

/** While recording with PC audio: is it arriving, and the way to share again. */
export function ShareStatus({
  shared,
  silent,
  levels,
  onReshare,
  busy,
}: {
  shared: SharedAudio;
  silent: boolean;
  levels: SourceLevels | null;
  onReshare: () => void;
  busy: boolean;
}) {
  const t = useT();
  const problem =
    shared === "missing"
      ? t("PC audio is not being shared, so it is not in the recording. Recording carries on.")
      : shared === "ended"
        ? t("Sharing was stopped, so PC audio is no longer in the recording. Recording carries on.")
        : silent
          ? t("No PC audio for a minute. If that is not just a quiet moment, the wrong window or tab may be shared.")
          : null;
  const button = (
    <button type="button" onClick={onReshare} disabled={busy} className="btn-outline shrink-0 !px-2.5 !py-1 !text-xs">
      {busy ? t("Opening…") : problem ? t("Share again") : t("Change what is shared")}
    </button>
  );
  if (problem) {
    return (
      <div className={`${box} flex flex-wrap items-center gap-2`} role="alert">
        <span className="min-w-0 flex-1">{problem}</span>
        {button}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
      <span>{t("PC audio: shared")}</span>
      <Meter label={t("Mic")} value={levels?.mic ?? null} />
      <Meter label={t("PC")} value={levels?.display ?? null} />
      <span className="ml-auto">{button}</span>
    </div>
  );
}

/** Nobody has spoken for a long while: probably the end of the meeting, not of the recording. */
export function IdlePrompt({
  minutes,
  onEnd,
  onContinue,
}: {
  minutes: number;
  onEnd: () => void;
  onContinue: () => void;
}) {
  const t = useT();
  return (
    // Above the dock, where the eye goes to stop a recording.
    <div
      role="alertdialog"
      aria-label={t("Is the meeting over?")}
      className="fixed bottom-28 left-1/2 z-40 flex w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-2 rounded-lg border border-[color-mix(in_srgb,var(--warning)_40%,transparent)] bg-[var(--elevated)] px-4 py-3 text-sm shadow-lg"
    >
      <p className="font-medium text-[var(--foreground)]">{t("Is the meeting over?")}</p>
      <p className="text-[var(--text-secondary)]">
        {t("Nobody has spoken for {n} minutes. A recording left running keeps everything after the meeting too.", { n: minutes })}
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onContinue} className="btn-outline !px-3 !py-1 !text-xs">
          {t("Still going")}
        </button>
        <button type="button" onClick={onEnd} className="btn-ink !px-3 !py-1 !text-xs">
          {t("End the meeting…")}
        </button>
      </div>
    </div>
  );
}
