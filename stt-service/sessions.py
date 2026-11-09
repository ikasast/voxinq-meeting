"""Which recording sessions of a meeting are still open, and where the next one starts.

A session's audio reaches the recording only when it is saved, as it ends (until then it is in
a part file beside the recording: recording_store.py). A new session takes
its clock from the length of the recording, so one that starts while the last one is still on
its way out would count from too early: its lines land on the wrong audio, for good, because
the web app stores those offsets.

That happens whenever a session outlives its client: the end of a meeting waits for the last
line and its translation, and a socket that died without a word stays open until the ping notices.

So a new session settles what came before it. One that is ending is waited for. One that has gone
quiet is closed, which saves it. One still receiving audio is another device recording the same
meeting: it is left alone, because closing it would only make it reconnect and close this one
in turn, and its audio so far is counted instead. Those two recordings overlap in time and the
file holds them one after the other, so that case stays approximate.

Standard library only, so it can be tested anywhere; server.py wires it to the WebSocket.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Callable
from dataclasses import dataclass, field

# How long a session has to wait on its client, with audio held, before it counts as gone. Longer
# than a drop the client recovers from by itself, and a client that does recover needs none of
# this: its audio so far is counted either way.
QUIET_S = 10.0
# The end of a meeting transcribes its last segment and gives translations up to 8 s. A new
# session is not held back for longer than that: the client buffers its audio until it is told
# to send it, and what is still unsaved by then is counted anyway.
SETTLE_S = 30.0
# How long a question about a meeting's recording waits for the sessions on their way out. Longer
# than settling: nothing is held up but the answer, and a short wait gives a wrong length that is
# stored on the meeting.
ENDED_S = 60.0


@dataclass(eq=False)
class Session:
    meeting_id: str
    task: asyncio.Task | None
    clock: Callable[[], float]
    # Samples received and not saved yet.
    held: int = 0
    # The client said it is finished. Its last line is being written; it must not be cut short.
    ending: bool = False
    # When this started waiting on its client. None while it is working on what it was sent, so
    # a slow transcription does not read as a client that went away.
    listening_since: float | None = None
    # Closed by a later session of the same meeting, not by a shutdown.
    superseded: bool = False
    gone: asyncio.Event = field(default_factory=asyncio.Event)

    def listening(self) -> None:
        self.listening_since = self.clock()

    def received(self, samples: int) -> None:
        self.held += samples
        self.listening_since = None

    def saved(self) -> None:
        """Its audio is in the recording now, so the recording's length counts it."""
        self.held = 0

    def quiet(self, limit: float = QUIET_S) -> bool:
        """Gone quiet with audio to save. With none held there is nothing to wait for."""
        since = self.listening_since
        return not self.ending and self.held > 0 and since is not None and self.clock() - since >= limit


class OpenSessions:
    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._open: dict[str, list[Session]] = {}

    def open(self, meeting_id: str, task: asyncio.Task | None) -> Session:
        session = Session(meeting_id, task, self._clock)
        session.listening()
        self._open.setdefault(meeting_id, []).append(session)
        return session

    def close(self, session: Session) -> None:
        """It has gone, saved or not."""
        session.saved()
        here = self._open.get(session.meeting_id, [])
        if session in here:
            here.remove(session)
        if not here:
            self._open.pop(session.meeting_id, None)
        session.gone.set()

    def earlier(self, session: Session) -> list[Session]:
        here = self._open.get(session.meeting_id, [])
        return here[: here.index(session)] if session in here else []

    def unsettled(self, session: Session) -> bool:
        """Whether settling has anything to do, so a client can be told about the wait."""
        return any(s.ending or s.quiet() for s in self.earlier(session))

    async def settle(self, session: Session, timeout: float = SETTLE_S) -> None:
        """Close the earlier sessions that have gone quiet, and wait for those on their way out.

        Bounded, and never raises: a session that will not finish must not stop a recording.
        """
        leaving = []
        for other in self.earlier(session):
            if other.quiet():
                other.superseded = True
                if other.task is not None:
                    other.task.cancel()
            if other.ending or other.superseded:
                leaving.append(other)
        if not leaving:
            return
        waits = [asyncio.ensure_future(other.gone.wait()) for other in leaving]
        _, pending = await asyncio.wait(waits, timeout=timeout)
        for wait in pending:
            wait.cancel()

    async def ended(self, meeting_id: str, timeout: float = ENDED_S) -> None:
        """Wait for the meeting's sessions that are ending to be saved. Bounded; never raises."""
        leaving = [s for s in self._open.get(meeting_id, []) if s.ending]
        if not leaving:
            return
        waits = [asyncio.ensure_future(s.gone.wait()) for s in leaving]
        _, pending = await asyncio.wait(waits, timeout=timeout)
        for wait in pending:
            wait.cancel()

    def start_after(self, session: Session, on_disk: int) -> int:
        """Where this session's clock starts: the recording, plus what is still on its way there."""
        return on_disk + sum(other.held for other in self.earlier(session))
