"""Who may ask this service for anything.

The service has no accounts of its own: the web app decides who owns a meeting, and this side
only checks that the web app said yes. Both are given the same secret (STT_SECRET) and sign with
a key derived from it.

  - The web server signs every HTTP request it makes: header ``x-voxinq-stt: s.<exp>.<sig>``.
  - A recording's WebSocket carries a token the web app issued for one meeting, to the person who
    owns it: ``m.<meetingId>.<exp>.<sig>`` in the ``start`` message. A meeting id is a cuid, so it
    holds no dots; a recording with no meeting uses ``-``.

Without STT_SECRET nothing is checked, which is how it was before this existed. A compose file
fetched before the secret was added starts that way, and the web app says so to administrators.

The other half is lib/stt/auth.ts. Both are tested against the same fixed token.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import time

_SECRET = os.environ.get("STT_SECRET", "")
_KEY = hmac.new(_SECRET.encode(), b"voxinq-stt-v1", hashlib.sha256).digest() if _SECRET else b""

HEADER = "x-voxinq-stt"


def enabled() -> bool:
    return bool(_KEY)


def _sign(message: str, key: bytes) -> str:
    digest = hmac.new(key, message.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def _valid(message: str, exp: str, sig: str, key: bytes, now: float) -> bool:
    try:
        if int(exp) < now:
            return False
    except ValueError:
        return False
    return hmac.compare_digest(_sign(message, key), sig)


def server_request_ok(header: str | None, *, key: bytes | None = None, now: float | None = None) -> bool:
    """Whether a request was signed by the web server."""
    key = _KEY if key is None else key
    parts = (header or "").split(".")
    if len(parts) != 3 or parts[0] != "s":
        return False
    return _valid(f"s.{parts[1]}", parts[1], parts[2], key, time.time() if now is None else now)


def meeting_token_ok(
    token: object, meeting_id: str | None, *, key: bytes | None = None, now: float | None = None
) -> bool:
    """Whether a recording may write into this meeting (``None``: a recording with no meeting)."""
    key = _KEY if key is None else key
    if not isinstance(token, str):
        return False
    parts = token.split(".")
    if len(parts) != 4 or parts[0] != "m":
        return False
    if parts[1] != (meeting_id or "-"):
        return False
    return _valid(f"m.{parts[1]}.{parts[2]}", parts[2], parts[3], key, time.time() if now is None else now)
