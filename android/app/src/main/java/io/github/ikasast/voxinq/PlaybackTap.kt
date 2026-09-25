package io.github.ikasast.voxinq

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioPlaybackCaptureConfiguration
import android.media.AudioRecord
import android.media.projection.MediaProjection

/**
 * What the phone is playing, as a recording source.
 *
 * `AudioPlaybackCaptureConfiguration` hands an app the audio other apps are playing — with two
 * limits that decide what this is good for. It only covers playback whose usage is **media**,
 * **game** or **unknown**, and an app may opt out of being captured at all. Voice communication
 * is a usage of its own, so **a phone call cannot be captured, and neither can Zoom, Teams or
 * Meet**: their audio is voice communication, whatever it sounds like. What is left is media —
 * a talk being streamed, a recording played back by an app that cannot share the file.
 *
 * It is also why this needs the user's consent every time: the permission Android asks for is
 * the screen-recording one, because the same projection could take the screen. This takes only
 * audio, and no virtual display is ever created.
 */
class PlaybackTap private constructor(private val record: AudioRecord) {
    companion object {
        /**
         * Open the tap, or return null if the framework refuses.
         *
         * The buffer is generous on purpose: this record is read *after* the microphone's frame
         * on a mixed recording, so it has to hold what arrives in the meantime, and the
         * framework dropping its oldest audio is a better failure than a read that blocks the
         * microphone's own pacing.
         */
        fun open(projection: MediaProjection): PlaybackTap? {
            val config = AudioPlaybackCaptureConfiguration.Builder(projection)
                .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
                .addMatchingUsage(AudioAttributes.USAGE_GAME)
                .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
                .build()
            val format = AudioFormat.Builder()
                .setSampleRate(AudioProcessor.SAMPLE_RATE)
                .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .build()
            val min = AudioRecord.getMinBufferSize(
                AudioProcessor.SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
            )
            val size = maxOf(min, AudioProcessor.FRAME_SAMPLES * 2) * 8
            val record = try {
                AudioRecord.Builder()
                    .setAudioFormat(format)
                    .setBufferSizeInBytes(size)
                    .setAudioPlaybackCaptureConfig(config)
                    .build()
            } catch (_: Exception) {
                null
            }
            if (record == null || record.state != AudioRecord.STATE_INITIALIZED) {
                record?.release()
                return null
            }
            record.startRecording()
            if (record.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
                record.release()
                return null
            }
            return PlaybackTap(record)
        }
    }

    /** Blocking, for a recording that is only this: nothing playing arrives as silence. */
    fun read(frame: ShortArray): Int {
        var filled = 0
        while (filled < frame.size) {
            val n = record.read(frame, filled, frame.size - filled)
            if (n <= 0) return if (filled > 0) filled else n
            filled += n
        }
        return filled
    }

    /**
     * Whatever is there, without waiting — for a recording the microphone is pacing.
     *
     * The two sources run at the same rate, so what is there is normally a whole frame. Less
     * than that is mixed as far as it goes and the rest of the frame is the microphone alone,
     * which is the right way round: a gap in what the phone was playing is inaudible, and
     * holding up the microphone to wait for it would put a gap in the room instead.
     */
    fun readAvailable(frame: ShortArray): Int {
        val n = record.read(frame, 0, frame.size, AudioRecord.READ_NON_BLOCKING)
        return if (n > 0) n else 0
    }

    /**
     * Stop delivering, so a blocking read returns and the capture thread can end. Separate from
     * [close] because releasing the record under a thread still reading it is a crash.
     */
    fun pause() {
        runCatching { record.stop() }
    }

    fun close() {
        pause()
        runCatching { record.release() }
    }
}
