"""Who may ask the service for anything: the web server's signature and a meeting's token.

Run with: python -m pytest stt-service/test_auth.py   (or plain `python test_auth.py`)

The fixed tokens below are the same ones tests/stt-auth.test.ts produces from lib/stt/auth.ts:
if either side changes how it signs, both tests fail rather than recording quietly stopping.
"""

from __future__ import annotations

import hashlib
import hmac
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import auth  # noqa: E402

KEY = hmac.new(b"test-secret", b"voxinq-stt-v1", hashlib.sha256).digest()
EXP = 2000000000
NOW = EXP - 60

SERVER = f"s.{EXP}.Zq026w3Ywbtr1WUCiq_A4-hBtzkUYH-wyGhiKUFMhhU"
MEETING = f"m.cm0meeting1.{EXP}.Nc5ImLVkC8a8nHY2Iq1WmuNT9jh-EKR-mQ2m5Fojmyk"
NO_MEETING = f"m.-.{EXP}.h43xZpXJbWueRQSbncSyrn4PGh4BNbSGiX4niI6YUSI"


def test_the_web_servers_signature_is_accepted():
    assert auth.server_request_ok(SERVER, key=KEY, now=NOW)


def test_an_expired_or_altered_signature_is_not():
    assert not auth.server_request_ok(SERVER, key=KEY, now=EXP + 1)
    assert not auth.server_request_ok(SERVER.replace(str(EXP), str(EXP + 1)), key=KEY, now=NOW)
    assert not auth.server_request_ok(SERVER, key=hmac.new(b"other", b"voxinq-stt-v1", hashlib.sha256).digest(), now=NOW)
    assert not auth.server_request_ok(None, key=KEY, now=NOW)
    assert not auth.server_request_ok("", key=KEY, now=NOW)
    # A meeting's token is not a server signature, though both are signed with the same key.
    assert not auth.server_request_ok(MEETING, key=KEY, now=NOW)


def test_a_meetings_token_opens_that_meeting_only():
    assert auth.meeting_token_ok(MEETING, "cm0meeting1", key=KEY, now=NOW)
    assert not auth.meeting_token_ok(MEETING, "cm0meeting2", key=KEY, now=NOW)
    assert not auth.meeting_token_ok(MEETING, None, key=KEY, now=NOW)
    assert not auth.meeting_token_ok(MEETING, "cm0meeting1", key=KEY, now=EXP + 1)


def test_a_recording_with_no_meeting_has_a_token_of_its_own():
    assert auth.meeting_token_ok(NO_MEETING, None, key=KEY, now=NOW)
    assert not auth.meeting_token_ok(NO_MEETING, "cm0meeting1", key=KEY, now=NOW)


def test_anything_else_is_not_a_token():
    for token in (None, 12, "", "m.cm0meeting1", SERVER, MEETING + ".x"):
        assert not auth.meeting_token_ok(token, "cm0meeting1", key=KEY, now=NOW)


def test_without_a_secret_nothing_is_checked():
    # The module reads STT_SECRET once; this run has none unless the caller set one.
    assert auth.enabled() == bool(auth._SECRET)


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
