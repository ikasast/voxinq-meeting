package io.github.ikasast.voxinq

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

// The start message is the page's (lib/stt/client.ts), key for key, and since 4.9 it carries the
// meeting's token (stt-service/auth.py). The page's token is kept with the recording so that one
// sent later still has something to show when the web app cannot be asked for a fresh one.

class RecorderConfigTest {
    private val page = JSONObject(
        """{"meetingId":"cm0meeting1","wsUrl":"wss://host.example.ts.net:8443/ws","token":"m.cm0meeting1.2000000000.sig","micMode":"room"}""",
    )

    @Test
    fun the_pages_token_goes_in_the_start_message() {
        val config = RecorderConfig.from(page, "https://host.example.ts.net")!!
        assertEquals("m.cm0meeting1.2000000000.sig", JSONObject(config.startMessage()).getString("token"))
    }

    @Test
    fun a_fresher_token_replaces_it() {
        val config = RecorderConfig.from(page, "https://host.example.ts.net")!!
        assertEquals("m.new", JSONObject(config.startMessage("m.new")).getString("token"))
    }

    @Test
    fun no_token_means_none_is_sent() {
        val config = RecorderConfig.from(page, "https://host.example.ts.net")!!
        assertFalse(JSONObject(config.startMessage(null)).has("token"))
    }

    @Test
    fun the_token_is_kept_with_the_recording() {
        val config = RecorderConfig.from(page, "https://host.example.ts.net")!!
        assertEquals("m.cm0meeting1.2000000000.sig", RecorderConfig.fromJson(config.toJson())!!.token)
    }
}
