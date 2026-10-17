package io.github.ikasast.voxinq

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AppLockTest {
    private val minute = 60_000L

    @Test
    fun coming_back_inside_the_chosen_time_does_not_ask() {
        assertTrue(AppLock.withinTime(true, true, leftAt = 1_000, now = 1_000 + 4 * minute, afterMinutes = 5))
        assertTrue(AppLock.withinTime(true, true, leftAt = 1_000, now = 1_000 + 5 * minute, afterMinutes = 5))
        assertFalse(AppLock.withinTime(true, true, leftAt = 1_000, now = 1_000 + 5 * minute + 1, afterMinutes = 5))
    }

    @Test
    fun every_time_means_any_time_away() {
        assertTrue(AppLock.withinTime(true, true, leftAt = 1_000, now = 1_000, afterMinutes = 0))
        assertFalse(AppLock.withinTime(true, true, leftAt = 1_000, now = 1_001, afterMinutes = 0))
    }

    @Test
    fun a_reboot_a_locked_leave_or_no_leave_at_all_asks() {
        // A restarted phone always asks, however soon it is opened.
        assertFalse(AppLock.withinTime(true, sameBoot = false, leftAt = 1_000, now = 2_000, afterMinutes = 60))
        // Left while still locked: there was no unlocking to carry over.
        assertFalse(AppLock.withinTime(leftUnlocked = false, sameBoot = true, leftAt = 1_000, now = 2_000, afterMinutes = 60))
        assertFalse(AppLock.withinTime(true, true, leftAt = -1, now = 2_000, afterMinutes = 60))
        // A clock that went backwards is not trusted as "no time at all".
        assertFalse(AppLock.withinTime(true, true, leftAt = 5_000, now = 2_000, afterMinutes = 60))
    }

    @Test
    fun the_choices_include_the_default() {
        assertTrue(AppLock.DEFAULT_MINUTES in AppLock.CHOICES)
        assertTrue(0 in AppLock.CHOICES)
    }
}
