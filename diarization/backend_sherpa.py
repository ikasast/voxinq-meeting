"""Speaker diarization on sherpa-onnx: no torch, no gated model, runs anywhere ONNX runs.

This is the backend for hosts without CUDA -- a Mac, an AMD or Intel GPU, a plain CPU server.
It needs neither PyTorch nor a Hugging Face token, so a fresh install can diarize with nothing
to sign up for, and it costs tens of megabytes instead of the several gigabytes a CUDA torch
chain does.

It is *not* as accurate as the pyannote backend, and the difference is not small. Measured
against pyannote's labels on real Japanese meetings:

    12-minute meeting, 3 people   pyannote 61/38/9   this backend 66/42  (86% agreement)
    49-minute meeting, 3 people   pyannote 3 speakers  this backend 1 speaker

The second line is why `backend_pyannote` remains the default wherever torch and CUDA exist.
See docs/design-decisions.md, "Diarization: two backends, chosen by hardware".

The embedding model is WeSpeaker trained on CN-Celeb rather than VoxCeleb. The English-trained
build shipped in v2.0.0-beta.1 and was withdrawn: it could not separate Japanese speakers over
a long meeting, splitting a 12-minute three-way conversation 87/20/1 even when told there were
three people.

Environment variables:
    DIA_MODEL_DIR          where the ONNX models live (default: ./models next to this file)
    DIA_NUM_SPEAKERS       fix the speaker count if known (optional)
    DIA_CLUSTER_THRESHOLD  clustering distance before the merge step (default 0.5)
    DIA_THREADS            ONNX threads (default: half the cores)

`DIA_DEVICE` is accepted and ignored: ONNX Runtime here is the CPU provider, and at RTF 0.18
a GPU would save seconds on a job that runs once, after the meeting, while the GPU is wanted
for generating minutes.
"""

from __future__ import annotations

import itertools
import math
import os
import wave
from pathlib import Path

import numpy as np

SAMPLE_RATE = 16000

MODEL_DIR = Path(os.environ.get("DIA_MODEL_DIR") or (Path(__file__).parent / "models"))
SEGMENTATION_MODEL = MODEL_DIR / "segmentation.onnx"
EMBEDDING_MODEL = MODEL_DIR / "embedding.onnx"

# The id recorded against any voiceprint this produces. It must match an entry in
# lib/embedding-models.ts, which is what stops a profile from one model being compared with a
# vector from another - equal dimensions mean nothing else would notice.
EMBEDDING_MODEL_ID = "sherpa-wespeaker-cnceleb"

NAME = "sherpa"


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


def _merge_clusters(
    turn_vectors: list[tuple[str, np.ndarray, float]], want: int
) -> dict[str, str]:
    """Merge over-split clusters down to `want` speakers, or to a count chosen by shape.

    sherpa's clustering splits far past the truth on real meetings: a 12-minute conversation
    between three people came back as 33 clusters at the most permissive threshold that still
    kept anyone apart, and lowering it only split further. Told the participant count, the same
    pipeline agreed with pyannote 91% of the time -- so the segmentation and the embeddings are
    sound and it is the "how many are there" step that fails.

    Rather than hunt for a threshold that cannot exist (same-speaker and different-speaker
    distances overlap at the level of individual turns), the over-split clusters are merged
    here by their centroids, where averaging has already cancelled most of that noise.

    Returns a mapping from sherpa's label to the merged label.
    """
    if not turn_vectors:
        return {}

    # Duration-weighted centroid per cluster: longer speech is more of the person, less of the
    # room. Normalised, so the distances below are cosine.
    sums: dict[str, np.ndarray] = {}
    weights: dict[str, float] = {}
    for label, vec, w in turn_vectors:
        sums[label] = sums.get(label, np.zeros_like(vec)) + vec * w
        weights[label] = weights.get(label, 0.0) + w
    labels = sorted(sums)
    cents = []
    for label in labels:
        c = sums[label] / weights[label]
        n = np.linalg.norm(c)
        cents.append(c / n if n > 0 else c)
    if len(labels) <= 1:
        return {label: label for label in labels}

    x = np.vstack(cents)
    sim = x @ x.T
    np.fill_diagonal(sim, -np.inf)

    # Average-linkage agglomeration, recording the similarity at which each merge happened.
    groups = {i: [i] for i in range(len(labels))}
    merges: list[tuple[float, int, int]] = []
    active = set(groups)
    while len(active) > 1:
        best = (-np.inf, None, None)
        for i, j in itertools.combinations(sorted(active), 2):
            score = float(np.mean(sim[np.ix_(groups[i], groups[j])]))
            if score > best[0]:
                best = (score, i, j)
        score, i, j = best
        merges.append((score, i, j))
        groups[i] = groups[i] + groups[j]
        active.discard(j)

    if want > 0:
        keep = max(1, min(want, len(labels)))
    else:
        # No participant count given. Cut where the merge similarity falls off hardest: the
        # step from "merging one person's own variation" to "merging two people" is the
        # largest drop in the sequence.
        scores = [m[0] for m in merges]
        keep = 1
        if len(scores) >= 2:
            drops = [(scores[k] - scores[k + 1], k) for k in range(len(scores) - 1)]
            # Only consider cuts that leave a plausible number of speakers for a meeting.
            plausible = [(d, k) for d, k in drops if 1 <= len(labels) - (k + 1) <= 10]
            if plausible:
                keep = len(labels) - (max(plausible)[1] + 1)
        keep = max(1, min(keep, len(labels)))

    # Replay the merges, stopping once the wanted number of groups remain.
    parent = list(range(len(labels)))

    def find(a: int) -> int:
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    remaining = len(labels)
    for _score, i, j in merges:
        if remaining <= keep:
            break
        ri, rj = find(i), find(j)
        if ri == rj:
            continue
        parent[rj] = ri
        remaining -= 1

    # Renumber in first-seen order so the labels read speaker0, speaker1, ...
    out: dict[str, str] = {}
    seen: dict[int, str] = {}
    for idx, label in enumerate(labels):
        root = find(idx)
        if root not in seen:
            seen[root] = f"SPEAKER_{len(seen):02d}"
        out[label] = seen[root]
    return out


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
        # Deliberately left to over-split. sherpa's clustering cannot find the speaker count
        # on real meeting audio -- a three-person conversation came back as 33 clusters at the
        # loosest threshold that still separated anyone -- so no attempt is made to get it
        # right here. The clusters are merged afterwards by their centroids, where averaging
        # has cancelled the per-turn noise that makes the threshold unfindable.
        clustering=sherpa_onnx.FastClusteringConfig(
            num_clusters=-1,
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

    # Embed every turn once. These serve twice over: they decide which of sherpa's over-split
    # clusters belong to the same person, and they become the voiceprints.
    turn_vectors: list[tuple[str, np.ndarray, float]] = []
    if turns:
        ex = _embedding_extractor()
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
            turn_vectors.append((label, vec, end - start))

    merged = _merge_clusters(turn_vectors, num_speakers)
    if merged:
        # Turns too short to embed have no merged label of their own. Leaving them on sherpa's
        # raw label would leak the over-split back out as extra speakers -- asking for three
        # people and getting five, two of them a single utterance each. Give each one the
        # speaker of the nearest turn that could be embedded; a half-second of speech belongs
        # to whoever is talking around it.
        placed = [(s0, e0, merged[l]) for s0, e0, l in turns if l in merged]
        resolved = []
        for s0, e0, label in turns:
            if label in merged:
                resolved.append((s0, e0, merged[label]))
            elif placed:
                nearest = min(placed, key=lambda t: min(abs(t[0] - e0), abs(s0 - t[1])))
                resolved.append((s0, e0, nearest[2]))
            else:
                resolved.append((s0, e0, "SPEAKER_00"))
        turns = resolved
        turn_vectors = [(merged[l], v, w) for l, v, w in turn_vectors if l in merged]

    # The voiceprint for a speaker: the mean of that speaker's turns, weighted by length.
    # Longer speech is more of the person and less of the room.
    embeddings: dict[str, list[float]] = {}
    if turn_vectors:
        sums: dict[str, np.ndarray] = {}
        weights: dict[str, float] = {}
        for label, vec, w in turn_vectors:
            sums[label] = sums.get(label, np.zeros_like(vec)) + vec * w
            weights[label] = weights.get(label, 0.0) + w
        for label, total in sums.items():
            vec = total / weights[label]
            values = [float(x) for x in vec]
            if any(not math.isfinite(x) for x in values) or all(x == 0.0 for x in values):
                continue
            embeddings[label] = values
    return turns, embeddings


def available() -> tuple[bool, str]:
    """Can this backend run here? Returns (ok, reason-if-not)."""
    try:
        import sherpa_onnx  # noqa: F401
    except ImportError as e:
        return False, f"sherpa-onnx is not installed ({e})"
    missing = [p.name for p in (SEGMENTATION_MODEL, EMBEDDING_MODEL) if not p.exists()]
    if missing:
        return False, (
            f"diarization models not found in {MODEL_DIR}: {', '.join(missing)} "
            "(fetch them with: python diarization/fetch_models.py)"
        )
    return True, ""
