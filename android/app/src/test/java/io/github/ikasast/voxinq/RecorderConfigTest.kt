package io.github.ikasast.voxinq

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// What the page asks for, as the service reads it. The recording source is the part with
// consequences: it decides whether a microphone is opened, whether the user is asked to allow
// capturing what the phone plays, and which kind of foreground service this is.

class RecorderConfigTest {
    private fun asked(vararg fields: Pair<String, Any>): RecorderConfig {
        val json = JSONObject().put("meetingId", "m1").put("wsUrl", "wss://stt.example/ws")
        for ((k, v) in fields) json.put(k, v)
        return RecorderConfig.from(json, "https://voxinq.example")!!
    }

    @Test
    fun the_microphone_alone_is_what_a_page_that_says_nothing_gets() {
        val c = asked()
        assertNull(c.source)
        assertTrue(c.capturesMic)
        assertFalse(c.capturesPlayback)
    }

    @Test
    fun what_the_phone_is_playing_can_be_the_only_source() {
        val c = asked("source" to "display")
        assertFalse("no microphone is opened for it", c.capturesMic)
        assertTrue(c.capturesPlayback)
    }

    @Test
    fun or_both_at_once() {
        val c = asked("source" to "both")
        assertTrue(c.capturesMic)
        assertTrue(c.capturesPlayback)
    }

    @Test
    fun a_source_this_app_does_not_know_is_the_microphone() {
        // The page is the server's own, but it is still a page: an unknown answer must not turn
        // into a recording with no source at all.
        val c = asked("source" to "screen")
        assertNull(c.source)
        assertTrue(c.capturesMic)
        assertFalse(c.capturesPlayback)
    }

    @Test
    fun the_source_survives_being_handed_to_the_service() {
        // The config travels to the service as JSON in an intent, and back out again.
        val there = RecorderConfig.fromJson(asked("source" to "both", "micMode" to "room").toJson())!!
        assertEquals("both", there.source)
        assertTrue(there.capturesPlayback)
        assertTrue(there.room)
    }
}
