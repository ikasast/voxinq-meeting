"""Speaker diarization - split a finished meeting into speaker turns, in one pass at the end.

Runs on sherpa-onnx: pyannote's segmentation model converted to ONNX, WeSpeaker embeddings,
and clustering. The pyannote *pipeline* it replaced needed PyTorch, a CUDA build of torch, and
a Hugging Face token for a gated model - which is most of why the STT image was 20 GB and why
the first Diarize on a new install failed with an authentication error.

What this buys:

  * No torch, no torchcodec, no CUDA wheels. ONNX Runtime is tens of megabytes.
  * No gated model, so no HF token: diarization works on a fresh install with nothing to sign.
  * Runs anywhere ONNX runs, which is the point of the whole 2.0 line.
  * Measured on a real 105 s meeting: 18.5 s on CPU (RTF 0.18), finding the same five speakers
    the pyannote pipeline did.

The trade is that voiceprints do not carry over. WeSpeaker embeddings and pyannote's are both
256 numbers and score 0.39 against each other on the same clip - a different space wearing the
same shape - so enrolled profiles have to be recorded again. See lib/embedding-models.ts.

Usage:
    # Standalone check: split audio into speaker turns
    python diarize.py path/to/audio.wav

    # Assign speakers to STT's finalized segments (production)
    #   segments.json = [{"start": 0.0, "end": 5.4}, ...] (in STT final start/end order)
    python diarize.py path/to/audio.wav segments.json
    #   -> prints the assigned ["speaker0","speaker1",...] per segment as JSON to stdout

    # Voice-profile enrollment: one voiceprint from a single-speaker clip
    python diarize.py --embed path/to/clip.wav

Environment variables:
    DIA_MODEL_DIR       where the ONNX models live (default: ./models next to this file)
    DIA_NUM_SPEAKERS    fix the speaker count if known (optional)
    DIA_CLUSTER_THRESHOLD  clustering distance when the count is unknown (default 0.5)
    DIA_THREADS         ONNX threads (default: half the cores)

`DIA_DEVICE` is accepted and ignored: ONNX Runtime here is the CPU provider, and at RTF 0.18
a GPU would save seconds on a job that runs once, after the meeting, while the GPU is wanted
for generating minutes.
"""

from __future__ import annotations

import json
import math
import os
import sys
import wave
from pathlib import Path

import numpy as np

SAMPLE_RATE = 16000

MODEL_DIR = Path(os.environ.get("DIA_MODEL_DIR") or (Path(__file__).parent / "models"))
SEGMENTATION_MODEL = MODEL_DIR / "segmentation.onnx"
EMBEDDING_MODEL = MODEL_DIR / "embedding.onnx"

# The id recorded against any voiceprint this produces. It must match the value in
# lib/embedding-models.ts, which is what stops a profile from one model being compared with a
# vector from another - equal dimensions mean nothing else would notice.
EMBEDDING_MODEL_ID = "sherpa-wespeaker-resnet34"


def _threads() -> int:
    if os.environ.get("DIA_THREADS"):
        return max(1, int(os.environ["DIA_THREADS"]))
    return max(1, (os.cpu_count() or 4) // 2)


def read_wav(path: str) -> np.ndarray:
    """Read a mono 16 kHz WAV as float32. The recordings this runs on are always that."""
    with wave.open(path, "rb") as w:
        if w.getnchannels() != 1 or w.getframerate() != SAMPLE_RATE:
            raise SystemExit(
                f"expected mono {SAMPLE_RATE} Hz audio, got {w.getnchannels()}ch "
                f"{w.getframerate()} Hz: {path}"
            )
        raw = w.readframes(w.getnframes())
    return np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0


def _require_models() -> None:
    missing = [p.name for p in (SEGMENTATION_MODEL, EMBEDDING_MODEL) if not p.exists()]
    if missing:
        raise SystemExit(
            f"diarization models not found in {MODEL_DIR}: {', '.join(missing)}\n"
            "Fetch them with: python diarization/fetch_models.py"
        )


def _embedding_extractor():
    import sherpa_onnx

    _require_models()
    return sherpa_onnx.SpeakerEmbeddingExtractor(
        sherpa_onnx.SpeakerEmbeddingExtractorConfig(
            model=str(EMBEDDING_MODEL), num_threads=_threads()
        )
    )


def embed_clip(audio_path: str) -> list[float]:
    """One voiceprint from a clip that is assumed to hold a single speaker."""
    ex = _embedding_extractor()
    pcm = read_wav(audio_path)
    stream = ex.create_stream()
    stream.accept_waveform(sample_rate=SAMPLE_RATE, waveform=pcm)
    stream.input_finished()
    return [float(x) for x in ex.compute(stream)]


def diarize(audio_path: str):
    """Split audio into speaker turns and extract a voiceprint per speaker.

    Returns (turns, embeddings):
      turns:      [(start, end, raw_label)]
      embeddings: {raw_label: [float, ...]} mean embedding per cluster, for enrolling and
                  recognising voice profiles on the web side.
    """
    import sherpa_onnx

    _require_models()
    num_speakers = int(os.environ.get("DIA_NUM_SPEAKERS") or -1)
    config = sherpa_onnx.OfflineSpeakerDiarizationConfig(
        segmentation=sherpa_onnx.OfflineSpeakerSegmentationModelConfig(
            pyannote=sherpa_onnx.OfflineSpeakerSegmentationPyannoteModelConfig(
                model=str(SEGMENTATION_MODEL)
            ),
            num_threads=_threads(),
        ),
        embedding=sherpa_onnx.SpeakerEmbeddingExtractorConfig(
            model=str(EMBEDDING_MODEL), num_threads=_threads()
        ),
        # num_clusters=-1 means "work it out"; the threshold then decides where one speaker
        # ends and another begins. A known participant count is far more reliable, which is
        # why the UI asks for it.
        clustering=sherpa_onnx.FastClusteringConfig(
            num_clusters=num_speakers if num_speakers > 0 else -1,
            threshold=float(os.environ.get("DIA_CLUSTER_THRESHOLD") or 0.5),
        ),
        min_duration_on=0.3,
        min_duration_off=0.5,
    )
    if not config.validate():
        raise SystemExit("invalid diarization configuration")

    pcm = read_wav(audio_path)
    result = sherpa_onnx.OfflineSpeakerDiarization(config).process(pcm)
    turns = [
        (float(s.start), float(s.end), f"SPEAKER_{int(s.speaker):02d}")
        for s in result.sort_by_start_time()
    ]

    # sherpa returns turns, not centroids, so the voiceprint for a speaker is built here: the
    # mean of the embeddings of that speaker's turns, weighted by how long each one is. Longer
    # speech is more of the person and less of the room.
    embeddings: dict[str, list[float]] = {}
    if turns:
        ex = _embedding_extractor()
        sums: dict[str, np.ndarray] = {}
        weights: dict[str, float] = {}
        for start, end, label in turns:
            # Too short to characterise a voice; including it drags the centroid around.
            if end - start < 1.0:
                continue
            clip = pcm[int(start * SAMPLE_RATE) : int(end * SAMPLE_RATE)]
            if clip.size < SAMPLE_RATE:
                continue
            stream = ex.create_stream()
            stream.accept_waveform(sample_rate=SAMPLE_RATE, waveform=clip)
            stream.input_finished()
            vec = np.asarray(ex.compute(stream), dtype=np.float64)
            if not np.all(np.isfinite(vec)):
                continue
            w = end - start
            sums[label] = sums.get(label, np.zeros_like(vec)) + vec * w
            weights[label] = weights.get(label, 0.0) + w
        for label, total in sums.items():
            vec = total / weights[label]
            values = [float(x) for x in vec]
            if any(not math.isfinite(x) for x in values) or all(x == 0.0 for x in values):
                continue
            embeddings[label] = values
    return turns, embeddings


def normalize_labels(turns):
    """Renumber raw labels to "speaker0","speaker1"... in first-seen order."""
    order: dict[str, str] = {}
    for _s, _e, label in turns:
        if label not in order:
            order[label] = f"speaker{len(order)}"
    return order


def assign_speakers(turns, segments):
    """Assign each finalized segment (start,end) the speaker with the largest time overlap."""
    label_map = normalize_labels(turns)
    result: list[str] = []
    for seg in segments:
        s, e = float(seg["start"]), float(seg["end"])
        overlap: dict[str, float] = {}
        for ts, te, label in turns:
            ov = max(0.0, min(e, te) - max(s, ts))
            if ov > 0:
                overlap[label] = overlap.get(label, 0.0) + ov
        if overlap:
            best = max(overlap, key=overlap.get)
            result.append(label_map[best])
        else:
            result.append("speaker0")  # no overlap (e.g. silence) -> default to the first speaker
    return result


def main() -> None:
    if len(sys.argv) < 2:
        print("usage: python diarize.py <audio> [segments.json] | --embed <audio>")
        raise SystemExit(1)

    if sys.argv[1] == "--embed":
        if len(sys.argv) < 3:
            print("usage: python diarize.py --embed <audio>")
            raise SystemExit(1)
        try:
            vec = embed_clip(sys.argv[2])
        except SystemExit:
            raise
        except Exception as e:  # noqa: BLE001  the caller shows this to a person
            print(json.dumps({"error": f"no voice embedding could be extracted: {e}"}))
            raise SystemExit(2)
        if not vec:
            print(json.dumps({"error": "no voice embedding could be extracted"}))
            raise SystemExit(2)
        print(json.dumps({"embedding": vec, "embeddingModel": EMBEDDING_MODEL_ID}))
        return

    audio_path = sys.argv[1]
    turns, embeddings = diarize(audio_path)

    if len(sys.argv) >= 3:
        with open(sys.argv[2], encoding="utf-8") as f:
            segments = json.load(f)
        speakers = assign_speakers(turns, segments)
        label_map = normalize_labels(turns)
        norm_embeddings = {label_map[k]: v for k, v in embeddings.items() if k in label_map}
        print(
            json.dumps(
                {
                    "speakers": speakers,
                    "embeddings": norm_embeddings,
                    "embeddingModel": EMBEDDING_MODEL_ID,
                },
                ensure_ascii=False,
            )
        )
    else:
        label_map = normalize_labels(turns)
        out = [
            {"start": round(s, 2), "end": round(e, 2), "speaker": label_map[label]}
            for s, e, label in turns
        ]
        n = len(set(label_map.values()))
        print(json.dumps({"num_speakers": n, "turns": out}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
