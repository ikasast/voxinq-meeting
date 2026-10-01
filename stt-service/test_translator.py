"""Translation, without the model: which languages are offered, and the cleanup of its output.

Run with: python -m pytest stt-service/test_translator.py   (or plain `python test_translator.py`)

The model itself is ~1.2GB and stays out of CI. What is checked is the code around it, which
needs nothing but the standard library: translator.py imports its dependencies only when the
model is first loaded.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import translator  # noqa: E402


def test_default_model_is_one_that_may_be_used_commercially():
    # NLLB-200 (CC-BY-NC) was the default until it had to be usable in a paid setting.
    if "STT_TRANSLATE_MODEL" in os.environ:
        return
    assert translator.TRANSLATE_MODEL == "jncraton/m2m100_1.2B-ct2-int8"


def test_languages_are_whisper_codes_and_japanese_is_not_one():
    assert {"en", "zh", "ko"} <= translator.SOURCE_LANGUAGES
    assert "ja" not in translator.SOURCE_LANGUAGES
    assert all(len(code) == 2 for code in translator.SOURCE_LANGUAGES)


def test_japanese_and_unknown_languages_are_left_alone_without_loading_anything():
    t = translator._Translator()
    assert t.translate("こんにちは", "ja") is None
    assert t.translate("Hej", "sv") is None
    assert t.translate("   ", "en") is None
    assert t.state["loaded"] is False


def test_a_copied_source_in_front_is_dropped():
    source = "OK, so action items: Ken updates the slides, and Mia checks the contract terms."
    output = source + " ケンはスライドを更新し、ミアは契約条件をチェックします。"
    assert translator.drop_echo(source, output) == "ケンはスライドを更新し、ミアは契約条件をチェックします。"


def test_a_near_copy_is_dropped_too():
    # The smaller model changes a word on the way ("updates" -> "update").
    source = "OK, so action items: Ken updates the slides, and Mia checks the contract terms."
    output = "OK, so action items: Ken update the slides, and Mia checks the contract terms. ケンはスライドを更新します。"
    assert translator.drop_echo(source, output) == "ケンはスライドを更新します。"


def test_a_name_in_front_of_the_japanese_stays():
    source = "How much does Google Cloud Platform cost per month for us?"
    output = "Google Cloud Platform の月額料金はいくらですか?"
    assert translator.drop_echo(source, output) == output
    assert translator.drop_echo("Ask the API team.", "API チームに聞いてください。") == "API チームに聞いてください。"


def test_ordinary_translations_are_untouched():
    assert translator.drop_echo("See you on Friday.", "金曜日に会いましょう。") == "金曜日に会いましょう。"
    assert translator.drop_echo("Hello", "") == ""


if __name__ == "__main__":
    failed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"  ok   {name}")
            except Exception as e:  # noqa: BLE001
                failed += 1
                print(f"  FAIL {name}: {type(e).__name__}: {e}")
    print("all passed" if not failed else f"{failed} failed")
    sys.exit(1 if failed else 0)
