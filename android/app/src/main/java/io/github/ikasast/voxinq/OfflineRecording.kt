package io.github.ikasast.voxinq

import android.media.AudioRecord
import android.os.Process
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileOutputStream

/**
 * A recording kept on the phone: the server could not be reached, so there is nobody to send it
 * to yet. The same microphone and the same audio graph as a recording to the server
 * (AudioProcessor), written straight to `audio.pcm` in its OfflineStore directory. Nothing is
 * recognised here; the server does it once the file arrives.
 */
class OfflineRecording(val dir: File, private val room: Boolean) {
    private val processor = AudioProcessor(room)
    private var recorder: AudioRecord? = null
    private var thread: Thread? = null
    @Volatile private var capturing = false
    @Volatile var failed: String? = null
        private set

    fun start() {
        val rec = openMicrophone(room)
        recorder = rec
        rec.startRecording()
        capturing = true
        thread = Thread({ capture(rec) }, "voxinq-offline").also { it.start() }
    }

    /** Stop and keep what was recorded. */
    fun stop() {
        capturing = false
        thread?.join(3_000)
        thread = null
        recorder?.let {
            runCatching { it.stop() }
            it.release()
        }
        recorder = null
        OfflineState.level = 0f
    }

    fun silenced(): Boolean = recorder?.activeRecordingConfiguration?.isClientSilenced == true

    private fun capture(rec: AudioRecord) {
        Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_AUDIO)
        val frame = ShortArray(AudioProcessor.FRAME_SAMPLES)
        BufferedOutputStream(FileOutputStream(File(dir, OfflineStore.AUDIO), true), 64 * 1024).use { out ->
            while (capturing) {
                var filled = 0
                while (filled < frame.size && capturing) {
                    val n = rec.read(frame, filled, frame.size - filled)
                    if (n < 0) {
                        failed = "read error $n"
                        capturing = false
                        break
                    }
                    filled += n
                }
                if (filled < frame.size) break
                val processed = processor.process(frame)
                OfflineState.level = processed.rms
                try {
                    out.write(processed.pcm)
                } catch (e: Exception) {
                    // A full disk: stop rather than pretend, and keep what was written.
                    failed = e.message ?: "the phone would not write the audio down"
                    capturing = false
                }
            }
        }
    }
}

/** What the offline screen shows while a recording is kept on the phone. */
object OfflineState {
    @Volatile var recording = false
    @Volatile var startedAt = 0L
    @Volatile var dir: File? = null
    /** The last frame's loudness, 0–1, for the meter. */
    @Volatile var level = 0f

    fun reset() {
        recording = false
        startedAt = 0L
        dir = null
        level = 0f
    }
}
