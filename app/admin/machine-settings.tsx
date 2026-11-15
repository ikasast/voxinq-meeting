"use client";

import { useEffect, useState } from "react";
import { useT } from "@/app/locale-provider";
import { FieldRow } from "@/app/field-row";
import { RetentionFields } from "@/app/settings/retention-fields";
import { WHISPER_MODELS, isKnownWhisperModel, modelSizeGuide, whisperModel } from "@/lib/stt/models";

// Administration → This machine: what there is one of — the recognition model on the one
// transcription service, how much of the one GPU queued work may use, and how long this disk
// keeps recordings and the trash. Each saves as it is changed, through the settings API, which
// lets only an administrator write these.

type Machine = {
  whisperModel: string;
  vramBudgetMb: number;
  recordingRetentionDays: number;
  trashRetentionDays: number;
  timeZone: string;
};

/** Every zone the browser knows, or null on one too old to list them. */
function timeZones(): string[] | null {
  try {
    return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? null;
  } catch {
    return null;
  }
}

const INPUT = "input";

export function MachineSettings() {
  const t = useT();
  const [values, setValues] = useState<Machine | null>(null);
  const [vram, setVram] = useState("");
  const [status, setStatus] = useState<"saving" | "saved" | "failed" | null>(null);

  useEffect(() => {
    void fetch("/api/settings", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Machine>) : null))
      .then((d) => {
        if (!d) return;
        setValues(d);
        setVram(d.vramBudgetMb ? String(d.vramBudgetMb) : "");
      })
      .catch(() => setStatus("failed"));
  }, []);

  const save = async (patch: Partial<Machine>) => {
    setValues((v) => (v ? { ...v, ...patch } : v));
    setStatus("saving");
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      setStatus(res.ok ? "saved" : "failed");
    } catch {
      setStatus("failed");
    }
  };

  if (!values) return <p className="text-sm text-[var(--text-muted)]">{t("Loading…")}</p>;

  // The model labels, in the reader's language: module-level constants have no hook to reach it.
  const modelLabel = (label: string) =>
    ({
      "large-v3-turbo (default; fast and accurate)": t("large-v3-turbo (default; fast and accurate)"),
      "large-v3 (accurate)": t("large-v3 (accurate)"),
      "small (light)": t("small (light)"),
      "kotoba-whisper-v2.0 (Japanese only)": t("kotoba-whisper-v2.0 (Japanese only)"),
    })[label] ?? label;
  const note = whisperModel(values.whisperModel)?.note;

  return (
    <div>
      <p aria-live="polite" className="mb-2 h-4 text-xs">
        {status === "saving" ? (
          <span className="text-[var(--text-muted)]">{t("Saving…")}</span>
        ) : status === "saved" ? (
          <span className="text-[var(--success)]">{t("Saved")}</span>
        ) : status === "failed" ? (
          <span className="text-[var(--error)]">{t("Not saved")}</span>
        ) : null}
      </p>

      <FieldRow
        label={t("Recognition model")}
        htmlFor="whisperModel"
        hint={
          <>
            <p>{t("Memory each needs: {guide}. Downloaded on first use.", { guide: modelSizeGuide() })}</p>
            {note ? (
              <p>
                {note === "Distilled on Japanese speech — faster and more accurate for Japanese, but the transcription language is forced to Japanese, it adds little punctuation, and the glossary is skipped for it."
                  ? t(
                      "Distilled on Japanese speech — faster and more accurate for Japanese, but the transcription language is forced to Japanese, it adds little punctuation, and the glossary is skipped for it.",
                    )
                  : note}
              </p>
            ) : null}
          </>
        }
      >
        <select
          id="whisperModel"
          value={values.whisperModel}
          onChange={(e) => void save({ whisperModel: e.target.value })}
          className={`${INPUT} max-w-sm`}
        >
          {WHISPER_MODELS.map((m) => (
            <option key={m.value} value={m.value}>
              {modelLabel(m.label)}
            </option>
          ))}
          {isKnownWhisperModel(values.whisperModel) ? null : (
            <option value={values.whisperModel}>{t("{model} (custom)", { model: values.whisperModel })}</option>
          )}
        </select>
      </FieldRow>

      <FieldRow
        label={t("GPU budget for queued work")}
        htmlFor="vramBudgetMb"
        hint={t("Megabytes of video memory queued work may use at once. Empty: worked out from the card.")}
      >
        <input
          id="vramBudgetMb"
          type="number"
          min={0}
          step={512}
          value={vram}
          onChange={(e) => setVram(e.target.value)}
          onBlur={() => {
            const n = Math.max(0, Number(vram) || 0);
            if (n !== values.vramBudgetMb && (n === 0 || n >= 512)) void save({ vramBudgetMb: n });
          }}
          placeholder={t("Auto")}
          className={`${INPUT} max-w-xs`}
        />
      </FieldRow>

      <TimeZoneField value={values.timeZone} onSave={(tz) => void save({ timeZone: tz })} />

      <RetentionFields
        recordingDays={values.recordingRetentionDays}
        trashDays={values.trashRetentionDays}
        isAdmin
        inputClass={INPUT}
        onRecording={(d) => void save({ recordingRetentionDays: d })}
        onTrash={(d) => void save({ trashRetentionDays: d })}
      />
    </div>
  );
}

/**
 * The zone meeting dates are written in (lib/time-zone.ts). Empty leaves it to TZ in `.env`, or
 * UTC without one. This browser's own zone is offered first, since it is usually the answer.
 */
function TimeZoneField({ value, onSave }: { value: string; onSave: (tz: string) => void }) {
  const t = useT();
  const [zones] = useState(timeZones);
  const [typed, setTyped] = useState(value);
  const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const hint = t("The clock meeting dates are shown in. Empty: TZ in .env, or UTC without it.");

  if (!zones) {
    return (
      <FieldRow label={t("Time zone")} htmlFor="timeZone" hint={hint}>
        <input
          id="timeZone"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onBlur={() => typed.trim() !== value && onSave(typed.trim())}
          placeholder={here}
          className={`${INPUT} max-w-xs`}
        />
      </FieldRow>
    );
  }
  return (
    <FieldRow label={t("Time zone")} htmlFor="timeZone" hint={hint}>
      <select id="timeZone" value={value} onChange={(e) => onSave(e.target.value)} className={`${INPUT} max-w-xs`}>
        <option value="">{t("From the server (TZ)")}</option>
        {here && zones.includes(here) ? <option value={here}>{t("{zone} (this browser)", { zone: here })}</option> : null}
        {zones
          .filter((z) => z !== here)
          .map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        {value && !zones.includes(value) ? <option value={value}>{value}</option> : null}
      </select>
    </FieldRow>
  );
}
