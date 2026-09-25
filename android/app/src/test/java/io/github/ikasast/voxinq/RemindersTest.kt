package io.github.ikasast.voxinq

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// The phone decides three things on its own: which meetings are worth an alarm, what the
// server's answer actually said, and which meetings it has already mentioned. Everything else
// is the server's word or the platform's. These are those three.

class RemindersTest {
    private val now = 1_780_000_000_000L // a fixed "now"; the arithmetic is what is being read
    private val hour = 60L * 60 * 1000

    private fun at(offsetMs: Long) = now + offsetMs

    @Test
    fun only_what_is_ahead_and_within_reach_gets_an_alarm() {
        val soon = listOf(
            Reminders.Booked("m-past", "Already started", at(-5 * 60_000)),
            Reminders.Booked("m-now", "In ten minutes", at(10 * 60_000)),
            Reminders.Booked("m-tomorrow", "Tomorrow morning", at(20 * hour)),
            Reminders.Booked("m-next-week", "Next week", at(7 * 24 * hour)),
        )
        val planned = Reminders.toSchedule(now, soon)
        // A meeting whose time has passed is the check's business, not an alarm's, and next
        // week's diary is not worth an alarm each today.
        assertEquals(listOf("m-now", "m-tomorrow"), planned.map { it.id })
    }

    @Test
    fun the_soonest_meeting_comes_first() {
        val planned = Reminders.toSchedule(
            now,
            listOf(
                Reminders.Booked("m-late", "Later", at(4 * hour)),
                Reminders.Booked("m-early", "Sooner", at(1 * hour)),
            ),
        )
        assertEquals(listOf("m-early", "m-late"), planned.map { it.id })
    }

    @Test
    fun the_answer_is_read_as_two_lists() {
        val reply = Reminders.parse(
            """
            {"meetings":[{"id":"cme1","title":"Weekly review","scheduledAt":"2026-06-01T09:00:00.000Z"}],
             "soon":[{"id":"cme2","title":"Budget call","scheduledAt":"2026-06-01T11:30:00.000Z"}]}
            """.trimIndent(),
        )!!
        assertEquals(listOf("cme1"), reply.due.map { it.id })
        assertEquals("Weekly review", reply.due[0].title)
        assertEquals(1_780_304_400_000L, reply.due[0].at) // 2026-06-01T09:00Z
        assertEquals(listOf("cme2"), reply.soon.map { it.id })
    }

    @Test
    fun an_answer_from_the_wrong_place_says_nothing() {
        // A session that has expired is answered with a login page, not with meetings. The
        // phone has to stay quiet rather than invent a reminder out of it.
        assertNull(Reminders.parse("<!doctype html><title>Sign in</title>"))
        assertNull(Reminders.parse("""{"error":"unauthorized"}"""))
        // The lists themselves may be empty — that is an answer, and it means nothing is due.
        assertEquals(0, Reminders.parse("""{"meetings":[]}""")!!.due.size)
    }

    @Test
    fun a_row_that_could_not_be_acted_on_is_left_out() {
        val reply = Reminders.parse(
            """
            {"meetings":[
              {"id":"cme1","title":"Fine","scheduledAt":"2026-06-01T09:00:00.000Z"},
              {"id":"cme2","title":"No time at all","scheduledAt":null},
              {"id":"../../etc","title":"Not an id","scheduledAt":"2026-06-01T09:00:00.000Z"},
              {"title":"No id","scheduledAt":"2026-06-01T09:00:00.000Z"}
            ]}
            """.trimIndent(),
        )!!
        // Without a time there is nothing to remind anybody at; an id that is not an id would
        // go into a URL and a notification.
        assertEquals(listOf("cme1"), reply.due.map { it.id })
    }

    @Test
    fun a_meeting_with_no_title_still_arrives() {
        val reply = Reminders.parse(
            """{"meetings":[{"id":"cme1","title":"","scheduledAt":"2026-06-01T09:00:00.000Z"}]}""",
        )!!
        assertEquals("", reply.due[0].title)
    }

    @Test
    fun what_has_been_mentioned_is_forgotten_once_it_is_old() {
        val told = JSONObject()
            .put("m-just-now", now - 60_000)
            .put("m-this-morning", now - 3 * hour)
            .put("m-yesterday", now - 30 * hour)
        val kept = Reminders.prune(told, now)
        // The server calls a meeting due for two hours, so the record has to outlast that —
        // and no longer, or a meeting rescheduled for tomorrow is silently skipped.
        assertTrue(kept.has("m-just-now"))
        assertTrue(kept.has("m-this-morning"))
        assertFalse(kept.has("m-yesterday"))
    }

    @Test
    fun the_record_does_not_grow_without_end() {
        val told = JSONObject()
        for (i in 1..120) told.put("m$i", now - i * 1000L)
        val kept = Reminders.prune(told, now, max = 50)
        assertEquals(50, kept.length())
        // The newest are the ones that matter: those are the meetings still being announced.
        assertTrue(kept.has("m1"))
        assertFalse(kept.has("m120"))
    }
}
