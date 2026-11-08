"""Speaker separation on public meetings: is each line given to the person who said it?

    python bench/diarize.py --backend pyannote|sherpa [--data bench/data] [--out ...]

That is the job diarization does in Voxinq — not drawing speaker turns, but naming the speaker of
each line the transcript already has. So the lines here come from the reference (AMI's own
speaker segments, at least half a second long), which keeps recognition out of the score, and
each meeting is run twice: told how many people spoke, as Voxinq is when participants are ticked
as expected to speak, and not told.

A line counts as right when its label, under the best one-to-one matching of labels to people,
is the person the reference says spoke it. Reported by count and by length, and split into
clear lines and lines at least half spoken over by somebody else — included, because they are
where it goes wrong.

Runs diarization/diarize.py with the diarization environment's Python, exactly as the
transcription service does, one subprocess per run.
"""

from __future__ import annotations

import argparse
import itertools
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIA = ROOT / "diarization"
PYTHON = DIA / (".venv/Scripts/python.exe" if sys.platform == "win32" else ".venv/bin/python")
MIN_LINE_S = 0.5


def reference(rttm: Path) -> list[tuple[float, float, str]]:
    lines = []
    for row in rttm.read_text(encoding="utf-8").splitlines():
        f = row.split()
        if len(f) >= 8 and f[0] == "SPEAKER":
            start, dur = float(f[3]), float(f[4])
            if dur >= MIN_LINE_S:
                lines.append((start, start + dur, f[7]))
    return sorted(lines)


def best_matching(pairs: list[tuple[str, str, float]]) -> dict[str, str]:
    """Hypothesis label -> reference speaker, one to one, maximising the weight that agrees."""
    hyp = sorted({h for h, _, _ in pairs})
    ref = sorted({r for _, r, _ in pairs})
    weight = {(h, r): 0.0 for h in hyp for r in ref}
    for h, r, w in pairs:
        weight[(h, r)] += w
    try:
        from scipy.optimize import linear_sum_assignment

        import numpy as np

        m = np.array([[weight[(h, r)] for r in ref] for h in hyp])
        rows, cols = linear_sum_assignment(-m)
        return {hyp[i]: ref[j] for i, j in zip(rows, cols)}
    except ImportError:
        best, best_score = {}, -1.0
        small, large = (hyp, ref) if len(hyp) <= len(ref) else (ref, hyp)
        for perm in itertools.permutations(large, len(small)):
            pairing = dict(zip(small, perm)) if small is hyp else {p: s for s, p in zip(small, perm)}
            score = sum(weight[(h, r)] for h, r in pairing.items())
            if score > best_score:
                best, best_score = pairing, score
        return best


def run(wav: Path, lines: list[tuple[float, float, str]], backend: str, speakers: int | None) -> dict:
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
        json.dump([{"start": s, "end": e} for s, e, _ in lines], f)
        segments = f.name
    env = dict(os.environ, DIA_BACKEND=backend, PYTHONIOENCODING="utf-8")
    env.pop("DIA_NUM_SPEAKERS", None)
    if speakers:
        env["DIA_NUM_SPEAKERS"] = str(speakers)
    t0 = time.perf_counter()
    proc = subprocess.run(
        [str(PYTHON), str(DIA / "diarize.py"), str(wav), segments],
        capture_output=True, text=True, encoding="utf-8", env=env,
    )
    took = time.perf_counter() - t0
    os.unlink(segments)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr[-2000:])
    labels = json.loads([ln for ln in proc.stdout.splitlines() if ln.strip()][-1])["speakers"]

    pairs = [(h or "none", r, e - s) for h, (s, e, r) in zip(labels, lines)]
    mapping = best_matching(pairs)
    right = [mapping.get(h) == r for h, r, _ in pairs]
    right_s = sum(w for (_, _, w), ok in zip(pairs, right) if ok)
    total_s = sum(w for _, _, w in pairs)
    over = overlapped(lines)
    clear = [ok for ok, o in zip(right, over) if not o]
    spoken_over = [ok for ok, o in zip(right, over) if o]
    return {
        "found": len({h for h, _, _ in pairs if h != "none"}),
        "lines": len(pairs),
        "right_by_count": round(100 * sum(right) / len(pairs), 1),
        "right_by_length": round(100 * right_s / total_s, 1),
        "spoken_over_share": round(100 * len(spoken_over) / len(pairs), 1),
        "right_clear": round(100 * sum(clear) / max(len(clear), 1), 1),
        "right_spoken_over": round(100 * sum(spoken_over) / max(len(spoken_over), 1), 1),
        "seconds": round(took, 1),
        "labels": labels,
    }


def overlapped(lines: list[tuple[float, float, str]]) -> list[bool]:
    """Whether at least half of each line is also somebody else speaking.

    That is the backchannel inside another person's sentence — the case a diarizer that gives
    each moment one speaker cannot get right, because the line lies inside a turn it has already
    given to someone else.
    """
    out = []
    for s, e, r in lines:
        covered = []
        for s2, e2, r2 in lines:
            if r2 != r and s2 < e and e2 > s:
                covered.append((max(s, s2), min(e, e2)))
        covered.sort()
        total, cur_s, cur_e = 0.0, None, None
        for a, b in covered:
            if cur_e is None or a > cur_e:
                if cur_e is not None:
                    total += cur_e - cur_s
                cur_s, cur_e = a, b
            else:
                cur_e = max(cur_e, b)
        if cur_e is not None:
            total += cur_e - cur_s
        out.append(total >= 0.5 * (e - s))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--backend", required=True, choices=["pyannote", "sherpa"])
    ap.add_argument("--data", type=Path, default=ROOT / "bench" / "data")
    ap.add_argument("--out", type=Path)
    a = ap.parse_args()
    out = a.out or ROOT / "bench" / "results" / f"dia-{a.backend}.json"
    out.parent.mkdir(parents=True, exist_ok=True)

    results = {}
    for rttm in sorted((a.data / "dia").glob("*.rttm")):
        meeting = rttm.stem
        lines = reference(rttm)
        people = len({r for _, _, r in lines})
        wav = a.data / "dia" / f"{meeting}.wav"
        results[meeting] = {"people": people}
        for told in (True, False):
            r = run(wav, lines, a.backend, people if told else None)
            results[meeting]["told" if told else "not_told"] = r
            print(
                f"{meeting} ({people} people, {'told' if told else 'not told'}): found {r['found']}, "
                f"{r['right_by_count']}% of {r['lines']} lines right ({r['right_by_length']}% by length; "
                f"{r['right_clear']}% of clear lines, {r['right_spoken_over']}% of the "
                f"{r['spoken_over_share']}% spoken over), {r['seconds']} s",
                flush=True,
            )
    out.write_text(json.dumps({"backend": a.backend, "meetings": results}, indent=1), encoding="utf-8")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
