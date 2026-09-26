// What a finished job records about how it ran, for looking back at it later.
//
// Kept apart from the job's other columns because it is different for each kind of work and
// grows as there is more to say: minutes have tokens and a model, speaker separation has a
// backend and a device. Everything is optional — a job that failed early records what it knew
// by then, and a job from before this existed records nothing.
//
// Imports nothing, so the queue screen can read it in the browser.

export type JobMetrics = {
  // ---- minutes ----
  /** "ollama" | "anthropic" | "openai". */
  provider?: string;
  model?: string;
  /** LLM calls made: more than one means a long meeting was condensed before it was written. */
  calls?: number;
  inputTokens?: number;
  outputTokens?: number;
  promptMs?: number;
  generateMs?: number;
  loadMs?: number;
  numCtx?: number;
  /** What Ollama held for the model once loaded, and how much of that was on the GPU. */
  loadedMb?: number;
  gpuMb?: number;

  // ---- speaker separation and recognition ----
  /** Recognition or diarization backend: "faster-whisper", "pyannote", "sherpa", … */
  backend?: string;
  /** "cuda" | "cpu" — where the STT service runs. */
  device?: string;
  speakers?: number;
  /** Lines divided because they held more than one speaker. */
  divided?: number;
  /** Where recognition ran: "local", or the saved endpoint's name. */
  where?: string;
};

/** The share of the loaded model that sat on the GPU, 0–1, when that is known. */
export function gpuShare(m: JobMetrics | null | undefined): number | null {
  if (!m?.loadedMb || m.gpuMb === undefined) return null;
  return Math.max(0, Math.min(1, m.gpuMb / m.loadedMb));
}

/** How fast the answer was written, in tokens per second, when that is known. */
export function tokensPerSecond(m: JobMetrics | null | undefined): number | null {
  if (!m?.outputTokens || !m.generateMs) return null;
  return m.outputTokens / (m.generateMs / 1000);
}
