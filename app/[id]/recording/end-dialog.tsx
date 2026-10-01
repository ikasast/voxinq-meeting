"use client";

import { useEffect, useState } from "react";
import { type MinutesChoice, MinutesChoiceFields, useMinutesChoice } from "@/app/minutes-options";
import { useT } from "@/app/locale-provider";

// Ending a meeting with minutes, or with speaker separation, asks how first.
//
// Both used to be a yes/no with one checkbox, and the minutes were then written however the
// settings said: the format, the detail and the model could only be changed by writing them
// again afterwards. The choices here are the same ones Regenerate and Write them all offer
// (app/minutes-options.tsx), applied to this run only. Speaker separation asks how many people
// spoke, which is what decides whether two voices are kept apart or merged.

export type EndChoice = {
  protect: boolean;
  minutes?: MinutesChoice;
  /** Undefined: worked out from the participants, as the meeting page does. */
  speakers?: number;
};

const MAX_SPEAKERS = 10;

export function EndDialog({
  kind,
  title,
  onCancel,
  onConfirm,
}: {
  kind: "minutes" | "diarize";
  title: string;
  onCancel: () => void;
  onConfirm: (choice: EndChoice) => void;
}) {
  const t = useT();
  const opts = useMinutesChoice();
  const [protect, setProtect] = useState(false);
  const [speakers, setSpeakers] = useState("");
  const { load } = opts;

  useEffect(() => {
    if (kind === "minutes") void load();
  }, [kind, load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const confirm = () =>
    onConfirm({
      protect,
      ...(kind === "minutes" ? { minutes: opts.choice } : {}),
      ...(kind === "diarize" && speakers ? { speakers: Number(speakers) } : {}),
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        className="card max-h-[90vh] w-full max-w-md overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="section-title text-base font-semibold text-[var(--text-strong)]">{title}</h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          {kind === "minutes"
            ? t(
                "Start generating minutes and end the meeting. Generation runs in the background; check the result on the meeting page when it finishes.",
              )
            : t(
                "End the meeting and start speaker diarization. Speakers are assigned automatically on the meeting page (enrolled voices get their names); generate minutes afterwards.",
              )}
        </p>

        <div className="mt-4 space-y-3">
          {kind === "minutes" ? (
            <MinutesChoiceFields
              idPrefix="end"
              choice={opts.choice}
              onChange={opts.setChoice}
              templates={opts.templates}
              models={opts.models}
            />
          ) : (
            <div>
              <label htmlFor="end-speakers" className="label">
                {t("Number of speakers")}
              </label>
              <select
                id="end-speakers"
                value={speakers}
                onChange={(e) => setSpeakers(e.target.value)}
                className="input mt-1"
              >
                <option value="">{t("Automatic (from the participants)")}</option>
                {Array.from({ length: MAX_SPEAKERS }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={String(n)}>
                    {t(n === 1 ? "1 person" : "{n} people", { n })}
                  </option>
                ))}
              </select>
            </div>
          )}
          {kind === "minutes" ? (
            <p className="text-xs text-[var(--text-muted)]">
              {t("Applies to this run only — saved settings are unchanged.")}
            </p>
          ) : null}
        </div>

        <label className="mt-4 flex items-start gap-2 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={protect}
            onChange={(e) => setProtect(e.target.checked)}
            className="mt-0.5 accent-[var(--accent)]"
          />
          {t("Protect the recording (otherwise auto-deleted after 7 days; used for diarization / re-transcription)")}
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-soft" onClick={onCancel}>
            {t("Cancel")}
          </button>
          <button type="button" autoFocus onClick={confirm} className="btn-ink">
            {kind === "minutes" ? t("Generate minutes") : t("Diarize")}
          </button>
        </div>
      </div>
    </div>
  );
}
