"use client";

import { useState } from "react";
import { useT } from "../locale-provider";

// What to press, in order, on the sample meeting.
//
// A card at the top of the page rather than an overlay tour. An overlay has to know where every
// control is, which means a second description of the interface that goes stale silently the
// first time one moves — and this codebase has found that failure twice already. A numbered list
// naming the buttons costs nothing to keep true, and stays readable while somebody scrolls past
// it and works.
//
// **Two steps are missing from it deliberately.** Recording and separating speakers both need
// the audio, and a sample meeting has none — the Diarize button does not even render without a
// recording. Rather than mention two things that cannot be pressed here, the card says which
// two they are and where to try them for real.

export function FirstRunGuide({ recordingHref }: { recordingHref: string }) {
  const t = useT();
  const [open, setOpen] = useState(true);

  if (!open) return null;

  const steps: { label: string; body: string }[] = [
    {
      label: t("The speaker names"),
      body: t(
        "Three speakers, already separated — this is what diarization produces. Rename one and every line by that person changes with it.",
      ),
    },
    {
      label: t("Suggest fixes"),
      body: t(
        "Two product names in here are written the way speech recognition mishears them. This asks the model to find exactly those and offers each as a change you accept or refuse.",
      ),
    },
    {
      label: t("Find & replace"),
      body: t(
        "For a word that came out wrong the same way throughout. Preview shows every line it would touch before anything changes.",
      ),
    },
    {
      label: t("Generate minutes"),
      body: t(
        "Nothing is written yet — pressing this runs the real model on the text above. A meeting this short takes seconds; a real one takes longer and waits in the queue.",
      ),
    },
    {
      label: t("Share, or download"),
      body: t("Markdown, Word or PDF, and the meeting's own ⬇ bundles the transcript with it."),
    },
  ];

  return (
    <section className="card border-[var(--accent)] p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t("Your first run")}</h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {t(
              "This is sample data. Everything below is the real thing acting on it, so break it as much as you like — then delete it from the meeting list.",
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="shrink-0 text-sm text-[var(--text-muted)] hover:text-[var(--text-strong)]"
          aria-label={t("Dismiss")}
        >
          ✕
        </button>
      </div>

      <ol className="space-y-1.5 text-xs text-[var(--text-secondary)]">
        {steps.map((s, i) => (
          <li key={s.label} className="flex gap-2">
            <span className="shrink-0 font-semibold text-[var(--accent-sub)]">{i + 1}.</span>
            <span>
              <strong className="text-[var(--text-strong)]">{s.label}</strong>
              {" — "}
              {s.body}
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-3 border-t border-[var(--border)] pt-2 text-xs text-[var(--text-muted)]">
        {t(
          "Recording and separating speakers are not on this list because both need the audio, and a sample meeting has none.",
        )}{" "}
        <a href={recordingHref} className="text-[var(--accent-sub)] underline">
          {t("Record a real one")}
        </a>{" "}
        {t("to try those — check the microphone first, which is the one step worth never skipping.")}
      </p>
    </section>
  );
}
