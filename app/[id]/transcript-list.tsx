"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatOffset, formatTime } from "@/lib/utils";
import {
  type SpeakerLabels,
  SELF_KEY,
  collectSpeakerKeys,
  diarizerLabelToKey,
  parseSpeakerLabels,
  speakerName,
} from "@/lib/speakers";
import { sttHttpBase } from "@/lib/stt/client";
import { useConfirm } from "../confirm-dialog";
import { useGpuBusy } from "../use-gpu-busy";
import { SpeakerBadge, SpeakerManager, SpeakerReassignSelect } from "./speakers-ui";
import { ShareButton } from "./share-button";

type Item = { id: string; speakerType: string; text: string; createdAt: string };

// State of the recording (WAV) saved on the GPU host. exists=false means not-yet-saved or expired/deleted.
type RecordingInfo = {
  exists: boolean;
  protected?: boolean;
  expiresAt?: string | null;
  firstUtteranceStart?: number; // start seconds of the first utterance within the WAV (for mapping playback position)
};

function remainingDays(expiresAt: string): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / 86400000));
}

const RETRANS_MODELS = [
  { value: "", label: "Same as settings" },
  { value: "large-v3-turbo", label: "large-v3-turbo (accurate & fast)" },
  { value: "large-v3", label: "large-v3 (accurate)" },
  { value: "distil-large-v3", label: "distil-large-v3" },
  { value: "medium", label: "medium" },
  { value: "small", label: "small (light)" },
];

// Post-meeting transcript. Supports recording playback, auto diarization, speaker renaming, and re-transcription.
export function TranscriptList({
  meetingId,
  meetingTitle,
  meetingStartedAt,
  initialTranscripts,
  initialSpeakerLabels,
}: {
  meetingId: string;
  meetingTitle: string;
  meetingStartedAt: string;
  initialTranscripts: Item[];
  initialSpeakerLabels: string | null;
}) {
  const [transcripts, setTranscripts] = useState<Item[]>(initialTranscripts);
  const [speakerLabels, setSpeakerLabels] = useState<SpeakerLabels>(
    parseSpeakerLabels(initialSpeakerLabels),
  );
  const [error, setError] = useState<string | null>(null);
  const [numSpeakers, setNumSpeakers] = useState<string>("");
  const [diarizing, setDiarizing] = useState(false);
  const [diarStatus, setDiarStatus] = useState<string | null>(null);
  const [diarWarn, setDiarWarn] = useState<string | null>(null);
  const [recInfo, setRecInfo] = useState<RecordingInfo | null>(null);
  const [recBusy, setRecBusy] = useState(false);
  const [retransing, setRetransing] = useState(false);
  const [retransStatus, setRetransStatus] = useState<string | null>(null);
  const [retransModel, setRetransModel] = useState("");
  const [toolsOpen, setToolsOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const confirm = useConfirm();

  const startedMs = useMemo(() => Date.parse(meetingStartedAt), [meetingStartedAt]);

  // Fetch the recording (WAV) retention state from STT (stays hidden if unreachable, e.g. external access).
  useEffect(() => {
    let cancelled = false;
    fetch(`${sttHttpBase()}/recordings/${meetingId}`, { signal: AbortSignal.timeout(6000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: RecordingInfo | null) => {
        if (!cancelled && d) setRecInfo(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [meetingId]);

  // The transcript timeline uses "elapsed time within the recording".
  // The origin (0:00) is the first utterance, so it is unaffected by the meeting-creation-to-recording-start gap (wall-clock skew).
  const anchorMs = useMemo(
    () => (transcripts.length > 0 ? Date.parse(transcripts[0].createdAt) : startedMs),
    [transcripts, startedMs],
  );
  const elapsedSeconds = useCallback(
    (createdAt: string) => Math.max(0, (Date.parse(createdAt) - anchorMs) / 1000),
    [anchorMs],
  );
  // Playback position within the WAV = first utterance's start in the WAV + elapsed time.
  const wavPosition = useCallback(
    (createdAt: string) => (recInfo?.firstUtteranceStart ?? 0) + elapsedSeconds(createdAt),
    [recInfo, elapsedSeconds],
  );

  const seekTo = useCallback((seconds: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, seconds);
    void el.play().catch(() => {});
  }, []);

  const toggleProtect = useCallback(async () => {
    if (!recInfo?.exists) return;
    setRecBusy(true);
    try {
      const res = await fetch(
        `${sttHttpBase()}/recordings/${meetingId}/protect?on=${!recInfo.protected}`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRecInfo((await res.json()) as RecordingInfo);
    } catch (e) {
      setError(`Failed to change protection: ${(e as Error).message}`);
    } finally {
      setRecBusy(false);
    }
  }, [recInfo, meetingId]);

  const reassignKeys = useMemo(
    () => collectSpeakerKeys(transcripts.map((t) => t.speakerType), speakerLabels),
    [transcripts, speakerLabels],
  );
  const selfUsed = useMemo(
    () => transcripts.some((t) => t.speakerType === SELF_KEY) || Boolean(speakerLabels[SELF_KEY]),
    [transcripts, speakerLabels],
  );
  const managerKeys = useMemo(
    () => (selfUsed ? reassignKeys : reassignKeys.filter((k) => k !== SELF_KEY)),
    [reassignKeys, selfUsed],
  );
  // Show the speaker badge/reassign on a row only when there are 2 or more speakers.
  const multiSpeaker = reassignKeys.length > 1;

  const transcriptText = useMemo(
    () =>
      transcripts
        .map((t) => (multiSpeaker ? `${speakerName(t.speakerType, speakerLabels)}: ${t.text}` : t.text))
        .join("\n"),
    [transcripts, speakerLabels, multiSpeaker],
  );

  const reassignSpeaker = useCallback(
    async (transcriptId: string, nextKey: string) => {
      const snapshot = transcripts;
      setTranscripts((list) =>
        list.map((t) => (t.id === transcriptId ? { ...t, speakerType: nextKey } : t)),
      );
      const res = await fetch(`/api/transcripts/${transcriptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speakerType: nextKey }),
      }).catch(() => null);
      if (!res || !res.ok) {
        setTranscripts(snapshot);
        setError(`Failed to change speaker (${res ? `HTTP ${res.status}` : "connection error"})`);
      }
    },
    [transcripts],
  );

  const renameSpeaker = useCallback(
    async (key: string, name: string) => {
      const updated = { ...speakerLabels, [key]: name };
      setSpeakerLabels(updated);
      const res = await fetch(`/api/meetings/${meetingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speakerLabels: updated }),
      }).catch(() => null);
      if (!res || !res.ok) {
        setError(`Failed to save speaker name (${res ? `HTTP ${res.status}` : "connection error"})`);
      }
    },
    [speakerLabels, meetingId],
  );

  const retranscribe = useCallback(async () => {
    const ok = await confirm({
      title: "Re-transcribe from the recording",
      message:
        "Replace the current transcript (including speaker assignments and manual edits) with a fresh recognition from the recording. You can re-run auto-diarization afterward.",
      confirmLabel: "Re-transcribe",
      danger: true,
    });
    if (!ok) return;
    setError(null);
    setRetransing(true);
    setRetransStatus("Starting transcription…");
    try {
      const settings = (await fetch("/api/settings")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)) as {
        whisperModel?: string;
        sttLanguage?: string;
        sttGlossary?: string;
      } | null;

      const base = sttHttpBase();
      const startRes = await fetch(`${base}/transcribe/${meetingId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: settings?.sttLanguage,
          model: retransModel || settings?.whisperModel,
          initialPrompt: settings?.sttGlossary,
        }),
      });
      if (!startRes.ok) {
        const d = await startRes.json().catch(() => null);
        throw new Error(d?.detail ?? `Failed to start (HTTP ${startRes.status})`);
      }
      let job = (await startRes.json()) as {
        status: string;
        utterances?: { start: number; end: number; text: string }[];
        detail?: string;
      };
      while (job.status === "running") {
        setRetransStatus("Recognizing… (this can take a few minutes including model load; you can leave this page open)");
        await new Promise((r) => setTimeout(r, 4000));
        const sres = await fetch(`${base}/transcribe/${meetingId}/status`);
        job = (await sres.json()) as typeof job;
      }
      if (job.status === "error") throw new Error(job.detail ?? "Transcription failed");
      if (job.status !== "done" || !Array.isArray(job.utterances)) {
        throw new Error("Invalid transcription result");
      }

      setRetransStatus("Replacing the transcript…");
      const applyRes = await fetch(`/api/meetings/${meetingId}/apply-transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ utterances: job.utterances }),
      });
      if (!applyRes.ok) {
        const d = await applyRes.json().catch(() => null);
        throw new Error(d?.error ?? `Failed to apply (HTTP ${applyRes.status})`);
      }
      const applied = (await applyRes.json()) as { replaced: number; transcripts: Item[] };
      setTranscripts(applied.transcripts);
      setDiarStatus(null);
      setDiarWarn(null);
      setRetransStatus(
        `Done: replaced with ${applied.replaced} utterances. Run "Auto-diarize" to distinguish speakers.`,
      );
    } catch (e) {
      setError(`Re-transcription failed: ${(e as Error).message}`);
      setRetransStatus(null);
    } finally {
      setRetransing(false);
    }
  }, [confirm, meetingId, retransModel]);

  const runDiarization = useCallback(async () => {
    setError(null);
    setDiarWarn(null);
    setDiarizing(true);
    setDiarStatus("Starting diarization…");
    try {
      const base = sttHttpBase();
      const qs = new URLSearchParams({ force: "true" });
      if (numSpeakers.trim()) qs.set("num_speakers", numSpeakers.trim());
      const startRes = await fetch(`${base}/diarize/${meetingId}?${qs}`, { method: "POST" });
      if (!startRes.ok) {
        const d = await startRes.json().catch(() => null);
        throw new Error(d?.detail ?? `Failed to start (HTTP ${startRes.status})`);
      }
      let data = (await startRes.json()) as { status: string; speakers?: string[]; detail?: string };
      while (data.status === "running") {
        setDiarStatus("Analyzing… (longer meetings take longer; you can leave this page open)");
        await new Promise((r) => setTimeout(r, 4000));
        const sres = await fetch(`${base}/diarize/${meetingId}/status`);
        data = (await sres.json()) as typeof data;
      }
      if (data.status === "error") throw new Error(data.detail ?? "Diarization failed");
      if (data.status !== "done" || !Array.isArray(data.speakers)) {
        throw new Error("Invalid diarization result");
      }
      const speakers = data.speakers;

      setDiarStatus("Applying results to the transcript…");
      const applyRes = await fetch(`/api/meetings/${meetingId}/apply-speakers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speakers }),
      });
      if (!applyRes.ok) {
        const d = await applyRes.json().catch(() => null);
        throw new Error(d?.error ?? `Failed to apply (HTTP ${applyRes.status})`);
      }
      const applied = (await applyRes.json()) as {
        updated: number;
        transcriptCount?: number;
        speakerCount?: number;
        speakerKeys?: string[];
      };
      setTranscripts((list) =>
        list.map((t, i) =>
          i < speakers.length ? { ...t, speakerType: diarizerLabelToKey(speakers[i]) } : t,
        ),
      );

      const distinct = applied.speakerKeys?.length ?? 0;
      const wanted = numSpeakers.trim() ? Number(numSpeakers.trim()) : 0;
      const missed = (applied.transcriptCount ?? 0) - (applied.speakerCount ?? 0);
      if (distinct <= 1 || (wanted && distinct < wanted) || missed > 0) {
        setDiarStatus(null);
        setDiarWarn(
          `Only ${distinct} speaker(s) detected. The recording may be short or have few utterances. ` +
            "Try a longer conversation (both sides speaking multiple times), or assign speakers manually per line.",
        );
      } else {
        setDiarWarn(null);
        setDiarStatus(
          `Done: assigned speakers to ${applied.updated} lines (${distinct} speakers). ` +
            'Name each speaker under "Speaker names" below.',
        );
      }
    } catch (e) {
      setError(`Diarization failed: ${(e as Error).message}`);
      setDiarStatus(null);
    } finally {
      setDiarizing(false);
    }
  }, [meetingId, numSpeakers]);

  const gpu = useGpuBusy();
  // Diarization and re-transcription both use the GPU. Block starting one while any other
  // GPU task (minutes generation, or an STT job we didn't start) is running.
  const gpuBlocked = gpu.busy && !diarizing && !retransing;
  const busy = diarizing || retransing || gpuBlocked;

  return (
    <details open>
      <summary className="cursor-pointer text-lg font-semibold text-[var(--text-strong)]">
        Transcript ({transcripts.length})
      </summary>

      {/* Recording player + protection state (only when a recording remains) */}
      {recInfo?.exists ? (
        <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--elevated)] px-3 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <audio
              ref={audioRef}
              controls
              preload="metadata"
              src={`${sttHttpBase()}/recordings/${meetingId}/audio`}
              className="h-9 min-w-0 flex-1"
            />
          </div>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Click a timestamp to play from that point.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
            <span>
              Recording:{" "}
              {recInfo.protected ? (
                <span className="text-[var(--accent-sub)]">protected (not auto-deleted)</span>
              ) : recInfo.expiresAt ? (
                <>auto-deletes in {remainingDays(recInfo.expiresAt)} day(s)</>
              ) : (
                "saved"
              )}
            </span>
            <button
              type="button"
              onClick={() => void toggleProtect()}
              disabled={recBusy}
              className="rounded-md border border-[var(--border-strong)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--hover-surface)] disabled:opacity-50"
            >
              {recBusy ? "Updating…" : recInfo.protected ? "Unprotect" : "Protect"}
            </button>
          </div>
        </div>
      ) : null}

      {/* Top toolbar: share, and toggle for the edit tools */}
      {transcripts.length > 0 || recInfo?.exists ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          {transcripts.length > 0 ? (
            <ShareButton
              text={transcriptText}
              title={`${meetingTitle} transcript`}
              label="Share transcript"
              filename={`${meetingTitle}-transcript.txt`}
            />
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => setToolsOpen((v) => !v)}
            className="btn-outline"
            aria-expanded={toolsOpen}
          >
            Edit tools {toolsOpen ? "▲" : "▼"}
          </button>
        </div>
      ) : null}

      {/* Edit tools (diarization, speaker names, re-transcription). Collapsed by default */}
      {toolsOpen && (transcripts.length > 0 || recInfo?.exists) ? (
        <div className="mt-3 space-y-4 rounded-lg border border-[var(--border)] bg-[var(--elevated)] p-4">
          {transcripts.length > 0 ? (
            <section>
              <p className="mb-1.5 text-xs font-medium text-[var(--text-secondary)]">
                1. Auto-diarize speakers
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                  Participants
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={numSpeakers}
                    onChange={(e) => setNumSpeakers(e.target.value)}
                    disabled={busy}
                    placeholder="auto"
                    className="w-16 rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] disabled:opacity-60"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void runDiarization()}
                  disabled={busy}
                  className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] disabled:opacity-50"
                >
                  {diarizing ? "Diarizing…" : "Auto-diarize"}
                </button>
                <span className="text-xs text-[var(--text-muted)]">
                  Analyzes the recording and assigns a speaker to each line (entering the count improves accuracy).
                </span>
              </div>
              {diarStatus ? <p className="mt-2 text-xs text-[var(--accent-sub)]">{diarStatus}</p> : null}
              {diarWarn ? <p className="mt-2 text-xs text-[var(--warning)]">{diarWarn}</p> : null}

              {managerKeys.length > 0 ? (
                <>
                  <p className="mb-1.5 mt-3 text-xs font-medium text-[var(--text-secondary)]">
                    2. Speaker names (edits apply to all lines)
                  </p>
                  <SpeakerManager
                    speakerKeys={managerKeys}
                    labels={speakerLabels}
                    onRename={renameSpeaker}
                  />
                </>
              ) : null}
            </section>
          ) : null}

          {recInfo?.exists ? (
            <section className="border-t border-[var(--border)] pt-3">
              <p className="mb-1.5 text-xs font-medium text-[var(--text-secondary)]">
                {transcripts.length > 0 ? "3. " : ""}Re-transcribe from the recording
              </p>
              {transcripts.length === 0 ? (
                <p className="mb-2 text-xs text-[var(--text-muted)]">
                  There is no transcript, but the recording remains. You can restore it from here.
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                  Model
                  <select
                    value={retransModel}
                    onChange={(e) => setRetransModel(e.target.value)}
                    disabled={busy}
                    className="rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] disabled:opacity-60"
                  >
                    {RETRANS_MODELS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => void retranscribe()}
                  disabled={busy}
                  className="rounded-md border border-[var(--border-strong)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--hover-surface)] disabled:opacity-50"
                >
                  {retransing ? "Recognizing…" : "Re-transcribe"}
                </button>
                <span className="text-xs text-[var(--text-muted)]">
                  Re-recognizes the whole recording and replaces the transcript.
                </span>
              </div>
              {retransStatus ? (
                <p className="mt-2 text-xs text-[var(--accent-sub)]">{retransStatus}</p>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-[var(--error)]">{error}</p> : null}
      {gpuBlocked ? (
        <p className="mt-2 text-xs text-[var(--warning)]">
          {gpu.label ?? "A GPU task is running"} — diarization / re-transcription can be used once it finishes.
        </p>
      ) : null}

      {transcripts.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--text-muted)]">No transcript.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {transcripts.map((t) => (
            <TranscriptRow
              key={t.id}
              item={t}
              elapsed={elapsedSeconds(t.createdAt)}
              labels={speakerLabels}
              reassignKeys={reassignKeys}
              showSpeaker={multiSpeaker}
              canSeek={Boolean(recInfo?.exists)}
              onSeek={() => seekTo(wavPosition(t.createdAt))}
              onReassign={(nextKey) => void reassignSpeaker(t.id, nextKey)}
            />
          ))}
        </ul>
      )}
    </details>
  );
}

// A single utterance. Shows elapsed time within the recording (0:00 origin); click to seek there.
// The wall-clock time is available in the tooltip. Speaker is shown only with multiple speakers.
function TranscriptRow({
  item,
  elapsed,
  labels,
  reassignKeys,
  showSpeaker,
  canSeek,
  onSeek,
  onReassign,
}: {
  item: Item;
  elapsed: number;
  labels: SpeakerLabels;
  reassignKeys: string[];
  showSpeaker: boolean;
  canSeek: boolean;
  onSeek: () => void;
  onReassign: (nextKey: string) => void;
}) {
  return (
    <li className="rounded border border-[var(--border)] bg-[var(--elevated)] px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        {canSeek ? (
          <button
            type="button"
            onClick={onSeek}
            title={`Play from here (${formatTime(item.createdAt)})`}
            className="text-xs tabular-nums text-[var(--accent-sub)] hover:underline"
          >
            ▶ {formatOffset(elapsed)}
          </button>
        ) : (
          <span
            className="text-xs tabular-nums text-[var(--text-muted)]"
            title={formatTime(item.createdAt)}
          >
            {formatOffset(elapsed)}
          </span>
        )}
        {showSpeaker ? <SpeakerBadge speakerKey={item.speakerType} labels={labels} /> : null}
        <span className="grow" />
        {showSpeaker ? (
          <SpeakerReassignSelect
            value={item.speakerType}
            speakerKeys={reassignKeys}
            labels={labels}
            onChange={onReassign}
          />
        ) : null}
      </div>
      <p className="mt-1 whitespace-pre-wrap">{item.text}</p>
    </li>
  );
}
