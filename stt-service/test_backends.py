"""Backend selection, which is the part that decides what a machine actually runs.

Run with: python -m pytest stt-service/test_backends.py   (or plain `python test_backends.py`)

Mostly this is about the rules: which backend a machine picks, and the promise that a CUDA
host keeps behaving exactly as it did before backends existed. faster-whisper inference needs
a GPU and several gigabytes, so it stays untested here -- but whisper.cpp runs on any CPU with
a 75 MB model, and one real decode is included at the bottom, because a bug hid in the gap
between "the rules are right" and "the call works".
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


def test_ggml_alias_names_a_repo_and_a_file() -> None:
    # Not just a repo id: pywhispercpp resolves its own built-in names or a file path, and
    # nothing else. An alias that stops at the repo silently loads no model at all.
    repo, filename = backends.GGML_ALIASES["kotoba-tech/kotoba-whisper-v2.0-faster"]
    assert repo == "kotoba-tech/kotoba-whisper-v2.0-ggml"
    assert filename.endswith(".bin")


def test_a_builtin_ggml_name_is_passed_through_untouched() -> None:
    # Downloading is only for the aliased models; everything else pywhispercpp fetches itself.
    assert backends.resolve_ggml("large-v3-turbo-q5_0") == "large-v3-turbo-q5_0"


class _Platform:
    """Pretend to be a given OS/CPU, so the Mac branch is testable from anywhere."""

    def __init__(self, plat: str, machine: str) -> None:
        self.plat, self.machine = plat, machine
        self._orig = (backends.sys.platform, backends.platform.machine)

    def __enter__(self):
        backends.sys.platform = self.plat
        backends.platform.machine = lambda: self.machine
        return self

    def __exit__(self, *_exc) -> None:
        backends.sys.platform, backends.platform.machine = self._orig


def test_a_cuda_host_transcribes_live() -> None:
    with _Chooser(True, BOTH):
        b = backends.choose_backend(None, "cuda", None)
    assert backends.live_transcription_available(b) is True


def test_apple_silicon_transcribes_live() -> None:
    # Its wheel is the one that bundles Metal.
    with _Chooser(False, BOTH), _Platform("darwin", "arm64"):
        b = backends.choose_backend(None, "cuda", None)
        assert b.name == "whisper.cpp"
        assert backends.live_transcription_available(b) is True


def test_a_plain_cpu_host_defers() -> None:
    # The measured case: 2.8x realtime, so live recognition would fall behind and stay behind.
    with _Chooser(False, BOTH), _Platform("linux", "x86_64"):
        b = backends.choose_backend(None, "cuda", None)
        assert backends.live_transcription_available(b) is False


def test_an_intel_mac_defers() -> None:
    # darwin alone is not the condition -- Metal here is a build for arm64 wheels.
    with _Chooser(False, BOTH), _Platform("darwin", "x86_64"):
        b = backends.choose_backend(None, "cuda", None)
        assert backends.live_transcription_available(b) is False


def test_faster_whisper_on_cpu_defers() -> None:
    # Forced onto faster-whisper without a GPU: still slower than speech.
    with _Chooser(False, {"faster_whisper"}):
        b = backends.choose_backend("faster-whisper", "cpu", None)
    assert backends.live_transcription_available(b) is False


def test_whisper_cpp_actually_decodes_at_the_beam_size_finals_use() -> None:
    """Run a real decode through the whisper.cpp backend, or skip.

    This is here because everything above tests the rules and nothing tested the path, and a
    bug lived in that gap: the beam_search parameter was sent as {"beam_size": n} without
    "patience", which the binding rejects with KeyError instead of defaulting. Partials decode
    at beam_size=1 and never touch it, so live text kept appearing while *every finalized
    utterance* failed -- on exactly the machines that have no CUDA and no other backend.

    A second of silence is enough: the assertion is that the call returns, not what it heard.
    """
    try:
        import numpy as np
        from pywhispercpp.model import Model  # noqa: F401
    except ImportError as e:
        print(f"  skip whisper.cpp decode ({e})")
        return

    backend = backends.WhisperCppBackend("cpu")
    try:
        model = backend.load("tiny")
    except Exception as e:  # noqa: BLE001  no network in some environments
        print(f"  skip whisper.cpp decode (model unavailable: {e})")
        return

    for beam_size in (1, 5):
        segments, _lang = backend.transcribe(
            model,
            np.zeros(16000, dtype=np.float32),
            language="ja",
            initial_prompt=None,
            beam_size=beam_size,
            vad_min_silence_ms=500,
            no_speech_threshold=0.6,
        )
        assert isinstance(segments, list), f"beam_size={beam_size} did not return segments"
    backend.unload(model)


if __name__ == "__main__":
    failed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"  ok   {name}")
            except Exception as e:  # noqa: BLE001
                # Not just AssertionError: a test that reaches real code can fail by raising,
                # and letting that escape would end the run at the first one and hide the rest.
                failed += 1
                print(f"  FAIL {name}: {type(e).__name__}: {e}")
    print("all passed" if not failed else f"{failed} failed")
    sys.exit(1 if failed else 0)
