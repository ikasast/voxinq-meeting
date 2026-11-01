"""Where a recording session starts when the one before it has not finished.

Run with: python -m pytest stt-service/test_sessions.py   (or plain `python test_sessions.py`)

Standard library only: the sessions here are plain tasks that hold audio and save it to a number.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from sessions import OpenSessions, Session  # noqa: E402

MEETING = "m"


class Clock:
    def __init__(self) -> None:
        self.now = 100.0

    def __call__(self) -> float:
        return self.now


class Disk:
    """The recording: samples are appended when a session saves."""

    def __init__(self) -> None:
        self.samples = 0
        self.order: list[str] = []

    def save(self, name: str, session: Session, sessions: OpenSessions) -> None:
        self.samples += session.held
        self.order.append(name)
        session.saved()
        sessions.close(session)


async def _socket(name: str, sessions: OpenSessions, disk: Disk, box: list) -> None:
    """Stands in for ws_endpoint: waits on its client, and saves in `finally` however it ends."""
    session = sessions.open(MEETING, asyncio.current_task())
    box.append(session)
    try:
        session.received(1000)
        session.listening()
        await asyncio.Event().wait()
    except asyncio.CancelledError:
        if not session.superseded:
            raise
    finally:
        disk.save(name, session, sessions)


def _run(coroutine) -> None:
    asyncio.run(asyncio.wait_for(coroutine, timeout=5))


async def _open_socket(name: str, sessions: OpenSessions, disk: Disk) -> tuple[asyncio.Task, Session]:
    box: list[Session] = []
    task = asyncio.create_task(_socket(name, sessions, disk, box))
    await asyncio.sleep(0)
    return task, box[0]


def test_a_session_starts_at_the_recording_when_nothing_else_is_open() -> None:
    sessions = OpenSessions()

    async def go() -> None:
        session = sessions.open(MEETING, None)
        await sessions.settle(session)
        assert sessions.start_after(session, 5000) == 5000

    _run(go())


def test_a_session_that_went_quiet_is_closed_and_saved_first() -> None:
    clock = Clock()
    sessions = OpenSessions(clock)
    disk = Disk()

    async def go() -> None:
        task, first = await _open_socket("first", sessions, disk)
        clock.now += 16  # the wait on 2026-10-27 that gave the second session a clock of zero
        second = sessions.open(MEETING, None)
        assert sessions.unsettled(second)
        await sessions.settle(second)
        await task
        assert first.superseded
        assert disk.order == ["first"]
        assert sessions.start_after(second, disk.samples) == 1000

    _run(go())


def test_a_session_on_its_way_out_is_waited_for_not_cut_short() -> None:
    clock = Clock()
    sessions = OpenSessions(clock)
    disk = Disk()

    async def go() -> None:
        first = sessions.open(MEETING, None)
        first.received(1000)
        first.ending = True
        first.listening()
        clock.now += 60

        async def finish() -> None:
            await asyncio.sleep(0.01)
            disk.save("first", first, sessions)

        finishing = asyncio.create_task(finish())
        second = sessions.open(MEETING, None)
        assert sessions.unsettled(second)
        await sessions.settle(second)
        assert not first.superseded
        assert disk.order == ["first"]
        assert sessions.start_after(second, disk.samples) == 1000
        await finishing

    _run(go())


def test_a_session_that_will_not_finish_is_counted_rather_than_lost() -> None:
    sessions = OpenSessions()

    async def go() -> None:
        first = sessions.open(MEETING, None)
        first.received(1000)
        first.ending = True
        second = sessions.open(MEETING, None)
        await sessions.settle(second, timeout=0.01)
        assert sessions.start_after(second, 0) == 1000

    _run(go())


def test_a_drop_the_client_is_recovering_from_is_counted_without_waiting() -> None:
    clock = Clock()
    sessions = OpenSessions(clock)

    async def go() -> None:
        first = sessions.open(MEETING, None)
        first.received(1000)
        first.listening()
        clock.now += 2  # the reconnect beat the ping: the old socket does not know yet
        second = sessions.open(MEETING, None)
        assert not sessions.unsettled(second)
        await sessions.settle(second)
        assert not first.superseded
        assert sessions.start_after(second, 500) == 1500

    _run(go())


def test_another_device_still_sending_is_left_alone() -> None:
    clock = Clock()
    sessions = OpenSessions(clock)
    disk = Disk()

    async def go() -> None:
        task, first = await _open_socket("first", sessions, disk)
        clock.now += 60
        first.received(500)  # still sending, so never quiet for long
        second = sessions.open(MEETING, None)
        await sessions.settle(second)
        assert not first.superseded and not task.done()
        assert sessions.start_after(second, 0) == 1500
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    _run(go())


def test_a_slow_transcription_does_not_read_as_a_client_gone() -> None:
    clock = Clock()
    sessions = OpenSessions(clock)

    async def go() -> None:
        first = sessions.open(MEETING, None)
        first.received(1000)  # and now it is busy with that audio, not waiting on the client
        clock.now += 60
        second = sessions.open(MEETING, None)
        await sessions.settle(second)
        assert not first.superseded

    _run(go())


def test_a_session_with_nothing_held_is_not_worth_closing() -> None:
    clock = Clock()
    sessions = OpenSessions(clock)

    async def go() -> None:
        first = sessions.open(MEETING, None)  # still loading the model; no audio has come
        clock.now += 60
        second = sessions.open(MEETING, None)
        await sessions.settle(second)
        assert not first.superseded
        assert sessions.start_after(second, 0) == 0

    _run(go())


def test_a_later_session_is_nothing_to_an_earlier_one() -> None:
    clock = Clock()
    sessions = OpenSessions(clock)

    async def go() -> None:
        first = sessions.open(MEETING, None)
        second = sessions.open(MEETING, None)
        second.received(1000)
        second.listening()
        clock.now += 60
        await sessions.settle(first)
        assert not second.superseded
        assert sessions.start_after(first, 0) == 0

    _run(go())


def test_another_meeting_is_nothing_to_this_one() -> None:
    clock = Clock()
    sessions = OpenSessions(clock)

    async def go() -> None:
        other = sessions.open("another", None)
        other.received(1000)
        other.listening()
        clock.now += 60
        session = sessions.open(MEETING, None)
        await sessions.settle(session)
        assert not other.superseded
        assert sessions.start_after(session, 0) == 0

    _run(go())


def test_saved_audio_is_not_counted_twice() -> None:
    sessions = OpenSessions()

    async def go() -> None:
        first = sessions.open(MEETING, None)
        first.received(1000)
        first.saved()  # in the recording, and the socket is still saying goodbye
        second = sessions.open(MEETING, None)
        assert sessions.start_after(second, 1000) == 1000

    _run(go())


def test_a_closed_meeting_leaves_nothing_behind() -> None:
    sessions = OpenSessions()
    session = sessions.open(MEETING, None)
    sessions.close(session)
    assert sessions._open == {}


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
