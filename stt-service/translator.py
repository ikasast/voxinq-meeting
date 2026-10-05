"""Translate non-Japanese utterances into Japanese, on the CPU.

Runs alongside recording: the GPU is fully occupied by Whisper during a meeting (8GB VRAM
only fits one model at a time), so translation has to stay off it. M2M100 1.2B in
CTranslate2 int8 form translates a sentence in well under a second on a few CPU threads.

The model is MIT-licensed (facebook/m2m100_1.2B, converted by jncraton), so translation can be
used commercially. It replaced NLLB-200 distilled, which is CC-BY-NC — non-commercial only —
and was no better on meeting speech. `STT_TRANSLATE_MODEL` takes any CTranslate2 conversion of
M2M100 that ships its SentencePiece model; jncraton/m2m100_418M-ct2-int8 is the lighter one
(~0.5GB, about twice as fast, noticeably rougher).

Translation is still opt-in (Settings → Transcription): nothing is downloaded (~1.2GB, cached
afterwards) until it is switched on.
"""

from __future__ import annotations

import os
import re
import threading

TRANSLATE_MODEL = os.environ.get("STT_TRANSLATE_MODEL", "jncraton/m2m100_1.2B-ct2-int8")
# Threads for one translation. Kept small: this shares the machine with the GPU pipeline.
TRANSLATE_THREADS = int(os.environ.get("STT_TRANSLATE_THREADS", "4"))
# Longer inputs are truncated — a single utterance is far below this.
MAX_INPUT_TOKENS = 384

# Languages offered, as Whisper reports them. M2M100 names them the same way ("en" is
# "__en__"), so no mapping is needed. Anything else is left untranslated rather than guessed at.
SOURCE_LANGUAGES = frozenset(
    "en zh ko es fr de pt it ru vi th id ms hi ar tl nl pl tr uk".split()
)

_JAPANESE = r"぀-ヿ㐀-鿿＀-￯"
_LEADING_FOREIGN = re.compile(rf"^([^{_JAPANESE}]+)(?=[{_JAPANESE}])")


def drop_echo(source: str, output: str) -> str:
    """The translation without a copy of the source in front of it.

    M2M100 sometimes repeats the sentence before translating it — "OK, so action items: Ken
    updates the slides. ケンはスライドを更新し…" — when the source opens with a filler and a
    colon. The copy is recognised as a run of non-Japanese text before the first Japanese
    character that is mostly the source's own words and most of the source. A name or a
    product in front of the Japanese ("Google Cloud の料金は…") is neither, and stays.
    """
    found = _LEADING_FOREIGN.match(output)
    if not found:
        return output
    head = re.findall(r"\w+", found.group(1).lower())
    said = re.findall(r"\w+", source.lower())
    if len(head) < 3 or not said:
        return output
    from_source = sum(word in set(said) for word in head) / len(head)
    if from_source >= 0.8 and len(head) >= 0.6 * len(said):
        return output[found.end(1):].strip()
    return output


class _Translator:
    """Lazy singleton. Loading is deferred until the first translation is actually needed."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._translator = None
        self._pieces = None
        self._error: str | None = None
        self._loaded = False

    @property
    def state(self) -> dict:
        return {
            "model": TRANSLATE_MODEL,
            "loaded": self._loaded,
            "error": self._error,
        }

    def _load_locked(self) -> bool:
        if self._loaded:
            return True
        if self._error:
            return False  # don't retry a broken setup on every utterance
        try:
            import ctranslate2
            import sentencepiece
            from huggingface_hub import snapshot_download

            path = snapshot_download(TRANSLATE_MODEL)
            self._translator = ctranslate2.Translator(
                path, device="cpu", compute_type="int8", inter_threads=1,
                intra_threads=TRANSLATE_THREADS,
            )
            self._pieces = sentencepiece.SentencePieceProcessor(
                model_file=os.path.join(path, "sentencepiece.bpe.model"),
            )
            self._loaded = True
            print(f"[translate] loaded {TRANSLATE_MODEL}")
            return True
        except Exception as e:  # noqa: BLE001
            self._error = f"{type(e).__name__}: {e}"
            print(f"[translate] unavailable: {self._error}")
            return False

    def preload(self) -> bool:
        """Load the model now, so the first utterance of a meeting is not the trigger.

        The first load downloads ~1.2GB and builds the CTranslate2 session, which takes
        longer than a short meeting has left once it starts. Translations produced after the
        WebSocket closes are simply lost, so the load has to happen before recording.
        """
        with self._lock:
            return self._load_locked()

    def translate(self, text: str, whisper_lang: str | None) -> str | None:
        """Japanese translation of `text`, or None when it should be left alone.

        Returns None for Japanese (nothing to do), for languages outside the table, and for
        any failure — a missing translation is always preferable to blocking transcription.
        """
        lang = (whisper_lang or "").lower()
        if lang not in SOURCE_LANGUAGES or not text.strip():
            return None
        with self._lock:
            if not self._load_locked():
                return None
            try:
                # M2M100 reads the sentence framed as __src__ … </s>, and is made to answer in
                # Japanese by forcing __ja__ as the first token it writes.
                pieces = self._pieces.encode(text, out_type=str)[:MAX_INPUT_TOKENS]
                results = self._translator.translate_batch(
                    [[f"__{lang}__", *pieces, "</s>"]],
                    target_prefix=[["__ja__"]],
                    beam_size=4,
                    max_decoding_length=512,
                )
                written = results[0].hypotheses[0][1:]  # without the forced __ja__
                out = drop_echo(text, self._pieces.decode(written).strip())
                return out or None
            except Exception as e:  # noqa: BLE001
                print(f"[translate] failed: {type(e).__name__}: {e}")
                return None


_INSTANCE = _Translator()


def translate_to_ja(text: str, whisper_lang: str | None) -> str | None:
    return _INSTANCE.translate(text, whisper_lang)


def preload_translator() -> bool:
    return _INSTANCE.preload()


def translator_state() -> dict:
    return _INSTANCE.state
