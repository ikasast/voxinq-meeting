"use client";

import { useState } from "react";
import { sttHttpBase } from "@/lib/stt/client";
import { DownloadIcon } from "../icons";

type PartId = "minutes" | "transcript" | "meta" | "recording";

// Download the whole meeting: minutes / transcript / meeting info (zip via the export
// API) and, optionally, the recording WAV (fetched from the STT host as its own file
// since it can be hundreds of MB). Everything is checked by default; untick to pick.
export function DownloadMeetingButton({
  meetingId,
  title,
  hasMinutes,
  hasTranscript,
}: {
  meetingId: string;
  title: string;
  hasMinutes: boolean;
  hasTranscript: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasRecording, setHasRecording] = useState<boolean | null>(null);
  const [checked, setChecked] = useState<Record<PartId, boolean>>({
    minutes: hasMinutes,
    transcript: hasTranscript,
    meta: true,
    recording: false, // enabled once the STT host confirms the WAV exists
  });

  const toggleOpen = () => {
    setOpen((v) => !v);
    setError(null);
    if (hasRecording === null) {
      fetch(`${sttHttpBase()}/recordings/${meetingId}`, { signal: AbortSignal.timeout(5000) })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { exists?: boolean } | null) => {
          const exists = Boolean(d?.exists);
          setHasRecording(exists);
          setChecked((c) => ({ ...c, recording: exists }));
        })
        .catch(() => setHasRecording(false));
    }
  };

  const saveBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const run = async () => {
    const textParts = (["minutes", "transcript", "meta"] as const).filter((p) => checked[p]);
    const wantRecording = checked.recording && hasRecording;
    if (textParts.length === 0 && !wantRecording) return;
    setBusy(true);
    setError(null);
    try {
      if (textParts.length > 0) {
        const res = await fetch(`/api/meetings/${meetingId}/export?parts=${textParts.join(",")}`);
        if (!res.ok) {
          const d = await res.json().catch(() => null);
          throw new Error(d?.error ?? `Export failed (HTTP ${res.status})`);
        }
        const blob = await res.blob();
        const ext = textParts.length > 1 ? "zip" : textParts[0] === "transcript" ? "txt" : "md";
        const suffix = textParts.length > 1 ? "" : `-${textParts[0]}`;
        saveBlob(blob, `${title}${suffix}.${ext}`);
      }
      if (wantRecording) {
        const res = await fetch(`${sttHttpBase()}/recordings/${meetingId}/audio`);
        if (!res.ok) throw new Error(`Recording download failed (HTTP ${res.status})`);
        saveBlob(await res.blob(), `${title}.wav`);
      }
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(false);
    }
  };

  const rows: { id: PartId; label: string; available: boolean; note?: string }[] = [
    { id: "minutes", label: "Minutes (.md)", available: hasMinutes },
    { id: "transcript", label: "Transcript (.txt)", available: hasTranscript },
    {
      id: "meta",
      label: "Meeting info (.md)",
      available: true,
      note: "title, purpose & agenda, speakers, LLM/transcription settings",
    },
    {
      id: "recording",
      label: "Recording (.wav)",
      available: Boolean(hasRecording),
      note:
        hasRecording === null
          ? "checking…"
          : hasRecording
            ? "downloads as a separate file"
            : "no recording (expired or not saved)",
    },
  ];
  const anySelected = rows.some((r) => r.available && checked[r.id]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggleOpen}
        className="btn-icon"
        title="Download meeting (minutes / transcript / info / recording)"
        aria-label="Download meeting"
        aria-expanded={open}
      >
        <DownloadIcon />
      </button>
      {open ? (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute right-0 z-20 mt-1 w-72 rounded-md border border-[var(--border-strong)] bg-[var(--elevated)] p-3 shadow-lg">
            <p className="mb-2 text-xs font-medium text-[var(--text-secondary)]">Download</p>
            <div className="space-y-1.5">
              {rows.map((r) => (
                <label
                  key={r.id}
                  className={`flex items-start gap-2 text-xs ${
                    r.available ? "text-[var(--text-secondary)]" : "text-[var(--text-muted)] opacity-60"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={r.available && checked[r.id]}
                    disabled={!r.available || busy}
                    onChange={(e) => setChecked((c) => ({ ...c, [r.id]: e.target.checked }))}
                  />
                  <span>
                    {r.label}
                    {r.note ? (
                      <span className="block text-[10px] text-[var(--text-muted)]">{r.note}</span>
                    ) : null}
                  </span>
                </label>
              ))}
            </div>
            {error ? <p className="mt-2 text-xs text-[var(--error)]">{error}</p> : null}
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} disabled={busy} className="btn-outline !px-3 !py-1 text-xs">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void run()}
                disabled={busy || !anySelected}
                className="btn-ink !px-3 !py-1 text-xs"
              >
                {busy ? "Preparing…" : "Download"}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
