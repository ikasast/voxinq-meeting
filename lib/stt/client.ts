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
  onFinal: (speakerKey: string, text: string) => void;
  onStatus: (status: RecognizerStatus) => void;
  onError: (message: string) => void;
  // Input audio level (RMS 0..1, ~every 100ms). For the "is sound arriving" meter.
  onLevel?: (rms: number) => void;
};

export type SttHandle = {
  stop: () => Promise<void>;
};

const WS_URL = process.env.NEXT_PUBLIC_STT_WS_URL ?? "ws://localhost:8000/ws";

// Derive the http(s) base from the WS URL, for HTTP endpoints such as diarization.
// e.g. wss://host:8443/ws -> https://host:8443
export function sttHttpBase(): string {
  return WS_URL.replace(/\/ws\/?$/, "").replace(/^ws/, "http");
}

type ServerMessage =
  | { type: "status"; status: "open" | "closed" | "loading" }
  | { type: "partial"; text: string }
  | { type: "final"; text: string; speaker?: string; start?: number; end?: number }
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
  });
  const srcNodes = streams.map((s) => ctx.createMediaStreamSource(s));
  srcNodes.forEach((sn) => sn.connect(node));
  // Do not connect to destination, to avoid echo.

  // Passing meetingId lets the STT service save the meeting audio for later diarization.
  // language: "auto"|"ja"|"en" (auto = auto-detect), initialPrompt: glossary to bias recognition.
  const startPayload = JSON.stringify({
    type: "start",
    model: opts?.model,
    meetingId: opts?.meetingId,
    language: opts?.language,
    initialPrompt: opts?.initialPrompt,
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
    log(retries > 0 ? `reconnecting (${retries}/${MAX_RETRIES})` : "connecting", WS_URL);
    handlers.onStatus(retries > 0 ? "reconnecting" : "connecting");
    const sock = new WebSocket(WS_URL);
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
          if (msg.text) handlers.onPartial(msg.text);
          break;
        case "final":
          if (msg.text) handlers.onFinal(speakerLabelToKey(msg.speaker), msg.text);
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
  node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
    const buf = e.data;
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
