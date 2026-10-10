"use client";

import { readStored } from "@/lib/i18n/stored";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { type LinkStatus, type SttHandle, startMic } from "@/lib/stt/client";
import {
  type NativeHandle,
  type NativeSaved,
  type NativeStartOptions,
  attachNative,
  hasNativeRecorder,
  nativeState,
  startNative,
} from "@/lib/stt/native";
import { useT } from "./locale-provider";

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
  | { kind: "error"; meetingId: string; message: string };

export type RecordingSession = {
  meetingId: string;
  title: string;
  /** When the meeting started, for the running time. */
  startedAt: number | null;
  /** The app's recorder rather than this page's microphone. */
  native: boolean;
};

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
  /** What is being heard and is not a line yet. */
  partial: string;
  /** The last thing that went wrong, until it is dismissed or the next recording starts. */
  error: string | null;
  dismissError: () => void;
  /** Whether this is the Android app, whose recorder outlives the page. */
  nativeAvailable: boolean;
  start: (r: StartRecording) => Promise<void>;
  /** Stops taking audio — the meeting itself is not ended — and hands the GPU back. */
  stop: () => Promise<void>;
  subscribe: (fn: (e: RecorderEvent) => void) => () => void;
  /** Stop re-rendering for the level meter, while nothing that shows it is on screen. */
  setQuiet: (quiet: boolean) => void;
};

// Three contexts, so a page re-renders only for what it reads: the meter changes ten times a
// second, and the transcript of an hour-long meeting has no business re-rendering with it.
type RecorderApi = Pick<
  Recorder,
  "current" | "nativeAvailable" | "start" | "stop" | "subscribe" | "setQuiet" | "dismissError"
>;
type RecorderState = Pick<Recorder, "session" | "status" | "partial" | "error">;
type RecorderLevel = Pick<Recorder, "level" | "clipping">;

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

  const handle = useRef<SttHandle | null>(null);
  // A start still opening the microphone and the connection. Stop can be pressed in that time —
  // the button already says Stop — and must stop what it is about to become, not nothing.
  const starting = useRef<Promise<SttHandle> | null>(null);
  const nativeHandle = useRef<NativeHandle | null>(null);
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
  }, []);

  const report = useCallback(
    (message: string) => {
      setError(message);
      const s = sessionRef.current;
      if (s) emit({ kind: "error", meetingId: s.meetingId, message });
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
      report(t("Failed to save utterance: {error}", { error: problem }));
    },
    [emit, report, t],
  );

  const level10 = useCallback((rms: number) => {
    if (!quiet.current) setLevel(rms);
  }, []);
  const clipped = useCallback(() => {
    setClipping(true);
    window.setTimeout(() => setClipping(false), 4000);
  }, []);

  // What the browser's own recording reports, for the meeting it was started for.
  const micHandlers = useCallback(
    (meetingId: string) => ({
      onPartial: (text: string) => setPartial(text),
      onFinal: (speaker: string, text: string, seq?: number, audio?: { startMs: number; endMs: number }) => {
        setPartial("");
        void keepLine(meetingId, speaker, text, seq, audio);
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
      onStatus: (s: LinkStatus) => setStatus(s),
      onError: (message: string) => report(readStored(t, message)),
      onLevel: level10,
      onClipping: clipped,
    }),
    [keepLine, emit, report, level10, clipped, t],
  );

  // What the app's recorder reports. It saves each line itself, so a line arrives already saved.
  const appHandlers = useCallback(
    (meetingId: string) => ({
      onPartial: (text: string) => setPartial(text),
      onSaved: (row: NativeSaved) => {
        setPartial("");
        emit({
          kind: "saved",
          meetingId,
          line: { id: row.id, speaker: row.speaker, text: row.text, at: row.createdAt, seq: row.seq },
        });
      },
      onTranslation: (seq: number, text: string, id?: string) => emit({ kind: "translation", meetingId, seq, text, id }),
      onStatus: (s: LinkStatus) => setStatus(s),
      onError: (message: string) => report(readStored(t, message)),
      onLevel: level10,
      onClipping: clipped,
      onResync: () => emit({ kind: "resync", meetingId }),
      onEnded: () => {
        finish();
        emit({ kind: "ended", meetingId });
      },
    }),
    [emit, report, level10, clipped, finish, t],
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
      begin({ meetingId: r.meetingId, title: r.title, startedAt: r.startedAt, native });
      setStatus("connecting");
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
          });
        }
        starting.current = attempt;
        let h: SttHandle;
        try {
          h = await attempt;
        } finally {
          starting.current = null;
        }
        // Stopped while it was starting: stop() has the handle and is stopping it.
        if (sessionRef.current?.meetingId !== r.meetingId) return;
        handle.current = h;
        if (native) nativeHandle.current = h as NativeHandle;
      } catch (e) {
        releaseCard(r.meetingId);
        finish();
        setStatus("error");
        throw e;
      }
    },
    [begin, finish, appHandlers, micHandlers, t],
  );

  const stop = useCallback(async () => {
    const s = sessionRef.current;
    const pending = starting.current;
    const h = handle.current ?? (pending ? await pending.catch(() => null) : null);
    handle.current = null;
    nativeHandle.current = null;
    await h?.stop().catch(() => {});
    if (s) releaseCard(s.meetingId);
    finish();
  }, [finish]);

  const recording = status === "open" || status === "connecting" || status === "reconnecting";
  const native = session?.native ?? false;

  // Closing the tab stops a browser recording, so the tab asks first. Not in the app, where the
  // recording carries on without the page and the question would guard nothing.
  useEffect(() => {
    if (!recording || native) return;
    const askFirst = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", askFirst);
    return () => window.removeEventListener("beforeunload", askFirst);
  }, [recording, native]);

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
    () => ({ current, nativeAvailable, start, stop, subscribe, setQuiet, dismissError }),
    [current, nativeAvailable, start, stop, subscribe, setQuiet, dismissError],
  );
  const state = useMemo<RecorderState>(() => ({ session, status, partial, error }), [session, status, partial, error]);
  const meter = useMemo<RecorderLevel>(() => ({ level, clipping }), [level, clipping]);
  return (
    <ApiContext.Provider value={api}>
      <StateContext.Provider value={state}>
        <LevelContext.Provider value={meter}>{children}</LevelContext.Provider>
      </StateContext.Provider>
    </ApiContext.Provider>
  );
}
