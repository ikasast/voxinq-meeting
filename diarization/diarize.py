"""Speaker diarization (pyannote.audio) - diarize the whole audio in one pass after a meeting.

Runs in a dedicated venv (diarization/.venv) to keep dependencies separate from the STT
service (faster-whisper). Accuracy is a compromise given the single-mic in-person assumption.
It is a post-meeting batch job, so CPU is fine.

Usage:
    # Standalone check: split audio into speaker turns
    python diarize.py path/to/audio.wav

    # Assign speakers to STT's finalized segments (production)
    #   segments.json = [{"start": 0.0, "end": 5.4}, ...] (in STT final start/end order)
    python diarize.py path/to/audio.wav segments.json
    #   -> prints the assigned ["speaker0","speaker1",...] per segment as JSON to stdout

Environment variables:
    HF_TOKEN            HuggingFace access token (if unset, uses the saved one in ~/.cache/huggingface)
    DIA_DEVICE         cpu (default) / cuda
    DIA_NUM_SPEAKERS   fix the speaker count if known (optional)
    DIA_MIN_SPEAKERS / DIA_MAX_SPEAKERS  hints for the speaker-count range (optional)
"""

from __future__ import annotations

import json
import math
import os
import sys

MODEL = "pyannote/speaker-diarization-3.1"


def _auth():
    # Use HF_TOKEN if set, otherwise None (= use the token saved by huggingface_hub).
    return os.environ.get("HF_TOKEN") or None


def load_pipeline():
    import torch
    from pyannote.audio import Pipeline

    # The auth argument differs by version: 3.x=use_auth_token / 4.x=token. Support both.
    try:
        pipeline = Pipeline.from_pretrained(MODEL, use_auth_token=_auth())
    except TypeError:
        pipeline = Pipeline.from_pretrained(MODEL, token=_auth())
    if pipeline is None:
        raise SystemExit(
            "Failed to load the pyannote pipeline. Check the HF token and that the model terms are accepted:\n"
            "  https://huggingface.co/pyannote/speaker-diarization-3.1\n"
            "  https://huggingface.co/pyannote/segmentation-3.0"
        )
    device = os.environ.get("DIA_DEVICE", "cpu")
    pipeline.to(torch.device(device))
    return pipeline


def diarize(audio_path: str):
    """Split audio into speaker turns and extract per-speaker voice embeddings.

    Returns (turns, embeddings):
      turns:      [(start, end, raw_label)]
      embeddings: {raw_label: [float, ...]} mean speaker embedding (voiceprint) per
                  cluster, or {} if the installed pyannote version cannot provide them.
                  Used for voice-profile enrollment / recognition on the web side.
    """
    pipeline = load_pipeline()
    kwargs = {}
    if os.environ.get("DIA_NUM_SPEAKERS"):
        kwargs["num_speakers"] = int(os.environ["DIA_NUM_SPEAKERS"])
    if os.environ.get("DIA_MIN_SPEAKERS"):
        kwargs["min_speakers"] = int(os.environ["DIA_MIN_SPEAKERS"])
    if os.environ.get("DIA_MAX_SPEAKERS"):
        kwargs["max_speakers"] = int(os.environ["DIA_MAX_SPEAKERS"])

    # 3.x: pipeline(file, return_embeddings=True) returns (Annotation, centroids).
    # 4.x: ignores that kwarg and returns a DiarizeOutput with .speaker_embeddings.
    try:
        result = pipeline(audio_path, return_embeddings=True, **kwargs)
    except TypeError:
        result = pipeline(audio_path, **kwargs)

    centroids = None
    if isinstance(result, tuple) and len(result) == 2:  # 3.x
        annotation, centroids = result
        labels_source = annotation
    elif hasattr(result, "speaker_diarization"):  # 4.x DiarizeOutput
        full = result.speaker_diarization
        centroids = getattr(result, "speaker_embeddings", None)
        labels_source = full  # centroid rows are ordered by full.labels()
        # For assigning speakers to utterances, the non-overlapping exclusive version is easier.
        annotation = getattr(result, "exclusive_speaker_diarization", None) or full
    else:
        annotation = result
        labels_source = result

    turns = [
        (float(turn.start), float(turn.end), str(label))
        for turn, _, label in annotation.itertracks(yield_label=True)
    ]

    embeddings: dict[str, list[float]] = {}
    if centroids is not None:
        for i, label in enumerate(labels_source.labels()):
            if i >= len(centroids):
                break
            vec = [float(x) for x in centroids[i]]
            # Skip padded/degenerate rows (all-zero or non-finite).
            if not vec or any(not math.isfinite(x) for x in vec) or all(x == 0.0 for x in vec):
                continue
            embeddings[str(label)] = vec
    return turns, embeddings


def normalize_labels(turns):
    """Renumber pyannote's "SPEAKER_00" etc. to "speaker0","speaker1"... in first-seen order."""
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
        # Voice-profile enrollment: extract ONE voiceprint from a single-speaker clip.
        if len(sys.argv) < 3:
            print("usage: python diarize.py --embed <audio>")
            raise SystemExit(1)
        os.environ["DIA_NUM_SPEAKERS"] = "1"
        _turns, embeddings = diarize(sys.argv[2])
        vec = next(iter(embeddings.values()), None)
        if vec is None:
            print(json.dumps({"error": "no voice embedding could be extracted"}))
            raise SystemExit(2)
        print(json.dumps({"embedding": vec}))
        return

    audio_path = sys.argv[1]
    turns, embeddings = diarize(audio_path)

    if len(sys.argv) >= 3:
        with open(sys.argv[2], encoding="utf-8") as f:
            segments = json.load(f)
        speakers = assign_speakers(turns, segments)
        # Emit embeddings keyed by the normalized labels ("speaker0", ...) so the web
        # side can enroll/match voice profiles per displayed speaker.
        label_map = normalize_labels(turns)
        norm_embeddings = {label_map[k]: v for k, v in embeddings.items() if k in label_map}
        print(json.dumps({"speakers": speakers, "embeddings": norm_embeddings}, ensure_ascii=False))
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
