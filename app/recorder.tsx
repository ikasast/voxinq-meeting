"use client";

import { readStored } from "@/lib/i18n/stored";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { type LinkStatus, type SharedAudio, type SourceLevels, type SttHandle, startMic } from "@/lib/stt/client";
import {
  type NativeHandle,
  type NativeSaved,
  type NativeStartOptions,
  attachNative,
  hasNativeRecorder,
  nativeState,
  startNative,
} from "@/lib/stt/native";
import { deliverEnd } from "@/lib/recording/deliver-end";
import { showNotification } from "./device-notifications";
import { useT } from "./locale-provider";
import { isRecording } from "./recording-status";

/**
 * PC audio this quiet for this long is worth a word: the wrong window was shared, or one with
 * nothing playing. Digital silence, not a quiet room — PC audio is exactly zero when nothing
 * plays, and an online meeting is rarely a whole minute without a sound.
 */
const PC_SILENT_RMS = 0.0005;
const PC_SILENT_MS = 60_000;

/**
 * No voice for this long while recording: the meeting has probably ended and the recording has
 * not. Asked once, and again after as long if the answer was to carry on.
 */
export const IDLE_MS = 20 * 60_000;
/** A voice: this loud for this many ~100 ms readings in a row. A door or a cough is shorter. */
const VOICE_RMS = 0.02;
const VOICE_READINGS = 8;

// The recording, for the whole app (v4).
//
// It used to belong to the recording screen: the microphone, the connection to the speech
// service and the saving of each line all lived in that page, so leaving it — a link in the
// sidebar, Back — stopped the meeting being recorded. Here it lives above every page, in the
// root layout, and goes on while you read last week's minutes or this meeting's own page. The
// recording screen is its control panel; elsewhere a small bar says it is running
// (recording-bar.tsx).
//
// Only what a recording is made of lives here: the handle, its state, the saving of lines, the
// GPU it holds, and the screen it keeps awake. How a recording starts (the model, the language,
// the question about a GPU somebody else is using) and how a meeting ends stay on the screen
// that asks them.
//
// Closing the tab still stops a browser recording — nothing on a page outlives its document —
// and the tab asks first. In the Android app the recording is the app's own service and goes
// on without the page at all (lib/stt/native.ts).

export type RecorderStatus = LinkStatus | "idle";

/** A line as it was saved. */
export type SavedLine = { id: string; speaker: string; text: string; at: string; seq?: number };

/** What happens to a recording, for whoever is showing its meeting. */
export type RecorderEvent =
  | { kind: "saved"; meetingId: string; line: SavedLine }
  | { kind: "translation"; meetingId: string; seq: number; text: string; id?: string }
  /** The app was in front again after a while hidden: what it saved meanwhile is on the server. */
  | { kind: "resync"; meetingId: string }
  /** Stop in the app's notification ended the meeting. */
  | { kind: "ended"; meetingId: string }
  /** Stopped with the server missing some of it: the copy in this browser is kept, to be sent. */
  | { kind: "kept"; meetingId: string }
  | { kind: "error"; meetingId: string; message: string };

export type RecordingSession = {
  meetingId: string;
  title: string;
  /** When the meeting started, for the running time. */
  startedAt: number | null;
  /** The app's recorder rather than this page's microphone. */
  native: boolean;
};

/** A recording that has stopped taking audio and is still delivering the end of it. */
export type FinishingRecording = { meetingId: string; native: boolean };

/**
 * One recording's handlers, from start to the end of its stop. Once it is stopping, what it
 * reports about the link — status, level, what is being heard — is no longer this recorder's:
 * the screen already says it stopped, and the next recording may have begun. What it saved is
 * still reported, and its saves are waited for before the stop is over.
 */
type Run = { stopping: boolean; saves: Set<Promise<void>> };

/**
 * How long a stop waits for its last lines to be saved, after the service has finished. The
 * service itself is bounded on its side (lib/stt/client.ts, lib/stt/native.ts).
 */
const LAST_SAVES_MS = 15_000;

/** Wraps a handler so it does nothing once `r` is stopping. */
function running(r: Run) {
  return <A extends unknown[]>(fn: (...a: A) => void) =>
    (...a: A) => {
      if (!r.stopping) fn(...a);
    };
}

export type StartRecording = {
  meetingId: string;
  title: string;
  startedAt: number | null;
  options: Omit<NativeStartOptions, "meetingId" | "title"> & { meetingId: string };
  /** The microphone the pre-flight check left open, handed over rather than opened again. */
  micStream?: MediaStream;
  source?: "mic" | "display" | "both";
};

type Recorder = {
  session: RecordingSession | null;
  /** The session as it is this moment, for a callback that may outlive the render it came from. */
  current: () => RecordingSession | null;
  status: RecorderStatus;
  /** Input level, RMS 0..1, about ten times a second. */
  level: number;
  clipping: boolean;
  /** Each source's own level, for a browser recording; null otherwise. */
  sources: SourceLevels | null;
  /** PC audio, for a browser recording that asked for it; null otherwise. */
  shared: SharedAudio | null;
  /** PC audio has been shared but silent for a minute. */
  pcSilent: boolean;
  /** Share the screen again, keeping the recording going. "unavailable" when it cannot be. */
  reshare: () => Promise<"ok" | "no-audio" | "cancelled" | "unavailable">;
  /** Nobody has spoken for IDLE_MS: has the meeting ended without the recording? */
  idle: boolean;
  /** "Still going": ask again after another IDLE_MS. */
  dismissIdle: () => void;
  /** What is being heard and is not a line yet. */
  partial: string;
  /** The last thing that went wrong, until it is dismissed or the next recording starts. */
  error: string | null;
  dismissError: () => void;
  /** Whether this is the Android app, whose recorder outlives the page. */
  nativeAvailable: boolean;
  start: (r: StartRecording) => Promise<void>;
  /**
   * Stops taking audio — the meeting itself is not ended — and hands the GPU back.
   *
   * The screen says it stopped at once. The promise is for whoever needs the end of it on the
   * server too — ending the meeting, writing minutes — and settles once the service has the last
   * of the audio, has recognised it, and its lines are saved.
   */
  stop: () => Promise<void>;
  /** Settles once a stop of this meeting's recording has finished; at once if there is none. */
  settled: (meetingId: string) => Promise<void>;
  /** A recording that has stopped and is still delivering its end, or null. */
  finishing: FinishingRecording | null;
  subscribe: (fn: (e: RecorderEvent) => void) => () => void;
  /** Stop re-rendering for the level meter, while nothing that shows it is on screen. */
  setQuiet: (quiet: boolean) => void;
};

// Three contexts, so a page re-renders only for what it reads: the meter changes ten times a
// second, and the transcript of an hour-long meeting has no business re-rendering with it.
type RecorderApi = Pick<
  Recorder,
  | "current"
  | "nativeAvailable"
  | "start"
  | "stop"
  | "settled"
  | "subscribe"
  | "setQuiet"
  | "dismissError"
  | "reshare"
  | "dismissIdle"
>;
type RecorderState = Pick<
  Recorder,
  "session" | "status" | "partial" | "error" | "shared" | "pcSilent" | "idle" | "finishing"
>;
type RecorderLevel = Pick<Recorder, "level" | "clipping" | "sources">;

const ApiContext = createContext<RecorderApi | null>(null);
const StateContext = createContext<RecorderState | null>(null);
const LevelContext = createContext<RecorderLevel | null>(null);

function need<T>(v: T | null): T {
  if (!v) throw new Error("used outside RecorderProvider");
  return v;
}

/** What can be done with the recording. Stable: reading it re-renders nothing. */
export function useRecorderApi(): RecorderApi {
  return need(useContext(ApiContext));
}

/** Which meeting is recording, how, and what is being heard. */
export function useRecorderState(): RecorderState {
  return need(useContext(StateContext));
}

/** All of it, the meter included: for the recording screen and the bar. */
export function useRecorder(): Recorder {
  return { ...need(useContext(ApiContext)), ...need(useContext(StateContext)), ...need(useContext(LevelContext)) };
}

/** Hand the GPU back. Safe to call when nothing was ever reserved. */
function releaseCard(meetingId: string) {
  void fetch(`/api/queue/recording?meetingId=${encodeURIComponent(meetingId)}`, {
    method: "DELETE",
    keepalive: true,
  }).catch(() => {});
}

export function RecorderProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [session, setSession] = useState<RecordingSession | null>(null);
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [level, setLevel] = useState(0);
  const [clipping, setClipping] = useState(false);
  const [partial, setPartial] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [nativeAvailable, setNativeAvailable] = useState(false);
  const [sources, setSources] = useState<SourceLevels | null>(null);
  const [shared, setShared] = useState<SharedAudio | null>(null);
  const [pcSilent, setPcSilent] = useState(false);
  const [idle, setIdle] = useState(false);
  const [finishing, setFinishing] = useState<FinishingRecording | null>(null);
  // When PC audio was last heard, and when a voice was: read ten times a second, so refs.
  const pcHeardAt = useRef(0);
  const voiceAt = useRef(0);
  const voiceRun = useRef(0);

  const handle = useRef<SttHandle | null>(null);
  // A start still opening the microphone and the connection. Stop can be pressed in that time —
  // the button already says Stop — and must stop what it is about to become, not nothing.
  const starting = useRef<Promise<SttHandle> | null>(null);
  const nativeHandle = useRef<NativeHandle | null>(null);
  // The handlers of the recording now running, so a stop can tell them it is stopping.
  const run = useRef<Run | null>(null);
  // The stop still delivering the end of a recording, and which recording that is.
  const finishingWork = useRef<{ at: FinishingRecording; done: Promise<void> } | null>(null);
  const sessionRef = useRef<RecordingSession | null>(null);
  const quiet = useRef(false);
  const listeners = useRef(new Set<(e: RecorderEvent) => void>());
  // Translations arrive after their line, by its number in the session; this is where the line
  // went.
  const seqToId = useRef(new Map<number, string>());

  const emit = useCallback((e: RecorderEvent) => {
    for (const fn of listeners.current) fn(e);
  }, []);
  const subscribe = useCallback((fn: (e: RecorderEvent) => void) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  const begin = useCallback((s: RecordingSession) => {
    sessionRef.current = s;
    seqToId.current = new Map();
    setSession(s);
    setError(null);
    const now = Date.now();
    pcHeardAt.current = now;
    voiceAt.current = now;
    voiceRun.current = 0;
  }, []);
  const finish = useCallback(() => {
    sessionRef.current = null;
    handle.current = null;
    nativeHandle.current = null;
    setSession(null);
    setStatus("idle");
    setPartial("");
    setLevel(0);
    setClipping(false);
    setSources(null);
    setShared(null);
    setPcSilent(false);
    setIdle(false);
  }, []);

  // About the recording of `meetingId`, which may have stopped by now: its stop goes on behind
  // the screen.
  const report = useCallback(
    (message: string, meetingId: string) => {
      setError(message);
      emit({ kind: "error", meetingId, message });
    },
    [emit],
  );

  // Store a finished line, then tell the meeting under the id and time the server gave it.
  const keepLine = useCallback(
    async (meetingId: string, speaker: string, said: string, seq?: number, audio?: { startMs: number; endMs: number }) => {
      const text = said.trim();
      if (!text) return;
      let problem: string;
      try {
        const res = await fetch("/api/transcripts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            meetingId,
            speakerType: speaker,
            text,
            audioStartMs: audio?.startMs,
            audioEndMs: audio?.endMs,
          }),
        });
        if (res.ok) {
          const row = (await res.json()) as { id: string; createdAt: string };
          if (seq !== undefined) seqToId.current.set(seq, row.id);
          emit({ kind: "saved", meetingId, line: { id: row.id, speaker, text, at: row.createdAt, seq } });
          return;
        }
        problem = `HTTP ${res.status}`;
      } catch (e) {
        problem = (e as Error).message;
      }
      report(t("Failed to save utterance: {error}", { error: problem }), meetingId);
    },
    [emit, report, t],
  );

  const level10 = useCallback((rms: number) => {
    if (!quiet.current) setLevel(rms);
    // A voice, held for most of a second, is the meeting still going.
    voiceRun.current = rms >= VOICE_RMS ? voiceRun.current + 1 : 0;
    if (voiceRun.current >= VOICE_READINGS) {
      voiceAt.current = Date.now();
      setIdle(false);
    }
  }, []);
  const sourceLevels = useCallback((l: SourceLevels) => {
    if (!quiet.current) setSources(l);
    if (l.display !== null && l.display > PC_SILENT_RMS) {
      pcHeardAt.current = Date.now();
      setPcSilent(false);
    }
  }, []);
  const clipped = useCallback(() => {
    setClipping(true);
    window.setTimeout(() => setClipping(false), 4000);
  }, []);

  // A new run, as the running one: made when a recording's handlers are.
  const newRun = useCallback((): Run => {
    const r: Run = { stopping: false, saves: new Set() };
    run.current = r;
    return r;
  }, []);

  // What the browser's own recording reports, for the meeting it was started for. Once it is
  // stopping, only what it saved and what went wrong.
  const micHandlers = useCallback(
    (meetingId: string) => {
      const r = newRun();
      const live = running(r);
      return {
        onPartial: live((text: string) => setPartial(text)),
        onFinal: (speaker: string, text: string, seq?: number, audio?: { startMs: number; endMs: number }) => {
          if (!r.stopping) setPartial("");
          const saving = keepLine(meetingId, speaker, text, seq, audio);
          r.saves.add(saving);
          void saving.finally(() => r.saves.delete(saving));
        },
        // A translation runs on the CPU after its line, so it is saved onto the row afterwards.
        onTranslation: (seq: number, text: string) => {
          const id = seqToId.current.get(seq);
          if (id) {
            void fetch(`/api/transcripts/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ translation: text }),
            }).catch(() => {});
          }
          emit({ kind: "translation", meetingId, seq, text, id });
        },
        onStatus: live((s: LinkStatus) => setStatus(s)),
        onError: (message: string) => report(readStored(t, message), meetingId),
        onLevel: live(level10),
        onClipping: live(clipped),
        onKept: () => emit({ kind: "kept", meetingId }),
        onShared: live((s: SharedAudio) => {
          setShared(s);
          if (s === "ok") {
            pcHeardAt.current = Date.now();
            setPcSilent(false);
          }
        }),
        onSourceLevels: live(sourceLevels),
      };
    },
    [newRun, keepLine, emit, report, level10, clipped, sourceLevels, t],
  );

  // What the app's recorder reports. It saves each line itself, so a line arrives already saved,
  // and its stop is over only once the app has saved the last of them (lib/stt/native.ts).
  const appHandlers = useCallback(
    (meetingId: string) => {
      const r = newRun();
      const live = running(r);
      return {
        onPartial: live((text: string) => setPartial(text)),
        onSaved: (row: NativeSaved) => {
          if (!r.stopping) setPartial("");
          emit({
            kind: "saved",
            meetingId,
            line: { id: row.id, speaker: row.speaker, text: row.text, at: row.createdAt, seq: row.seq },
          });
        },
        onTranslation: (seq: number, text: string, id?: string) => emit({ kind: "translation", meetingId, seq, text, id }),
        onStatus: live((s: LinkStatus) => setStatus(s)),
        onError: (message: string) => report(readStored(t, message), meetingId),
        onLevel: live(level10),
        onClipping: live(clipped),
        onResync: () => emit({ kind: "resync", meetingId }),
        onEnded: () => {
          // A stop already reset the screen, and another recording may be on it by now.
          if (!r.stopping) finish();
          emit({ kind: "ended", meetingId });
        },
      };
    },
    [newRun, emit, report, level10, clipped, finish, t],
  );

  // In the app, ask whether it is already recording — the WebView reloaded, or was opened from
  // the recording's notification — and take that up rather than start another.
  useEffect(() => {
    if (!hasNativeRecorder()) return;
    setNativeAvailable(true);
    let cancelled = false;
    void nativeState().then(async (s) => {
      if (cancelled || !s?.recording || !s.meetingId || handle.current) return;
      const meetingId = s.meetingId;
      const h = attachNative(appHandlers(meetingId), s.status);
      handle.current = h;
      nativeHandle.current = h;
      begin({ meetingId, title: "", startedAt: null, native: true });
      if (s.status) setStatus(s.status);
      const m = (await fetch(`/api/meetings/${meetingId}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)) as { title?: string; startedAt?: string } | null;
      if (!cancelled && m && sessionRef.current?.meetingId === meetingId) {
        const next = {
          ...sessionRef.current,
          title: m.title ?? "",
          startedAt: m.startedAt ? new Date(m.startedAt).getTime() : null,
        };
        sessionRef.current = next;
        setSession(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [appHandlers, begin]);

  const start = useCallback(
    async (r: StartRecording) => {
      if (handle.current) {
        if (sessionRef.current?.meetingId !== r.meetingId) {
          r.micStream?.getTracks().forEach((track) => track.stop());
          throw new Error(
            t("“{title}” is being recorded. Stop it before recording another meeting.", {
              title: sessionRef.current?.title || t("Meeting"),
            }),
          );
        }
        return;
      }
      const native = hasNativeRecorder();
      const me: RecordingSession = { meetingId: r.meetingId, title: r.title, startedAt: r.startedAt, native };
      begin(me);
      setStatus("connecting");
      // The last recording may still be delivering its end. Started now, this one would be
      // taken by the app for that one carrying on, or have its card handed back by that one's
      // stop; so it waits, saying "connecting", which is what it is about to do.
      const before = finishingWork.current;
      if (before) {
        await before.done;
        if (sessionRef.current !== me) {
          // Stopped while it waited: that stop has already reset the screen.
          r.micStream?.getTracks().forEach((track) => track.stop());
          return;
        }
      }
      try {
        let attempt: Promise<SttHandle>;
        if (native) {
          // The app records with its own microphone; the check's is closed so the two do not compete.
          r.micStream?.getTracks().forEach((track) => track.stop());
          attempt = startNative(appHandlers(r.meetingId), { ...r.options, title: r.title || undefined });
        } else {
          attempt = startMic(micHandlers(r.meetingId), {
            ...r.options,
            micStream: r.micStream,
            source: r.source,
            // A copy in this browser, for a drop longer than the page can hold (local-recordings.ts).
            keepCopy: { title: r.title || undefined },
          });
        }
        starting.current = attempt;
        let h: SttHandle;
        try {
          h = await attempt;
        } finally {
          starting.current = null;
        }
        // Stopped while it was starting: stop() has the handle and is stopping it. By the session
        // itself, not its meeting: the same meeting may have been started again since.
        if (sessionRef.current !== me) return;
        handle.current = h;
        if (native) nativeHandle.current = h as NativeHandle;
      } catch (e) {
        // Unless a stop has already reset the screen, and perhaps started something else on it.
        if (sessionRef.current === me) {
          releaseCard(r.meetingId);
          finish();
          setStatus("error");
        }
        throw e;
      }
    },
    [begin, finish, appHandlers, micHandlers, t],
  );

  // Stop says so on the screen at once, and delivers the end of the recording behind it.
  //
  // The end used to come first: the button stayed a red square and the clock kept running
  // while the service recognised the last segment, waited for translations (up to 8 s), saved
  // the recording, and the page waited for it (up to 10 s; in the app, up to 45 s for the last
  // lines to be saved too). The microphone stops here regardless — none of that needs the
  // screen to wait. What does need it, ending the meeting and writing minutes from the last
  // line, waits on the promise instead.
  const stop = useCallback(() => {
    const s = sessionRef.current;
    const pending = starting.current;
    const h = handle.current;
    const r = run.current;
    if (!s && !h && !pending) return finishingWork.current?.done ?? Promise.resolve();
    if (r) r.stopping = true;
    run.current = null;
    handle.current = null;
    nativeHandle.current = null;
    finish();
    const meetingId = s?.meetingId ?? "";
    const at: FinishingRecording = { meetingId, native: s?.native ?? false };
    const done = deliverEnd({
      handle: h ?? pending,
      saves: r?.saves ?? new Set(),
      savesMs: LAST_SAVES_MS,
      earlier: finishingWork.current?.done,
      // Not when this meeting is recording again: the card is that recording's now.
      mayRelease: () => meetingId !== "" && sessionRef.current?.meetingId !== meetingId,
      release: () => releaseCard(meetingId),
    }).finally(() => {
      if (finishingWork.current?.done === done) {
        finishingWork.current = null;
        setFinishing(null);
      }
    });
    finishingWork.current = { at, done };
    setFinishing(at);
    return done;
  }, [finish]);

  const settled = useCallback((meetingId: string) => {
    const f = finishingWork.current;
    return f && f.at.meetingId === meetingId ? f.done : Promise.resolve();
  }, []);

  const reshare = useCallback(async () => {
    const h = handle.current;
    if (!h?.reshare) return "unavailable" as const;
    return h.reshare();
  }, []);

  const dismissIdle = useCallback(() => {
    voiceAt.current = Date.now();
    setIdle(false);
  }, []);

  const recording = isRecording(status);
  const native = session?.native ?? false;

  // Looked at every so often rather than on every reading: a minute's silence, or twenty, does
  // not need deciding ten times a second. In the app too, where the levels come from its
  // recorder — the question about a meeting that has ended is the same.
  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      if (shared === "ok" && now - pcHeardAt.current >= PC_SILENT_MS) setPcSilent(true);
      if (!idle && now - voiceAt.current >= IDLE_MS) {
        setIdle(true);
        const s = sessionRef.current;
        // For somebody in another window, which is where a meeting that has ended leaves them.
        if (s && document.visibilityState !== "visible") {
          void showNotification(
            t("Is the meeting over?"),
            t("Nobody has spoken for {n} minutes, and “{title}” is still recording.", {
              n: Math.round(IDLE_MS / 60_000),
              title: s.title || t("Meeting"),
            }),
            `/${s.meetingId}`,
            `idle-${s.meetingId}`,
          );
        }
      }
    }, 15_000);
    return () => window.clearInterval(id);
  }, [recording, shared, idle, t]);

  // Closing the tab stops a browser recording, so the tab asks first. Not in the app, where the
  // recording carries on without the page and the question would guard nothing. Also while a
  // stopped one is still delivering its end: closed then, its last line is never recognised.
  const delivering = finishing !== null && !finishing.native;
  useEffect(() => {
    if (!(recording && !native) && !delivering) return;
    const askFirst = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", askFirst);
    return () => window.removeEventListener("beforeunload", askFirst);
  }, [recording, native, delivering]);

  // Keep the screen awake while recording: on a phone, a screen going off stops the microphone.
  // The lock is let go when the page is hidden, so it is taken again on the way back.
  useEffect(() => {
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
        // Unsupported or refused: recording goes on without it.
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
  }, [recording, native]);

  // Closing the tab or typing an address unmounts nothing, so `pagehide` is what hands the GPU
  // back then; `keepalive` lets the request outlive the document. Not while the app records: its
  // recording goes on, and keeps the GPU.
  useEffect(() => {
    const onHide = () => {
      const s = sessionRef.current;
      if (s && !s.native) releaseCard(s.meetingId);
      const f = finishingWork.current?.at;
      if (f && !f.native && f.meetingId) releaseCard(f.meetingId);
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  const setQuiet = useCallback((q: boolean) => {
    quiet.current = q;
  }, []);
  const dismissError = useCallback(() => setError(null), []);
  const current = useCallback(() => sessionRef.current, []);

  const api = useMemo<RecorderApi>(
    () => ({ current, nativeAvailable, start, stop, settled, subscribe, setQuiet, dismissError, reshare, dismissIdle }),
    [current, nativeAvailable, start, stop, settled, subscribe, setQuiet, dismissError, reshare, dismissIdle],
  );
  const state = useMemo<RecorderState>(
    () => ({ session, status, partial, error, shared, pcSilent, idle, finishing }),
    [session, status, partial, error, shared, pcSilent, idle, finishing],
  );
  const meter = useMemo<RecorderLevel>(() => ({ level, clipping, sources }), [level, clipping, sources]);
  return (
    <ApiContext.Provider value={api}>
      <StateContext.Provider value={state}>
        <LevelContext.Provider value={meter}>{children}</LevelContext.Provider>
      </StateContext.Provider>
    </ApiContext.Provider>
  );
}
