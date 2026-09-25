package io.github.ikasast.voxinq

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// Everything a share has to decide before a meeting exists: is this audio, is it small enough
// to send, and what is the meeting called. Getting the first wrong creates a meeting out of
// somebody's photo; getting the second wrong hands the transcription service more than it can
// hold in memory.

class ImportTest {
    @Test
    fun the_sharing_app_s_own_type_is_the_first_answer() {
        assertTrue(Import.looksLikeAudio("audio/mp4", "clip"))
        assertTrue(Import.looksLikeAudio("AUDIO/MPEG", null))
        // A meeting recorded as video is still a meeting, and the service decodes it.
        assertTrue(Import.looksLikeAudio("video/mp4", "clip"))
        assertFalse(Import.looksLikeAudio("image/jpeg", "photo.jpg"))
        assertFalse(Import.looksLikeAudio("text/plain", "notes.txt"))
    }

    @Test
    fun a_file_shared_as_plain_bytes_is_judged_by_its_name() {
        // Which is how a file manager tends to share something it read off storage.
        assertTrue(Import.looksLikeAudio("application/octet-stream", "REC_20260926_101500.m4a"))
        assertTrue(Import.looksLikeAudio(null, "interview.OPUS"))
        assertFalse(Import.looksLikeAudio("application/octet-stream", "budget.xlsx"))
        assertFalse(Import.looksLikeAudio(null, null))
    }

    @Test
    fun the_meeting_is_called_after_the_file() {
        assertEquals("Monday review", Import.titleFrom("Monday review.m4a"))
        assertEquals("REC_20260926_101500", Import.titleFrom("REC_20260926_101500.m4a"))
        // A path, from a provider that answers with one.
        assertEquals("call", Import.titleFrom("/storage/emulated/0/Recordings/call.wav"))
        // A leading dot is the whole name of a hidden file, not an extension to strip.
        assertEquals(".hidden", Import.titleFrom(".hidden"))
        // Nothing at all has nothing to give; the caller names the meeting instead.
        assertEquals("", Import.titleFrom("   "))
        assertEquals("", Import.titleFrom(null))
        // No extension is not a problem: plenty of content providers report none.
        assertEquals("voice 002", Import.titleFrom("voice 002"))
    }

    @Test
    fun what_is_too_large_to_send() {
        assertFalse(Import.tooBig(0))
        assertFalse(Import.tooBig(Import.MAX_BYTES))
        assertTrue(Import.tooBig(Import.MAX_BYTES + 1))
    }

    @Test
    fun the_size_is_said_the_way_a_person_would() {
        assertEquals("", Import.sizeLabel(0))
        assertEquals("900 B", Import.sizeLabel(900))
        assertEquals("64 KB", Import.sizeLabel(64 * 1024))
        assertEquals("1.5 MB", Import.sizeLabel(3 * 512 * 1024))
        assertEquals("512 MB", Import.sizeLabel(Import.MAX_BYTES))
    }
}
