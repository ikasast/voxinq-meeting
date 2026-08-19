"""Backend selection, which is the part that decides what a machine actually runs.

Run with: python -m pytest stt-service/test_backends.py   (or plain `python test_backends.py`)

The inference itself is not tested here -- that needs models and hardware. What is tested is
the promise that a CUDA host keeps behaving exactly as it did before backends existed.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import backends  # noqa: E402


class _Chooser:
    """Pin down what is installed and whether CUDA is present, so the test is about the rules."""

    def __init__(self, monkey_cuda: bool, installed: set[str]) -> None:
        self.cuda = monkey_cuda
        self.installed = installed
        self._orig_cuda = backends.cuda_available
        self._orig_import = backends._importable

    def __enter__(self):
        backends.cuda_available = lambda: self.cuda
        backends._importable = lambda m: m in self.installed
        return self

    def __exit__(self, *_exc) -> None:
        backends.cuda_available = self._orig_cuda
        backends._importable = self._orig_import


BOTH = {"faster_whisper", "pywhispercpp"}


def test_cuda_host_is_unchanged() -> None:
    # The promise of this change: a CUDA machine keeps faster-whisper and its CUDA compute type.
    with _Chooser(True, BOTH):
        b = backends.choose_backend(None, "cuda", None)
    assert b.name == "faster-whisper"
    assert b.device == "cuda"
    assert b.compute == "int8_float16"


def test_without_cuda_it_picks_whisper_cpp() -> None:
    with _Chooser(False, BOTH):
        b = backends.choose_backend(None, "cuda", None)  # asked for cuda, hardware says no
    assert b.name == "whisper.cpp"
    assert b.device == "cpu"


def test_cpu_faster_whisper_does_not_get_a_cuda_compute_type() -> None:
    # int8_float16 does not merely run slowly on CPU, it fails to load.
    with _Chooser(False, {"faster_whisper"}):
        b = backends.choose_backend("faster-whisper", "cpu", None)
    assert b.compute == "int8"


def test_an_explicit_choice_wins() -> None:
    with _Chooser(True, BOTH):
        assert backends.choose_backend("whispercpp", "cuda", None).name == "whisper.cpp"
        assert backends.choose_backend("faster-whisper", "cpu", None).name == "faster-whisper"


def test_an_uninstalled_backend_falls_back_rather_than_failing_to_boot() -> None:
    # A service that will not start is worse than one running on the other engine.
    with _Chooser(False, {"faster_whisper"}):
        assert backends.choose_backend("whispercpp", "cpu", None).name == "faster-whisper"
    with _Chooser(True, {"pywhispercpp"}):
        assert backends.choose_backend("faster-whisper", "cuda", None).name == "whisper.cpp"


def test_explicit_compute_is_respected() -> None:
    with _Chooser(True, BOTH):
        assert backends.choose_backend(None, "cuda", "float16").compute == "float16"


def test_segment_defaults_keep_the_segment() -> None:
    # A backend that reports no confidence must not have its output discarded by the filter,
    # which drops only when no_speech_prob is high AND avg_logprob is low.
    s = backends.Segment(text="hello")
    assert not (s.no_speech_prob >= 0.6 and s.avg_logprob <= -1.0)


def test_ggml_alias_maps_the_japanese_model() -> None:
    # The CTranslate2 repo name has no ggml build under the same id.
    assert (
        backends.GGML_ALIASES["kotoba-tech/kotoba-whisper-v2.0-faster"]
        == "kotoba-tech/kotoba-whisper-v2.0-ggml"
    )


if __name__ == "__main__":
    failed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"  ok   {name}")
            except AssertionError as e:
                failed += 1
                print(f"  FAIL {name}: {e}")
    print("all passed" if not failed else f"{failed} failed")
    sys.exit(1 if failed else 0)
