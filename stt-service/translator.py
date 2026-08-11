"""Translate non-Japanese utterances into Japanese, on the CPU.

Runs alongside recording: the GPU is fully occupied by Whisper during a meeting (8GB VRAM
only fits one model at a time), so translation has to stay off it. NLLB-200-distilled-600M
in CTranslate2 int8 form is small and fast enough on CPU for a sentence at a time.

Deliberately built on the packages faster-whisper already pulls in (`ctranslate2`,
`tokenizers`, `huggingface_hub`) rather than `transformers`, so enabling translation adds no
new dependency — only the model download (~600MB, on first use, cached afterwards).

The model is CC-BY-NC-4.0, so translation is opt-in (Settings → Transcription) and nothing
is downloaded until it is switched on.
"""

from __future__ import annotations

import os
import threading

# Model repo (CTranslate2 int8 conversion of facebook/nllb-200-distilled-600M).
TRANSLATE_MODEL = os.environ.get(
    "STT_TRANSLATE_MODEL", "JustFrederik/nllb-200-distilled-600M-ct2-int8"
)
# Threads for one translation. Kept small: this shares the machine with the GPU pipeline.
TRANSLATE_THREADS = int(os.environ.get("STT_TRANSLATE_THREADS", "4"))
# Longer inputs are truncated — a single utterance is far below this.
MAX_INPUT_TOKENS = 384

TARGET_LANG = "jpn_Jpan"

# Whisper language codes -> NLLB (FLORES-200) codes. Only languages worth offering here;
# anything else is left untranslated rather than guessed at.
WHISPER_TO_NLLB = {
    "en": "eng_Latn",
    "zh": "zho_Hans",
    "ko": "kor_Hang",
    "es": "spa_Latn",
    "fr": "fra_Latn",
    "de": "deu_Latn",
    "pt": "por_Latn",
    "it": "ita_Latn",
    "ru": "rus_Cyrl",
    "vi": "vie_Latn",
    "th": "tha_Thai",
    "id": "ind_Latn",
    "ms": "zsm_Latn",
    "hi": "hin_Deva",
    "ar": "arb_Arab",
    "tl": "tgl_Latn",
    "nl": "nld_Latn",
    "pl": "pol_Latn",
    "tr": "tur_Latn",
    "uk": "ukr_Cyrl",
}


class _Translator:
    """Lazy singleton. Loading is deferred until the first translation is actually needed."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._translator = None
        self._tokenizer = None
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
            from huggingface_hub import snapshot_download
            from tokenizers import Tokenizer

            path = snapshot_download(TRANSLATE_MODEL)
            self._translator = ctranslate2.Translator(
                path, device="cpu", compute_type="int8", inter_threads=1,
                intra_threads=TRANSLATE_THREADS,
            )
            self._tokenizer = Tokenizer.from_file(os.path.join(path, "tokenizer.json"))
            self._loaded = True
            print(f"[translate] loaded {TRANSLATE_MODEL}")
            return True
        except Exception as e:  # noqa: BLE001
            self._error = f"{type(e).__name__}: {e}"
            print(f"[translate] unavailable: {self._error}")
            return False

    def translate(self, text: str, whisper_lang: str | None) -> str | None:
        """Japanese translation of `text`, or None when it should be left alone.

        Returns None for Japanese (nothing to do), for languages outside the table, and for
        any failure — a missing translation is always preferable to blocking transcription.
        """
        src = WHISPER_TO_NLLB.get((whisper_lang or "").lower())
        if not src or not text.strip():
            return None
        with self._lock:
            if not self._load_locked():
                return None
            try:
                # NLLB expects the source sentence framed as [src_lang] … </s>, and the
                # target language forced as the first generated token.
                encoded = self._tokenizer.encode(text, add_special_tokens=False)
                tokens = [src, *encoded.tokens[:MAX_INPUT_TOKENS], "</s>"]
                results = self._translator.translate_batch(
                    [tokens],
                    target_prefix=[[TARGET_LANG]],
                    beam_size=2,
                    max_decoding_length=512,
                )
                hypothesis = results[0].hypotheses[0]
                if hypothesis and hypothesis[0] == TARGET_LANG:
                    hypothesis = hypothesis[1:]  # drop the forced language token
                ids = [self._tokenizer.token_to_id(t) for t in hypothesis]
                out = self._tokenizer.decode([i for i in ids if i is not None])
                return out.strip() or None
            except Exception as e:  # noqa: BLE001
                print(f"[translate] failed: {type(e).__name__}: {e}")
                return None


_INSTANCE = _Translator()


def translate_to_ja(text: str, whisper_lang: str | None) -> str | None:
    return _INSTANCE.translate(text, whisper_lang)


def translator_state() -> dict:
    return _INSTANCE.state
