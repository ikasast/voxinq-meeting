package io.github.ikasast.voxinq

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder

class OfflineStoreTest {
    @get:Rule val tmp = TemporaryFolder()

    @Test
    fun aWavHeaderDescribes16kMono16Bit() {
        val h = OfflineStore.wavHeader(32_000)
        assertEquals(44, h.size)
        assertArrayEquals("RIFF".toByteArray(), h.copyOfRange(0, 4))
        assertArrayEquals("WAVE".toByteArray(), h.copyOfRange(8, 12))
        val b = ByteBuffer.wrap(h).order(ByteOrder.LITTLE_ENDIAN)
        assertEquals(36 + 32_000, b.getInt(4))
        assertEquals(1, b.getShort(22).toInt()) // mono
        assertEquals(16_000, b.getInt(24))
        assertEquals(32_000, b.getInt(28)) // bytes per second
        assertEquals(16, b.getShort(34).toInt())
        assertEquals(32_000, b.getInt(40))
    }

    @Test
    fun recordingsAreListedOldestFirstAndTheOneBeingWrittenIsLeftOut() {
        val files = tmp.newFolder("files")
        val later = OfflineStore.create(files, 2_000L, null, null)
        val earlier = OfflineStore.create(files, 1_000L, "meeting-1", "Weekly sync")
        val writing = OfflineStore.create(files, 3_000L, null, null)
        for (d in listOf(later, earlier, writing)) File(d, OfflineStore.AUDIO).writeBytes(ByteArray(64_000))
        // Nothing recorded yet: not worth listing.
        OfflineStore.create(files, 4_000L, null, null)

        val saved = OfflineStore.list(files, recording = writing)
        assertEquals(listOf(1_000L, 2_000L), saved.map { it.startedAt })
        assertEquals("meeting-1", saved[0].meetingId)
        assertEquals("Weekly sync", saved[0].title)
        assertNull(saved[1].meetingId)
        assertEquals(2L, saved[0].seconds)

        OfflineStore.delete(saved[0])
        assertEquals(listOf(2_000L), OfflineStore.list(files, recording = writing).map { it.startedAt })
    }
}
