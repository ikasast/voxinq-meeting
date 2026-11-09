"""Speaker diarization on sherpa-onnx: no torch, no gated model, runs anywhere ONNX runs.

This is the backend for hosts without CUDA -- a Mac, an AMD or Intel GPU, a plain CPU server.
It needs neither PyTorch nor a Hugging Face token, so a fresh install can diarize with nothing
to sign up for, and it costs tens of megabytes instead of the several gigabytes a CUDA torch
chain does.

It is a little less accurate than the pyannote backend. On the public AMI benchmark
(docs/benchmarks.md) it gives 84.5% of speech to the right person against pyannote's 85.3%,
and 86.1% of clear lines against 90.5%. Against pyannote's labels on real Japanese meetings it
agrees on 89% of a 12-minute meeting and 85% of a 41-minute one.

Those figures are from after the merge step below was fixed. Before, this backend agreed on
86% of the short meeting and put every line of the long one on one speaker -- a collapse also
seen on a 49-minute meeting, and why `backend_pyannote` remains the default wherever torch
and CUDA exist. See docs/design-decisions.md, "Diarization has two backends".

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


# Two centroids at least this similar are taken to be one person. On the AMI benchmark the
# clusters sherpa splits one person into sit at 0.88-0.97 to each other, and different people at
# 0.5-0.75 -- though a pair can reach 0.81. Merging down to 0.78 joined two real people in one
# meeting; anywhere from 0.80 to 0.85 gave the same result, so the middle is used.
MERGE_SIMILARITY = 0.82

# Not told the count, a group must hold this much speech to be called a speaker; anything
# smaller is folded into the nearest one. Absolute for short meetings, a share for long ones,
# where the leftovers of crosstalk and laughter grow with the length.
MIN_SPEAKER_S = 10.0
MIN_SPEAKER_SHARE = 0.01


def _merge_clusters(
    turn_vectors: list[tuple[str, np.ndarray, float]], want: int
) -> dict[str, str]:
    """Merge over-split clusters into `want` speakers, or into as many as the voices show.

    sherpa's clustering splits far past the truth on real meetings: a 12-minute conversation
    between three people came back as 33 clusters, and an AMI meeting of four as 136. Those
    clusters are nearly pure -- 91-98% of each one's speech is one person's on the AMI
    benchmark -- so the segmentation and the embeddings are sound and it is the "how many are
    there" step that fails.

    Two steps, in this order:

    1. Merge only what is clearly the same person: join the two groups whose centroids are most
       alike, again and again, while they are at least MERGE_SIMILARITY alike. A merged group's
       centroid is its members' weighted by speech, so a big cluster is not dragged about by
       the scraps that join it.
    2. Then decide who is a speaker by how much each group says. Told the count, the `want`
       groups with the most speech are the speakers; not told, every group with at least
       MIN_SPEAKER_S and MIN_SPEAKER_SHARE of the speech is. Every other group's clusters go,
       one by one, to the speaker whose centroid is nearest.

    The order is the fix. The earlier version merged everything by similarity alone until
    `want` were left. But a cluster of one or two turns -- crosstalk, a laugh, two voices at
    once -- is alike to nobody, so it was always merged last, and real people were joined
    first to make room for it. Told there were four, it put 521 of 523 lines of an AMI meeting
    on one person and spent the other three labels on single lines. Counting speech instead of
    clusters keeps those scraps from taking a speaker's place.

    Returns a mapping from sherpa's label to the merged label.
    """
    if not turn_vectors:
        return {}

    # Duration-weighted centroid per cluster: longer speech is more of the person, less of the
    # room. Normalised, so the products below are cosine similarities.
    sums: dict[str, np.ndarray] = {}
    weights: dict[str, float] = {}
    for label, vec, w in turn_vectors:
        sums[label] = sums.get(label, np.zeros_like(vec)) + vec * w
        weights[label] = weights.get(label, 0.0) + w
    labels = sorted(sums)
    cents = np.vstack([_unit(sums[label]) for label in labels])
    mass = np.array([weights[label] for label in labels])

    def merge_while(stop_at: float, floor: int) -> list[list[int]]:
        """Centroid-linkage agglomeration: stop below `stop_at` similarity or at `floor` groups."""
        groups = [[i] for i in range(len(labels))]
        totals = cents * mass[:, None]
        sim = cents @ cents.T
        np.fill_diagonal(sim, -np.inf)
        while len(groups) > max(floor, 1):
            a, b = np.unravel_index(int(np.argmax(sim)), sim.shape)
            if sim[a, b] < stop_at:
                break
            a, b = min(a, b), max(a, b)
            groups[a] += groups.pop(b)
            totals[a] += totals[b]
            totals = np.delete(totals, b, axis=0)
            sim = np.delete(np.delete(sim, b, axis=0), b, axis=1)
            # Only the merged group's similarities change.
            g = totals / np.linalg.norm(totals, axis=1, keepdims=True).clip(min=1e-12)
            sim[a] = g @ g[a]
            sim[:, a] = sim[a]
            sim[a, a] = -np.inf
        return groups

    floor = max(want, 1)
    groups = merge_while(MERGE_SIMILARITY, floor)

    spoken = np.array([mass[g].sum() for g in groups])
    by_speech = [int(k) for k in np.argsort(-spoken, kind="stable")]
    if want > 0:
        speakers = by_speech[:want]
    else:
        least = max(MIN_SPEAKER_S, MIN_SPEAKER_SHARE * float(mass.sum()))
        speakers = [k for k in by_speech if spoken[k] >= least] or by_speech[:1]

    speaker_cents = np.vstack(
        [_unit((cents[groups[k]] * mass[groups[k], None]).sum(axis=0)) for k in speakers]
    )
    owner: dict[int, int] = {}
    for rank, k in enumerate(speakers):
        for i in groups[k]:
            owner[i] = rank
    for i in range(len(labels)):
        if i not in owner:
            owner[i] = int(np.argmax(speaker_cents @ cents[i]))

    # Renumber in first-seen order so the labels read SPEAKER_00, SPEAKER_01, ...
    out: dict[str, str] = {}
    seen: dict[int, str] = {}
    for idx, label in enumerate(labels):
        rank = owner[idx]
        if rank not in seen:
            seen[rank] = f"SPEAKER_{len(seen):02d}"
        out[label] = seen[rank]
    return out


def _unit(v: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(v)
    return v / n if n > 0 else v


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
        #
        # The count is not passed here even when it is known: told the count directly, sherpa
        # reached 76.3% on the AMI benchmark, against 84.5% for over-splitting and merging.
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
