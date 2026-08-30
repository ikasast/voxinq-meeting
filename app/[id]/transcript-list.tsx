"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { audioPosition, displayOffset } from "@/lib/audio-position";
import { mergeLiveTranscripts, type ServerSnapshot } from "@/lib/live-merge";
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
import { WHISPER_MODELS, effectiveSttLanguage } from "@/lib/stt/models";
import { useConfirm } from "../confirm-dialog";
import { PencilIcon, TrashIcon } from "../icons";
import { useGpuBusy } from "../use-gpu-busy";
import { SpeakerBadge, SpeakerManager, SpeakerReassignSelect } from "./speakers-ui";
import { ShareButton } from "./share-button";

type Item = {
  id: string;
  speakerType: string;
  text: string;
  createdAt: string;
  // Japanese translation of a non-Japanese utterance (null when none was produced).
  translation?: string | null;
  // Where this utterance starts in the recording. Null on rows saved before this was stored.
  audioStartMs?: number | null;
};

// A proposed fix for a misheard glossary term. Held in memory only — nothing is stored until
// the user applies it, and applying goes through the ordinary utterance-edit path.
type Suggestion = { transcriptId: string; before: string; after: string };

// State of the recording (WAV) saved on the GPU host. exists=false means not-yet-saved or expired/deleted.
type RecordingInfo = {
  exists: boolean;
  protected?: boolean;
  expiresAt?: string | null;
  firstUtteranceStart?: number; // start seconds of the first utterance within the WAV (for mapping playback position)
  segments?: { start: number; end: number }[]; // utterance boundaries, for rows with no stored offset
};

function remainingDays(expiresAt: string): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / 86400000));
}

const RETRANS_MODELS = [{ value: "", label: "Same as settings" }, ...WHISPER_MODELS];

// Post-meeting transcript. Supports recording playback, auto diarization, speaker renaming, and re-transcription.
export function TranscriptList({
  meetingId,
  meetingTitle,
  meetingStartedAt,
  meetingEndedAt,
  upcoming = false,
  initialTranscripts,
  initialSpeakerLabels,
  seriesGlossary,
  globalGlossary,
  readOnly = false,
}: {
  meetingId: string;
  meetingTitle: string;
  meetingStartedAt: string;
  // null while the meeting is still being recorded (on this device or another one).
  meetingEndedAt: string | null;
  /**
   * Booked for later and not recorded yet. Such a meeting also has no endedAt, but there is no
   * session to follow: polling would find nothing and the header would claim to be live.
   */
  upcoming?: boolean;
  initialTranscripts: Item[];
  initialSpeakerLabels: string | null;
  seriesGlossary: string | null;
  // Global glossary from settings. Passed in (rather than fetched) only to decide whether
  // "Suggest fixes" has anything to check against.
  globalGlossary: string;
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
  const [needsHfToken, setNeedsHfToken] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [replaceCase, setReplaceCase] = useState(false);
  const [replaceBusy, setReplaceBusy] = useState(false);
  const [replacePreview, setReplacePreview] = useState<{
    matchedRows: number;
    totalMatches: number;
    changeCount: number;
    changes: { id: string; before: string; after: string; count: number }[];
    skipped: { id: string; reason: string }[];
  } | null>(null);
  const [replaceMsg, setReplaceMsg] = useState<string | null>(null);
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
  const [showTranslation, setShowTranslation] = useState(true);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestMsg, setSuggestMsg] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const confirm = useConfirm();

  // Only worth offering the toggle when something in this meeting actually has a translation.
  const hasTranslations = useMemo(
    () => transcripts.some((t) => Boolean(t.translation)),
    [transcripts],
  );

  // Checking for misheard glossary terms needs a glossary to check against.
  const hasGlossary = Boolean(globalGlossary.trim() || seriesGlossary?.trim());

  // Suggestions are keyed by utterance so a row can render its own.
  const suggestionByT = useMemo(() => {
    const m = new Map<string, Suggestion>();
    for (const s of suggestions) m.set(s.transcriptId, s);
    return m;
  }, [suggestions]);

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

  // Timeline positions come from where each utterance actually sits in the recording — see
  // lib/audio-position.ts for the order of sources and why the wall-clock estimate is last.
  const positionSources = useMemo(
    () => ({
      segments: recInfo?.segments ?? null,
      firstUtteranceStart: recInfo?.firstUtteranceStart ?? null,
    }),
    [recInfo],
  );
  const elapsedSeconds = useCallback(
    (index: number) => displayOffset(transcripts, index, positionSources) ?? 0,
    [transcripts, positionSources],
  );
  const wavPosition = useCallback(
    (index: number) => audioPosition(transcripts, index, positionSources) ?? 0,
    [transcripts, positionSources],
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

  // Preview a find-and-replace. The server plans it against the rows it holds, so what is shown
  // is what would actually be written — not this tab's possibly-stale copy of the transcript.
  const previewReplace = useCallback(async () => {
    if (!findText) return;
    setReplaceBusy(true);
    setReplaceMsg(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/replace`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          find: findText,
          replace: replaceText,
          caseSensitive: replaceCase,
          dryRun: true,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setReplacePreview(await res.json());
    } catch (e) {
      setReplaceMsg(`Preview failed: ${(e as Error).message}`);
      setReplacePreview(null);
    } finally {
      setReplaceBusy(false);
    }
  }, [meetingId, findText, replaceText, replaceCase]);

  const applyReplace = useCallback(async () => {
    setReplaceBusy(true);
    setReplaceMsg(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/replace`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ find: findText, replace: replaceText, caseSensitive: replaceCase }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = (await res.json()) as { updated: number; skipped: { reason: string }[] };
      // Reflect the change locally rather than refetching — the rows are already on screen.
      const applied = new Map(replacePreview?.changes.map((c) => [c.id, c.after]) ?? []);
      setTranscripts((list) =>
        list.map((t) => (applied.has(t.id) ? { ...t, text: applied.get(t.id)! } : t)),
      );
      const skippedNote = d.skipped.length > 0 ? `, ${d.skipped.length} skipped` : "";
      setReplaceMsg(`Replaced in ${d.updated} utterance${d.updated === 1 ? "" : "s"}${skippedNote}.`);
      setReplacePreview(null);
    } catch (e) {
      setReplaceMsg(`Replace failed: ${(e as Error).message}`);
    } finally {
      setReplaceBusy(false);
    }
  }, [meetingId, findText, replaceText, replaceCase, replacePreview]);

  // Correct the wording of one utterance. Unlike deleting, this changes no positions, so the
  // recording's utterance boundaries (which diarization maps speakers onto) stay valid.
  const editTranscript = useCallback(
    async (transcriptId: string, text: string): Promise<boolean> => {
      const snapshot = transcripts;
      setTranscripts((list) => list.map((t) => (t.id === transcriptId ? { ...t, text } : t)));
      const res = await fetch(`/api/transcripts/${transcriptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      }).catch(() => null);
      if (!res || !res.ok) {
        setTranscripts(snapshot);
        setError(`Failed to save the edit (${res ? `HTTP ${res.status}` : "connection error"})`);
        return false;
      }
      setError(null);
      return true;
    },
    [transcripts],
  );

  // Ask the LLM which utterances misheard a glossary term. It only proposes; nothing is
  // written until the user applies a suggestion, which then goes through the ordinary edit
  // path. This is also the only way a glossary reaches kotoba-whisper, which ignores the
  // initial_prompt at recognition time.
  const runSuggestions = useCallback(async () => {
    setSuggesting(true);
    setSuggestMsg(null);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/suggest-corrections`, {
        method: "POST",
      });
      const d = (await res.json().catch(() => null)) as {
        suggestions?: Suggestion[];
        checked?: number;
        error?: string;
      } | null;
      if (!res.ok) throw new Error(d?.error ?? `HTTP ${res.status}`);
      const found = d?.suggestions ?? [];
      setSuggestions(found);
      setSuggestMsg(
        found.length > 0
          ? `${found.length} suggestion${found.length === 1 ? "" : "s"} across ${d?.checked ?? 0} utterances — review each below.`
          : `No misheard glossary terms found across ${d?.checked ?? 0} utterances.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSuggesting(false);
    }
  }, [meetingId]);

  const dismissSuggestion = useCallback((transcriptId: string) => {
    setSuggestions((list) => list.filter((s) => s.transcriptId !== transcriptId));
  }, []);

  const applySuggestion = useCallback(
    async (s: Suggestion) => {
      const ok = await editTranscript(s.transcriptId, s.after);
      if (ok) dismissSuggestion(s.transcriptId);
    },
    [editTranscript, dismissSuggestion],
  );

  // Apply sequentially: each edit PATCHes one row, and editTranscript rolls back from a
  // snapshot on failure, so overlapping writes would fight over that snapshot.
  const applyAllSuggestions = useCallback(async () => {
    for (const s of suggestions) {
      const ok = await editTranscript(s.transcriptId, s.after);
      if (!ok) return; // the error is already shown; leave the rest for the user to retry
      dismissSuggestion(s.transcriptId);
    }
    setSuggestMsg(null);
  }, [suggestions, editTranscript, dismissSuggestion]);

  // Remove one utterance: hallucinations and audio glitches otherwise end up in the minutes.
  const deleteTranscript = useCallback(
    async (transcriptId: string) => {
      const ok = await confirm({
        title: "Delete this utterance?",
        message:
          "It is removed from the transcript and will no longer be used when generating minutes. The audio itself is kept.",
        confirmLabel: "Delete",
        danger: true,
      });
      if (!ok) return;
      const snapshot = transcripts;
      setTranscripts((list) => list.filter((t) => t.id !== transcriptId));
      const res = await fetch(`/api/transcripts/${transcriptId}`, { method: "DELETE" }).catch(
        () => null,
      );
      if (!res || !res.ok) {
        setTranscripts(snapshot);
        setError(`Failed to delete (${res ? `HTTP ${res.status}` : "connection error"})`);
        return;
      }
      const d = (await res.json().catch(() => null)) as { synced?: boolean } | null;
      // The recording's utterance boundaries drive diarization by index. If they could not be
      // updated in step, a later diarization would attribute the wrong speakers.
      setDiarWarn(
        d?.synced
          ? null
          : "The recording's utterance list could not be updated to match. Re-run Diarize before trusting speaker names.",
      );
    },
    [confirm, transcripts],
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
        sttTranslate?: boolean;
      } | null;

      const base = sttHttpBase();
      const model = retransModel || settings?.whisperModel;
      const startRes = await fetch(`${base}/transcribe/${meetingId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: effectiveSttLanguage(model, settings?.sttLanguage),
          model,
          // Global glossary + this meeting's series glossary (if any).
          initialPrompt:
            [settings?.sttGlossary, seriesGlossary].filter(Boolean).join("、") || undefined,
          translate: Boolean(settings?.sttTranslate),
        }),
      });
      if (!startRes.ok) {
        const d = await startRes.json().catch(() => null);
        throw new Error(d?.detail ?? `Failed to start (HTTP ${startRes.status})`);
      }
      let job = (await startRes.json()) as {
        status: string;
        utterances?: { start: number; end: number; text: string; translation?: string }[];
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
      // The box wins when it has a number in it. Otherwise the count comes from the participant
      // list, read now rather than held in state: it is edited elsewhere on this page, and a
      // stale count is worse than none -- too low merges two people into one.
      let want = numSpeakers.trim();
      if (!want) {
        const n = await expectedSpeakerCount(meetingId);
        want = n > 0 ? String(n) : "";
      }
      if (want) qs.set("num_speakers", want);
      const startRes = await fetch(`${base}/diarize/${meetingId}?${qs}`, { method: "POST" });
      if (!startRes.ok) {
        const d = await startRes.json().catch(() => null);
        throw new Error(d?.detail ?? `Failed to start (HTTP ${startRes.status})`);
      }
      let data = (await startRes.json()) as {
        status: string;
        speakers?: string[];
        embeddings?: Record<string, number[]>;
        // Which model produced those embeddings — pyannote or sherpa-onnx, depending on the
        // STT host's hardware. Stored with them so a voiceprint is never compared with a
        // vector from the other model, which would score like a stranger.
        embeddingModel?: string | null;
        detail?: string;
        code?: string;
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
      if (data.code === "hf_token_required") {
        // Nothing before this point needs a token, so this is where a fresh install finds
        // out. Say what to do rather than handing over the tail of a Python traceback.
        setNeedsHfToken(true);
        setDiarStatus(null);
        return;
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
          body: JSON.stringify({
            embeddings: data.embeddings ?? {},
            embeddingModel: data.embeddingModel ?? null,
          }),
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

  // --- Following a meeting that is being recorded elsewhere ---------------------------------
  //
  // The recording device saves each utterance as soon as it is final, so any other device can
  // follow the meeting by polling for the transcript. Only the recording device holds the
  // WebSocket to STT; this side never talks to it, which is why a read-only viewer outside the
  // tailnet gets live updates too.
  //
  // In-progress text (what the speaker is saying right now) is deliberately not shown: it is
  // never persisted, so it exists only inside the recording browser.
  const router = useRouter();
  const [endedAt, setEndedAt] = useState<string | null>(meetingEndedAt);
  const [liveOffline, setLiveOffline] = useState(false);
  // What the server last told us, as the base for merging: see lib/live-merge.
  const serverSnapshot = useRef<ServerSnapshot>(new Map());

  useEffect(() => {
    // A meeting that has not happened yet is not one that is happening: there is no session to
    // follow, and polling for it would find nothing every second until someone gave up.
    if (endedAt || upcoming) return;
    // A recorder that crashed leaves endedAt null forever. Stop chasing it after a day.
    if (Date.now() - Date.parse(meetingStartedAt) > 86400_000) return;

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let misses = 0;

    const tick = async () => {
      if (stopped) return;
      // Nothing to show while the tab is hidden; the visibility listener polls on return.
      if (document.visibilityState !== "visible") return schedule();

      const res = await fetch(`/api/meetings/${meetingId}/live`, {
        signal: AbortSignal.timeout(6000),
        cache: "no-store",
      }).catch(() => null);

      if (stopped) return;
      if (!res || !res.ok) {
        misses += 1;
        if (misses >= 2) setLiveOffline(true);
        return schedule();
      }

      const data = (await res.json().catch(() => null)) as {
        endedAt: string | null;
        speakerLabels: string | null;
        transcripts: Item[];
      } | null;
      if (stopped || !data) return schedule();

      misses = 0;
      setLiveOffline(false);
      setTranscripts((list) => {
        const { next, snapshot } = mergeLiveTranscripts(list, serverSnapshot.current, data.transcripts);
        serverSnapshot.current = snapshot;
        return next;
      });
      // Diarization only runs after a meeting ends, so labels can only have been set by a
      // reload of an already-ended meeting — but adopting them costs nothing.
      if (data.speakerLabels) setSpeakerLabels(parseSpeakerLabels(data.speakerLabels));

      if (data.endedAt) {
        stopped = true;
        setEndedAt(data.endedAt);
        // Re-render the server component so the header dates, the minutes section and the
        // recording player reflect the finished meeting.
        router.refresh();
        return;
      }
      schedule();
    };

    const schedule = () => {
      if (!stopped) timer = setTimeout(tick, 4000);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && !stopped) {
        clearTimeout(timer);
        void tick();
      }
    };

    void tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [endedAt, upcoming, meetingId, meetingStartedAt, router]);

  const live = !endedAt && !upcoming;

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
        {live ? (
          <span
            className="ml-2 inline-flex items-center gap-1.5 align-middle text-xs font-medium text-[var(--text-muted)]"
            title={
              liveOffline
                ? "Cannot reach the server — retrying"
                : "This meeting is being recorded; new utterances appear as they are transcribed"
            }
          >
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                liveOffline ? "bg-[var(--text-muted)]" : "animate-pulse bg-red-500"
              }`}
            />
            {liveOffline ? "Reconnecting…" : "Live"}
          </span>
        ) : null}
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
          <div className="flex flex-wrap items-center gap-2">
            {hasTranslations ? (
              <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                <input
                  type="checkbox"
                  checked={showTranslation}
                  onChange={(e) => setShowTranslation(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[var(--accent)]"
                />
                Show translations
              </label>
            ) : null}
          </div>
          {!readOnly ? (
            <div className="flex flex-wrap items-center gap-2">
              {transcripts.length > 0 ? (
                <>
                  <label className="flex items-center gap-1 text-xs text-[var(--text-muted)]"
                    title="How many voices to look for. Left empty, the participant list decides."
                  >
                    Speakers
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
              {transcripts.length > 0 && hasGlossary ? (
                <button
                  type="button"
                  onClick={() => void runSuggestions()}
                  disabled={busy || suggesting}
                  className="btn-outline"
                  title="Check the transcript for glossary terms that were misheard, and propose fixes to apply line by line"
                >
                  {suggesting ? "Checking…" : "Suggest fixes"}
                </button>
              ) : null}
              {transcripts.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setReplaceOpen((v) => !v)}
                  className="btn-outline"
                  aria-expanded={replaceOpen}
                  title="Fix a term that was misheard the same way throughout"
                >
                  Find &amp; replace {replaceOpen ? "▲" : "▼"}
                </button>
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

      {needsHfToken ? (
        <div className="mt-2 rounded-lg border border-[var(--warning)] bg-[var(--elevated)] p-3 text-xs">
          <p className="font-medium text-[var(--text-strong)]">
            Speaker separation needs a Hugging Face token
          </p>
          <p className="mt-1 text-[var(--text-secondary)]">
            The model that tells speakers apart is free, but its authors require you to accept
            their terms first. It is a one-time setup of a few minutes; everything else — recording,
            transcription, minutes — works without it.
          </p>
          <a
            className="mt-2 inline-block text-[var(--accent)] underline"
            href="https://github.com/ikasast/voxinq-meeting/blob/release/docs/setup.md#diarization-needs-a-hugging-face-token"
            target="_blank"
            rel="noreferrer"
          >
            How to set it up →
          </a>
        </div>
      ) : null}

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

      {/* Find and replace — for a term misheard the same way throughout. Rewriting text moves
          no positions, so the recording's utterance boundaries stay valid. */}
      {replaceOpen && !readOnly ? (
        <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--elevated)] p-4">
          <p className="mb-1.5 text-xs font-medium text-[var(--text-secondary)]">
            Find &amp; replace in this transcript
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="label">Find</span>
              <input
                className="input mt-1"
                value={findText}
                onChange={(e) => {
                  setFindText(e.target.value);
                  setReplacePreview(null);
                }}
                placeholder="ネクサス"
                disabled={replaceBusy}
              />
            </label>
            <label className="block">
              <span className="label">Replace with</span>
              <input
                className="input mt-1"
                value={replaceText}
                onChange={(e) => {
                  setReplaceText(e.target.value);
                  setReplacePreview(null);
                }}
                placeholder="NEXUS"
                disabled={replaceBusy}
              />
            </label>
          </div>

          <label className="mt-2 flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={replaceCase}
              onChange={(e) => {
                setReplaceCase(e.target.checked);
                setReplacePreview(null);
              }}
              disabled={replaceBusy}
            />
            <span>Match case</span>
          </label>

          <div className="mt-2.5 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-outline"
              onClick={() => void previewReplace()}
              disabled={replaceBusy || !findText}
            >
              {replaceBusy ? "Checking…" : "Preview"}
            </button>
            {replacePreview && replacePreview.changeCount > 0 ? (
              <button
                type="button"
                className="btn-ink"
                onClick={() => void applyReplace()}
                disabled={replaceBusy}
              >
                Replace in {replacePreview.changeCount} utterance
                {replacePreview.changeCount === 1 ? "" : "s"}
              </button>
            ) : null}
          </div>

          {replacePreview ? (
            <div className="mt-2.5 text-xs">
              {replacePreview.totalMatches === 0 ? (
                <p className="text-[var(--text-muted)]">No matches.</p>
              ) : (
                <>
                  <p className="text-[var(--text-secondary)]">
                    {replacePreview.totalMatches} match
                    {replacePreview.totalMatches === 1 ? "" : "es"} in {replacePreview.matchedRows}{" "}
                    utterance{replacePreview.matchedRows === 1 ? "" : "s"}.
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {replacePreview.changes.slice(0, 5).map((c) => (
                      <li key={c.id} className="text-[var(--text-muted)]">
                        <span className="line-through">{c.before.slice(0, 60)}</span>
                        {" → "}
                        <span className="text-[var(--text-strong)]">{c.after.slice(0, 60)}</span>
                      </li>
                    ))}
                  </ul>
                  {replacePreview.changeCount > 5 ? (
                    <p className="mt-1 text-[var(--text-muted)]">
                      …and {replacePreview.changeCount - 5} more
                    </p>
                  ) : null}
                  {replacePreview.skipped.length > 0 ? (
                    <p className="mt-1 text-[var(--warning)]">
                      {replacePreview.skipped.length} skipped — a replacement cannot empty an
                      utterance (delete it instead) or exceed the length limit.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          {replaceMsg ? (
            <p className="mt-2 text-xs text-[var(--accent-sub)]">{replaceMsg}</p>
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

      {/* Suggested glossary fixes: a summary line, plus a bulk action once there are several.
          Each suggestion also renders on its own row so it can be judged in context. */}
      {suggestMsg ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-xs text-[var(--accent-sub)]">{suggestMsg}</p>
          {suggestions.length > 0 ? (
            <>
              <button
                type="button"
                onClick={() => void applyAllSuggestions()}
                className="text-xs font-semibold text-[var(--accent)] hover:underline"
              >
                Apply all
              </button>
              <button
                type="button"
                onClick={() => {
                  setSuggestions([]);
                  setSuggestMsg(null);
                }}
                className="text-xs text-[var(--text-muted)] hover:underline"
              >
                Dismiss all
              </button>
            </>
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
          {transcripts.map((t, i) => (
            <TranscriptRow
              key={t.id}
              item={t}
              elapsed={elapsedSeconds(i)}
              labels={speakerLabels}
              reassignKeys={reassignKeys}
              showSpeaker={multiSpeaker}
              canSeek={Boolean(recInfo?.exists)}
              onSeek={() => seekTo(wavPosition(i))}
              onReassign={(nextKey) => void reassignSpeaker(t.id, nextKey)}
              onDelete={() => void deleteTranscript(t.id)}
              onEdit={(text) => editTranscript(t.id, text)}
              suggestion={suggestionByT.get(t.id) ?? null}
              onApplySuggestion={() => {
                const s = suggestionByT.get(t.id);
                if (s) void applySuggestion(s);
              }}
              onDismissSuggestion={() => dismissSuggestion(t.id)}
              showTranslation={showTranslation}
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
  onDelete,
  onEdit,
  suggestion,
  onApplySuggestion,
  onDismissSuggestion,
  showTranslation,
  readOnly,
}: {
  showTranslation: boolean;
  item: Item;
  elapsed: number;
  labels: SpeakerLabels;
  reassignKeys: string[];
  showSpeaker: boolean;
  canSeek: boolean;
  onSeek: () => void;
  onReassign: (nextKey: string) => void;
  onDelete: () => void;
  onEdit: (text: string) => Promise<boolean>;
  suggestion: Suggestion | null;
  onApplySuggestion: () => void;
  onDismissSuggestion: () => void;
  readOnly: boolean;
}) {
  // Correcting a misheard word in place. Recognition gets names and jargon wrong often
  // enough that retyping one line beats re-transcribing the whole meeting.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setDraft(item.text);
    setEditing(true);
  };

  const save = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === item.text) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const ok = await onEdit(trimmed);
    setSaving(false);
    if (ok) setEditing(false);
  };

  return (
    <li className="group rounded border border-[var(--border)] bg-[var(--elevated)] px-3 py-2 text-sm">
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
        {/* Fix or drop a misheard line so the minutes are built from the right words. Kept
            quiet until the row is hovered on desktop; always visible on touch, which has no
            hover. */}
        {!readOnly && !editing ? (
          <>
            <button
              type="button"
              onClick={startEdit}
              title="Edit this utterance"
              aria-label="Edit this utterance"
              className="shrink-0 rounded p-1 text-[var(--text-muted)] opacity-100 hover:bg-[var(--hover-surface)] hover:text-[var(--foreground)] sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
            >
              <PencilIcon className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              title="Delete this utterance (it will no longer feed minutes generation)"
              aria-label="Delete this utterance"
              className="shrink-0 rounded p-1 text-[var(--text-muted)] opacity-100 hover:bg-[var(--hover-surface)] hover:text-[var(--error)] sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </button>
          </>
        ) : null}
      </div>
      {editing ? (
        <div className="mt-1 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter saves (the common case is a short correction); Shift+Enter adds a line.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void save();
              } else if (e.key === "Escape") {
                setEditing(false);
              }
            }}
            rows={Math.min(8, Math.max(2, draft.split("\n").length + 1))}
            autoFocus
            disabled={saving}
            className="input resize-y text-sm"
          />
          <div className="flex items-center justify-end gap-2">
            <span className="mr-auto text-[11px] text-[var(--text-muted)]">
              Enter to save · Shift+Enter for a new line · Esc to cancel
            </span>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
              className="rounded-md border border-[var(--border-strong)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--hover-surface)] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !draft.trim()}
              className="rounded-md bg-[var(--accent-solid)] px-2.5 py-1 text-xs font-medium text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-1 whitespace-pre-wrap">{item.text}</p>
      )}
      {/* A proposed glossary fix, shown in place so it can be judged against the utterance it
          would replace. Applying it is an ordinary edit; nothing changes until then. */}
      {suggestion && !editing && !readOnly ? (
        <div className="mt-1.5 rounded border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] px-2 py-1.5">
          <p className="text-[11px] font-medium text-[var(--accent-sub)]">Suggested fix</p>
          <p className="mt-0.5 text-xs whitespace-pre-wrap text-[var(--foreground)]">
            {suggestion.after}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={onApplySuggestion}
              className="rounded-md bg-[var(--accent-solid)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)]"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={onDismissSuggestion}
              className="rounded-md border border-[var(--border-strong)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--hover-surface)]"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
      {/* Japanese translation, shown under the original rather than replacing it — the
          transcript stays the record of what was actually said. */}
      {showTranslation && item.translation ? (
        <p className="mt-1 border-l-2 border-[var(--border-strong)] pl-2 text-xs whitespace-pre-wrap text-[var(--text-muted)]">
          {item.translation}
        </p>
      ) : null}
    </li>
  );
}

// How many people are ticked as speaking on this meeting. Asked at the moment diarization
// starts rather than carried in state, because the list lives in another component and the
// count is only meaningful if it is the current one.
async function expectedSpeakerCount(meetingId: string): Promise<number> {
  try {
    const res = await fetch(`/api/meetings/${meetingId}/participants`, { cache: "no-store" });
    if (!res.ok) return 0;
    const d = (await res.json()) as { participants?: { speaking?: boolean }[] };
    return (d.participants ?? []).filter((p) => p.speaking !== false).length;
  } catch {
    return 0; // let the diarizer decide for itself rather than fail the run
  }
}
