"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { audioPosition, displayOffset } from "@/lib/audio-position";
import { mergeLiveTranscripts, type ServerSnapshot } from "@/lib/live-merge";
import { formatOffset } from "@/lib/utils";
import {
  type SpeakerNames,
  MIC_SPEAKER,
  speakersInOrder,
  readNames,
  shownName,
  separatedSpeakers,
} from "@/lib/speakers";
import { tellSpeakers, useOpenSpeakers } from "./speaker-bus";
import { sttHttpBase } from "@/lib/stt/client";
import { WHISPER_MODELS, effectiveSttLanguage } from "@/lib/stt/models";
import { useConfirm } from "../confirm-dialog";
import {
  CheckIcon,
  DotsIcon,
  FaceJoyIcon,
  LockIcon,
  LockOpenIcon,
  PeopleIcon,
  RefreshIcon,
  SearchIcon,
  ShareIcon,
  SpellCheckIcon,
  VolumeUpIcon,
} from "../icons";
import { busyLabel } from "@/lib/queue/job-label";
import { useGpuBusy } from "../use-gpu-busy";
import { SpeakerNamesEditor } from "./speakers-ui";
import { TrimRecording } from "./trim-recording";
import { shareText } from "./share-text";
import { CopyButton } from "./copy-button";
import { DropMenu, MENU_ITEM, MenuRule } from "../drop-menu";
import { profileDestination, sttDestination } from "@/lib/stt/destination";
import type { PublicSttProfile } from "@/lib/stt/profiles";
import { useT } from "@/app/locale-provider";
import { useExtensions } from "@/app/extensions-provider";
import { MoodStrip } from "./mood-strip";
import { SpellingFix } from "./spelling-fix";
import { readStored } from "@/lib/i18n/stored";
import { useRecorderApi, useRecorderState } from "@/app/recorder";
import { type Item, TranscriptRow } from "./transcript-row";
import { Step, type StepState, ToolPanel } from "./tool-panel";
import { HEAD_BUTTON, ROW_BUTTON } from "./transcript-buttons";

type SttSettings = { sttProfiles?: PublicSttProfile[]; sttDefaultProfileId?: string };

/** The tools above the lines that open a panel under them. */
type Tool = "speakers" | "fix" | "retrans" | null;

// State of the recording (WAV) saved on the GPU host. exists=false means not-yet-saved or expired/deleted.
type RecordingInfo = {
  exists: boolean;
  protected?: boolean;
  expiresAt?: string | null;
  firstUtteranceStart?: number; // start seconds of the first utterance within the WAV (for mapping playback position)
  segments?: { start: number; end: number }[]; // utterance boundaries, for rows with no stored offset
  durationSec?: number | null; // length of the recording, for the trim bar's scale
};

function remainingDays(expiresAt: string): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / 86400000));
}

/** A JSON PATCH. Null when it never reached the server, so callers can say which went wrong. */
function patchJson(url: string, body: Record<string, unknown>): Promise<Response | null> {
  return fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
}

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
  hasCorrectionTerms,
  readOnly = false,
  transcribeJobId = null,
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
  // Global glossary from settings. Passed in (rather than fetched) only to decide whether
  // "Suggest fixes" has anything to check against.
  /** The series' own terms, for Whisper's initial_prompt on a re-transcription. */
  seriesGlossary: string | null;
  /** Whether anything is known to be a proper noun here — see lib/correction-terms.ts. */
  hasCorrectionTerms: boolean;
  // External (read-only) access can view/play/share but not diarize, re-transcribe or reassign.
  readOnly?: boolean;
  /** A recognition already queued or running for this meeting when the page was rendered. */
  transcribeJobId?: string | null;
}) {
  const t = useT();
  const [transcripts, setTranscripts] = useState<Item[]>(initialTranscripts);
  const [speakerLabels, setSpeakerLabels] = useState<SpeakerNames>(
    readNames(initialSpeakerLabels),
  );
  const [error, setError] = useState<string | null>(null);
  const [numSpeakers, setNumSpeakers] = useState<string>("");
  const [diarizing, setDiarizing] = useState(false);
  const [undoingSplit, setUndoingSplit] = useState(false);
  const [stoppingDiar, setStoppingDiar] = useState(false);
  const stopDiarRef = useRef(false); // set by the Stop button to break the polling loop
  const diarJobRef = useRef<string | null>(null); // the queued job, so Stop can cancel it
  const [diarStatus, setDiarStatus] = useState<string | null>(null);
  const [needsHfToken, setNeedsHfToken] = useState(false);
  // Which of the tools above the lines is open: one at a time, none to begin with.
  const [tool, setTool] = useState<Tool>(null);
  // A word on what just happened that needs no more than a moment ("Copied").
  const [notice, setNotice] = useState<string | null>(null);
  const [diarWarn, setDiarWarn] = useState<string | null>(null);
  const [recInfo, setRecInfo] = useState<RecordingInfo | null>(null);
  const [recBusy, setRecBusy] = useState(false);
  // Busy from the first frame when the page opened on a recognition already in the queue (see
  // the effect that follows it), so the button is never briefly offered for one on its way.
  const [retransing, setRetransing] = useState(Boolean(transcribeJobId));
  const [retransStatus, setRetransStatus] = useState<string | null>(
    transcribeJobId ? t("Waiting for the GPU to be free…") : null,
  );
  const [retransWarn, setRetransWarn] = useState<string | null>(null);
  // Re-transcription changes things this component does not own: t("Transcribed with") on the
  // meeting is rendered on the server, so replacing the transcript here left it showing the
  // model from before -- correct in the database, stale on screen until a reload.
  const listRouter = useRouter();
  // "" = whatever Settings says; "local:<model>" = here; "profile:<id>" = a saved endpoint.
  const [retransChoice, setRetransChoice] = useState("");
  // Saved recognition endpoints, offered beside the local models below. `profiles` is already
  // taken here by voice profiles, which are a different thing entirely.
  const [sttProfiles, setSttProfiles] = useState<PublicSttProfile[]>([]);
  const [defaultProfileId, setDefaultProfileId] = useState("");
  const [remoteHost, setRemoteHost] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<{ name: string }[]>([]);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [showTranslation, setShowTranslation] = useState(true);
  // Extensions switched off keep their data but show nothing (lib/extensions.ts).
  const extensions = useExtensions();
  const [voicing, setVoicing] = useState(false);
  const [judging, setJudging] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const confirm = useConfirm();

  // Only worth offering the toggle when something in this meeting actually has a translation.
  const hasTranslations = useMemo(
    () => transcripts.some((t) => Boolean(t.translation)),
    [transcripts],
  );

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
      setProfileMsg(t("Saved voice profiles: {names}", { names: (d?.saved ?? []).join(", ") }));
      const list = (await fetch("/api/speaker-profiles").then((r) => r.json())) as {
        name: string;
      }[];
      setProfiles(list);
    } catch (e) {
      setProfileMsg((e as Error).message);
    } finally {
      setProfileBusy(false);
    }
  }, [meetingId, t]);

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
  // Failure is silence: not knowing leaves the local picker in place, which is what this
  // screen did before and is the safe way to be wrong.
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: SttSettings | null) => {
        setSttProfiles(d?.sttProfiles ?? []);
        setDefaultProfileId(d?.sttDefaultProfileId ?? "");
        setRemoteHost(d ? sttDestination(d) : null);
      })
      .catch(() => {
        setSttProfiles([]);
        setRemoteHost(null);
      });
  }, []);

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

  // Where every line starts in the recording, for the trim bar's ticks.
  const linePositions = useMemo(() => transcripts.map((_, i) => wavPosition(i)), [transcripts, wavPosition]);

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
      // The answer carries the protection state but not the length, which protecting does not
      // change; replacing the whole state lost it, and the trim button with it.
      const next = (await res.json()) as RecordingInfo;
      setRecInfo((prev) => ({ ...prev, ...next }));
    } catch (e) {
      setError(t("Failed to change protection: {error}", { error: (e as Error).message }));
    } finally {
      setRecBusy(false);
    }
  }, [recInfo, meetingId, t]);

  const reassignKeys = useMemo(
    () => speakersInOrder(transcripts.map((t) => t.speakerType), speakerLabels),
    [transcripts, speakerLabels],
  );
  const selfUsed = useMemo(
    () => transcripts.some((t) => t.speakerType === MIC_SPEAKER) || Boolean(speakerLabels[MIC_SPEAKER]),
    [transcripts, speakerLabels],
  );
  const managerKeys = useMemo(
    () => (selfUsed ? reassignKeys : reassignKeys.filter((k) => k !== MIC_SPEAKER)),
    [reassignKeys, selfUsed],
  );
  // Show the speaker badge/reassign on a row only when there are 2 or more speakers.
  const multiSpeaker = reassignKeys.length > 1;
  // The speaker-name tools appear once diarization has produced speakers to name.
  const showSpeakerTools = managerKeys.length > 0 && !readOnly;

  // Where speaker separation stands, for its three steps and for the row in the meeting's
  // details (speakers-row.tsx), which hears it through speaker-bus.ts.
  // The speakers some line is said by — the microphone too, when lines are still its own — as
  // the names below list them; separated once any of them is a voice told apart.
  const voiceKeys = useMemo(
    () => reassignKeys.filter((k) => transcripts.some((l) => l.speakerType === k)),
    [reassignKeys, transcripts],
  );
  const separated = voiceKeys.some((k) => k !== MIC_SPEAKER);
  const unnamedVoices = voiceKeys.filter((k) => !speakerLabels[k]?.trim()).length;
  // The participants who spoke, which is the count a run is given when the box is left empty.
  // Asked when the panel opens, because the list is edited elsewhere on this page.
  const [expectedVoices, setExpectedVoices] = useState(0);
  useEffect(() => {
    if (tool !== "speakers") return;
    let gone = false;
    void expectedSpeakerCount(meetingId).then((n) => {
      if (!gone) setExpectedVoices(n);
    });
    return () => {
      gone = true;
    };
  }, [tool, meetingId]);
  const stepDone = [
    numSpeakers.trim() !== "" || expectedVoices > 0 || separated,
    separated && !diarizing,
    separated && unnamedVoices === 0,
  ];
  const nextStep = stepDone.findIndex((d) => !d) + 1; // 0 when all are done
  const stepState = (n: number): StepState =>
    stepDone[n - 1] ? "done" : n === nextStep ? "next" : "later";

  useEffect(() => {
    tellSpeakers(meetingId, {
      ...separatedSpeakers(
        transcripts.map((l) => l.speakerType),
        speakerLabels,
        t,
      ),
      running: diarizing ? (diarStatus ?? t("Separating…")) : null,
      possible: transcripts.length > 0 && (recInfo === null || recInfo.exists || diarizing),
    });
  }, [meetingId, transcripts, speakerLabels, diarizing, diarStatus, recInfo, t]);

  // The row in the meeting's details asks for this panel: open it, at the speakers.
  const showSpeakers = useCallback(() => {
    setTool("speakers");
    requestAnimationFrame(() =>
      document.getElementById(`speakers-${meetingId}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
    );
  }, [meetingId]);
  useOpenSpeakers(meetingId, showSpeakers);

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
        .map((line) => (multiSpeaker ? `${shownName(line.speakerType, speakerLabels, t)}: ${line.text}` : line.text))
        .join("\n"),
    [transcripts, speakerLabels, multiSpeaker, t],
  );

  // Give one line to another speaker: shown at once, put back if the server says no.
  const setLineSpeaker = useCallback(
    async (lineId: string, speaker: string) => {
      const before = transcripts;
      setTranscripts((lines) => lines.map((line) => (line.id === lineId ? { ...line, speakerType: speaker } : line)));
      const res = await patchJson(`/api/transcripts/${lineId}`, { speakerType: speaker });
      if (res?.ok) return;
      setTranscripts(before);
      setError(t("Failed to change speaker ({reason})", { reason: res ? `HTTP ${res.status}` : t("connection error") }));
    },
    [transcripts, t],
  );

  // Correct the wording of one utterance. Unlike deleting, this changes no positions, so the
  // recording's utterance boundaries (which diarization maps speakers onto) stay valid.
  const editTranscript = useCallback(
    async (transcriptId: string, text: string): Promise<boolean> => {
      const snapshot = transcripts;
      setTranscripts((list) => list.map((t) => (t.id === transcriptId ? { ...t, text } : t)));
      const res = await patchJson(`/api/transcripts/${transcriptId}`, { text });
      if (!res || !res.ok) {
        setTranscripts(snapshot);
        setError(t("Failed to save the edit ({reason})", { reason: res ? `HTTP ${res.status}` : t("connection error") }));
        return false;
      }
      setError(null);
      return true;
    },
    [transcripts, t],
  );

  // Voice cues: measure the recording and mark the lines that stand out for their speaker.
  const runVoiceCues = useCallback(async () => {
    setVoicing(true);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/voice-cues`, { method: "POST" });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(d?.error ?? `HTTP ${res.status}`);
      }
      await reloadTranscriptRef.current();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setVoicing(false);
    }
  }, [meetingId]);

  // Emotion: a queued job on the card. Asked for here, followed until it ends, then read back.
  const runEmotion = useCallback(async () => {
    setJudging(true);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/emotion`, { method: "POST" });
      const d = (await res.json().catch(() => null)) as { jobId?: string; error?: string } | null;
      if (!res.ok || !d?.jobId) throw new Error(d?.error ?? `HTTP ${res.status}`);
      for (;;) {
        await new Promise((r) => setTimeout(r, 3000));
        const j = (await fetch(`/api/jobs/${d.jobId}`, { cache: "no-store" })
          .then((r) => r.json())
          .catch(() => null)) as { status?: string; detail?: string | null } | null;
        if (!j || j.status === "queued" || j.status === "running") continue;
        if (j.status !== "done") throw new Error(j.detail ? readStored(t, j.detail) : t("Judging emotion failed."));
        break;
      }
      await reloadTranscriptRef.current();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setJudging(false);
    }
  }, [meetingId, t]);

  // Remove one utterance: hallucinations and audio glitches otherwise end up in the minutes.
  const deleteTranscript = useCallback(
    async (transcriptId: string) => {
      const ok = await confirm({
        title: t("Delete this utterance?"),
        message: t(
          "It is removed from the transcript and will no longer be used when generating minutes. The audio itself is kept.",
        ),
        confirmLabel: t("Delete"),
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
        setError(t("Failed to delete ({reason})", { reason: res ? `HTTP ${res.status}` : t("connection error") }));
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
    [confirm, transcripts, t],
  );

  // Name a speaker. The whole map is sent, so the names never drift from what is shown.
  const nameSpeaker = useCallback(
    async (speaker: string, name: string) => {
      const names = { ...speakerLabels, [speaker]: name };
      setSpeakerLabels(names);
      const res = await patchJson(`/api/meetings/${meetingId}`, { speakerLabels: names });
      if (!res?.ok) {
        setError(t("Failed to save speaker name ({reason})", { reason: res ? `HTTP ${res.status}` : t("connection error") }));
      }
    },
    [speakerLabels, meetingId, t],
  );

  // Where *this* run would send the audio: the picked endpoint, or the default when the picker
  // is left alone. Null for anything on this machine or your own network.
  const uploadTo = (() => {
    if (retransChoice.startsWith("local:")) return null;
    if (retransChoice.startsWith("profile:")) {
      return profileDestination(sttProfiles.find((p) => p.id === retransChoice.slice(8)));
    }
    return remoteHost;
  })();

  // Wait for a queued job, reporting where it is while it waits.
  //
  // The browser used to run these itself: start on the STT service, poll it, post the results
  // back here. It does not any more — closing the tab abandoned the run, and the browser was
  // the thing deciding when to start, which is why the buttons had to be disabled whenever
  // anything else held the GPU. Now it asks the queue how its job is getting on.
  const awaitJob = useCallback(
    async (jobId: string, report: (s: string) => void, stopped?: () => boolean) => {
      for (;;) {
        if (stopped?.()) return null;
        const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        if (!res.ok) throw new Error(t("The job could not be found."));
        const job = (await res.json()) as {
          status: string;
          detail?: string | null;
          ahead?: number;
        };
        if (job.status === "queued") {
          report(
            job.ahead
              ? t(
                  job.ahead === 1
                    ? "Waiting — 1 job ahead of it."
                    : "Waiting — {n} jobs ahead of it.",
                  { n: job.ahead },
                )
              : t("Waiting for the GPU to be free…"),
          );
        } else if (job.status === "running") {
          report(t("Working… (you can leave this page; it finishes on the server)"));
        } else {
          return job;
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
    },
    [t],
  );

  /** Pull the transcript and speaker names back after a job has rewritten them. */
  const reloadTranscript = useCallback(async () => {
    const res = await fetch(`/api/meetings/${meetingId}/live`, { cache: "no-store" });
    if (!res.ok) return;
    const d = (await res.json()) as { transcripts?: Item[]; speakerLabels?: string | null };
    if (Array.isArray(d.transcripts)) setTranscripts(d.transcripts);
    setSpeakerLabels(readNames(d.speakerLabels ?? null));
    listRouter.refresh();
  }, [meetingId, listRouter]);
  // For callbacks declared above this one.
  const reloadTranscriptRef = useRef(reloadTranscript);
  useEffect(() => {
    reloadTranscriptRef.current = reloadTranscript;
  }, [reloadTranscript]);

  // A recognition that was already in the queue when the page opened: a file dropped on New
  // meeting, an import from the phone, a re-transcription from before a reload. Followed the
  // same way as one started from here, so the page says where it has got to -- and picks up the
  // transcript when it lands -- instead of saying there is none.
  useEffect(() => {
    if (!transcribeJobId) return;
    let stopped = false;
    // Also marks the list busy, for a job that turns up on a later render rather than the first.
    const report = (s: string) => {
      setRetransing(true);
      setRetransStatus(s);
    };
    void (async () => {
      try {
        const job = await awaitJob(transcribeJobId, report, () => stopped);
        if (!job) return;
        if (job.status === "error") throw new Error(job.detail ? readStored(t, job.detail) : job.status);
        if (job.status === "cancelled") {
          setRetransStatus(t("Cancelled."));
          return;
        }
        await reloadTranscript();
        setRetransWarn(job.detail ? readStored(t, job.detail) : null);
        setRetransStatus(null);
      } catch (e) {
        setError(t("Transcription failed: {error}", { error: (e as Error).message }));
        setRetransStatus(null);
      } finally {
        if (!stopped) setRetransing(false);
      }
    })();
    return () => {
      stopped = true;
    };
  }, [transcribeJobId, awaitJob, reloadTranscript, t]);

  const retranscribe = useCallback(async () => {
    const ok = await confirm({
      title: t("Re-transcribe from the recording"),
      message:
        t(
          "Replace the current transcript (including speaker assignments and manual edits) with a fresh recognition from the recording. You can re-run auto-diarization afterward.",
        ) +
        (uploadTo
          ? `\n\n${t("The recording will be uploaded to {host}, which recognises it and bills you for the length of the audio.", { host: uploadTo })}`
          : ""),
      confirmLabel: t("Re-transcribe"),
      danger: true,
    });
    if (!ok) return;
    setError(null);
    setRetransWarn(null);
    setRetransing(true);
    setRetransStatus(t("Adding to the queue…"));
    try {
      const settings = (await fetch("/api/settings")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)) as {
        whisperModel?: string;
        sttLanguage?: string;
        sttGlossary?: string;
        sttTranslate?: boolean;
      } | null;

      // Decode the one picker back into the two things the request needs.
      const local = retransChoice.startsWith("local:") ? retransChoice.slice(6) : null;
      const profileId = retransChoice.startsWith("profile:") ? retransChoice.slice(8) : null;
      const model = local || settings?.whisperModel;

      const startRes = await fetch(`/api/meetings/${meetingId}/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: effectiveSttLanguage(model, settings?.sttLanguage),
          model,
          // Explicit "local" rather than absent: absent means "use the default", and the point
          // of the picker is being able to ask for this machine when the default is elsewhere.
          profileId: profileId ?? (local ? "local" : undefined),
          initialPrompt:
            [settings?.sttGlossary, seriesGlossary].filter(Boolean).join("、") || undefined,
          translate: Boolean(settings?.sttTranslate),
        }),
      });
      if (!startRes.ok) {
        const d = await startRes.json().catch(() => null);
        throw new Error(d?.error ?? `Failed to queue (HTTP ${startRes.status})`);
      }
      const { jobId } = (await startRes.json()) as { jobId: string };

      const job = await awaitJob(jobId, setRetransStatus);
      if (!job) return;
      if (job.status === "error") throw new Error(job.detail ? readStored(t, job.detail) : t("Re-transcription failed"));
      if (job.status === "cancelled") {
        setRetransStatus(t("Cancelled."));
        return;
      }

      await reloadTranscript();
      setDiarStatus(null);
      setDiarWarn(null);
      // Whatever the backend wanted said about this run — an endpoint that answered without
      // timings, so far.
      setRetransWarn(job.detail ? readStored(t, job.detail) : null);
      setRetransStatus(t('Done. Run "Diarize" to distinguish speakers.'));
    } catch (e) {
      setError(t("Re-transcription failed: {error}", { error: (e as Error).message }));
      setRetransStatus(null);
    } finally {
      setRetransing(false);
    }
  }, [
    confirm,
    meetingId,
    retransChoice,
    uploadTo,
    seriesGlossary,
    awaitJob,
    reloadTranscript, t
  ]);

  // Putting divided lines back together: the way out of a split that got it wrong. The lines
  // that came out of another are appended to it and removed; nothing else is touched.
  const undoSplit = useCallback(async () => {
    setError(null);
    setUndoingSplit(true);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/unsplit`, { method: "POST" });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(d?.error ?? `HTTP ${res.status}`);
      }
      await reloadTranscript();
    } catch (e) {
      setError(t("Could not undo the split ({reason})", { reason: (e as Error).message }));
    } finally {
      setUndoingSplit(false);
    }
  }, [meetingId, reloadTranscript, t]);

  const runDiarization = useCallback(async (speakers?: number) => {
    setError(null);
    setDiarWarn(null);
    setDiarizing(true);
    stopDiarRef.current = false;
    setDiarStatus(t("Adding to the queue…"));
    try {
      // The box wins when it has a number in it. Otherwise the count comes from the participant
      // list, read now rather than held in state: it is edited elsewhere on this page, and a
      // stale count is worse than none -- too low merges two people into one.
      // A count chosen when the meeting was ended (?speakers=) comes first.
      let want = speakers ?? Number(numSpeakers.trim());
      if (!Number.isFinite(want) || want <= 0) want = await expectedSpeakerCount(meetingId);

      const startRes = await fetch(`/api/meetings/${meetingId}/diarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numSpeakers: want > 0 ? want : undefined }),
      });
      if (!startRes.ok) {
        const d = await startRes.json().catch(() => null);
        throw new Error(d?.error ?? `Failed to queue (HTTP ${startRes.status})`);
      }
      const { jobId } = (await startRes.json()) as { jobId: string };
      diarJobRef.current = jobId;

      const job = await awaitJob(jobId, setDiarStatus, () => stopDiarRef.current);
      if (!job) {
        setDiarStatus(t("Stopped."));
        return;
      }
      if (job.status === "error") {
        // Nothing before this point needs a token, so this is where a fresh install finds out.
        if (/hf_token|hugging ?face/i.test(job.detail ?? "")) {
          setNeedsHfToken(true);
          setDiarStatus(null);
          return;
        }
        throw new Error(job.detail ? readStored(t, job.detail) : t("Diarization failed"));
      }
      if (job.status === "cancelled") {
        setDiarStatus(t("Stopped."));
        return;
      }

      await reloadTranscript();
      // The runner reports what it found — one speaker where several were expected has causes
      // the person can act on.
      setDiarWarn(job.detail ? readStored(t, job.detail) : null);
      setDiarStatus(job.detail ? null : t("Done. Rename the speakers below if you like."));
    } catch (e) {
      setError(t("Diarization failed: {error}", { error: (e as Error).message }));
      setDiarStatus(null);
    } finally {
      setDiarizing(false);
      setStoppingDiar(false);
    }
  }, [meetingId, numSpeakers, awaitJob, reloadTranscript, t]);

  // Force-stop a running diarization: tell STT to kill the subprocess and break the poll loop.
  const stopDiarization = useCallback(async () => {
    stopDiarRef.current = true;
    setStoppingDiar(true);
    setDiarStatus(t("Stopping…"));
    try {
      // The job, not the service: the queue owns the run now, and it knows which of its
      // kinds can actually be stopped.
      if (diarJobRef.current) {
        await fetch(`/api/jobs/${diarJobRef.current}/cancel`, {
          method: "POST",
          signal: AbortSignal.timeout(6000),
        }).catch(() => {});
      }
    } finally {
      setStoppingDiar(false);
    }
  }, [t]);

  const gpu = useGpuBusy();
  // Diarization and re-transcription both use the GPU. Block starting one while any other
  // GPU task (minutes generation, or an STT job we didn't start) is running.
  // Whether *this page* has something in flight. What the GPU is doing elsewhere no longer
  // stops these buttons: Diarize and Re-transcribe are queued jobs, and a queue you may not
  // add to while it is busy is a disabled button with extra steps. The one thing still refused
  // is asking twice for the same meeting, which the routes answer with a 409.
  const busy = diarizing || retransing;
  // Not this meeting's own recording: on the page that is recording it, "Recording in progress —
  // anything started now waits its turn" is the page talking about itself.
  const ownRecording = gpu.kind === "recording" && gpu.minutesMeetingId === meetingId;
  const elsewhere = gpu.busy && !diarizing && !retransing && !ownRecording ? busyLabel(t, gpu.kind) : null;

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
  const { subscribe: recSubscribe, current: recCurrent } = useRecorderApi();
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
      if (data.speakerLabels) setSpeakerLabels(readNames(data.speakerLabels));

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

    // Recorded in this tab (app/recorder.tsx): fetch a line the moment it is saved, rather than
    // up to four seconds later.
    const off = recSubscribe((e) => {
      if (e.meetingId === meetingId && e.kind === "saved" && !stopped) {
        clearTimeout(timer);
        void tick();
      }
    });

    void tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      off();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [endedAt, upcoming, meetingId, meetingStartedAt, router, recSubscribe]);

  const live = !endedAt && !upcoming;

  // While this tab records the meeting, the page follows the newest line down — as long as it
  // is already at the bottom. Scrolled up to read something, it stays put.
  const lineCount = useRef(transcripts.length);
  useEffect(() => {
    const grew = transcripts.length > lineCount.current;
    lineCount.current = transcripts.length;
    if (!grew || recCurrent()?.meetingId !== meetingId) return;
    const root = window.document.documentElement;
    if (window.innerHeight + window.scrollY >= root.scrollHeight - 320) {
      window.scrollTo({ top: root.scrollHeight, behavior: "smooth" });
    }
  }, [transcripts.length, meetingId, recCurrent]);

  // "Diarize" on the recording page lands here with ?autodiarize=1: start diarization once
  // (progress is shown inline in the toolbar) and drop the param from the URL so a reload
  // doesn't re-trigger (results are cached on the STT side anyway, so a re-run is cheap).
  const autoDiarizeTried = useRef(false);
  useEffect(() => {
    if (autoDiarizeTried.current || transcripts.length === 0 || !extensions.speakers) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("autodiarize") !== "1") return;
    autoDiarizeTried.current = true;
    const speakers = Number(params.get("speakers"));
    params.delete("autodiarize");
    params.delete("speakers");
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    void runDiarization(Number.isInteger(speakers) && speakers > 0 ? speakers : undefined);
  }, [transcripts.length, runDiarization, extensions.speakers]);

  // Worked out here rather than inside t(): the string scanner reads a plural choice only when
  // its condition has no call in it, and missed both forms (they showed in English).
  const daysLeft = recInfo?.expiresAt ? remainingDays(recInfo.expiresAt) : 0;

  // The three that open something open it under the heading, one at a time; the rest only take
  // the transcript away or measure it, and wait behind "…".
  // Offered whenever there are lines: it is where you learn whether they can be separated.
  const speakersTool = !readOnly && extensions.speakers && transcripts.length > 0;
  const fixTool = transcripts.length > 0 && !readOnly;
  const retransTool = Boolean(recInfo?.exists) && !readOnly;
  const canMeasure = !readOnly && Boolean(endedAt) && Boolean(recInfo?.exists) && transcripts.length > 0;
  const toolButton = (k: NonNullable<Tool>, label: string, Icon: typeof SearchIcon) => (
    <button
      type="button"
      onClick={() => setTool((v) => (v === k ? null : k))}
      aria-pressed={tool === k}
      title={label}
      aria-label={label}
      className={`${HEAD_BUTTON} ${tool === k ? "bg-[var(--hover-surface)] !text-[var(--accent)]" : ""}`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
  const running = [
    voicing ? t("Measuring…") : null,
    judging ? t("Judging emotion…") : null,
  ].filter(Boolean);

  return (
    <div>
      <div className="flex items-center gap-0.5">
        <h2 className="flex min-w-0 flex-1 items-baseline gap-2 text-base font-semibold text-[var(--text-strong)]">
          {t("Transcript")}
          <span className="text-sm font-normal tabular-nums text-[var(--text-muted)]">{transcripts.length}</span>
          {live ? (
            <span
              className="inline-flex items-center gap-1.5 self-center text-xs font-medium text-[var(--text-muted)]"
              title={
                liveOffline
                  ? t("Cannot reach the server — retrying")
                  : t("This meeting is being recorded; new utterances appear as they are transcribed")
              }
            >
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  liveOffline ? "bg-[var(--text-muted)]" : "animate-pulse bg-red-500"
                }`}
              />
              {liveOffline ? t("Reconnecting…") : t("Live")}
            </span>
          ) : null}
        </h2>
        {/* Copying is always in sight, as it is beside the minutes: it is what is done with a
            transcript most, so it is not one of the things behind "…". */}
        {transcripts.length > 0 ? <CopyButton text={transcriptText} label={t("Copy transcript")} /> : null}
        {speakersTool ? toolButton("speakers", t("Speaker separation"), PeopleIcon) : null}
        {fixTool ? toolButton("fix", t("Fix wording"), SpellCheckIcon) : null}
        {retransTool ? toolButton("retrans", t("Re-transcribe"), RefreshIcon) : null}
        {/* What to do with the transcript once it reads correctly: take it away, show the
            translations beside it, or have it checked. None of these change a word of it. */}
        {transcripts.length > 0 ? (
          <DropMenu label={t("More")} trigger={<DotsIcon className="h-4 w-4" />} className={HEAD_BUTTON} width={224}>
            {(close) => (
              <>
                <button
                  type="button"
                  role="menuitem"
                  className={MENU_ITEM}
                  onClick={() => {
                    close();
                    void shareText(transcriptText, `${meetingTitle} transcript`).then((how) => {
                      if (how === "shared") return;
                      setNotice(how === "copied" ? t("Copied") : t("Copy failed"));
                      setTimeout(() => setNotice(null), 2500);
                    });
                  }}
                >
                  <ShareIcon className="h-3.5 w-3.5" />
                  {t("Share transcript")}
                </button>
                {canMeasure && (extensions.voiceCues || extensions.emotion) ? (
                  <MenuRule />
                ) : null}
                {canMeasure && extensions.voiceCues ? (
                  <button
                    type="button"
                    role="menuitem"
                    className={MENU_ITEM}
                    disabled={busy || voicing}
                    title={t("Mark the lines said louder, higher or faster than the speaker usually was — or quieter, lower or slower")}
                    onClick={() => {
                      close();
                      void runVoiceCues();
                    }}
                  >
                    <VolumeUpIcon className="h-3.5 w-3.5" />
                    {voicing ? t("Measuring…") : t("Check the voice")}
                  </button>
                ) : null}
                {canMeasure && extensions.emotion ? (
                  <button
                    type="button"
                    role="menuitem"
                    className={MENU_ITEM}
                    disabled={busy || judging}
                    title={t("Judged from the voice alone: how a line sounded, not what anybody felt.")}
                    onClick={() => {
                      close();
                      void runEmotion();
                    }}
                  >
                    <FaceJoyIcon className="h-3.5 w-3.5" />
                    {judging ? t("Judging emotion…") : t("Judge emotion")}
                  </button>
                ) : null}
                {hasTranslations && extensions.translation ? (
                  <>
                    <MenuRule />
                    <button
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={showTranslation}
                      className={MENU_ITEM}
                      onClick={() => {
                        close();
                        setShowTranslation((v) => !v);
                      }}
                    >
                      <span className="inline-flex h-3.5 w-3.5 items-center justify-center">
                        {showTranslation ? <CheckIcon className="h-3.5 w-3.5 text-[var(--accent)]" /> : null}
                      </span>
                      {t("Show translations")}
                    </button>
                  </>
                ) : null}
              </>
            )}
          </DropMenu>
        ) : null}
      </div>

      {/* Speaker separation, as the three steps it is (v4): how many voices, telling them apart,
          and naming them — with what is done ticked and what is next marked, because "has this
          meeting been separated, and what is left?" had no answer anywhere on the page. Naming
          ends with remembering the voices, which is what makes the next meeting name itself. */}
      {tool === "speakers" && speakersTool ? (
        <ToolPanel
          title={t("Speaker separation")}
          hint={t("Work out who spoke each line, and give them names")}
          onClose={() => setTool(null)}
        >
          <ol id={`speakers-${meetingId}`} className="space-y-3">
            <Step n={1} state={stepState(1)} title={t("How many")}>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={numSpeakers}
                  onChange={(e) => setNumSpeakers(e.target.value)}
                  disabled={busy}
                  placeholder={expectedVoices > 0 ? String(expectedVoices) : t("auto")}
                  aria-label={t("How many voices to look for")}
                  className="w-16 rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] disabled:opacity-60"
                />
                <span className="text-xs text-[var(--text-muted)]">
                  {numSpeakers.trim()
                    ? t("As entered.")
                    : expectedVoices > 0
                      ? t("From the participants who spoke.")
                      : t("Left empty, it is guessed. Tick who spoke under Participants to set it.")}
                </span>
              </div>
            </Step>

            <Step n={2} state={stepState(2)} title={t("Separate")}>
              {recInfo && !recInfo.exists && !diarizing ? (
                <p className="text-xs text-[var(--text-muted)]">
                  {separated
                    ? `${t(voiceKeys.length === 1 ? "Told apart: 1 voice." : "Told apart: {n} voices.", {
                        n: voiceKeys.length,
                      })} ${t("The recording is no longer kept, so it cannot be done again.")}`
                    : t("The recording is no longer kept, so the voices cannot be told apart.")}
                </p>
              ) : diarizing ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-[var(--accent-sub)]">{diarStatus}</span>
                  <button
                    type="button"
                    onClick={() => void stopDiarization()}
                    disabled={stoppingDiar}
                    className="btn-danger !px-3 !py-1 text-xs"
                  >
                    <span aria-hidden className="inline-block h-2 w-2 rounded-[2px] bg-[var(--error)]" />
                    {stoppingDiar ? t("Stopping…") : t("Stop")}
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {separated ? (
                    <span className="text-xs text-[var(--text-secondary)]">
                      {t(voiceKeys.length === 1 ? "Told apart: 1 voice." : "Told apart: {n} voices.", {
                        n: voiceKeys.length,
                      })}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void runDiarization()}
                    disabled={busy}
                    className={separated ? "btn-outline !px-3 !py-1 text-xs" : "btn-ink !px-4 !py-1.5"}
                    title={t(
                      "Analyze the recording and assign a speaker to each line (entering the participant count improves accuracy)",
                    )}
                  >
                    <PeopleIcon />
                    {separated ? t("Separate again") : t("Separate speakers")}
                  </button>
                  {/* Only once something has been divided, which is the only time it means
                      anything. */}
                  {transcripts.some((x) => x.splitOfId) ? (
                    <button
                      type="button"
                      onClick={() => void undoSplit()}
                      disabled={busy || undoingSplit}
                      className="btn-outline !px-3 !py-1 text-xs"
                      title={t("Put lines that were divided at a speaker change back together as they were")}
                    >
                      {undoingSplit ? t("Undoing…") : t("Undo split")}
                    </button>
                  ) : null}
                </div>
              )}
            </Step>

            <Step n={3} state={stepState(3)} title={t("Name them")}>
              {showSpeakerTools && separated ? (
                <>
                  <SpeakerNamesEditor speakers={managerKeys} names={speakerLabels} onName={nameSpeaker} />
                  <p className="mt-1.5 text-xs text-[var(--text-muted)]">{t("A name here changes every line by that speaker.")}</p>

                  {/* Voice profiles: what makes the next meeting name these people by itself. */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void saveVoiceProfiles()}
                      disabled={profileBusy || busy}
                      className="btn-outline !px-3 !py-1 text-xs"
                    >
                      {profileBusy ? t("Saving…") : t("Remember their voices")}
                    </button>
                    <span className="text-xs text-[var(--text-muted)]">
                      {t("The named speakers are then named automatically in later meetings.")}
                    </span>
                  </div>
                  {profileMsg ? <p className="mt-1.5 text-xs text-[var(--accent-sub)]">{profileMsg}</p> : null}
                  {profiles.length > 0 ? (
                    <p className="mt-2 text-xs text-[var(--text-muted)]">
                      {t("Voices remembered:")}{" "}
                      {profiles.map((p, i) => (
                        <span key={p.name} className="whitespace-nowrap text-[var(--text-secondary)]">
                          {i > 0 ? ", " : ""}
                          {p.name}
                          <button
                            type="button"
                            onClick={() => void deleteProfile(p.name)}
                            aria-label={t("Delete the voice profile of {name}", { name: p.name })}
                            title={t("Delete this voice profile")}
                            className="ml-0.5 text-[var(--text-muted)] hover:text-[var(--error)]"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="text-xs text-[var(--text-muted)]">{t("Once the voices are told apart.")}</p>
              )}
            </Step>
          </ol>
        </ToolPanel>
      ) : null}

      {/* Fixing the wording — a term found by hand, or the glossary's misheard terms, as one
          list of changes to tick. Rewriting text moves no positions, so the recording's
          utterance boundaries stay valid. */}
      {tool === "fix" && fixTool ? (
        <ToolPanel title={t("Fix wording")} hint={t("See every line it changes before it does")} onClose={() => setTool(null)}>
          <SpellingFix
            meetingId={meetingId}
            lines={transcripts.map((line, i) => ({
              id: line.id,
              who: multiSpeaker ? shownName(line.speakerType, speakerLabels, t) : null,
              at: formatOffset(elapsedSeconds(i)),
            }))}
            glossary={extensions.corrections}
            hasCorrectionTerms={hasCorrectionTerms}
            onReplaced={(applied) =>
              setTranscripts((list) => list.map((l) => (applied.has(l.id) ? { ...l, text: applied.get(l.id)! } : l)))
            }
            editLine={editTranscript}
          />
        </ToolPanel>
      ) : null}

      {/* Re-transcription — separate from diarization: it re-runs speech recognition and
          replaces the whole transcript. */}
      {tool === "retrans" && retransTool ? (
        <ToolPanel
          title={t("Re-transcribe")}
          hint={t("Recognise the recording again and replace the transcript")}
          onClose={() => setTool(null)}
        >
          {transcripts.length === 0 && !retransing ? (
            <p className="mb-2 text-xs text-[var(--text-muted)]">
              {t(
                "There is no transcript, but the recording remains. You can restore it from here.",
              )}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {/* min-w-0 on both: a select is as wide as its longest option, and a flex item
                will not shrink below its content unless told it may. Without this a long model
                name pushes the row past the screen on a phone -- wrapping does not help,
                because the item that wrapped is still too wide for the line it wrapped to. */}
            {/* One picker for both, because "where" and "which model" are the same question
                from here: a saved endpoint brings its own model, and a local model implies this
                machine. Splitting them into two controls would let you choose a combination
                that does not exist. */}
            <label className="flex min-w-0 max-w-full items-center gap-1 text-xs text-[var(--text-muted)]">
              {t("Recognise with")}
              <select
                value={retransChoice}
                onChange={(e) => setRetransChoice(e.target.value)}
                disabled={busy}
                className="min-w-0 max-w-full flex-1 truncate rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] disabled:opacity-60"
              >
                <option value="">
                  {defaultProfileId
                    ? t("Same as settings ({endpoint})", {
                        endpoint:
                          sttProfiles.find((p) => p.id === defaultProfileId)?.name ?? t("endpoint"),
                      })
                    : t("Same as settings (this machine)")}
                </option>
                <optgroup label={t("On this machine")}>
                  {WHISPER_MODELS.map((m) => (
                    <option key={m.value} value={`local:${m.value}`}>
                      {m.label}
                    </option>
                  ))}
                </optgroup>
                {sttProfiles.length > 0 ? (
                  <optgroup label={t("Saved endpoints")}>
                    {sttProfiles.map((p) => (
                      <option key={p.id} value={`profile:${p.id}`}>
                        {p.name}
                        {p.model ? ` — ${p.model}` : ""}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void retranscribe()}
              disabled={busy}
              className="btn-outline"
            >
              <RefreshIcon />
              {retransing ? t("Recognizing…") : t("Re-transcribe")}
            </button>
            <span className="text-xs text-[var(--text-muted)]">
              {t("Re-recognizes the whole recording and replaces the transcript.")}
            </span>
          </div>
        </ToolPanel>
      ) : null}

      {/* What is going on, and what came of it. Outside the panels, so closing one does not
          hide a run it started. */}
      {diarStatus && !(tool === "speakers" && diarizing) ? (
        <p className="mt-2 text-xs text-[var(--accent-sub)]">{diarStatus}</p>
      ) : null}
      {diarWarn ? <p className="mt-2 text-xs text-[var(--warning)]">{diarWarn}</p> : null}
      {retransStatus ? <p className="mt-2 text-xs text-[var(--accent-sub)]">{retransStatus}</p> : null}
      {retransWarn ? <p className="mt-2 text-xs text-[var(--warning)]">{retransWarn}</p> : null}
      {running.length > 0 ? (
        <p className="mt-2 flex items-center gap-2 text-xs text-[var(--accent-sub)]">
          <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
          {running.join(" · ")}
        </p>
      ) : null}
      {notice ? <p className="mt-2 text-xs text-[var(--text-muted)]">{notice}</p> : null}

      {needsHfToken ? (
        <div className="mt-2 rounded-lg border border-[var(--warning)] bg-[var(--elevated)] p-3 text-xs">
          <p className="font-medium text-[var(--text-strong)]">
            {t("Speaker separation needs a Hugging Face token")}
          </p>
          <p className="mt-1 text-[var(--text-secondary)]">
            {t(
              "The model that tells speakers apart is free, but its authors require you to accept their terms first. It is a one-time setup of a few minutes; everything else — recording, transcription, minutes — works without it.",
            )}
          </p>
          <a
            className="mt-2 inline-block text-[var(--accent)] underline"
            href="https://github.com/ikasast/voxinq-meeting/blob/release/docs/setup.md#diarization-needs-a-hugging-face-token"
            target="_blank"
            rel="noreferrer"
          >
            {t("How to set it up →")}
          </a>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-[var(--error)]">{error}</p> : null}
      {elsewhere ? (
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          {t("{task} — anything started now waits its turn.", { task: elsewhere })}{" "}
          <Link href="/queue" className="underline">
            {t("See the queue")}
          </Link>
        </p>
      ) : null}

      {/* The recording: play it, and from any line's time. Kept or not, and trimmed, from the
          line under the player. Not while it is still being recorded: the file has no end yet, so
          the player could only say 0:00 / 0:00. */}
      {recInfo?.exists && !live ? (
        <div className="mt-3">
          <audio
            ref={audioRef}
            controls
            preload="metadata"
            src={`${sttHttpBase()}/recordings/${meetingId}/audio`}
            className="h-9 w-full"
          />
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-muted)]">
            <span>{t("Click a timestamp to play from that point.")}</span>
            <span aria-hidden>·</span>
            {/* With its lock, so that on a phone the lock does not wrap onto a line of its own. */}
            <span className="inline-flex items-center gap-1">
              <span>
                {t("Recording:")}{" "}
                {recInfo.protected ? (
                  <span className="text-[var(--accent-sub)]">{t("protected (not auto-deleted)")}</span>
                ) : recInfo.expiresAt ? (
                  <>
                    {t(daysLeft === 1 ? "auto-deletes in 1 day" : "auto-deletes in {n} days", { n: daysLeft })}
                  </>
                ) : (
                  t("saved")
                )}
              </span>
              {/* Not from outside: keeping a recording is not on the external allow-list, so
                  this answered 403 — a button that cannot do the thing it names. */}
              {!readOnly ? (
                <button
                  type="button"
                  onClick={() => void toggleProtect()}
                  disabled={recBusy}
                  aria-label={t("Protect the recording")}
                  aria-pressed={recInfo.protected}
                  title={
                    recInfo.protected
                      ? t("Protected. If unprotected, it is auto-deleted once the retention period has passed from then")
                      : t("Protect the recording so it is not auto-deleted")
                  }
                  className={`${ROW_BUTTON} ${recInfo.protected ? "!text-[var(--accent-sub)]" : ""}`}
                >
                  {recInfo.protected ? <LockIcon className="h-3.5 w-3.5" /> : <LockOpenIcon className="h-3.5 w-3.5" />}
                </button>
              ) : null}
            </span>
            {/* Not while it is still being recorded: the end of the recording is not known yet. */}
            {!readOnly && !live && recInfo.durationSec ? (
              <TrimRecording
                meetingId={meetingId}
                durationSec={recInfo.durationSec}
                linePositions={linePositions}
                audioRef={audioRef}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {/* The meeting at a glance, a minute at a time, from what Emotion found (mood-strip.tsx). */}
      {!live && transcripts.length > 0 ? (
        <MoodStrip lines={transcripts} elapsed={elapsedSeconds} showEmotion={extensions.emotion} />
      ) : null}

      {transcripts.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--text-muted)]">
          {/* One being made is not the same as none. */}
          {retransing && retransStatus
            ? retransStatus
            : live
              ? t("What is said appears here once recording starts.")
              : t("No transcript.")}
        </p>
      ) : (
        <ul className="mt-3">
          {transcripts.map((line, i) => (
            <TranscriptRow
              key={line.id}
              item={line}
              elapsed={elapsedSeconds(i)}
              labels={speakerLabels}
              reassignKeys={reassignKeys}
              showSpeaker={multiSpeaker}
              sameSpeaker={i > 0 && transcripts[i - 1].speakerType === line.speakerType}
              canSeek={Boolean(recInfo?.exists)}
              onSeek={() => seekTo(wavPosition(i))}
              onReassign={(speaker) => void setLineSpeaker(line.id, speaker)}
              onDelete={() => void deleteTranscript(line.id)}
              onEdit={(text) => editTranscript(line.id, text)}
              showTranslation={showTranslation && extensions.translation}
              readOnly={readOnly}
            />
          ))}
        </ul>
      )}
      {/* After the last line: what is being heard right now, while this tab records. */}
      {live ? <Hearing meetingId={meetingId} /> : null}
    </div>
  );
}

/**
 * What is being heard and is not a line yet, when this tab is recording the meeting. Its own
 * component, so the list above does not re-render each time a word is added to it.
 */
function Hearing({ meetingId }: { meetingId: string }) {
  const t = useT();
  const { session, partial } = useRecorderState();
  if (session?.meetingId !== meetingId || !partial) return null;
  return (
    <p className="mt-3 flex items-baseline gap-2 text-sm italic text-[var(--text-muted)]">
      <span aria-hidden className="recording-dot inline-block h-2 w-2 shrink-0 rounded-full bg-[var(--error)] not-italic" />
      <span className="sr-only">{t("Recognizing:")}</span>
      {partial}
    </p>
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
