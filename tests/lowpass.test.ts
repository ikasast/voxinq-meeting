import { describe, expect, it } from "vitest";
import {
  ANTI_ALIAS_CUTOFF_HZ,
  antiAliasStages,
  applyStages,
  biquadLowpass,
  responseDb,
} from "../lib/audio/lowpass";

describe("antiAliasStages", () => {
  it("does nothing when the input is already at the target rate", () => {
    // Mic-only capture opens the context at 16 kHz, so no samples are discarded and filtering
    // would only remove usable band.
    expect(antiAliasStages(16000)).toBeNull();
    expect(antiAliasStages(8000)).toBeNull();
  });

  it("builds a cascade for the usual 48 kHz capture", () => {
    const stages = antiAliasStages(48000);
    expect(stages).toHaveLength(3);
    for (const s of stages!) {
      for (const v of Object.values(s)) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("shrugs off a nonsense sample rate", () => {
    expect(antiAliasStages(Number.NaN)).toBeNull();
    expect(antiAliasStages(0)).toBeNull();
  });
});

describe("frequency response at 48 kHz", () => {
  const stages = antiAliasStages(48000)!;

  it("leaves speech alone", () => {
    // The band that carries intelligibility must come through essentially untouched.
    for (const f of [200, 500, 1000, 2000]) {
      expect(responseDb(stages, f, 48000)).toBeGreaterThan(-1.5);
    }
  });

  it("kills what would fold into the speech band", () => {
    // Decimating to 16 kHz folds an input at f down to 16000 - f. What matters is not the
    // attenuation at some round number but the attenuation at the frequencies whose folds
    // land on speech: 14 kHz becomes 2 kHz, 12 kHz becomes 4 kHz, 10 kHz becomes 6 kHz.
    expect(responseDb(stages, 14000, 48000)).toBeLessThan(-50); // -> 2 kHz, worst place for it
    expect(responseDb(stages, 12000, 48000)).toBeLessThan(-40); // -> 4 kHz
    expect(responseDb(stages, 10000, 48000)).toBeLessThan(-25); // -> 6 kHz
    expect(responseDb(stages, 20000, 48000)).toBeLessThan(-70);
  });

  it("beats the plain 4th-order design it replaced", () => {
    // Guards the reason for the third section: if someone trims it back to two, the fold that
    // lands in the middle of speech loses about 20 dB and this fails.
    const fourth = [0.541196, 1.306563].map((q) => biquadLowpass(6800, 48000, q));
    expect(responseDb(stages, 14000, 48000)).toBeLessThan(responseDb(fourth, 14000, 48000) - 15);
  });

  it("is already rolling off at the cutoff", () => {
    const atCutoff = responseDb(stages, ANTI_ALIAS_CUTOFF_HZ, 48000);
    expect(atCutoff).toBeLessThan(-2);
    expect(atCutoff).toBeGreaterThan(-10);
  });

  it("keeps sibilance", () => {
    // Japanese leans on 5-7 kHz for s/sh; losing it costs more than the aliasing it would save.
    expect(responseDb(stages, 6000, 48000)).toBeGreaterThan(-4);
  });
});

describe("applyStages", () => {
  it("is stable — no runaway on a long signal", () => {
    const stages = antiAliasStages(48000)!;
    const n = 48000;
    const noise = new Float32Array(n);
    for (let i = 0; i < n; i++) noise[i] = Math.sin(i) * 0.9;
    const out = applyStages(noise, stages);
    for (const v of out) expect(Number.isFinite(v)).toBe(true);
    expect(Math.max(...Array.from(out, Math.abs))).toBeLessThan(2);
  });

  it("passes DC through at unity, which is what a low-pass should do", () => {
    const stages = [biquadLowpass(6800, 48000, 0.7071)];
    const dc = new Float32Array(2000).fill(1);
    const out = applyStages(dc, stages);
    expect(out[out.length - 1]).toBeCloseTo(1, 3);
  });

  it("does not modify its input", () => {
    const stages = antiAliasStages(48000)!;
    const input = new Float32Array([1, 0, -1, 0, 1]);
    const copy = Float32Array.from(input);
    applyStages(input, stages);
    expect(Array.from(input)).toEqual(Array.from(copy));
  });
});
