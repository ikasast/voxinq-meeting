"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { type RecognizerStatus, type SttHandle, startMic, sttHttpBase } from "@/lib/stt/client";
import {
  type NativeHandle,
  type NativeSaved,
  attachNative,
  hasNativeRecorder,
  nativeState,
  startNative,
} from "@/lib/stt/native";
import { effectiveSttLanguage } from "@/lib/stt/models";
import { sttHealth } from "@/lib/stt/preload";
import { applyTranscript, transcribeRecording } from "@/lib/stt/transcribe-recording";
import { useConfirmEx } from "../../confirm-dialog";
import { PreflightCheck } from "./preflight-check";
import { useT } from "@/app/locale-provider";

/** A job holding the GPU when a recording wants it. Mirrors lib/queue/recording.ts. */
type Contender = { id: string; kind: string; meetingId: string | null; title: string | null };

type TranscriptEntry = {
  id: string;
  speaker: string;
  text: string;
  at: Date;
  seq?: number; // utterance number within this session; a translation arrives under it
  translation?: string; // Japanese translation, when the utterance was in another language
};

function formatElapsed(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Returns the key rather than the words, so the caller — which has the locale — translates it.
// A module-level function has no hook to reach the language with, and threading one in would
// make five callers pass a translator to something whose whole job is a switch.
function statusLabel(status: RecognizerStatus | "idle") {
  switch (status) {
    case "connecting":
      return "Preparing"; // model loading. audio is captured and transcribed together once ready
    case "open":
      return "Listening";
    case "reconnecting":
      return "Reconnecting";
    case "error":
      return "Error";
    case "closed":
    case "idle":
    default:
      return "Stopped";
  }
}

/** The five strings statusLabel can return, spelled out so the table's test can see them. */
export function statusText(
  t: (k: string) => string,
  status: RecognizerStatus | "idle",
): string {
  const key = statusLabel(status);
  const table: Record<string, string> = {
    Preparing: t("Preparing"),
    Listening: t("Listening"),
    Reconnecting: t("Reconnecting"),
    Error: t("Error"),
    Stopped: t("Stopped"),
  };
  return table[key] ?? key;
}

function statusDot(status: RecognizerStatus | "idle") {
  if (status === "open") return "bg-[var(--error)] animate-pulse";
  if (status === "connecting" || status === "reconnecting") return "bg-[var(--warning)] animate-pulse";
  if (status === "error") return "bg-[var(--error)]";
  return "bg-[var(--border-strong)]";
}

export default function RecordingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: meetingId } = use(params);
  const router = useRouter();
  const confirm = useConfirmEx();

  const [title, setTitle] = useState<string>("");
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [now, setNow] = useState<Date>(new Date());
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);

  const [status, setStatus] = useState<RecognizerStatus | "idle">("idle");
  const active = status === "connecting" || status === "open" || status === "reconnecting";
  const [partial, setPartial] = useState<string>("");
  const [level, setLevel] = useState(0); // input audio level (RMS 0..1)
  // Set while the input is hitting the rails. Clipping cannot be undone afterwards, so this is
  // shown during the meeting rather than reported as a quality problem later.
  const [clipping, setClipping] = useState(false);
  const [source, setSource] = useState<"mic" | "display" | "both">("mic");
  const sourceRef = useRef(source);
  const [displaySupported, setDisplaySupported] = useState(true);
  // The model actually used = URL override > this meeting's stored model > settings default.
  // Kept as three sources because the meeting and the settings load independently.
  const settingsModelRef = useRef<string | undefined>(undefined);
  const meetingModelRef = useRef<string | undefined>(undefined);
  const sttLanguageRef = useRef<string | undefined>(undefined);
  const meetingLangRef = useRef<string | undefined>(undefined); // per-meeting language (overrides settings)
  const sttGlossaryRef = useRef<string | undefined>(undefined);
  const seriesGlossaryRef = useRef<string | undefined>(undefined);
  const sttMicModeRef = useRef<string | undefined>(undefined);
  const sttTranslateRef = useRef(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [meetingLoaded, setMeetingLoaded] = useState(false);
  // Whisper model resident on the STT service, polled until it matches this meeting's model —
  // so the user can see the model is ready before pressing record.
  const [loadedModel, setLoadedModel] = useState<string | null | undefined>(undefined);
  // null until /health answers. True = this host records now and transcribes at the end,
  // because recognition here is slower than speech (see lib/stt/preload.ts).
  const [deferred, setDeferred] = useState<boolean | null>(null);
  const [deferredStatus, setDeferredStatus] = useState<string | null>(null);
  // Chosen for this meeting rather than decided by the hardware: something else was using the
  // card and the answer was to leave it alone. Recording happens; the text arrives at the end.
  const [recordOnly, setRecordOnly] = useState(false);
  // Folded away when recording starts: they are advice about setting up, and once you are set
  // up the transcript should have the room. Re-openable, and it stays open if you re-open it.
  const [tipsOpen, setTipsOpen] = useState(true);
  // The microphone the check left open, for `startMic` to take over rather than acquire again.
  const preflightStreamRef = useRef<MediaStream | null>(null);
  // Transcription settings in effect for this recording (shown to the user). The LLM settings
  // are not part of recording, so they are not collected here.
  const [cfg, setCfg] = useState<{
    sttLanguage?: string;
    micMode?: string;
  } | null>(null);
  const autostartTried = useRef(false);
  const [external, setExternal] = useState(false);
  const [meetingLang, setMeetingLang] = useState<string | undefined>(undefined);
  // Whether this meeting has already ended. A back-navigation can land here again, so this
  // guards against restarting the recording / meeting timer on a finished meeting.
  const [ended, setEnded] = useState(false);
  const t = useT();
  const endedRef = useRef(false);

  // Per-recording temporary settings passed from the new-meeting screen (not saved to the settings file).
  // STT language is saved on the meeting (meeting.sttLanguage), so it is not handled here.
  const overrides = useMemo(() => {
    if (typeof window === "undefined") return {} as { model?: string; mic?: string; source?: string };
    const p = new URLSearchParams(window.location.search);
    return {
      model: p.get("model") || undefined,
      mic: p.get("mic") || undefined,
      source: p.get("source") || undefined,
    };
  }, []);

  // Seconds of stillness before the screen goes black, from Settings. 0 = never; resting by
  // hand still works.
  const [restAfter, setRestAfter] = useState(0);
  const [resting, setResting] = useState(false);
  // The level meter fires ~10 times a second and re-renders the page each time. Nothing is on
  // screen to show it while resting, and the point of resting is to stop spending.
  const restingRef = useRef(false);
  const [toast, setToast] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"none" | "summary">("none");

  const handleRef = useRef<SttHandle | null>(null);
  // Inside the Android app the recording is the app's, in a service of its own: the screen can
  // go off, and this page can even be closed, without it stopping (lib/stt/native.ts).
  const [native, setNative] = useState(false);
  const nativeRef = useRef<NativeHandle | null>(null);
  const transcriptScrollRef = useRef<HTMLDivElement>(null);

  // Elapsed time
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // On external (Funnel) access, STT is unreachable so recording is impossible. Used to warn and disable recording.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/context")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { external?: boolean } | null) => {
        if (!cancelled && d?.external) setExternal(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // The default recording source is saved per device in the browser (e.g. phone=mic / PC=both).
  // Phones etc. lack getDisplayMedia, so disable PC audio/both and fall back to mic.
  useEffect(() => {
    const supported =
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getDisplayMedia === "function";
    setDisplaySupported(supported);

    // Temporary settings (query) take top priority; otherwise the per-device saved value.
    const saved = overrides.source ?? localStorage.getItem("voxinq.source");
    let initial: "mic" | "display" | "both" =
      saved === "mic" || saved === "display" || saved === "both" ? saved : "mic";
    if (!supported && (initial === "display" || initial === "both")) initial = "mic";
    setSource(initial);
    sourceRef.current = initial;
  }, [overrides.source]);

  // Fetch initial data
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/meetings/${meetingId}`);
      if (!res.ok) {
        if (res.status === 404) router.replace("/");
        return;
      }
      const data = (await res.json()) as {
        title: string;
        startedAt: string;
        endedAt: string | null;
        sttLanguage: string | null;
        whisperModel: string | null;
        series?: { sttGlossary: string | null } | null;
        transcripts: { id: string; speakerType: string; text: string; createdAt: string }[];
      };
      if (cancelled) return;
      setTitle(data.title);
      // The model chosen when the meeting was set up. Stored on the meeting, so re-entering
      // or reloading this screen still records with it rather than the settings default.
      if (data.whisperModel) meetingModelRef.current = data.whisperModel;
      // Per-series glossary terms are appended to the global glossary at recording start.
      if (data.series?.sttGlossary) seriesGlossaryRef.current = data.series.sttGlossary;
      setStartedAt(new Date(data.startedAt));
      // Already-ended meeting. With ?resume=1 (Resume recording), reopen it and append a new
      // session to the existing recording; otherwise block restart (e.g. a back-navigation).
      if (data.endedAt) {
        const resume = new URLSearchParams(window.location.search).get("resume") === "1";
        if (resume) {
          await fetch(`/api/meetings/${meetingId}/reopen`, { method: "POST" }).catch(() => {});
          // Stay "not ended" so autostart proceeds and the session appends to the recording.
        } else {
          endedRef.current = true;
          setEnded(true);
        }
      }
      // The per-meeting language overrides the settings default (adopted at start).
      if (data.sttLanguage) {
        meetingLangRef.current = data.sttLanguage;
        setMeetingLang(data.sttLanguage);
      }
      setMeetingLoaded(true);
      setTranscripts(
        data.transcripts.map((t) => ({
          id: t.id,
          speaker: t.speakerType,
          text: t.text,
          at: new Date(t.createdAt),
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [meetingId, router]);

  // Fetch settings (model, STT language, glossary) and pass them to the STT service at recording start.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          s: {
            whisperModel?: string;
            sttLanguage?: string;
            sttGlossary?: string;
            micMode?: string;
            sttTranslate?: boolean;
            restScreenSeconds?: number;
          } | null,
        ) => {
          if (cancelled) return;
          if (typeof s?.restScreenSeconds === "number") setRestAfter(s.restScreenSeconds);
          if (s?.whisperModel) settingsModelRef.current = s.whisperModel;
          if (s?.sttLanguage) sttLanguageRef.current = s.sttLanguage;
          if (s?.sttGlossary) sttGlossaryRef.current = s.sttGlossary;
          if (s?.micMode) sttMicModeRef.current = s.micMode;
          sttTranslateRef.current = Boolean(s?.sttTranslate);
          // Override with this recording's temporary settings (query).
          if (overrides.mic) sttMicModeRef.current = overrides.mic;
          if (s)
            setCfg({
              sttLanguage: s.sttLanguage,
              micMode: overrides.mic ?? s.micMode,
            });
          setSettingsLoaded(true);
        },
      )
      .catch(() => setSettingsLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [overrides.mic]);

  // Resolved once both sources have loaded, then used everywhere (render included) so the
  // displayed model and the one sent to STT can never disagree.
  const [activeModel, setActiveModel] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!settingsLoaded || !meetingLoaded) return;
    setActiveModel(overrides.model ?? meetingModelRef.current ?? settingsModelRef.current);
  }, [settingsLoaded, meetingLoaded, overrides.model]);

  // Preload the Whisper model: loading takes tens of seconds, so start it on the STT side
  // when the recording page opens. Waits for the meeting too — preloading before its stored
  // model is known would warm the settings default and then have to swap.
  // Also warms the translation model when translation is on: it is the last chance before
  // recording starts, and a cold load triggered by the first non-Japanese utterance finishes
  // after the WebSocket has closed, so those translations are lost.
  useEffect(() => {
    if (!settingsLoaded || !meetingLoaded || external) return;
    const params = new URLSearchParams();
    if (activeModel) params.set("model", activeModel);
    if (sttTranslateRef.current) params.set("translate", "1");
    const qs = params.size > 0 ? `?${params}` : "";
    fetch(`${sttHttpBase()}/preload${qs}`, { method: "POST" }).catch(() => {});
  }, [settingsLoaded, meetingLoaded, external, activeModel]);

  // Track whether the model is loaded yet. Polls while it is still loading and stops once it
  // is resident; recording itself buffers audio until the model is ready, but starting a
  // meeting without knowing that has cost whole recordings.
  useEffect(() => {
    if (!settingsLoaded || !meetingLoaded || external || ended) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const want = activeModel;
    const poll = async () => {
      const h = await sttHealth(6000);
      if (stop) return;
      setLoadedModel(h ? (h.loaded ?? null) : null);
      // An older service does not report this and only ever did live.
      const isDeferred = h ? h.liveTranscription === false : null;
      setDeferred(isDeferred);
      // Nothing loads a model on a deferred host, so waiting for one would poll forever and
      // leave "Loading model..." on screen for the whole meeting.
      if (isDeferred) return;
      // Keep polling until the model we need is the one resident.
      if (!h || !h.loaded || (want && h.loaded !== want)) {
        timer = setTimeout(() => void poll(), 3000);
      }
    };
    void poll();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, [settingsLoaded, meetingLoaded, external, ended, activeModel]);

  // Auto-scroll
  useEffect(() => {
    transcriptScrollRef.current?.scrollTo({
      top: transcriptScrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [transcripts.length, partial]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setLastError(msg);
    window.setTimeout(() => setToast(null), 4500);
  }, []);

  const saveTranscript = useCallback(
    async (
      speakerKey: string,
      text: string,
      seq?: number,
      audio?: { startMs: number; endMs: number },
    ) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      try {
        const res = await fetch("/api/transcripts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            meetingId,
            speakerType: speakerKey,
            text: trimmed,
            audioStartMs: audio?.startMs,
            audioEndMs: audio?.endMs,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const created = (await res.json()) as { id: string; createdAt: string };
        setTranscripts((prev) => [
          ...prev,
          {
            id: created.id,
            speaker: speakerKey,
            text: trimmed,
            at: new Date(created.createdAt),
            seq,
          },
        ]);
      } catch (e) {
        showToast(t("Failed to save utterance: {error}", { error: (e as Error).message }));
      }
    },
    [meetingId, showToast],
  );

  // A translation arrives after its utterance (it runs on the CPU while Whisper keeps the
  // GPU), so it is matched back to the line by seq and saved onto the stored row.
  const applyTranslation = useCallback((seq: number, ja: string) => {
    setTranscripts((prev) => {
      const row = prev.find((t) => t.seq === seq);
      if (row) {
        void fetch(`/api/transcripts/${row.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ translation: ja }),
        }).catch(() => {});
      }
      return prev.map((t) => (t.seq === seq ? { ...t, translation: ja } : t));
    });
  }, []);

  const handlers = useMemo(
    () => ({
      onPartial: (text: string) => setPartial(text),
      onFinal: (
        speakerKey: string,
        text: string,
        seq?: number,
        audio?: { startMs: number; endMs: number },
      ) => {
        setPartial("");
        void saveTranscript(speakerKey, text, seq, audio);
      },
      onTranslation: applyTranslation,
      onStatus: (s: RecognizerStatus) => setStatus(s),
      onError: (message: string) => showToast(message),
      // Skipped while the screen rests: the meter is not on screen, and this is the one thing
      // on this page that re-renders it ten times a second.
      onLevel: (rms: number) => {
        if (!restingRef.current) setLevel(rms);
      },
      onClipping: () => {
        setClipping(true);
        window.setTimeout(() => setClipping(false), 4000);
      },
    }),
    [saveTranscript, applyTranslation, showToast],
  );

  // The transcript as the server has it. In the app, lines are saved by the app's recorder
  // while this page is hidden, and reading them back is simpler than replaying each one.
  const resync = useCallback(async () => {
    const res = await fetch(`/api/meetings/${meetingId}/live`, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as {
      transcripts: {
        id: string;
        speakerType: string;
        text: string;
        translation: string | null;
        createdAt: string;
      }[];
    };
    const rows: TranscriptEntry[] = data.transcripts.map((r) => ({
      id: r.id,
      speaker: r.speakerType,
      text: r.text,
      at: new Date(r.createdAt),
      translation: r.translation ?? undefined,
    }));
    const ids = new Set(rows.map((r) => r.id));
    // A line the app reported while this request was in flight is kept, not dropped.
    setTranscripts((prev) =>
      [...rows, ...prev.filter((r) => !ids.has(r.id))].sort((a, b) => a.at.getTime() - b.at.getTime()),
    );
  }, [meetingId]);

  // What the app's recorder reports. It saves each line itself, so a line arrives here already
  // saved — the page shows it and does not save it a second time.
  const nativeHandlers = useMemo(
    () => ({
      onPartial: (text: string) => setPartial(text),
      onSaved: (row: NativeSaved) => {
        setPartial("");
        setTranscripts((prev) =>
          prev.some((r) => r.id === row.id)
            ? prev
            : [
                ...prev,
                { id: row.id, speaker: row.speaker, text: row.text, at: new Date(row.createdAt), seq: row.seq },
              ],
        );
      },
      onTranslation: (seq: number, text: string, id?: string) =>
        setTranscripts((prev) =>
          prev.map((r) => ((id ? r.id === id : r.seq === seq) ? { ...r, translation: text } : r)),
        ),
      onStatus: (s: RecognizerStatus) => setStatus(s),
      onError: (message: string) => showToast(message),
      onLevel: (rms: number) => {
        if (!restingRef.current) setLevel(rms);
      },
      onClipping: () => {
        setClipping(true);
        window.setTimeout(() => setClipping(false), 4000);
      },
      onResync: () => void resync(),
      // Stop in the app's notification has ended the meeting; go where the end buttons go.
      onEnded: () => {
        handleRef.current = null;
        nativeRef.current = null;
        endedRef.current = true;
        setEnded(true);
        router.replace(`/${meetingId}`);
      },
    }),
    [showToast, resync, router, meetingId],
  );

  // In the app, ask whether it is already recording this meeting — this page reloaded, or was
  // opened again from the recording's notification — and pick that up rather than start another.
  useEffect(() => {
    if (!hasNativeRecorder()) return;
    let cancelled = false;
    void nativeState().then((s) => {
      if (cancelled) return;
      setNative(true);
      if (!s?.recording || s.meetingId !== meetingId || handleRef.current) return;
      const h = attachNative(nativeHandlers, s.status);
      handleRef.current = h;
      nativeRef.current = h;
      setTipsOpen(false);
    });
    return () => {
      cancelled = true;
    };
  }, [meetingId, nativeHandlers]);

  // Ready = the model this meeting will use is the one resident on the STT service.
  const modelReady = Boolean(loadedModel) && loadedModel === activeModel;

  /**
   * Ask the queue for the GPU.
   *
   * Called twice when something is in the way: once to find out what, once with the answer.
   * `interrupt: false` reserves nothing and stops nothing — it is the question.
   */
  const claimCard = useCallback(
    async (id: string, model: string | undefined, interrupt: boolean) => {
      try {
        const res = await fetch("/api/queue/recording", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ meetingId: id, model, interrupt }),
        });
        if (!res.ok) return { contenders: [] as Contender[] };
        return (await res.json()) as { contenders: Contender[] };
      } catch {
        // The queue being unreachable must not stop a meeting from being recorded. Worst case
        // two things share the card and both are slow, which is better than not recording.
        return { contenders: [] as Contender[] };
      }
    },
    [],
  );

  /** Hand the GPU back. Safe to call when nothing was ever reserved. */
  const release = useCallback(() => {
    void fetch(`/api/queue/recording?meetingId=${encodeURIComponent(meetingId)}`, {
      method: "DELETE",
      keepalive: true,
    }).catch(() => {});
  }, [meetingId]);

  const startRecording = useCallback(async () => {
    if (handleRef.current || endedRef.current) return; // never (re)start an ended meeting
    try {
      const model = activeModel;

      // Ask the queue for the card. On a host that does not recognise as it goes there is
      // nothing to ask for — the recording uses no GPU at all — so the question never appears.
      let live = deferred !== true;
      if (live) {
        const claim = await claimCard(meetingId, model, false);
        if (claim.contenders.length > 0) {
          const label = (c: Contender) =>
            c.kind === "minutes" ? t("Minutes") : c.kind === "diarize" ? t("Diarize") : t("Re-transcribe");
          const what = claim.contenders
            .map((c) => `${label(c)}${c.title ? ` — ${c.title}` : ""}`)
            .join(", ");
          // Both answers are reasonable, so neither is the destructive one: recording happens
          // either way, and what changes is whether you can read along while it does.
          // `confirm` resolves to { ok, checked } — the object is always truthy, so the
          // answer has to be read out of it.
          const { ok: takeIt } = await confirm({
            title: t("Something else is using the GPU"),
            // Plain text: the dialog does not render markdown, and asterisks in a sentence
            // read as a mistake rather than as emphasis.
            message: `${what} is running.

Interrupting it transcribes this meeting as you speak. What was running goes back to the front of the queue and starts again once the meeting ends.

Recording only leaves it alone. The audio is kept and transcribed after the meeting — nothing is lost, but no text appears while you talk.`,
            confirmLabel: t("Interrupt and transcribe live"),
            cancelLabel: t("Record only"),
          });
          if (takeIt) {
            await claimCard(meetingId, model, true);
          } else {
            live = false;
            setRecordOnly(true);
          }
        }
      }

      setTipsOpen(false);
      // Handed over, not borrowed: `startMic` stops these tracks when the meeting ends, so the
      // ref must not still be pointing at them.
      const checked = preflightStreamRef.current;
      preflightStreamRef.current = null;

      const options = {
        liveTranscript: live,
        model,
        meetingId,
        language: effectiveSttLanguage(model, meetingLangRef.current ?? sttLanguageRef.current),
        // Global glossary + this meeting's series glossary (if any).
        initialPrompt:
          [sttGlossaryRef.current, seriesGlossaryRef.current].filter(Boolean).join("、") ||
          undefined,
        micMode: sttMicModeRef.current,
        translate: sttTranslateRef.current,
      };
      if (hasNativeRecorder()) {
        // The app records with its own microphone, in a service the screen cannot stop. The
        // check's microphone is closed rather than handed over, so the two do not compete.
        checked?.getTracks().forEach((track) => track.stop());
        const h = await startNative(nativeHandlers, { ...options, title: title || undefined });
        handleRef.current = h;
        nativeRef.current = h;
      } else {
        handleRef.current = await startMic(handlers, {
          ...options,
          micStream: checked ?? undefined,
          source: sourceRef.current,
        });
      }
    } catch (e) {
      showToast(t("Cannot start the microphone: {error}", { error: (e as Error).message }));
      setStatus("error");
    }
  }, [handlers, nativeHandlers, title, meetingId, showToast, activeModel, confirm, deferred, claimCard]);

  const stopRecording = useCallback(async () => {
    const h = handleRef.current;
    handleRef.current = null;
    nativeRef.current = null;
    if (h) await h.stop().catch(() => {});
    setStatus("idle");
    setPartial("");
    setLevel(0);
  }, []);

  // Change recording source. Remembered per device; if recording, re-record with the new source (appended to the meeting).
  const changeSource = useCallback(
    async (next: "mic" | "display" | "both") => {
      setSource(next);
      sourceRef.current = next;
      try {
        localStorage.setItem("voxinq.source", next);
      } catch {}
      if (handleRef.current) {
        await stopRecording();
        await startRecording();
      }
    },
    [stopRecording, startRecording],
  );

  // One-tap recording: when arriving with ?autostart=1, try to auto-start recording after settings/meeting load.
  // Skip entirely if the meeting already ended (e.g. navigated back here).
  useEffect(() => {
    if (autostartTried.current || !settingsLoaded || !startedAt || external || ended) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("autostart") === "1") {
      autostartTried.current = true;
      void startRecording();
    }
  }, [settingsLoaded, startedAt, external, ended, startRecording]);

  // Protect the recording (WAV used for diarization/re-transcription). If off, auto-deleted after 7 days.
  const protectRecording = useCallback(async () => {
    try {
      await fetch(`${sttHttpBase()}/recordings/${meetingId}/protect?on=true`, {
        method: "POST",
        signal: AbortSignal.timeout(6000),
      });
    } catch {
      // 保存前の会議や STT 不達は黙って諦める(期限で自動削除されるだけ)
    }
  }, [meetingId]);

  // On a host that cannot keep up with speech, the transcript is produced here: the meeting
  // was only recorded, and the whole file is recognised once, now. It runs before the meeting
  // is marked ended so that minutes generation -- which reads the transcript -- has something
  // to read.
  //
  // A failure is reported and swallowed. The audio is saved either way, and "Re-transcribe" on
  // the meeting page runs exactly this again; losing the meeting because recognition failed
  // would be far worse than ending it without a transcript.
  const transcribeIfDeferred = useCallback(async () => {
    if (!deferred) return;
    try {
      const settings = (await fetch("/api/settings")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)) as {
        whisperModel?: string;
        sttLanguage?: string;
        sttGlossary?: string;
        sttTranslate?: boolean;
      } | null;
      const { utterances, usedModel } = await transcribeRecording(meetingId, {
        model: settings?.whisperModel,
        language: settings?.sttLanguage,
        initialPrompt: settings?.sttGlossary || undefined,
        translate: Boolean(settings?.sttTranslate),
        onProgress: setDeferredStatus,
      });
      setDeferredStatus(t("Saving the transcript…"));
      await applyTranscript(meetingId, utterances, usedModel);
      setDeferredStatus(null);
    } catch (e) {
      setDeferredStatus(null);
      showToast(
        t('Transcription failed: {error}. The recording is saved — use "Re-transcribe" on the meeting page.', {
          error: (e as Error).message,
        }),
      );
    }
  }, [deferred, meetingId, showToast, t]);

  const generateSummaryAndEnd = useCallback(async () => {
    if (busy !== "none") return;
    const { ok, checked } = await confirm({
      title: title || t("Meeting"),
      message: t(
        "Start generating minutes and end the meeting. Generation runs in the background; check the result on the meeting page when it finishes.",
      ),
      confirmLabel: t("Generate minutes"),
      checkboxLabel: t(
        "Protect the recording (otherwise auto-deleted after 7 days; used for diarization / re-transcription)",
      ),
    });
    if (!ok) return;
    setBusy("summary");
    endedRef.current = true;
    setEnded(true);
    try {
      await stopRecording();
      if (checked) await protectRecording();
      await transcribeIfDeferred();
      await fetch(`/api/meetings/${meetingId}/end`, { method: "POST" });
      // Minutes generation runs in the background (202 returns immediately). Go to the list without waiting.
      const sumRes = await fetch("/api/claude/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId }),
      });
      if (!sumRes.ok && sumRes.status !== 202) {
        const sumData = await sumRes.json().catch(() => null);
        throw new Error(sumData?.error ?? `HTTP ${sumRes.status}`);
      }
      // Land on the meeting just recorded, where the minutes will appear as they finish —
      // the list gives no sign of which meeting the generation belongs to.
      // replace() so this recording page leaves the history — pressing "back" from the
      // detail must not return here and restart the meeting.
      router.replace(`/${meetingId}`);
    } catch (e) {
      showToast(t("Failed to start minutes generation: {error}", { error: (e as Error).message }));
      setBusy("none");
    }
  }, [busy, confirm, title, meetingId, router, showToast, stopRecording, protectRecording, transcribeIfDeferred, t]);

  // End the meeting and kick off speaker diarization: the detail page opens with
  // ?autodiarize=1 and starts Auto-diarize (apply + voiceprint naming) automatically.
  // Minutes are NOT generated — review the speakers first, then generate.
  const diarizeAndEnd = useCallback(async () => {
    if (busy !== "none") return;
    const { ok, checked } = await confirm({
      title: title || t("Meeting"),
      message: t(
        "End the meeting and start speaker diarization. Speakers are assigned automatically on the meeting page (enrolled voices get their names); generate minutes afterwards.",
      ),
      confirmLabel: t("Diarize"),
      checkboxLabel: t(
        "Protect the recording (otherwise auto-deleted after 7 days; used for diarization / re-transcription)",
      ),
    });
    if (!ok) return;
    setBusy("summary");
    endedRef.current = true;
    setEnded(true);
    try {
      // stopRecording waits for the STT server to finish saving the WAV + utterance
      // boundaries — diarization needs both.
      await stopRecording();
      if (checked) await protectRecording();
      await transcribeIfDeferred();
      await fetch(`/api/meetings/${meetingId}/end`, { method: "POST" });
      // replace() so back navigation cannot return here and restart the meeting.
      router.replace(`/${meetingId}?autodiarize=1`);
    } catch (e) {
      showToast(t("Failed to end the meeting: {error}", { error: (e as Error).message }));
      setBusy("none");
    }
  }, [busy, confirm, title, meetingId, router, showToast, stopRecording, protectRecording, transcribeIfDeferred, t]);

  const endWithoutSummary = useCallback(async () => {
    if (busy !== "none") return;
    const { ok, checked } = await confirm({
      title: title || t("Meeting"),
      message: t("End the meeting without generating minutes."),
      confirmLabel: t("End"),
      danger: true,
      checkboxLabel: t(
        "Protect the recording (otherwise auto-deleted after 7 days; used for diarization / re-transcription)",
      ),
    });
    if (!ok) return;
    endedRef.current = true;
    setEnded(true);
    await stopRecording();
    if (checked) await protectRecording();
    await transcribeIfDeferred();
    await fetch(`/api/meetings/${meetingId}/end`, { method: "POST" }).catch(() => {});
    // replace() so back navigation cannot return to this recording page.
    router.replace(`/${meetingId}`);
  }, [busy, confirm, title, meetingId, router, stopRecording, protectRecording, transcribeIfDeferred, t]);

  // Started by mistake, or not worth keeping. The meeting goes to the trash rather than away:
  // "I did not mean to record that" is sometimes wrong, and the trash keeps it restorable for 30
  // days. The recording is not protected, so it expires on its own like any other. Nothing is
  // transcribed on the way out — that would be spending the GPU on something being thrown away.
  const discardAndEnd = useCallback(async () => {
    if (busy !== "none") return;
    const { ok } = await confirm({
      title: title || t("Meeting"),
      message: t(
        "End the meeting without keeping it. It moves to the trash, where it can be restored for 30 days, and its recording is not protected.",
      ),
      confirmLabel: t("Discard"),
      danger: true,
    });
    if (!ok) return;
    endedRef.current = true;
    setEnded(true);
    await stopRecording();
    await fetch(`/api/meetings/${meetingId}/end`, { method: "POST" }).catch(() => {});
    await fetch(`/api/meetings/${meetingId}`, { method: "DELETE" }).catch(() => {});
    // replace() so back navigation cannot return to a recording page for a meeting in the trash.
    router.replace("/");
  }, [busy, confirm, title, meetingId, router, stopRecording, t]);

  // Warn before leaving while recording. Not in the app: there, leaving the page leaves the
  // recording running, and the warning would be a dialog guarding nothing.
  useEffect(() => {
    const recording = status === "open" || status === "connecting";
    if (!recording || native) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [status, native]);

  // While recording, prevent screen sleep (stops mic capture from halting when a phone screen turns off).
  // Wake Lock is auto-released when the page is hidden, so re-acquire on return.
  useEffect(() => {
    const recording = status === "open" || status === "connecting" || status === "reconnecting";
    // In the Android app the recording does not need the screen, so the screen may sleep.
    if (!recording || native) return;
    const nav = navigator as unknown as {
      wakeLock?: { request(type: "screen"): Promise<{ release: () => Promise<void> }> };
    };
    if (!nav.wakeLock) return;
    let sentinel: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        const s = await nav.wakeLock!.request("screen");
        if (cancelled) {
          void s.release().catch(() => {});
          return;
        }
        sentinel = s;
      } catch {
        // Ignore unsupported/denied (recording continues even without Wake Lock)
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release().catch(() => {});
      sentinel = null;
    };
  }, [status, native]);

  // Rest the screen after a while of nobody touching it.
  //
  // The wake lock above keeps the screen on for the whole meeting, because letting it sleep
  // stops the microphone -- and a screen that is on for an hour is what empties a phone. Black
  // is the one lever a web page has: no brightness API exists, and on an OLED panel a black
  // pixel does not light up at all.
  //
  // Nothing about the recording changes. The lock is still held, the microphone is still open,
  // audio is still going up. Only the picture is gone, and one touch brings it back.
  useEffect(() => {
    restingRef.current = resting;
  }, [resting]);

  useEffect(() => {
    if (!active) setResting(false);
  }, [active]);

  useEffect(() => {
    if (!active || restAfter <= 0 || resting) return;
    let timer = 0;
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setResting(true), restAfter * 1000);
    };
    // Anything that says a person is there. Re-armed on each, and again when the screen is
    // woken, since this effect re-runs as `resting` goes back to false.
    const events = ["pointerdown", "keydown", "touchstart", "wheel"] as const;
    for (const e of events) window.addEventListener(e, arm, { passive: true });
    arm();
    return () => {
      window.clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, arm);
    };
  }, [active, restAfter, resting]);

  // Cleanup
  useEffect(() => {
    return () => {
      // In the app the recording belongs to the app's service and outlives this page: leaving
      // lets go of it, and the notification is the way back. Stopping is Stop's job.
      if (nativeRef.current) {
        nativeRef.current.detach();
        nativeRef.current = null;
        handleRef.current = null;
        return;
      }
      void handleRef.current?.stop();
      release();
    };
  }, [meetingId, release]);

  // Leaving the page by closing the tab or typing an address does not unmount anything, so the
  // effect above never runs — `pagehide` is the one that fires for both, and `keepalive` is what
  // lets the request outlive the document. The queue sweep still backstops a browser that dies
  // without either.
  useEffect(() => {
    // Except while the app records: its recording goes on without the page, and keeps the GPU.
    const onHide = () => {
      if (!nativeRef.current) release();
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [release]);

  const elapsedSec = startedAt
    ? Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000))
    : 0;

  // Block starting a recording if the meeting already ended. Stopping stays allowed.
  // Recording does not wait for the GPU any more — it asks for it, and the person decides.
  // `ended` is the only thing left that makes starting impossible rather than inconvenient.
  const startBlocked = ended;

  // Displayed language prefers this meeting's setting (meetingLang), else the settings default.
  const effectiveLang = meetingLang ?? cfg?.sttLanguage;
  const langLabel =
    effectiveLang === "ja" ? t("Japanese") : effectiveLang === "en" ? t("English") : t("Auto-detect");
  const micLabel = cfg?.micMode === "room" ? t("Room") : t("Standard");
  const sourceLabel =
    source === "display" ? t("PC audio") : source === "both" ? t("Mic + PC audio") : t("Microphone");

  return (
    <div className="space-y-4">
      {/* The resting screen. Black, and as close to nothing as it can be while still saying
          that the meeting is still being recorded -- a dim dot and the running time, because a
          phone that looks switched off during a meeting you cannot afford to lose is worse
          than the battery it saves. */}
      {resting ? (
        <button
          type="button"
          onClick={() => setResting(false)}
          aria-label={t("Screen resting. Recording continues. Activate to show the recording screen.")}
          // Sized explicitly, not just `inset-0`: as a <button> it came out 16px short of the
          // viewport, and the sticky bar at the bottom of the page showed through the gap.
          // dvh rather than vh so a phone's collapsing address bar cannot open one either.
          className="fixed inset-0 z-[100] flex h-[100dvh] w-screen cursor-pointer flex-col items-center justify-center gap-3 bg-black"
        >
          <span aria-hidden className="h-2 w-2 rounded-full bg-[#7f1d1d]" />
          <span className="font-mono text-sm tabular-nums text-white/40">
            {formatElapsed(elapsedSec)}
          </span>
          <span className="text-xs text-white/25">{t("Recording — touch to show")}</span>
        </button>
      ) : null}

      {/* Sticky top bar: keeps recording controls always visible. Pulses with accent while recording. */}
      <div
        className={`sticky top-0 z-20 -mx-4 border-b bg-[color-mix(in_srgb,var(--background)_92%,transparent)] px-4 py-3 backdrop-blur transition-colors ${
          active ? "border-[var(--accent)] shadow-[0_2px_16px_-6px_var(--accent)]" : "border-[var(--border)]"
        }`}
      >
        <div className="flex flex-wrap items-center gap-3">
          {/* Before recording, say whether the model is loaded — the wait for a cold load is
              silent otherwise, and starting into it means the first minutes go unrecognized. */}
          {!active && !ended && !external ? (
            deferred ? (
              <span
                className="text-xs text-[var(--text-muted)]"
                title={t(
                  "No GPU acceleration on this machine, so recognition would fall behind live speech. The meeting is recorded and transcribed in one pass at the end — nothing is lost, but the text arrives afterwards.",
                )}
              >
                ● {t("Transcribes when the meeting ends")}
              </span>
            ) : (
              <span
                className={`text-xs ${modelReady ? "text-[var(--success)]" : "text-[var(--warning)]"}`}
                title={
                  modelReady
                    ? t("{model} is loaded — transcription starts right away", {
                        model: activeModel ?? t("The model"),
                      })
                    : t(
                        "The model is still loading. You can start; audio is buffered and transcribed once it is ready.",
                      )
                }
              >
                {modelReady ? t("● Model ready") : t("◌ Loading model…")}
              </span>
            )
          ) : null}

          <div className="flex items-center gap-2 text-sm">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${statusDot(status)}`} />
            <span className="text-[var(--text-secondary)]">{statusText(t, status)}</span>
            {recordOnly ? (
              <span
                className="text-xs text-[var(--warning)]"
                title={t(
                  "You chose to leave the GPU to what was already using it. The audio is being kept and will be transcribed when the meeting ends.",
                )}
              >
                {t("recording only")}
              </span>
            ) : null}
            {active ? (
              <div
                className={`h-1.5 w-16 overflow-hidden rounded-full bg-[var(--elevated)] ${
                  clipping ? "ring-1 ring-[var(--warning)]" : ""
                }`}
                title={
                  clipping
                    ? t("The input is clipping — turn the source down; recognition cannot recover a clipped word")
                    : t("Input audio level (movement means sound is arriving)")
                }
              >
                <div
                  className={`h-full rounded-full ${
                    clipping ? "bg-[var(--warning)]" : "bg-[var(--accent-solid)]"
                  }`}
                  style={{ width: `${Math.min(100, Math.round(level * 300))}%` }}
                />
              </div>
            ) : null}
            {active && clipping ? (
              <span className="text-[10px] font-medium text-[var(--warning)]">
                {t("Input too loud")}
              </span>
            ) : null}
          </div>

          {active ? (
            <button
              type="button"
              onClick={() => setResting(true)}
              className="btn-outline px-3 py-1.5 text-xs"
              title={
                restAfter > 0
                  ? t(
                      "Black out the screen. Recording continues; one touch brings it back, and it rests again by itself.",
                    )
                  : t(
                      "Black out the screen. Recording continues; one touch brings it back. Settings → Appearance can do this on its own after a while.",
                    )
              }
            >
              {t("Rest screen")}
            </button>
          ) : null}

          <select
            value={source}
            onChange={(e) => void changeSource(e.target.value as "mic" | "display" | "both")}
            title={t("Recording source (PC audio captures online-meeting sound). Changeable while recording.")}
            className="rounded-md border border-[var(--border-strong)] bg-[var(--elevated)] px-2 py-1 text-xs text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] disabled:opacity-60"
          >
            <option value="mic">{t("Microphone")}</option>
            {displaySupported ? <option value="display">{t("PC audio")}</option> : null}
            {displaySupported ? <option value="both">{t("Mic + PC audio")}</option> : null}
          </select>

          {/* No link to the meeting page here: navigating away unmounts this page and drops
              the recording. Leave the meeting via the end actions at the bottom. */}
          <div className="min-w-0 flex-1 truncate text-right text-sm font-medium text-[var(--text-strong)]">
            {title || t("Meeting")}
          </div>
        </div>
      </div>

      {ended ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--border-strong)] bg-[var(--elevated)] px-3 py-2 text-sm text-[var(--text-secondary)]">
          <span>{t("This meeting has already ended. Recording cannot be restarted.")}</span>
          <Link href={`/${meetingId}`} className="btn-outline shrink-0">
            {t("View minutes")}
          </Link>
        </div>
      ) : null}

      {external ? (
        <div className="rounded-md border border-[color-mix(in_srgb,var(--warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] px-3 py-2 text-sm text-[var(--warning)]">
          {t(
            "Accessing from an external network, so recording is unavailable (recording works over Tailscale only). Viewing/generating minutes, diarization, and sharing still work here.",
          )}
        </div>
      ) : null}

      {/* Before the tips, because it is the one thing on this screen worth doing before
          pressing record: a meeting nobody recorded cannot be recovered, and every other
          failure here can. Hidden once recording has started, when it has nothing left to say,
          and for PC-audio-only recordings, which have no microphone to check. */}
      {!external && !ended && !active && source !== "display" ? (
        <PreflightCheck
          source={source}
          micMode={cfg?.micMode}
          onStream={(s) => {
            preflightStreamRef.current = s;
          }}
        />
      ) : null}

      <details
        open={tipsOpen}
        onToggle={(e) => setTipsOpen(e.currentTarget.open)}
        className="rounded-md border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-3 py-2 text-xs text-[var(--accent-sub)]"
      >
        <summary className="cursor-pointer select-none marker:text-[var(--accent)]">
          {t("Before you start")}
        </summary>
        <ul className="mt-1 list-disc space-y-1 pl-4 marker:text-[var(--accent)]">
        <li>{t("Pick the recording source from the menu above (mic / PC audio / both).")}</li>
        {displaySupported ? (
          <li>{t("For PC audio / both, enable “Share tab audio” (or system audio) in the share dialog.")}</li>
        ) : null}
        {displaySupported ? (
          <li>
            <strong>{t("Headphones are recommended for “both”")}</strong>
            {t(". With speakers, the mic picks up PC audio and it may be recorded twice.")}
          </li>
        ) : null}
        <li>{t("Distinguish speakers after the meeting via “Diarize” on the detail page, or per line.")}</li>
        {native ? (
          <li>
            {t(
              "In the app, recording carries on with the screen off or another app in front. Stop it here, or from the app's notification.",
            )}
          </li>
        ) : (
          <li>
            {t("On phones, ")}
            <strong>{t("keep the screen on")}</strong>
            {t(" while recording (sleep is auto-suppressed, but on some devices turning the screen off stops mic capture).")}
          </li>
        )}
        </ul>
      </details>

      {/* What this recording will actually use — the choices made when the meeting was set up.
          The minutes LLM is deliberately not shown: it plays no part in recording, and seeing
          it here suggested the transcription settings were something else. */}
      {cfg ? (
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text-muted)]">
          <p className="text-[var(--text-secondary)]">{t("Settings for this recording")}</p>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
            <div className="col-span-2 sm:col-span-1">
              {t("Model:")}{" "}
              <span className="text-[var(--text-secondary)]">{activeModel ?? "-"}</span>{" "}
              {deferred ? (
                <span className="text-[var(--text-muted)]" title={t("Loaded and run once the meeting ends")}>
                  {t("· at meeting end")}
                </span>
              ) : modelReady ? (
                <span className="text-[var(--success)]" title={t("Loaded on the GPU — transcription starts immediately")}>
                  {t("● ready")}
                </span>
              ) : (
                <span className="text-[var(--warning)]" title={t("Still loading; audio is buffered and transcribed once it is ready")}>
                  {t("◌ loading…")}
                </span>
              )}
            </div>
            <div>
              {t("Language:")} <span className="text-[var(--text-secondary)]">{langLabel}</span>
            </div>
            <div>
              {t("Mic mode:")} <span className="text-[var(--text-secondary)]">{micLabel}</span>
            </div>
            <div>
              {t("Source:")} <span className="text-[var(--text-secondary)]">{sourceLabel}</span>
            </div>
          </div>
        </div>
      ) : null}

      {lastError ? (
        <div className="flex items-start gap-2 rounded-md border border-[color-mix(in_srgb,var(--error)_40%,transparent)] bg-[color-mix(in_srgb,var(--error)_12%,transparent)] px-3 py-2 text-sm text-[var(--error)]">
          <span className="font-medium">{t("Error:")}</span>
          <span className="flex-1 break-all">{lastError}</span>
          <button
            type="button"
            onClick={() => setLastError(null)}
            className="text-xs hover:opacity-80"
          >
            {t("Close")}
          </button>
        </div>
      ) : null}

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-2">
          <h2 className="text-sm font-semibold text-[var(--text-secondary)]">{t("Transcript")}</h2>
          {/* Diarization is a post-meeting step, so do not show speakers during recording */}
          <span className="text-xs text-[var(--text-muted)]">{t("Speakers can be distinguished after the meeting")}</span>
        </div>
        <div ref={transcriptScrollRef} className="h-[60vh] space-y-2 overflow-y-auto px-4 py-3">
            {transcripts.map((t) => (
              <div
                key={t.id}
                className="rounded border border-[var(--border)] bg-[var(--elevated)] px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs tabular-nums text-[var(--text-muted)]">
                    {t.at.toLocaleTimeString("ja-JP")}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap">{t.text}</p>
                {/* Japanese translation, when the utterance was spoken in another language.
                    It lands a beat after the line itself. */}
                {t.translation ? (
                  <p className="mt-1 border-l-2 border-[var(--border-strong)] pl-2 text-xs whitespace-pre-wrap text-[var(--text-muted)]">
                    {t.translation}
                  </p>
                ) : null}
              </div>
            ))}
            {partial ? (
              <div className="rounded border border-dashed border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] px-3 py-2 text-sm text-[var(--text-muted)]">
                <span className="rounded bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] px-1.5 text-xs text-[var(--accent-sub)]">
                  recognizing
                </span>
                <span className="ml-2 italic">{partial}</span>
              </div>
            ) : null}
            {transcripts.length === 0 && !partial ? (
              <div className="py-12 text-center text-sm text-[var(--text-muted)]">
                {deferred
                  ? active
                    ? t(
                        "Recording. This machine has no GPU acceleration, so speech is recognized once — when you end the meeting — rather than as you speak. The transcript appears then, at full quality.",
                      )
                    : t('Press "Start recording" below. Text appears when the meeting ends, not during it.')
                  : status === "connecting"
                    ? t(
                        "Loading the speech model (the first time can take about a minute). Recording has already started and will be transcribed together once loading completes.",
                      )
                    : t('Press "Start recording" below to begin transcription.')}
              </div>
            ) : null}
          </div>
      </section>

      {/* Sticky bottom bar: the recording control, and the ways to end the meeting.
          Start/Stop was at the top of the page, which on a phone is the far corner from your
          thumb and the one control you may need in a hurry. It is the primary action, so it is
          the big one at the bottom; the end actions were the coloured ones and are now the
          quiet ones above it, which is the right way round -- they are what you press once, at
          the end. The running time comes down with the button; the status and the input level
          stay at the top, where they are read rather than acted on. */}
      <div className="sticky bottom-0 -mx-4 border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--background)_92%,transparent)] px-4 py-3 backdrop-blur">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="tabular-nums text-sm font-medium text-[var(--text-secondary)]">
            {formatElapsed(elapsedSec)}
          </span>
          <div className="grow" />
          <button
            type="button"
            onClick={generateSummaryAndEnd}
            disabled={busy !== "none" || transcripts.length === 0}
            className="btn-outline !px-3 !py-1.5 !text-xs"
            title={t("End the meeting and start generating minutes in the background")}
          >
            {busy === "summary" ? t("Starting…") : t("Generate minutes")}
          </button>
          <button
            type="button"
            onClick={diarizeAndEnd}
            disabled={busy !== "none" || transcripts.length === 0}
            className="btn-outline !px-3 !py-1.5 !text-xs"
            title={t("End the meeting and assign speakers automatically; generate minutes after reviewing them")}
          >
            {t("Diarize")}
          </button>
          <button
            type="button"
            onClick={endWithoutSummary}
            disabled={busy !== "none"}
            className="btn-outline !px-3 !py-1.5 !text-xs"
          >
            {t("End only")}
          </button>
          <button
            type="button"
            onClick={discardAndEnd}
            disabled={busy !== "none"}
            className="btn-outline !px-3 !py-1.5 !text-xs text-[var(--error)]"
            title={t("For a meeting started by mistake: moves it to the trash instead of keeping it")}
          >
            {t("End without saving")}
          </button>
        </div>
        <button
          type="button"
          onClick={active ? stopRecording : startRecording}
          disabled={(external && !active) || startBlocked}
          title={
            external
              ? t("Recording is not available from an external network")
              : ended
                ? t("This meeting has ended")
                : undefined
          }
          // Full width where the thumb is the input, capped and centred where a mouse is: the
          // same button spanning a desktop window is a metre of saturated red for a click that
          // does not need help being found.
          className={`flex w-full items-center justify-center gap-2 rounded-full px-6 py-4 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-50 sm:mx-auto sm:w-auto sm:min-w-[18rem] ${
            active ? "bg-[var(--error)] text-white hover:opacity-90" : "btn-ink"
          }`}
        >
          <span
            className={`inline-block h-3 w-3 ${
              active ? "rounded-[3px] bg-white" : "rounded-full bg-[var(--accent-contrast)]"
            }`}
          />
          {active ? t("Stop recording") : t("Start recording")}
        </button>
      </div>

      {toast ? (
        // Clear of the bottom bar, which grew when the recording control moved into it.
        <div className="fixed bottom-36 left-1/2 -translate-x-1/2 rounded-md border border-[var(--border)] bg-[var(--elevated)] px-4 py-2 text-sm text-[var(--foreground)] shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
