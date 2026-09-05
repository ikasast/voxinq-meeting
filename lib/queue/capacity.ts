import { whisperModel } from "@/lib/stt/models";
import { sttInternalUrl } from "@/lib/stt/internal";
import { readSettings } from "@/lib/settings";
import type { JobKind } from "./types";
import type { MinutesParams } from "./types";
import type { TranscribeParams } from "./runners/transcribe";

// How much of the card each job wants, and how much there is.
//
// The rule before this was "one at a time", which is right for the case it was written for —
// Whisper and a 7B model on one 8 GB card — and stricter than the hardware anywhere else. A
// re-transcription sent to Groq uses no video memory at all; so does minutes written by
// Anthropic. Both were queued behind local work for no reason other than the rule being a
// count rather than a measurement.
//
// The numbers are estimates and are treated as such: they decide what may start together, not
// what is allowed to exist. A job larger than the whole budget still runs — alone — because the
// alternative is a queue that silently never moves.

/** Left for the display, the desktop, and whatever else is on the card. */
const HEADROOM_MB = 1024;

/** When there is no NVIDIA card at all. Work is serialised by CPU contention instead. */
const NO_GPU_BUDGET_MB = 4096;

/**
 * pyannote on CUDA, measured as roughly this in the 8 GB configuration. sherpa-onnx runs on the
 * CPU and costs nothing here — which is why a host without CUDA can diarize beside anything.
 */
const PYANNOTE_MB = 2048;

/** A 7B at Q4 plus its context. Used when Ollama cannot be asked. */
const LLM_FALLBACK_MB = 5120;

type Health = {
  vramTotalMb?: number | null;
  diarizationBackend?: string | null;
};

async function health(): Promise<Health> {
  try {
    const res = await fetch(`${sttInternalUrl()}/health`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return {};
    return (await res.json()) as Health;
  } catch {
    // The STT service being unreachable is not this function's problem to report; the job that
    // needs it will say so far more usefully.
    return {};
  }
}

/**
 * What the queue may run at once, in MB.
 *
 * The saved setting wins when it is set — an estimate is a guess about someone else's machine,
 * and the person sitting at it can measure. Zero means "work it out".
 */
export async function budgetMb(): Promise<number> {
  const s = await readSettings();
  if (s.vramBudgetMb > 0) return s.vramBudgetMb;
  const { vramTotalMb } = await health();
  if (!vramTotalMb || vramTotalMb <= 0) return NO_GPU_BUDGET_MB;
  return Math.max(1024, vramTotalMb - HEADROOM_MB);
}

/** Is this address on this machine? A local Ollama competes for the card; a remote one does not. */
export function isLocalUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return (
      h === "localhost" ||
      h === "127.0.0.1" ||
      h === "::1" ||
      h === "0.0.0.0" ||
      h === "host.docker.internal" ||
      h.endsWith(".local")
    );
  } catch {
    return false;
  }
}

/** What an Ollama model occupies, asked of Ollama. Its own report beats any table here. */
async function ollamaModelMb(baseUrl: string, model: string): Promise<number> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return LLM_FALLBACK_MB;
    const d = (await res.json()) as { models?: { name?: string; size?: number }[] };
    const hit = d.models?.find((m) => m.name === model || m.name?.split(":")[0] === model.split(":")[0]);
    if (!hit?.size) return LLM_FALLBACK_MB;
    // On disk, quantised. What it occupies loaded is that plus the context, and the context is
    // the part this cannot see — so a fifth is added rather than pretending the file size is it.
    return Math.round((hit.size / 1024 / 1024) * 1.2);
  } catch {
    return LLM_FALLBACK_MB;
  }
}

/**
 * What this job is expected to occupy.
 *
 * Worked out when the job is queued, not when it runs, so the queue can show it and admission is
 * a sum rather than a round of questions. The cost of that: a model changed between queueing and
 * running is costed as the old one. It is an estimate either way.
 */
export async function estimateVramMb(kind: JobKind, params: object): Promise<number> {
  const s = await readSettings();

  if (kind === "minutes") {
    const p = params as MinutesParams;
    const provider = p.provider ?? s.llmProvider;
    // Someone else's machine, someone else's memory.
    if (provider === "anthropic" || provider === "openai") return 0;
    if (!isLocalUrl(s.ollamaBaseUrl)) return 0;
    return ollamaModelMb(s.ollamaBaseUrl, s.ollamaModel);
  }

  if (kind === "transcribe") {
    const p = params as TranscribeParams;
    const asked = typeof p.profileId === "string" ? p.profileId : null;
    const wantedId = asked === null ? s.sttDefaultProfileId : asked === "local" ? "" : asked;
    const profile = wantedId ? s.sttProfiles.find((x) => x.id === wantedId) : undefined;
    const model = p.model || s.whisperModel;
    const localSize = Math.round((whisperModel(model)?.sizeGb ?? 3) * 1024);
    // Recognition over HTTP costs nothing here — unless "over HTTP" means a whisper server on
    // this machine, which is on this card. What it actually loads is unknowable from here, so
    // it is costed as if it were the local model: an overestimate delays a job, an
    // underestimate runs two things on a card that fits one.
    if (profile) return isLocalUrl(profile.baseUrl) ? localSize : 0;
    return localSize;
  }

  if (kind === "diarize") {
    const { diarizationBackend } = await health();
    // sherpa-onnx is the CPU backend; it is why a host without CUDA can separate speakers at all,
    // and it does not compete for the card.
    return diarizationBackend === "sherpa" ? 0 : PYANNOTE_MB;
  }

  return 0;
}
