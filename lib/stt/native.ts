// The Android app's recorder, as the recording page sees it.
//
// In the app the page is a WebView on this server, and recording moves out of the page into a
// foreground service — the one kind of work Android keeps running with the screen off or another
// app in front. The page hands the recording over through `window.VoxinqAndroid`, which the app
// gives to this server's own pages and no others, and gets back what `startMic` would have told
// it: the status, the words being recognised, the level. Saving belongs to the service, so each
// line arrives already saved. See docs/android-app.md.

import { type RecognizerStatus, type SttHandle, type SttHandlers, sttWsUrl } from "./client";

/** What the app injects: strings go out through `postMessage`, and come back as message events. */
type Bridge = {
  postMessage(message: string): void;
  addEventListener?(type: "message", listener: (event: { data: unknown }) => void): void;
  onmessage?: ((event: { data: unknown }) => void) | null;
};

declare global {
  interface Window {
    VoxinqAndroid?: Bridge;
  }
}

/** A line the app has saved — the row the page would otherwise have created itself. */
export type NativeSaved = {
  id: string;
  speaker: string;
  text: string;
  createdAt: string;
  seq?: number;
};

export type NativeHandlers = Omit<SttHandlers, "onFinal" | "onTranslation"> & {
  onSaved: (row: NativeSaved) => void;
  /** Already saved onto its row by the app; the page only has to show it. */
  onTranslation?: (seq: number, text: string, id?: string) => void;
  /** The app is in front again after a while hidden: reload what was saved meanwhile. */
  onResync?: () => void;
  /** Stop in the app's notification ended the meeting. */
  onEnded?: () => void;
};

/** The handle `startMic` returns, and a way to let go of the page without stopping anything. */
export type NativeHandle = SttHandle & { detach: () => void };

export type NativeState = {
  recording: boolean;
  meetingId: string | null;
  status: RecognizerStatus | null;
  startedAt: number;
};

export type NativeStartOptions = {
  meetingId: string;
  title?: string;
  model?: string;
  language?: string;
  initialPrompt?: string;
  translate?: boolean;
  liveTranscript?: boolean;
  micMode?: string;
};

type Message = { type: string; [key: string]: unknown };

const STATUSES: readonly RecognizerStatus[] = ["connecting", "open", "closed", "reconnecting", "error"];

/** The app waits up to ten seconds for the service, then for the lines still being saved. */
const STOP_CEILING_MS = 45_000;

const listeners = new Set<(m: Message) => void>();
let wired: Bridge | null = null;

function bridge(): Bridge | null {
  return typeof window !== "undefined" && window.VoxinqAndroid ? window.VoxinqAndroid : null;
}

export function hasNativeRecorder(): boolean {
  return bridge() !== null;
}

function wire(b: Bridge) {
  if (wired === b) return;
  wired = b;
  const onMessage = (event: { data: unknown }) => {
    if (typeof event.data !== "string") return;
    let m: Message;
    try {
      m = JSON.parse(event.data) as Message;
    } catch {
      return;
    }
    if (!m || typeof m.type !== "string") return;
    for (const l of [...listeners]) l(m);
  };
  if (typeof b.addEventListener === "function") b.addEventListener("message", onMessage);
  else b.onmessage = onMessage;
}

function listen(fn: (m: Message) => void): () => void {
  const b = bridge();
  if (b) wire(b);
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function send(message: Message) {
  bridge()?.postMessage(JSON.stringify(message));
}

function asStatus(value: unknown): RecognizerStatus | null {
  return STATUSES.includes(value as RecognizerStatus) ? (value as RecognizerStatus) : null;
}

/** Whether the app is recording, and which meeting. Null with no app, or no answer. */
export function nativeState(timeoutMs = 1500): Promise<NativeState | null> {
  if (!bridge()) return Promise.resolve(null);
  return new Promise((resolve) => {
    let off = () => {};
    const timer = setTimeout(() => {
      off();
      resolve(null);
    }, timeoutMs);
    off = listen((m) => {
      if (m.type !== "state") return;
      clearTimeout(timer);
      off();
      resolve({
        recording: m.recording === true,
        meetingId: typeof m.meetingId === "string" ? m.meetingId : null,
        status: asStatus(m.status),
        startedAt: typeof m.startedAt === "number" ? m.startedAt : 0,
      });
    });
    send({ type: "hello" });
  });
}

function subscribe(handlers: NativeHandlers): NativeHandle {
  const off = listen((m) => {
    switch (m.type) {
      case "status": {
        const s = asStatus(m.status);
        if (s) handlers.onStatus(s);
        break;
      }
      case "partial":
        handlers.onPartial(typeof m.text === "string" ? m.text : "");
        break;
      case "saved":
        if (typeof m.id === "string" && typeof m.text === "string") {
          handlers.onSaved({
            id: m.id,
            speaker: typeof m.speaker === "string" ? m.speaker : "self",
            text: m.text,
            createdAt: typeof m.createdAt === "string" && m.createdAt ? m.createdAt : new Date().toISOString(),
            seq: typeof m.seq === "number" ? m.seq : undefined,
          });
        }
        break;
      case "translation":
        if (typeof m.seq === "number" && typeof m.text === "string" && m.text) {
          handlers.onTranslation?.(m.seq, m.text, typeof m.id === "string" ? m.id : undefined);
        }
        break;
      case "level":
        if (typeof m.rms === "number") handlers.onLevel?.(m.rms);
        break;
      case "clipping":
        if (typeof m.ratio === "number") handlers.onClipping?.(m.ratio);
        break;
      case "error":
        if (typeof m.message === "string" && m.message) handlers.onError(m.message);
        break;
      case "resync":
        handlers.onResync?.();
        break;
      case "ended":
        handlers.onEnded?.();
        break;
    }
  });

  let stopping: Promise<void> | null = null;
  return {
    detach: off,
    stop: () => {
      stopping ??= new Promise<void>((resolve) => {
        let offStop = () => {};
        const done = () => {
          clearTimeout(timer);
          offStop();
          off();
          handlers.onStatus("closed");
          resolve();
        };
        const timer = setTimeout(done, STOP_CEILING_MS);
        offStop = listen((m) => {
          if (m.type === "stopped" || m.type === "ended") done();
        });
        send({ type: "stop" });
      });
      return stopping;
    },
  };
}

/** Hand this meeting's recording to the app. The same options `startMic` takes, less the audio routing. */
export async function startNative(handlers: NativeHandlers, opts: NativeStartOptions): Promise<NativeHandle> {
  if (!bridge()) throw new Error("The app's recorder is not available");
  const handle = subscribe(handlers);
  handlers.onStatus("connecting");
  send({ type: "start", wsUrl: sttWsUrl(), ...opts });
  return handle;
}

/**
 * Pick up a recording the app is already making — the page reloaded, or opened again from the
 * notification. Nothing is started; the app says where it is.
 */
export function attachNative(handlers: NativeHandlers, status: RecognizerStatus | null): NativeHandle {
  const handle = subscribe(handlers);
  if (status) handlers.onStatus(status);
  return handle;
}
