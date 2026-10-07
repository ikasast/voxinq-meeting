"""The files that make up a recording, and the sweep that deletes them after the retention period.

A recording is more than its WAV: utterance boundaries, and what speaker separation left beside
it. The sweep used to delete four of those by name, and every file added later — the request a
run answered, its fingerprint, the pieces, which embedding model was used — stayed on disk after
the audio was gone. Everything is listed once here, and both the sweep and DELETE go by the list.

Standard library only, so it can be tested anywhere; server.py wires it to the hourly loop.
"""

from __future__ import annotations

import re
from pathlib import Path

_ID = re.compile(r"[A-Za-z0-9_-]{1,64}")


def recording_files(folder: Path, mid: str) -> dict[str, Path]:
    """Every file kept for meeting `mid`'s recording, by role."""
    return {
        "wav": folder / f"{mid}.wav",
        "seg": folder / f"{mid}.segments.json",
        "spk": folder / f"{mid}.speakers.json",
        # The spans the last run was asked about, and a fingerprint of them: a cached
        # answer belongs to the utterances it was computed for, not to a position.
        "req": folder / f"{mid}.request.json",
        "key": folder / f"{mid}.speakers.key",
        "pcs": folder / f"{mid}.pieces.json",
        "emb": folder / f"{mid}.embeddings.json",
        # Which embedding model produced "emb": it says what space those vectors are in.
        "model": folder / f"{mid}.embedding-model",
        "keep": folder / f"{mid}.keep",
    }


def sweep(folder: Path, retention_days: float, now: float) -> tuple[list[str], int]:
    """Delete what the retention period has run out on.

    An unprotected recording whose WAV is older than the period goes with every file beside it.
    So do files of a recording whose WAV is already gone and that are older than the period —
    what earlier sweeps left. Returns the meetings whose recording went, and how many such
    leftover files were removed. A period of zero or less turns the sweep off.
    """
    if retention_days <= 0:
        return [], 0
    cutoff = now - retention_days * 86400
    gone: list[str] = []
    for wav in folder.glob("*.wav"):
        mid = wav.stem
        files = recording_files(folder, mid)
        try:
            if files["keep"].exists() or wav.stat().st_mtime >= cutoff:
                continue
            for f in files.values():
                f.unlink(missing_ok=True)
            gone.append(mid)
        except OSError:
            pass

    stray = 0
    for f in folder.iterdir():
        mid = f.name.split(".", 1)[0]
        # Only a recording's own files, and only once its WAV is gone: anything else in the
        # folder is not this sweep's to judge.
        if not _ID.fullmatch(mid) or (folder / f"{mid}.wav").exists():
            continue
        if f not in recording_files(folder, mid).values():
            continue
        try:
            if f.stat().st_mtime < cutoff:
                f.unlink()
                stray += 1
        except OSError:
            pass
    return gone, stray
