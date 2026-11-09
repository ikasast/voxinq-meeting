"""Merging sherpa-onnx's over-split clusters into speakers.

Run with: python diarization/test_sherpa_merge.py

sherpa splits a meeting into far more clusters than there are people, and the merge decides who
is who. These check it on synthetic voices -- one direction per person, each split into several
clusters, plus a handful of one-turn scraps that point nowhere in particular, the way crosstalk
and laughter do. Those scraps are what broke the earlier merge: it kept them apart as speakers
and joined real people to make room.

Needs only numpy: no models, no sherpa-onnx.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))

from backend_sherpa import _merge_clusters  # noqa: E402

DIM = 64


def voices(seed: int, people: int) -> np.ndarray:
    """One unit direction per person, about as far apart as real voices are (cosine ~0.6)."""
    rng = np.random.default_rng(seed)
    shared = rng.normal(size=DIM)  # the room, the microphone: what every voice has in common
    out = []
    for _ in range(people):
        v = shared + rng.normal(size=DIM) * 0.8
        out.append(v / np.linalg.norm(v))
    return np.vstack(out)


def turns_for(
    rng: np.random.Generator, voice: np.ndarray, cluster: str, n: int, seconds: float
) -> list[tuple[str, np.ndarray, float]]:
    """`n` turns of one person, all in one of sherpa's clusters."""
    return [(cluster, voice + rng.normal(size=DIM) * 0.04, seconds) for _ in range(n)]


def meeting(seed: int = 0, quiet: float = 0.0):
    """Four people, each split into three clusters, plus eight one-turn scraps.

    Returns (turn_vectors, truth) where truth maps each cluster to the person it belongs to,
    or to None for a scrap. `quiet` > 0 makes the fourth person say only that many seconds.
    """
    rng = np.random.default_rng(seed + 100)
    v = voices(seed, 4)
    tv: list[tuple[str, np.ndarray, float]] = []
    truth: dict[str, str | None] = {}
    for p in range(4):
        for part in range(3):
            label = f"c{p}{part}"
            if quiet and p == 3:
                tv += turns_for(rng, v[p], label, 2, quiet / 6)
            else:
                tv += turns_for(rng, v[p], label, 6 - part, 8.0)
            truth[label] = f"p{p}"
    # The scraps: a single turn each, a few seconds long, pointing anywhere.
    for k in range(8):
        label = f"x{k}"
        noise = rng.normal(size=DIM)
        tv.append((label, noise / np.linalg.norm(noise), 2.0))
        truth[label] = None
    return tv, truth


def people_found(mapping: dict[str, str], truth: dict[str, str | None]) -> dict[str, set[str]]:
    """For each merged label, which real people's clusters went into it (scraps ignored)."""
    out: dict[str, set[str]] = {}
    for cluster, label in mapping.items():
        out.setdefault(label, set())
        if truth[cluster] is not None:
            out[label].add(truth[cluster])
    return out


def assert_one_label_per_person(mapping, truth, people=4) -> None:
    found = people_found(mapping, truth)
    # Every label holds exactly one person: nobody was merged with anybody else...
    assert all(len(p) == 1 for p in found.values()), found
    # ...and every person has exactly one label: nobody was left split, and no scrap took a
    # label of its own.
    assert len(found) == people, found
    assert set().union(*found.values()) == {f"p{i}" for i in range(people)}, found


def test_told_the_count_the_scraps_do_not_take_a_speaker_place() -> None:
    tv, truth = meeting()
    assert_one_label_per_person(_merge_clusters(tv, 4), truth)


def test_not_told_the_count_it_finds_the_people_and_not_the_scraps() -> None:
    tv, truth = meeting()
    assert_one_label_per_person(_merge_clusters(tv, -1), truth)


def test_the_scraps_are_folded_into_somebody_rather_than_dropped() -> None:
    # Every cluster must come back with a label: a turn without one would leak sherpa's raw
    # label back out as an extra speaker.
    tv, truth = meeting()
    for want in (4, -1):
        mapping = _merge_clusters(tv, want)
        assert set(mapping) == set(truth)
        assert len(set(mapping.values())) == 4


def test_a_quiet_person_is_kept_when_the_count_says_they_are_there() -> None:
    # The fourth person says 15 seconds in all, split across three clusters -- less than some
    # people's single cluster, more than any scrap. Told four, they keep their own label.
    tv, truth = meeting(quiet=15.0)
    assert_one_label_per_person(_merge_clusters(tv, 4), truth)


def test_the_old_failure_two_people_merged_to_keep_scraps_apart() -> None:
    # What the earlier merge did, on several seeds: asked for four, it returned four labels,
    # but some were scraps and two real people shared one. Check across seeds that no label
    # holds two people.
    for seed in range(10):
        tv, truth = meeting(seed)
        found = people_found(_merge_clusters(tv, 4), truth)
        assert all(len(p) <= 1 for p in found.values()), (seed, found)


def test_labels_are_numbered_in_order() -> None:
    tv, _ = meeting()
    labels = set(_merge_clusters(tv, 4).values())
    assert labels == {"SPEAKER_00", "SPEAKER_01", "SPEAKER_02", "SPEAKER_03"}


def test_edges() -> None:
    assert _merge_clusters([], 3) == {}
    one = [("a", np.ones(DIM), 3.0)]
    assert _merge_clusters(one, 3) == {"a": "SPEAKER_00"}
    assert _merge_clusters(one, -1) == {"a": "SPEAKER_00"}
    # Asked for more people than there are clusters: each cluster is its own speaker.
    v = voices(1, 2)
    two = [("a", v[0], 20.0), ("b", v[1], 20.0)]
    assert len(set(_merge_clusters(two, 5).values())) == 2
    # Not told, and everything is tiny: still one speaker rather than none.
    tiny = [("a", v[0], 1.0), ("b", v[1], 1.0)]
    assert len(set(_merge_clusters(tiny, -1).values())) == 1


if __name__ == "__main__":
    failed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"  ok   {name}")
            except Exception as e:  # noqa: BLE001  a test can fail by raising, not only by assert
                failed += 1
                print(f"  FAIL {name}: {type(e).__name__}: {e}")
    print("all passed" if not failed else f"{failed} failed")
    sys.exit(1 if failed else 0)
