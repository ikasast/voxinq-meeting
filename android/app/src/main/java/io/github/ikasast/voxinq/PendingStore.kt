package io.github.ikasast.voxinq

import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile

/**
 * What a recording still owes the server, written down.
 *
 * The page holds five minutes of audio in memory and drops the oldest after that. A phone
 * recording an hour-long meeting over a tailnet that comes and goes needs longer than that, and
 * must not be the thing that loses the meeting. So every frame is written to a file before it
 * is sent, and **the file is the queue**: the sender reads from where it left off, so a
 * connection that returns twenty minutes later still finds everything, in order.
 *
 * The same directory holds the lines that were recognised but not yet saved, so a process the
 * system kills loses neither the audio nor the words.
 *
 * One directory per recording. It is deleted when nothing is owed; what is left behind is a
 * recording that still has something to deliver.
 */
class PendingStore(val dir: File) {
    companion object {
        /** How often the sent mark is written down. A kill can cost at most this much audio,
         *  re-sent rather than lost — a second of duplicate speech beats a second of silence. */
        private const val MARK_EVERY_BYTES = 32_000L // one second at 16 kHz mono 16-bit

        private const val AUDIO = "audio.pcm"
        private const val SENT = "sent"
        private const val SAVES = "saves.json"
        private const val META = "meta.json"

        /** Recordings with something still owed, oldest first. */
        fun leftovers(root: File): List<PendingStore> =
            (root.listFiles() ?: emptyArray())
                .filter { it.isDirectory && File(it, META).exists() }
                .sortedBy { it.lastModified() }
                .map { PendingStore(it) }
    }

    private val lock = Any()
    private var file: RandomAccessFile? = null
    private var written = 0L
    private var sent = 0L
    private var marked = 0L

    /** Opens the directory, picking up whatever a previous run left in it. */
    fun open() {
        synchronized(lock) {
            dir.mkdirs()
            val f = RandomAccessFile(File(dir, AUDIO), "rw")
            written = f.length()
            file = f
            sent = runCatching { File(dir, SENT).readText().trim().toLong() }.getOrDefault(0L)
                .coerceIn(0L, written)
            marked = sent
        }
    }

    // ---- The audio ----

    /** Write a frame down. False means the disk refused it, and the frame is gone. */
    fun appendAudio(bytes: ByteArray): Boolean = synchronized(lock) {
        val f = file ?: return false
        try {
            f.seek(written)
            f.write(bytes)
            written += bytes.size
            true
        } catch (_: IOException) {
            false
        }
    }

    /** The next unsent audio, up to `max` bytes, without marking it sent. */
    fun readNext(max: Int): ByteArray? = synchronized(lock) {
        val f = file ?: return null
        if (sent >= written) return null
        val n = minOf(max.toLong(), written - sent).toInt()
        val buf = ByteArray(n)
        return try {
            f.seek(sent)
            f.readFully(buf)
            buf
        } catch (_: IOException) {
            null
        }
    }

    fun markSent(count: Int) {
        synchronized(lock) {
            sent = (sent + count).coerceAtMost(written)
            if (sent - marked >= MARK_EVERY_BYTES) writeMarkLocked()
        }
    }

    /**
     * Give back audio a dead connection was still holding.
     *
     * A frame handed to OkHttp is queued, not delivered, so a connection that fails takes its
     * queue with it. Winding the mark back by what was queued re-sends those seconds instead of
     * leaving a hole in the meeting; the send queue is kept small so it is only ever seconds.
     */
    fun rewind(bytes: Long) {
        synchronized(lock) {
            sent = (sent - bytes).coerceAtLeast(0L)
            writeMarkLocked()
        }
    }

    fun unsentBytes(): Long = synchronized(lock) { written - sent }

    /**
     * Drop the oldest audio when more than `maxUnsent` is waiting, and say how much went.
     *
     * The last resort: hours out of reach, or a disk with nothing left. Dropping the oldest is
     * the same choice the page makes, for the same reason — the newest speech is the part
     * somebody is still waiting to read.
     */
    fun trim(maxUnsent: Long): Long = synchronized(lock) {
        val over = (written - sent) - maxUnsent
        if (over <= 0) return 0L
        sent += over
        writeMarkLocked()
        return over
    }

    private fun writeMarkLocked() {
        marked = sent
        runCatching { File(dir, SENT).writeText(sent.toString()) }
    }

    // ---- The lines waiting to be saved ----

    /** Add a line (or a translation) that still has to reach the web app. */
    fun addPending(item: JSONObject) {
        synchronized(lock) {
            val all = readSavesLocked()
            all.put(item)
            writeSavesLocked(all)
        }
    }

    fun removePending(key: String) {
        synchronized(lock) {
            val all = readSavesLocked()
            val kept = JSONArray()
            for (i in 0 until all.length()) {
                val item = all.optJSONObject(i) ?: continue
                if (item.optString("key") != key) kept.put(item)
            }
            writeSavesLocked(kept)
        }
    }

    fun pending(): List<JSONObject> = synchronized(lock) {
        val all = readSavesLocked()
        (0 until all.length()).mapNotNull { all.optJSONObject(it) }
    }

    private fun readSavesLocked(): JSONArray =
        runCatching { JSONArray(File(dir, SAVES).readText()) }.getOrDefault(JSONArray())

    private fun writeSavesLocked(all: JSONArray) {
        runCatching { File(dir, SAVES).writeText(all.toString()) }
    }

    // ---- What a later run needs to finish the job ----

    fun writeMeta(json: JSONObject) {
        runCatching { File(dir, META).writeText(json.toString()) }
    }

    fun meta(): JSONObject? =
        runCatching { JSONObject(File(dir, META).readText()) }.getOrNull()

    /** Give up on this one: nothing here can be delivered. */
    fun discard() {
        synchronized(lock) {
            runCatching { file?.close() }
            file = null
            dir.deleteRecursively()
        }
    }

    /**
     * Close the files, and delete the directory when nothing is owed.
     *
     * What survives is exactly what still has to be delivered — which is how a later run knows
     * there is anything to do.
     */
    fun close(): Boolean = synchronized(lock) {
        runCatching { file?.close() }
        file = null
        writeMarkLocked()
        val owed = written - sent > 0 || readSavesLocked().length() > 0
        if (!owed) dir.deleteRecursively()
        return owed
    }
}
