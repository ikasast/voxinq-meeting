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
  seriesGlossary,
  readOnly = false,
}: {
  meetingId: string;
  meetingTitle: string;
  meetingStartedAt: string;
  initialTranscripts: Item[];
  initialSpeakerLabels: string | null;
  seriesGlossary: string | null;
  // External (read-only) access can view/play/share but not diarize, re-transcribe or reassign.
  readOnly?: boolean;
}) {
  const [transcripts, setTranscripts] = useState<Item[]>(initialTranscripts);
  const [speakerLabels, setSpeakerLabels] = useState<SpeakerLabels>(
    parseSpeakerLabels(initialSpeakerLabels),
  );
  const [error, setError] = useState<string | null>(null);
  const [numSpeakers, setNumSpeakers] = useState<string>("");
  const [diarizing, setDiarizing] = useState(false);
  const [stoppingDiar, setStoppingDiar] = useState(false);
  const stopDiarRef = useRef(false); // set by the Stop button to break the polling loop
  const [diarStatus, setDiarStatus] = useState<string | null>(null);
  const [diarWarn, setDiarWarn] = useState<string | null>(null);
  const [recInfo, setRecInfo] = useState<RecordingInfo | null>(null);
  const [recBusy, setRecBusy] = useState(false);
  const [retransing, setRetransing] = useState(false);
  const [retransStatus, setRetransStatus] = useState<string | null>(null);
  const [retransModel, setRetransModel] = useState("");
  const [retransOpen, setRetransOpen] = useState(false);
  const [profiles, setProfiles] = useState<{ name: string }[]>([]);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const confirm = useConfirm();

  // Enroll voiceprints from this meeting's diarized clusters (named speakers only).
  const saveVoiceProfiles = useCallback(async () => {
    setProfileBusy(true);
    setProfileMsg(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/save-voice-profiles`, {
        method: "POST",
      });
      const d = (await res.json().catch(() => null)) as
        | { saved?: string[]; error?: string }
        | null;
      if (!res.ok) throw new Error(d?.error ?? `HTTP ${res.status}`);
      setProfileMsg(`Saved voice profiles: ${(d?.saved ?? []).join(", ")}`);
      const list = (await fetch("/api/speaker-profiles").then((r) => r.json())) as {
        name: string;
      }[];
      setProfiles(list);
    } catch (e) {
      setProfileMsg((e as Error).message);
    } finally {
      setProfileBusy(false);
    }
  }, [meetingId]);

  const deleteProfile = useCallback(async (name: string) => {
    try {
      await fetch(`/api/speaker-profiles?name=${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      setProfiles((list) => list.filter((p) => p.name !== name));
    } catch {
      // best-effort
    }
  }, []);

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
  // The speaker-name tools appear once diarization has produced speakers to name.
  const showSpeakerTools = managerKeys.length > 0 && !readOnly;

  // Enrolled voice profiles (shown alongside the speaker names).
  useEffect(() => {
    if (!showSpeakerTools) return;
    let cancelled = false;
    fetch("/api/speaker-profiles")
      .then((r) => (r.ok ? r.json() : null))
      .then((list: { name: string }[] | null) => {
        if (!cancelled && list) setProfiles(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [showSpeakerTools]);

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
          // Global glossary + this meeting's series glossary (if any).
          initialPrompt:
            [settings?.sttGlossary, seriesGlossary].filter(Boolean).join("、") || undefined,
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
        `Done: replaced with ${applied.replaced} utterances. Run "Diarize" to distinguish speakers.`,
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
    stopDiarRef.current = false;
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
      let data = (await startRes.json()) as {
        status: string;
        speakers?: string[];
        embeddings?: Record<string, number[]>;
        detail?: string;
      };
      while (data.status === "running") {
        if (stopDiarRef.current) break;
        setDiarStatus("Analyzing… (longer meetings take longer; you can leave this page open)");
        await new Promise((r) => setTimeout(r, 4000));
        const sres = await fetch(`${base}/diarize/${meetingId}/status`);
        data = (await sres.json()) as typeof data;
      }
      if (stopDiarRef.current) {
        setDiarStatus("Stopped.");
        return; // don't apply partial/aborted results
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

      // Voiceprints: store the cluster embeddings on the meeting and auto-name any
      // clusters that match enrolled voice profiles (never overwrites manual names).
      let recognized: string[] = [];
      try {
        const embRes = await fetch(`/api/meetings/${meetingId}/diarization-embeddings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ embeddings: data.embeddings ?? {} }),
        });
        if (embRes.ok) {
          const emb = (await embRes.json()) as {
            labels: SpeakerLabels;
            matched: Record<string, string>;
          };
          setSpeakerLabels(emb.labels);
          recognized = Object.values(emb.matched);
        }
      } catch {
        // voiceprint matching is best-effort; diarization itself already succeeded
      }

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
        const recognizedNote =
          recognized.length > 0
            ? ` Recognized by voiceprint: ${recognized.join(", ")}.`
            : "";
        setDiarStatus(
          `Done: assigned speakers to ${applied.updated} lines (${distinct} speakers).` +
            recognizedNote +
            ' Name the rest under "Speaker names" below.',
        );
      }
    } catch (e) {
      setError(`Diarization failed: ${(e as Error).message}`);
      setDiarStatus(null);
    } finally {
      setDiarizing(false);
    }
  }, [meetingId, numSpeakers]);

  // Force-stop a running diarization: tell STT to kill the subprocess and break the poll loop.
  const stopDiarization = useCallback(async () => {
    stopDiarRef.current = true;
    setStoppingDiar(true);
    setDiarStatus("Stopping…");
    try {
      await fetch(`${sttHttpBase()}/diarize/${meetingId}/cancel`, {
        method: "POST",
        signal: AbortSignal.timeout(6000),
      }).catch(() => {});
    } finally {
      setStoppingDiar(false);
    }
  }, [meetingId]);

  const gpu = useGpuBusy();
  // Diarization and re-transcription both use the GPU. Block starting one while any other
  // GPU task (minutes generation, or an STT job we didn't start) is running.
  const gpuBlocked = gpu.busy && !diarizing && !retransing;
  const busy = diarizing || retransing || gpuBlocked;

  // "Diarize" on the recording page lands here with ?autodiarize=1: start diarization once
  // (progress is shown inline in the toolbar) and drop the param from the URL so a reload
  // doesn't re-trigger (results are cached on the STT side anyway, so a re-run is cheap).
  const autoDiarizeTried = useRef(false);
  useEffect(() => {
    if (autoDiarizeTried.current || transcripts.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("autodiarize") !== "1") return;
    autoDiarizeTried.current = true;
    params.delete("autodiarize");
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    void runDiarization();
  }, [transcripts.length, runDiarization]);

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

      {/* Top toolbar: share on the left; diarization (the usual next step after a meeting) on
          the right, directly reachable. Re-transcription is rarer and destructive, so it stays
          behind its own disclosure below. */}
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
          {!readOnly ? (
            <div className="flex flex-wrap items-center gap-2">
              {transcripts.length > 0 ? (
                <>
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
                  {diarizing ? (
                    <button
                      type="button"
                      onClick={() => void stopDiarization()}
                      disabled={stoppingDiar}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--error)_45%,transparent)] px-5 py-2.5 text-sm font-semibold text-[var(--error)] hover:bg-[color-mix(in_srgb,var(--error)_10%,transparent)] disabled:opacity-50"
                    >
                      <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-[2px] bg-[var(--error)]" />
                      {stoppingDiar ? "Stopping…" : "Stop"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void runDiarization()}
                      disabled={busy}
                      className="btn-ink"
                      title="Analyze the recording and assign a speaker to each line (entering the participant count improves accuracy)"
                    >
                      Diarize
                    </button>
                  )}
                </>
              ) : null}
              {recInfo?.exists ? (
                <button
                  type="button"
                  onClick={() => setRetransOpen((v) => !v)}
                  className="btn-outline"
                  aria-expanded={retransOpen}
                >
                  Re-transcribe {retransOpen ? "▲" : "▼"}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {diarStatus ? <p className="mt-2 text-xs text-[var(--accent-sub)]">{diarStatus}</p> : null}
      {diarWarn ? <p className="mt-2 text-xs text-[var(--warning)]">{diarWarn}</p> : null}

      {/* Speaker names — revealed as soon as diarization has produced speakers to name. */}
      {showSpeakerTools ? (
        <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--elevated)] p-4">
          <p className="mb-1.5 text-xs font-medium text-[var(--text-secondary)]">
            Speaker names (edits apply to all lines)
          </p>
          <SpeakerManager speakerKeys={managerKeys} labels={speakerLabels} onRename={renameSpeaker} />

          {/* Voice profiles: enroll named speakers so future diarizations auto-name them. */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void saveVoiceProfiles()}
              disabled={profileBusy || busy}
              className="rounded-md border border-[var(--border-strong)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--hover-surface)] disabled:opacity-50"
            >
              {profileBusy ? "Saving…" : "Save voice profiles"}
            </button>
            <span className="text-xs text-[var(--text-muted)]">
              Enrolls each named speaker&apos;s voiceprint from this meeting; future auto-diarize
              runs will name them automatically.
            </span>
          </div>
          {profileMsg ? <p className="mt-1.5 text-xs text-[var(--accent-sub)]">{profileMsg}</p> : null}
          {profiles.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-[var(--text-muted)]">Enrolled:</span>
              {profiles.map((p) => (
                <span
                  key={p.name}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-0.5 text-xs text-[var(--text-secondary)]"
                >
                  {p.name}
                  <button
                    type="button"
                    onClick={() => void deleteProfile(p.name)}
                    aria-label={`Delete voice profile ${p.name}`}
                    title="Delete this voice profile"
                    className="text-[var(--text-muted)] hover:text-[var(--error)]"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Re-transcription — separate from diarization: it re-runs speech recognition and
          replaces the whole transcript. Collapsed by default. */}
      {retransOpen && recInfo?.exists && !readOnly ? (
        <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--elevated)] p-4">
          <p className="mb-1.5 text-xs font-medium text-[var(--text-secondary)]">
            Re-transcribe from the recording
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
              readOnly={readOnly}
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
  readOnly,
}: {
  item: Item;
  elapsed: number;
  labels: SpeakerLabels;
  reassignKeys: string[];
  showSpeaker: boolean;
  canSeek: boolean;
  onSeek: () => void;
  onReassign: (nextKey: string) => void;
  readOnly: boolean;
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
        {showSpeaker && !readOnly ? (
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
