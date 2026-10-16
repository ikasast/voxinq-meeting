package io.github.ikasast.voxinq

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder

/**
 * The microphone, opened the way the recording page opens it: 16 kHz mono, 16-bit.
 *
 * Standard keeps the platform's echo cancellation and noise suppression, as the browser does
 * with them on; Room asks for the source meant for recognition, which has neither
 * (lib/stt/mic-constraints.ts). The plain microphone is the fallback for either. Shared by a
 * recording to the server (RecordingSession) and one kept on the phone (OfflineRecording).
 */
@SuppressLint("MissingPermission") // checked by the service before either is started
fun openMicrophone(room: Boolean): AudioRecord {
    val rate = AudioProcessor.SAMPLE_RATE
    val format = AudioFormat.Builder()
        .setSampleRate(rate)
        .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
        .build()
    val min = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
    val size = maxOf(min, AudioProcessor.FRAME_SAMPLES * 2) * 4
    val sources = if (room) {
        listOf(MediaRecorder.AudioSource.VOICE_RECOGNITION, MediaRecorder.AudioSource.MIC)
    } else {
        listOf(MediaRecorder.AudioSource.VOICE_COMMUNICATION, MediaRecorder.AudioSource.MIC)
    }
    for (source in sources) {
        val rec = try {
            AudioRecord.Builder().setAudioSource(source).setAudioFormat(format).setBufferSizeInBytes(size).build()
        } catch (_: Exception) {
            null
        }
        if (rec?.state == AudioRecord.STATE_INITIALIZED) return rec
        rec?.release()
    }
    throw IllegalStateException("no microphone could be opened")
}
