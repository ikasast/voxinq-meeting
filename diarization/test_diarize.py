"""Dividing an utterance between the people who spoke in it.

Run with: python diarization/test_diarize.py

An utterance is cut where the room goes quiet, never where the speaker changes, so a quick
exchange lands in one line and today's rule hands the whole line to whoever spoke most of it.
These are about the arithmetic that fixes that: which words fall on which side of a change,
where the line then divides, and the cases where it must leave the line alone.

No models are involved — the turns are written out here — so this runs anywhere.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from diarize import absorb_short, assign_speakers, split_utterances  # noqa: E402

# Two people, taking turns: A speaks to 5 s, B from 5.2 to 8 s, A again from 8.4 s.
TURNS = [(0.0, 5.0, "spk_a"), (5.2, 8.0, "spk_b"), (8.4, 12.0, "spk_a")]


def words(*items):
    return [{"w": w, "s": s, "e": e} for w, s, e in items]


def test_a_line_of_one_speaker_is_left_alone() -> None:
    seg = {"start": 0.0, "end": 4.0, "words": words(("そう", 1.0, 1.4), ("ですね", 1.4, 2.0))}
    assert split_utterances(TURNS, [seg]) == [None]


def test_a_line_holding_two_speakers_divides_where_they_change() -> None:
    seg = {
        "start": 4.0,
        "end": 9.0,
        "words": words(("はい", 4.2, 4.6), ("それで", 5.4, 6.0), ("いいです", 6.0, 6.8), ("では", 8.6, 9.0)),
    }
    [pieces] = split_utterances(TURNS, [seg])
    assert [(p["speaker"], p["text"]) for p in pieces] == [
        ("speaker0", "はい"),
        ("speaker1", "それでいいです"),
        ("speaker0", "では"),
    ]
    # The times come from the words, so the pieces can be placed in the recording.
    assert (pieces[1]["start"], pieces[1]["end"]) == (5.4, 6.8)


def test_a_line_with_no_words_is_left_to_the_single_speaker() -> None:
    # An older recording, or a backend that cannot align words. The caller keeps the label
    # assign_speakers gave the whole line.
    assert split_utterances(TURNS, [{"start": 4.0, "end": 9.0}]) == [None]
    assert split_utterances(TURNS, [{"start": 4.0, "end": 9.0, "words": []}]) == [None]
    assert assign_speakers(TURNS, [{"start": 4.0, "end": 9.0}]) == ["speaker1"]


def test_malformed_words_are_refused_rather_than_half_used() -> None:
    # Half a line divided by half its words would put text on the wrong speaker silently.
    seg = {"start": 4.0, "end": 9.0, "words": [{"w": "はい", "s": 4.2, "e": 4.6}, {"w": "それで"}]}
    assert split_utterances(TURNS, [seg]) == [None]


def test_a_word_in_the_gap_between_turns_goes_to_the_nearer_side() -> None:
    # Diarizers leave a small gap at a change, and a word inside one still has to belong to
    # somebody. "ええ" here starts 0.10 s after A stops and ends 0.02 s before B starts.
    seg = {"start": 0.0, "end": 9.0, "words": words(("そう", 4.0, 4.5), ("ええ", 5.10, 5.18), ("どうぞ", 6.0, 6.5))}
    [pieces] = split_utterances(TURNS, [seg])
    assert [(p["speaker"], p["text"]) for p in pieces] == [
        ("speaker0", "そう"),
        ("speaker1", "ええどうぞ"),
    ]


def test_short_pieces_can_be_absorbed_when_asked() -> None:
    pieces = [
        {"speaker": "speaker0", "text": "はい", "start": 4.2, "end": 4.5},
        {"speaker": "speaker1", "text": "それでいいです", "start": 5.4, "end": 6.8},
    ]
    # Off by default: a short piece in a live line is usually a real "はい".
    assert absorb_short([dict(p) for p in pieces], 0.0) == pieces
    merged = absorb_short([dict(p) for p in pieces], 1.0)
    assert [(p["speaker"], p["text"]) for p in merged] == [("speaker1", "はいそれでいいです")]


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
