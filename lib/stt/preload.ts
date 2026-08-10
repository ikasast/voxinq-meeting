// Warming up the Whisper model before recording starts.
//
// Loading the model takes tens of seconds, and the STT service releases it again after an
// idle period (to hand the GPU to the LLM). Recording therefore often begins with a long
// "Preparing" phase during which nothing is transcribed. Asking the service to load the
// model while the user is still on the way to the recording screen removes that wait.
//
// The 8GB VRAM budget only fits one of Whisper / the LLM at a time, so a preload never runs
// while minutes are being generated — that would fight for the GPU the LLM is holding.

import { currentMinutesBusy } from "@/lib/minutes-busy";
import { sttHttpBase } from "@/lib/stt/client";

export type SttHealth = {
  status?: string;
  model?: string; // model the service defaults to
  loaded?: string | null; // model currently resident in VRAM (null once released)
  busy?: boolean;
  busyKind?: string | null;
};

export async function sttHealth(timeoutMs = 8000): Promise<SttHealth | null> {
  try {
    const res = await fetch(`${sttHttpBase()}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as SttHealth;
  } catch {
    return null;
  }
}

// The Whisper model from the app settings. Passed to /preload so we warm the model the
// recording will actually use (otherwise the service loads its default and has to swap).
export async function sttModelFromSettings(): Promise<string | undefined> {
  try {
    const s = (await fetch("/api/settings").then((r) => (r.ok ? r.json() : null))) as {
      whisperModel?: string;
    } | null;
    return s?.whisperModel || undefined;
  } catch {
    return undefined;
  }
}

// Ask the STT service to load the model. Returns immediately; the load runs in a background
// thread there ("loading"), or reports "ready" when the model is already resident.
export async function preloadStt(model?: string): Promise<"loading" | "ready" | null> {
  try {
    const qs = model ? `?model=${encodeURIComponent(model)}` : "";
    const res = await fetch(`${sttHttpBase()}/preload${qs}`, {
      method: "POST",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { status?: string };
    return d.status === "ready" ? "ready" : "loading";
  } catch {
    return null; // STT unreachable (e.g. external access) — recording isn't possible anyway
  }
}

// Fire-and-forget warm-up for the paths that lead to a recording. Skipped while minutes are
// generating so we don't pull VRAM out from under the LLM; that case is handled by the
// "interrupt minutes" prompt, after which the recording page preloads anyway.
export async function preloadSttIfIdle(model?: string): Promise<void> {
  const mb = await currentMinutesBusy();
  if (mb.busy) return;
  await preloadStt(model ?? (await sttModelFromSettings()));
}
