import { afterEach, describe, expect, it, vi } from "vitest";
import { attachNative, hasNativeRecorder, nativeState, startNative } from "@/lib/stt/native";

// The page's half of the Android app's recorder (lib/stt/native.ts). The app's half is Kotlin
// and is checked on a phone; what can be pinned here is the page's side of the conversation —
// what it sends, and what it does with each thing it is told.

type Sent = Record<string, unknown>;
type Win = { window?: unknown };

function installApp() {
  const sent: Sent[] = [];
  let listener: ((event: { data: unknown }) => void) | null = null;
  const app = {
    postMessage: (m: string) => {
      sent.push(JSON.parse(m) as Sent);
    },
    addEventListener: (_type: string, l: (event: { data: unknown }) => void) => {
      listener = l;
    },
  };
  (globalThis as Win).window = { VoxinqAndroid: app, __VOXINQ_STT_WS__: "wss://stt.example:8443/ws" };
  return {
    sent,
    tell: (m: object) => listener?.({ data: JSON.stringify(m) }),
    tellRaw: (data: unknown) => listener?.({ data }),
  };
}

function handlers() {
  return {
    onPartial: vi.fn(),
    onSaved: vi.fn(),
    onTranslation: vi.fn(),
    onStatus: vi.fn(),
    onError: vi.fn(),
    onLevel: vi.fn(),
    onClipping: vi.fn(),
    onResync: vi.fn(),
    onEnded: vi.fn(),
  };
}

afterEach(() => {
  delete (globalThis as Win).window;
  vi.useRealTimers();
});

describe("the page's side of the app's recorder", () => {
  it("is only there inside the app", () => {
    expect(hasNativeRecorder()).toBe(false);
    installApp();
    expect(hasNativeRecorder()).toBe(true);
  });

  it("hands over the recording with the browser's start options and the service's address", async () => {
    const app = installApp();
    const h = handlers();
    const handle = await startNative(h, {
      meetingId: "m1",
      title: "Weekly sync",
      model: "large-v3-turbo",
      language: "ja",
      translate: true,
      liveTranscript: false,
      micMode: "room",
    });
    expect(h.onStatus).toHaveBeenCalledWith("connecting");
    expect(app.sent).toEqual([
      {
        type: "start",
        wsUrl: "wss://stt.example:8443/ws",
        meetingId: "m1",
        title: "Weekly sync",
        model: "large-v3-turbo",
        language: "ja",
        translate: true,
        liveTranscript: false,
        micMode: "room",
      },
    ]);
    handle.detach();
  });

  it("passes on what the app reports, and ignores what it cannot read", async () => {
    const app = installApp();
    const h = handlers();
    const handle = await startNative(h, { meetingId: "m1" });

    app.tell({ type: "status", status: "open" });
    app.tell({ type: "status", status: "saving" }); // the notification's word, not the page's
    app.tell({ type: "partial", text: "hel" });
    app.tell({ type: "saved", id: "t1", speaker: "self", text: "hello", createdAt: "2026-09-12T10:00:00.000Z", seq: 1 });
    app.tell({ type: "translation", seq: 1, text: "こんにちは", id: "t1" });
    app.tell({ type: "level", rms: 0.05 });
    app.tell({ type: "clipping", ratio: 0.01 });
    app.tell({ type: "error", message: "Failed to save utterance: HTTP 500" });
    app.tell({ type: "resync" });
    app.tell({ type: "ended", meetingId: "m1" });
    app.tellRaw("not json");
    app.tellRaw(42);

    expect(h.onStatus.mock.calls).toEqual([["connecting"], ["open"]]);
    expect(h.onPartial).toHaveBeenCalledWith("hel");
    expect(h.onSaved).toHaveBeenCalledWith({
      id: "t1",
      speaker: "self",
      text: "hello",
      createdAt: "2026-09-12T10:00:00.000Z",
      seq: 1,
    });
    expect(h.onTranslation).toHaveBeenCalledWith(1, "こんにちは", "t1");
    expect(h.onLevel).toHaveBeenCalledWith(0.05);
    expect(h.onClipping).toHaveBeenCalledWith(0.01);
    expect(h.onError).toHaveBeenCalledWith("Failed to save utterance: HTTP 500");
    expect(h.onResync).toHaveBeenCalledOnce();
    expect(h.onEnded).toHaveBeenCalledOnce();
    handle.detach();
  });

  it("stops once the app says the recording is saved, and hears nothing after", async () => {
    const app = installApp();
    const h = handlers();
    const handle = await startNative(h, { meetingId: "m1" });
    const stopped = handle.stop();
    expect(app.sent.at(-1)).toEqual({ type: "stop" });
    app.tell({ type: "stopped", meetingId: "m1" });
    await stopped;
    expect(h.onStatus).toHaveBeenLastCalledWith("closed");
    app.tell({ type: "partial", text: "late" });
    expect(h.onPartial).not.toHaveBeenCalled();
    // A second Stop is the same stop, not another message.
    expect(handle.stop()).toBe(stopped);
    expect(app.sent.filter((m) => m.type === "stop")).toHaveLength(1);
  });

  it("does not wait forever for an app that never answers", async () => {
    vi.useFakeTimers();
    installApp();
    const h = handlers();
    const handle = await startNative(h, { meetingId: "m1" });
    const stopped = handle.stop();
    await vi.advanceTimersByTimeAsync(45_000);
    await stopped;
    expect(h.onStatus).toHaveBeenLastCalledWith("closed");
  });

  it("asks the app what it is recording", async () => {
    const app = installApp();
    const asked = nativeState();
    expect(app.sent).toEqual([{ type: "hello" }]);
    app.tell({ type: "state", recording: true, meetingId: "m1", status: "open", startedAt: 1757670000000 });
    await expect(asked).resolves.toEqual({
      recording: true,
      meetingId: "m1",
      status: "open",
      startedAt: 1757670000000,
    });
  });

  it("gets no answer outside the app, or from an app that does not reply", async () => {
    await expect(nativeState()).resolves.toBeNull();
    vi.useFakeTimers();
    installApp();
    const asked = nativeState(1500);
    await vi.advanceTimersByTimeAsync(1500);
    await expect(asked).resolves.toBeNull();
  });

  it("picks up a recording that is already running without starting another", () => {
    const app = installApp();
    const h = handlers();
    const handle = attachNative(h, "open");
    expect(app.sent).toEqual([]);
    expect(h.onStatus).toHaveBeenCalledWith("open");
    app.tell({ type: "saved", id: "t9", speaker: "self", text: "still here", createdAt: "2026-09-12T10:00:00.000Z" });
    expect(h.onSaved).toHaveBeenCalledOnce();
    handle.detach();
    app.tell({ type: "saved", id: "t10", speaker: "self", text: "after leaving", createdAt: "2026-09-12T10:00:05.000Z" });
    expect(h.onSaved).toHaveBeenCalledOnce();
  });
});
