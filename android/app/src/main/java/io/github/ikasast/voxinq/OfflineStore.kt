package io.github.ikasast.voxinq

import org.json.JSONObject
import java.io.File

/**
 * Recordings made on the phone while the server could not be reached, waiting to be sent.
 *
 * One directory each under `files/offline/`: the audio as 16 kHz mono 16-bit PCM — what the
 * microphone gives and the transcription service reads, an hour of it about 110 MB — and a
 * `meta.json` saying when it started and, for a booked meeting recorded from its notice, which
 * meeting it belongs to. A directory goes only once the server has the recording (ImportService),
 * or when the person deletes it.
 */
object OfflineStore {
    const val DIR = "offline"
    const val AUDIO = "audio.pcm"
    const val META = "meta.json"

    /** Bytes of audio per second: 16 000 samples of two bytes. */
    const val BYTES_PER_SECOND = 32_000L

    data class Saved(
        val dir: File,
        val startedAt: Long,
        val bytes: Long,
        /** A booked meeting it was recorded for, from that meeting's notice. */
        val meetingId: String?,
        val title: String?,
    ) {
        val seconds: Long get() = bytes / BYTES_PER_SECOND
        val audio: File get() = File(dir, AUDIO)
    }

    fun root(filesDir: File) = File(filesDir, DIR)

    /** A new recording's directory, named for when it started so the list sorts itself. */
    fun create(filesDir: File, startedAt: Long, meetingId: String?, title: String?): File {
        val dir = File(root(filesDir), "rec-$startedAt")
        dir.mkdirs()
        val meta = JSONObject().put("startedAt", startedAt)
        meetingId?.let { meta.put("meetingId", it) }
        title?.let { meta.put("title", it) }
        File(dir, META).writeText(meta.toString())
        return dir
    }

    /**
     * What is waiting, oldest first. `recording` is the directory being written right now, which
     * is not ready to send; anything with no audio in it is not worth listing.
     */
    fun list(filesDir: File, recording: File? = null): List<Saved> =
        (root(filesDir).listFiles() ?: emptyArray())
            .filter { it.isDirectory && it != recording }
            .mapNotNull { read(it) }
            .filter { it.bytes > 0 }
            .sortedBy { it.startedAt }

    fun read(dir: File): Saved? {
        val meta = runCatching { JSONObject(File(dir, META).readText()) }.getOrNull() ?: return null
        val startedAt = meta.optLong("startedAt", 0L).takeIf { it > 0 } ?: return null
        return Saved(
            dir = dir,
            startedAt = startedAt,
            bytes = File(dir, AUDIO).length(),
            meetingId = meta.stringOrNull("meetingId"),
            title = meta.stringOrNull("title"),
        )
    }

    fun delete(saved: Saved) {
        saved.dir.deleteRecursively()
    }

    /**
     * The 44 bytes that make the PCM a WAV file — sent in front of the audio, so the server is
     * handed something any decoder reads, without a second copy of an hour of audio on the phone.
     */
    fun wavHeader(dataBytes: Long, sampleRate: Int = 16_000): ByteArray {
        val channels = 1
        val bits = 16
        val byteRate = sampleRate * channels * bits / 8
        val size = dataBytes.coerceAtMost(0xFFFFFFFFL - 36)
        val b = java.nio.ByteBuffer.allocate(44).order(java.nio.ByteOrder.LITTLE_ENDIAN)
        b.put("RIFF".toByteArray(Charsets.US_ASCII)).putInt((36 + size).toInt())
        b.put("WAVE".toByteArray(Charsets.US_ASCII))
        b.put("fmt ".toByteArray(Charsets.US_ASCII)).putInt(16).putShort(1).putShort(channels.toShort())
        b.putInt(sampleRate).putInt(byteRate).putShort((channels * bits / 8).toShort()).putShort(bits.toShort())
        b.put("data".toByteArray(Charsets.US_ASCII)).putInt(size.toInt())
        return b.array()
    }
}
