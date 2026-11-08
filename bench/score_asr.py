"""Character error rate, and how much runs of the same audio differ.

    python bench/score_asr.py bench/results/asr-*.json [--data bench/data]

CER is edit distance over the reference's length, after NFKC, lower case, and keeping letters and
digits only: punctuation and spacing are a matter of style the reference and Whisper disagree on,
and counting them would measure that rather than recognition.

Between runs, the same distance is taken from one run's text to another's, over the first run's
length — a recognition of the same audio that comes out differently each time is something a
person correcting a transcript notices, whatever the reference says.
"""

from __future__ import annotations

import argparse
import itertools
import json
import re
import unicodedata
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKC", s).lower()
    s = re.sub(r"<[^>]*>", "", s)
    return "".join(c for c in s if unicodedata.category(c)[0] in "LN")


def distance(a: str, b: str) -> int:
    """Levenshtein distance, a row at a time with numpy (fast enough for 30 minutes of text)."""
    if not a:
        return len(b)
    if not b:
        return len(a)
    bb = np.frombuffer(b.encode("utf-32-le"), dtype=np.uint32)
    prev = np.arange(len(b) + 1, dtype=np.int32)
    for i, ch in enumerate(a, 1):
        sub = prev[:-1] + (bb != ord(ch))
        cur = np.empty_like(prev)
        cur[0] = i
        cur[1:] = np.minimum(prev[1:] + 1, sub)
        # Insertions run left to right within the row.
        cur = np.minimum.accumulate(cur - np.arange(len(cur))) + np.arange(len(cur))
        prev = cur
    return int(prev[-1])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("results", nargs="+", type=Path)
    ap.add_argument("--data", type=Path, default=ROOT / "bench" / "data")
    a = ap.parse_args()
    refs = json.loads((a.data / "asr" / "refs.json").read_text(encoding="utf-8"))
    keys = sorted(refs)
    joined = norm("".join(refs[k] for k in keys))

    for path in a.results:
        r = json.loads(path.read_text(encoding="utf-8"))
        print(f"\n{path.name}: {r['backend']} on {r['device']} ({r['compute']}), {r['model']}")
        if "clips" in r:
            hyps = r["clips"]["hyps"]
            errors = sum(distance(norm(refs[k]), norm(hyps.get(k, ""))) for k in keys)
            chars = sum(len(norm(refs[k])) for k in keys)
            empty = sum(1 for k in keys if not norm(hyps.get(k, "")))
            rtf = r["clips"]["seconds"] / r["clips"]["audio_seconds"]
            print(f"  clips, one at a time:  CER {100 * errors / chars:.2f}%  RTF {rtf:.3f}  empty {empty}/{len(keys)}")
        runs = r.get("long", {}).get("runs", [])
        for i, run in enumerate(runs, 1):
            cer = 100 * distance(joined, norm(run["text"])) / len(joined)
            rtf = run["seconds"] / r["long"]["audio_seconds"]
            print(f"  long file, run {i}:     CER {cer:.2f}%  RTF {rtf:.3f}  lines {run['lines']}")
        for (i, x), (j, y) in itertools.combinations(enumerate(runs, 1), 2):
            nx, ny = norm(x["text"]), norm(y["text"])
            print(f"  run {i} vs run {j}:        differ by {100 * distance(nx, ny) / max(len(nx), 1):.2f}% of characters")


if __name__ == "__main__":
    main()
