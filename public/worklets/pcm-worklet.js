// AudioWorklet processor for Voxinq recording.
// Downsamples Float32 mono input of any sample rate to 16kHz / Int16(LE), and
// transfers an ArrayBuffer to the main thread every ~100ms (1600 samples).
// This binary is streamed as-is to the STT service (WebSocket).

const TARGET_RATE = 16000;
const CHUNK_SAMPLES = 1600; // 100ms @ 16kHz

class VoxinqPcmFeeder extends AudioWorkletProcessor {
  constructor(options) {
    super();
    // Ratio of input rate / 16k. A phase-accumulator approach handles non-integer ratios.
    this.step = sampleRate / TARGET_RATE;
    this.acc = 0;
    this.chunk = new Int16Array(CHUNK_SAMPLES);
    this.filled = 0;

    // Anti-alias low-pass, applied before samples are dropped. Decimating without it folds
    // everything above 8kHz back into the band we keep — 14kHz arrives as 2kHz, in the middle
    // of speech. The coefficients are designed and tested on the main thread
    // (lib/audio/lowpass.ts); only the recurrence lives here. Empty = input already at 16k.
    const stages = (options && options.processorOptions && options.processorOptions.stages) || [];
    this.stages = stages.map((s) => ({ ...s, x1: 0, x2: 0, y1: 0, y2: 0 }));

    // Clipping is reported rather than silently flattened: it means the input is too hot, and
    // no amount of downstream processing recovers what the clip destroyed.
    this.clipped = 0;
    this.seen = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i++) {
      let v = channel[i];

      for (const s of this.stages) {
        const y = s.b0 * v + s.b1 * s.x1 + s.b2 * s.x2 - s.a1 * s.y1 - s.a2 * s.y2;
        s.x2 = s.x1;
        s.x1 = v;
        s.y2 = s.y1;
        s.y1 = y;
        v = y;
      }

      this.seen++;
      if (v > 1 || v < -1) this.clipped++;

      this.acc += 1;
      if (this.acc < this.step) continue;
      this.acc -= this.step;

      let s = v;
      if (s > 1) s = 1;
      else if (s < -1) s = -1;
      this.chunk[this.filled++] = (s * 0x7fff) | 0;

      if (this.filled === CHUNK_SAMPLES) {
        // Ride along with the audio so the UI can warn while there is still time to fix it.
        const clipRatio = this.seen > 0 ? this.clipped / this.seen : 0;
        this.clipped = 0;
        this.seen = 0;
        this.port.postMessage({ pcm: this.chunk.buffer, clipRatio }, [this.chunk.buffer]);
        this.chunk = new Int16Array(CHUNK_SAMPLES);
        this.filled = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-worklet", VoxinqPcmFeeder);
