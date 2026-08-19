// Anti-alias filtering for the 48 kHz → 16 kHz downsample in the recording worklet.
//
// The worklet decimates by dropping samples. Without a low-pass first, everything above 8 kHz
// folds back into the band we keep: sibilance and room noise reappear as energy sitting on top
// of speech, which is exactly where the recogniser is listening. It is inaudible as "aliasing"
// and shows up instead as words that come back slightly wrong.
//
// The coefficients are computed here, on the main thread, and handed to the worklet — so the
// design is testable in the ordinary way while the worklet keeps only the recurrence.

export type BiquadStage = { b0: number; b1: number; b2: number; a1: number; a2: number };

/** One RBJ low-pass section, normalised so a0 = 1. */
export function biquadLowpass(cutoffHz: number, sampleRate: number, q: number): BiquadStage {
  const w0 = (2 * Math.PI * cutoffHz) / sampleRate;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  return {
    b0: ((1 - cos) / 2) / a0,
    b1: (1 - cos) / a0,
    b2: ((1 - cos) / 2) / a0,
    a1: (-2 * cos) / a0,
    a2: (1 - alpha) / a0,
  };
}

// A 6th-order Butterworth as three cascaded sections. These Q values are what make the set
// Butterworth (maximally flat) rather than three arbitrary low-passes stacked into a bump.
const BUTTERWORTH_6_Q = [0.517638, 0.707107, 1.931852];

// Chosen by measuring where aliasing lands rather than by the textbook "just under Nyquist".
// Decimating to 16 kHz folds an input at f down to 16000 - f, so 14 kHz arrives at 2 kHz —
// the middle of speech, and the most damaging place for it to appear. This cutoff keeps 4 kHz
// untouched (-0.1 dB) and 6 kHz nearly so (-2 dB, where sibilance lives) while pushing that
// 14 kHz fold to -56 dB. A 4th order at 6.8 kHz left it at -35 dB; the extra section is five
// multiply-adds per sample.
export const ANTI_ALIAS_CUTOFF_HZ = 6400;

/**
 * Filter stages for a given input rate, or `null` when the input is already at (or below) the
 * target rate and nothing will be discarded — filtering then only costs quality and CPU.
 */
export function antiAliasStages(sampleRate: number, targetRate = 16000): BiquadStage[] | null {
  if (!Number.isFinite(sampleRate) || sampleRate <= targetRate * 1.01) return null;
  return BUTTERWORTH_6_Q.map((q) => biquadLowpass(ANTI_ALIAS_CUTOFF_HZ, sampleRate, q));
}

/** Run samples through the cascade. Used by the tests; the worklet has its own copy of this. */
export function applyStages(samples: Float32Array, stages: BiquadStage[]): Float32Array {
  const out = Float32Array.from(samples);
  for (const s of stages) {
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < out.length; i++) {
      const x = out[i];
      const y = s.b0 * x + s.b1 * x1 + s.b2 * x2 - s.a1 * y1 - s.a2 * y2;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
      out[i] = y;
    }
  }
  return out;
}

/** Steady-state gain at one frequency, in dB — how the tests check the response. */
export function responseDb(stages: BiquadStage[], freqHz: number, sampleRate: number): number {
  const n = Math.round(sampleRate * 0.5);
  const input = new Float32Array(n);
  for (let i = 0; i < n; i++) input[i] = Math.sin((2 * Math.PI * freqHz * i) / sampleRate);
  const out = applyStages(input, stages);
  // Measure over the back half so the filter's start-up transient is excluded.
  let peak = 0;
  for (let i = Math.floor(n / 2); i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  return 20 * Math.log10(Math.max(peak, 1e-9));
}
