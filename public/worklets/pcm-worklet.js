// AudioWorklet processor for Voxinq recording.
// Downsamples Float32 mono input of any sample rate to 16kHz / Int16(LE), and
// transfers an ArrayBuffer to the main thread every ~100ms (1600 samples).
// This binary is streamed as-is to the STT service (WebSocket).

const TARGET_RATE = 16000;
const CHUNK_SAMPLES = 1600; // 100ms @ 16kHz

class VoxinqPcmFeeder extends AudioWorkletProcessor {
  constructor() {
    super();
    // Ratio of input rate / 16k. A phase-accumulator approach handles non-integer ratios.
    this.step = sampleRate / TARGET_RATE;
    this.acc = 0;
    this.chunk = new Int16Array(CHUNK_SAMPLES);
    this.filled = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i++) {
      this.acc += 1;
      if (this.acc < this.step) continue;
      this.acc -= this.step;

      let s = channel[i];
      if (s > 1) s = 1;
      else if (s < -1) s = -1;
      this.chunk[this.filled++] = (s * 0x7fff) | 0;

      if (this.filled === CHUNK_SAMPLES) {
        this.port.postMessage(this.chunk.buffer, [this.chunk.buffer]);
        this.chunk = new Int16Array(CHUNK_SAMPLES);
        this.filled = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-worklet", VoxinqPcmFeeder);
