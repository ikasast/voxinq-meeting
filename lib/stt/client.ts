import { antiAliasStages } from "@/lib/audio/lowpass";
import { diarizerLabelToKey, SELF_KEY } from "@/lib/speakers";

// WebSocket client for the self-hosted STT service (Python/faster-whisper).
// Assumes in-person meetings and single-phone recording, handling a single mic input.
// pcm-worklet.js converts to 16kHz/16bit/mono PCM and sends it as raw binary.
//
// Follows the handler shape of the old lib/amivoice/client.ts but drops the source(self/partner) concept.

export type RecognizerStatus = "connecting" | "open" | "closed" | "reconnecting" | "error";

export type SttHandlers = {
  // Provisional (interim text mid-segment).
  onPartial: (text: string) => void;
  // Finalized utterance. speakerKey is SELF_KEY when diarization is off, partner-N when on.
  // seq numbers the utterance within this session, so a later translation can find its line.
  // `audio` is where this utterance sits in the recording. Persist it: the alternative — deriving
  // a position from when the row reached the database — is late by the utterance's own length
  // plus however long recognition took, which put clicks up to ten seconds before the speech.
  onFinal: (
    speakerKey: string,
    text: string,
    seq?: number,
    audio?: { startMs: number; endMs: number },
  ) => void;
  // Japanese translation of finalized utterance `seq`, arriving separately (CPU-side, so it
  // must never hold up the transcript).
  onTranslation?: (seq: number, text: string) => void;
  onStatus: (status: RecognizerStatus) => void;
  onError: (message: string) => void;
  // Input audio level (RMS 0..1, ~every 100ms). For the "is sound arriving" meter.
  onLevel?: (rms: number) => void;
  /** Fraction of samples that hit the rails in the last ~100 ms. */
  onClipping?: (ratio: number) => void;
};

export type SttHandle = {
  stop: () => Promise<void>;
};

// Where the browser reaches the STT service. NEXT_PUBLIC_* is inlined at build time, which
// is fine when you build from source but useless in a published image — every user would be
// stuck with whatever URL the image was built with, and recording from a phone needs a URL
// that only they know. So the server may also inject one at runtime (see app/layout.tsx),
// and that wins when present.
declare global {
  interface Window {
    __VOXINQ_STT_WS__?: string;
  }
}

const BUILT_IN_WS_URL = process.env.NEXT_PUBLIC_STT_WS_URL ?? "ws://localhost:8000/ws";

function wsUrl(): string {
  if (typeof window !== "undefined" && window.__VOXINQ_STT_WS__) return window.__VOXINQ_STT_WS__;
  return BUILT_IN_WS_URL;
}

// Derive the http(s) base from the WS URL, for HTTP endpoints such as diarization.
// e.g. wss://host:8443/ws -> https://host:8443
export function sttHttpBase(): string {
  return wsUrl().replace(/\/ws\/?$/, "").replace(/^ws/, "http");
}

type ServerMessage =
  | { type: "status"; status: "open" | "closed" | "loading" }
  | { type: "partial"; text: string }
  | { type: "final"; text: string; speaker?: string; seq?: number; start?: number; end?: number }
  | { type: "translation"; seq: number; text: string }
  | { type: "error"; message: string };

// Convert the server's speaker label to a speaker key.
// With diarization off, "spk" etc. arrives -> SELF_KEY as a single speaker.
// With diarization on, "speaker0"/"speaker1" ... -> partner-N.
function speakerLabelToKey(label: string | undefined): string {
  if (label && /^speaker\d+$/.test(label)) return diarizerLabelToKey(label);
  return SELF_KEY;
}

export async function startMic(
  handlers: SttHandlers,
  opts?: {
    model?: string;
    meetingId?: string;
    language?: string;
    initialPrompt?: string;
    micMode?: string;
    source?: string; // "mic"(既定) | "display"(PC音声) | "both"(両方をミックス)
    translate?: boolean; // translate non-Japanese utterances into Japanese (CPU-side)
  },
): Promise<SttHandle> {
  const log = (...args: unknown[]) => console.log("[stt]", ...args);

  // room: to better pick up distant voices in a meeting room, turn off echo/noise
  //       suppression and raise auto-gain. standard: the default for near/call use.
  const room = opts?.micMode === "room";
  const source = opts?.source ?? "mic";
  const streams: MediaStream[] = [];
  try {
    // Acquire screen share (getDisplayMedia) first, to use the user gesture right after the click.
    if (source === "display" || source === "both") {
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== "function") {
        throw new Error(
          "この端末/ブラウザは PC 音声の取り込みに対応していません（PC の Chrome / Edge をご利用ください）。",
        );
      }
      const disp = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      if (disp.getAudioTracks().length === 0) {
        disp.getTracks().forEach((t) => t.stop());
        throw new Error(
          "画面共有で音声が選択されていません。共有ダイアログで「タブの音声を共有」またはシステム音声をオンにしてください。",
        );
      }
      streams.push(disp);
    }
    if (source === "mic" || source === "both") {
      // In both (mic + PC audio), the mic picks up PC audio from the speakers and
      // double-captures (echo). The browser AEC can cancel it by referencing the system
      // playback, so force AEC/NS ON for both even in room mode.
      const useAec = source === "both" ? true : !room;
      streams.push(
        await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: useAec,
            noiseSuppression: useAec,
            autoGainControl: true,
          },
        }),
      );
    }
  } catch (e) {
    streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    throw e;
  }

  // PC audio (getDisplayMedia) has a known Chrome bug: it goes silent when the
  // AudioContext sample rate differs from the device default (usually 48kHz).
  // -> When display is included, open at the device default rate and downsample to
  //   16kHz in pcm-worklet. Mic-only keeps specifying 16kHz (the browser resamples cleanly).
  const ctx = source === "mic" ? new AudioContext({ sampleRate: 16000 }) : new AudioContext();
  try {
    await ctx.audioWorklet.addModule("/worklets/pcm-worklet.js");
  } catch (e) {
    streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    await ctx.close().catch(() => {});
    throw new Error(`AudioWorklet を読み込めませんでした: ${(e as Error).message}`);
  }
  // Multiple sources (mic + PC audio) connect to the same node and mix to mono.
  const node = new AudioWorkletNode(ctx, "pcm-worklet", {
    channelCount: 1,
    channelCountMode: "explicit",
    channelInterpretation: "speakers",
    // Filter before decimating — see lib/audio/lowpass.ts for why, and for the tests.
    processorOptions: { stages: antiAliasStages(ctx.sampleRate) ?? [] },
  });

  // Mixing used to be a bare sum of every source into the worklet, which meant mic and PC audio
  // both at full scale could add past 1.0 and hit the hard clip inside it. Now each source gets
  // headroom and the sum passes through a limiter, so a loud moment is rounded off rather than
  // squared off — clipping is the one distortion recognition cannot see past.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 3;
  limiter.ratio.value = 12; // effectively a limiter above the threshold
  limiter.attack.value = 0.003;
  limiter.release.value = 0.15;
  limiter.connect(node);

  const srcNodes = streams.map((s) => ctx.createMediaStreamSource(s));
  srcNodes.forEach((sn) => {
    const gain = ctx.createGain();
    // Two sources summing need room; one on its own does not have to be quieter than it was.
    gain.gain.value = streams.length > 1 ? 0.7 : 1;
    sn.connect(gain);
    gain.connect(limiter);
  });
  // Do not connect to destination, to avoid echo.

  // Passing meetingId lets the STT service save the meeting audio for later diarization.
  // language: "auto"|"ja"|"en" (auto = auto-detect), initialPrompt: glossary to bias recognition.
  const startPayload = JSON.stringify({
    type: "start",
    model: opts?.model,
    meetingId: opts?.meetingId,
    language: opts?.language,
    initialPrompt: opts?.initialPrompt,
    translate: opts?.translate ?? false,
  });

  let ws: WebSocket | null = null;
  let opened = false; // whether the server returned "open" (model ready)
  let stopped = false;
  let fatal = false; // explicit server error (e.g. model load failure). do not reconnect
  let retries = 0;
  const MAX_RETRIES = 5;

  // Audio buffer awaiting send. Audio from before the connection opens (model loading)
  // or during reconnects is buffered locally and flushed after "open". This ensures:
  //  - speech during preparation is not lost
  //  - the path is not clogged by sending nonstop until the server finishes reading
  const backlog: ArrayBuffer[] = [];
  const MAX_BACKLOG_CHUNKS = 3000; // 100ms x 3000 = ~5 min. drop oldest when exceeded

  const flushBacklog = () => {
    while (backlog.length > 0 && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(backlog.shift()!);
    }
  };

  const connect = () => {
    log(retries > 0 ? `reconnecting (${retries}/${MAX_RETRIES})` : "connecting", wsUrl());
    handlers.onStatus(retries > 0 ? "reconnecting" : "connecting");
    const sock = new WebSocket(wsUrl());
    sock.binaryType = "arraybuffer";
    ws = sock;
    opened = false;

    sock.addEventListener("open", () => sock.send(startPayload));

    sock.addEventListener("message", (ev) => {
      if (typeof ev.data !== "string") return;
      let msg: ServerMessage;
      try {
        msg = JSON.parse(ev.data) as ServerMessage;
      } catch {
        return;
      }
      switch (msg.type) {
        case "status":
          if (msg.status === "open") {
            opened = true;
            retries = 0; // reset retry count once recognition starts
            flushBacklog();
            handlers.onStatus("open");
          } else if (msg.status === "closed") {
            handlers.onStatus("closed");
          }
          // "loading" keeps the connecting state shown
          break;
        case "partial":
          // An empty partial clears the provisional text (sent when a segment is discarded
          // as noise, so its last partial does not linger on screen).
          handlers.onPartial(msg.text ?? "");
          break;
        case "final":
          if (msg.text) {
            const audio =
              typeof msg.start === "number" && typeof msg.end === "number"
                ? { startMs: Math.round(msg.start * 1000), endMs: Math.round(msg.end * 1000) }
                : undefined;
            handlers.onFinal(speakerLabelToKey(msg.speaker), msg.text, msg.seq, audio);
          }
          break;
        case "translation":
          if (msg.text) handlers.onTranslation?.(msg.seq, msg.text);
          break;
        case "error":
          fatal = true;
          handlers.onError(msg.message);
          handlers.onStatus("error");
          break;
      }
    });

    sock.addEventListener("close", (ev) => {
      if (stopped || sock !== ws) return; // 意図的な停止 or 旧接続の残骸
      opened = false;
      if (!fatal && retries < MAX_RETRIES) {
        // Auto-reconnect on unexpected disconnects. Audio during the gap keeps buffering in backlog.
        retries += 1;
        handlers.onStatus("reconnecting");
        setTimeout(() => {
          if (!stopped) connect();
        }, 2000);
      } else {
        if (!fatal) {
          handlers.onError(
            `STT 切断: code=${ev.code}${ev.reason ? ` reason=${ev.reason}` : ""}（再接続を${MAX_RETRIES}回試みました）`,
          );
        }
        handlers.onStatus("error");
      }
    });
    // the error event is handled by the close that immediately follows
  };

  connect();

  // On returning from a phone screen lock or a backgrounded tab:
  //  - resume the suspended AudioContext (restore the stalled audio capture)
  //  - reconnect if disconnected (a fallback for exhausted retries; gap audio stays in backlog)
  const onVisibility = () => {
    if (typeof document === "undefined" || document.visibilityState !== "visible") return;
    if (stopped || fatal) return;
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    const closed =
      !ws || ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED;
    if (closed) {
      retries = 0;
      connect();
    }
  };
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibility);
  }

  // PCM (Int16LE) from the worklet. Send immediately if opened, otherwise queue to backlog.
  node.port.onmessage = (e: MessageEvent<{ pcm: ArrayBuffer; clipRatio: number }>) => {
    const { pcm: buf, clipRatio } = e.data;
    // Clipping is destroyed information, not a level to be turned down later — surface it while
    // the meeting is still running and the input can be fixed.
    if (clipRatio > 0.001) handlers.onClipping?.(clipRatio);
    if (opened && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(buf);
    } else if (!stopped && !fatal) {
      backlog.push(buf);
      if (backlog.length > MAX_BACKLOG_CHUNKS) backlog.shift();
    }
    if (handlers.onLevel) {
      const arr = new Int16Array(buf);
      let sum = 0;
      let n = 0;
      for (let i = 0; i < arr.length; i += 4) {
        const v = arr[i] / 32768;
        sum += v * v;
        n++;
      }
      handlers.onLevel(n > 0 ? Math.sqrt(sum / n) : 0);
    }
  };

  return {
    stop: async () => {
      stopped = true;
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
      const sock = ws;
      // After receiving end, the server transcribes the final segment and saves the recording.
      // Closing before that loses the last utterance and the recording (WAV for diarization),
      // so wait up to 10s for the server's "closed" notice (save complete) before closing.
      const serverDone = new Promise<void>((resolve) => {
        if (!sock || sock.readyState === WebSocket.CLOSED) {
          resolve();
          return;
        }
        sock.addEventListener("message", (ev) => {
          if (typeof ev.data !== "string") return;
          try {
            const m = JSON.parse(ev.data) as ServerMessage;
            if (m.type === "status" && m.status === "closed") resolve();
          } catch {
            // ignore
          }
        });
        sock.addEventListener("close", () => resolve());
      });
      try {
        if (sock && sock.readyState === WebSocket.OPEN) {
          flushBacklog(); // deliver any leftover audio before end
          sock.send(JSON.stringify({ type: "end" }));
        }
      } catch {
        // ignore
      }
      // Stop audio capture immediately (do not send while waiting after end).
      try { node.disconnect(); } catch {}
      try { srcNodes.forEach((sn) => sn.disconnect()); } catch {}
      try { streams.forEach((s) => s.getTracks().forEach((t) => t.stop())); } catch {}
      try { await ctx.close(); } catch {}
      await Promise.race([serverDone, new Promise((r) => setTimeout(r, 10000))]);
      try { sock?.close(); } catch {}
      handlers.onStatus("closed");
    },
  };
}
