package io.github.ikasast.voxinq

import org.json.JSONObject
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

// The file is the queue: audio is written down before it is sent, and the sent mark says how
// far the server has got. What these are about is the arithmetic that decides whether a meeting
// survives twenty minutes without a network — and whether a process the system kills leaves
// behind exactly what it still owes.

class PendingStoreTest {
    @get:Rule val tmp = TemporaryFolder()

    private fun store(name: String = "m1"): PendingStore =
        PendingStore(tmp.root.resolve(name)).also { it.open() }

    private fun frame(byte: Int, size: Int = 8) = ByteArray(size) { byte.toByte() }

    @Test
    fun audio_comes_back_in_the_order_it_went_in() {
        val s = store()
        s.appendAudio(frame(1))
        s.appendAudio(frame(2))
        assertEquals(16L, s.unsentBytes())

        val first = s.readNext(8)!!
        assertArrayEquals(frame(1), first)
        // Reading does not consume: nothing is owed to the socket until it takes it.
        assertArrayEquals(frame(1), s.readNext(8))
        s.markSent(first.size)
        assertArrayEquals(frame(2), s.readNext(8))
        s.markSent(8)
        assertNull(s.readNext(8))
        assertEquals(0L, s.unsentBytes())
    }

    @Test
    fun it_hands_over_as_much_as_is_asked_for() {
        val s = store()
        s.appendAudio(frame(7, size = 100))
        assertEquals(32, s.readNext(32)!!.size)
        assertEquals(100, s.readNext(4096)!!.size)
    }

    @Test
    fun a_later_run_carries_on_from_the_mark() {
        val dir = tmp.root.resolve("m2")
        val first = PendingStore(dir).also { it.open() }
        first.appendAudio(frame(1, size = 40_000))
        first.markSent(32_000) // past the point where the mark is written down
        assertTrue("something is still owed", first.close())

        val second = PendingStore(dir).also { it.open() }
        assertEquals(8_000L, second.unsentBytes())
        assertEquals(8_000, second.readNext(1 shl 20)!!.size)
    }

    @Test
    fun a_dead_connection_gives_its_queue_back() {
        // OkHttp queues rather than delivers, so a socket that fails takes its queue with it.
        // Winding back re-sends those seconds instead of leaving a hole in the meeting.
        val s = store()
        s.appendAudio(frame(3, size = 6_400))
        s.markSent(6_400)
        assertEquals(0L, s.unsentBytes())
        s.rewind(3_200)
        assertEquals(3_200L, s.unsentBytes())
        s.rewind(999_999) // never past the beginning
        assertEquals(6_400L, s.unsentBytes())
    }

    @Test
    fun the_oldest_goes_when_there_is_too_much_waiting() {
        val s = store()
        s.appendAudio(frame(1, size = 10_000))
        assertEquals(4_000L, s.trim(6_000))
        assertEquals(6_000L, s.unsentBytes())
        assertEquals(0L, s.trim(6_000)) // nothing to do twice
    }

    @Test
    fun lines_waiting_to_be_saved_survive_the_process() {
        val dir = tmp.root.resolve("m3")
        val first = PendingStore(dir).also { it.open() }
        first.addPending(JSONObject().put("key", "1:0").put("text", "そうですね"))
        first.addPending(JSONObject().put("key", "1:1").put("text", "では次に"))
        first.removePending("1:0")
        assertTrue(first.close())

        val second = PendingStore(dir).also { it.open() }
        val waiting = second.pending()
        assertEquals(1, waiting.size)
        assertEquals("では次に", waiting[0].optString("text"))
    }

    @Test
    fun nothing_owed_means_nothing_left_behind() {
        val dir = tmp.root.resolve("m4")
        val s = PendingStore(dir).also { it.open() }
        s.writeMeta(JSONObject().put("meetingId", "m4"))
        s.appendAudio(frame(5, size = 320))
        s.markSent(320)
        assertFalse("nothing is owed", s.close())
        assertFalse("so the directory is gone", dir.exists())
    }

    @Test
    fun what_is_left_behind_is_what_a_later_run_should_finish() {
        val root = tmp.root.resolve("pending")
        val owes = PendingStore(root.resolve("m5")).also { it.open() }
        owes.writeMeta(JSONObject().put("meetingId", "m5").put("wsUrl", "wss://stt.example/ws"))
        owes.appendAudio(frame(9, size = 1_600))
        owes.close()

        val done = PendingStore(root.resolve("m6")).also { it.open() }
        done.writeMeta(JSONObject().put("meetingId", "m6"))
        done.close()

        val left = PendingStore.leftovers(root)
        assertEquals(1, left.size)
        assertEquals("m5", left[0].meta()?.optString("meetingId"))
        assertEquals("wss://stt.example/ws", left[0].meta()?.optString("wsUrl"))
    }
}
