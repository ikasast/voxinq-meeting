package io.github.ikasast.voxinq

import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.pow
import kotlin.math.sqrt

/**
 * The recording page's audio graph, one 100 ms frame at a time.
 *
 * The page sends the microphone through a gain (four times in Room mode), then a limiter, then
 * a worklet that clamps to 16-bit PCM (lib/stt/client.ts, public/worklets/pcm-worklet.js). The
 * transcription service's silence threshold is set against what that graph produces, so the
 * phone has to produce the same thing or a voice across the table is quieter here than in the
 * browser and never reaches the recogniser.
 *
 * The limiter follows the Web Audio DynamicsCompressorNode the page configures — threshold
 * -6 dB, knee 3 dB, ratio 12, attack 3 ms, release 150 ms — including the make-up gain that
 * node adds on its own, and the 6 ms it looks ahead so a peak is turned down before it arrives
 * rather than after.
 */
class AudioProcessor(room: Boolean, sampleRate: Int = SAMPLE_RATE, mixed: Boolean = false) {
    companion object {
        const val SAMPLE_RATE = 16_000
        const val FRAME_SAMPLES = 1_600 // 100 ms, the size the service is sent

        /** lib/stt/mic-constraints.ts. */
        const val ROOM_GAIN = 4f

        /**
         * Headroom for each of two sources, as the page gives them: the microphone and what the
         * phone is playing, both at full scale, would add past the rails before the limiter had
         * a chance to round the peak off, and clipping is the one distortion recognition cannot
         * see past.
         */
        const val MIX_HEADROOM = 0.7f

        private const val THRESHOLD_DB = -6f
        private const val KNEE_DB = 3f
        private const val RATIO = 12f
        private const val ATTACK_S = 0.003f
        private const val RELEASE_S = 0.15f
        private const val LOOKAHEAD_S = 0.006f

        /** Output level for an input level, in dB: the compressor's static curve. */
        fun curveDb(x: Float): Float {
            val over = x - THRESHOLD_DB
            return when {
                2 * over < -KNEE_DB -> x
                2 * abs(over) <= KNEE_DB -> {
                    val k = over + KNEE_DB / 2
                    x + (1 / RATIO - 1) * k * k / (2 * KNEE_DB)
                }
                else -> THRESHOLD_DB + over / RATIO
            }
        }

        /** Web Audio's automatic make-up: (1 / curve(0 dB)) ^ 0.6. */
        val MAKEUP: Float = 10f.pow(-curveDb(0f) * 0.6f / 20f)
    }

    class Frame(val pcm: ByteArray, val rms: Float, val clipRatio: Float)

    private val gain = (if (room) ROOM_GAIN else 1f) * (if (mixed) MIX_HEADROOM else 1f)
    private val attack = exp(-1f / (ATTACK_S * sampleRate))
    private val release = exp(-1f / (RELEASE_S * sampleRate))
    private val delay = FloatArray(max(1, (LOOKAHEAD_S * sampleRate).toInt()))
    private val railDelay = BooleanArray(delay.size)
    private var delayAt = 0
    private var reductionDb = 0f

    /**
     * One frame out of one or two sources.
     *
     * `second` is what the phone was playing over the same 100 ms, as far as it had arrived. It
     * is summed in before the limiter — the page sums its sources into the same limiter — so a
     * loud moment in either is rounded off rather than squared off.
     */
    fun process(
        input: ShortArray,
        count: Int = input.size,
        second: ShortArray? = null,
        secondCount: Int = 0,
    ): Frame {
        val pcm = ByteArray(count * 2)
        var clipped = 0
        var sum = 0.0
        var n = 0
        for (i in 0 until count) {
            val raw = input[i]
            val other: Int = if (second != null && i < secondCount) second[i].toInt() else 0
            val x = (raw.toInt() + other) / 32768f * gain

            // Detect on the sample coming in, apply to the one leaving the delay line.
            val levelDb = 20 * log10(max(abs(x), 1e-6f))
            val targetDb = curveDb(levelDb) - levelDb
            val coef = if (targetDb < reductionDb) attack else release
            reductionDb = coef * reductionDb + (1 - coef) * targetDb

            val delayed = delay[delayAt]
            // A sample at the rail was clipped before it reached us, whatever happens next. It
            // travels with its sample, so one sample is counted once however it clipped.
            val delayedRail = railDelay[delayAt]
            delay[delayAt] = x
            railDelay[delayAt] = raw == Short.MAX_VALUE || raw == Short.MIN_VALUE ||
                other == Short.MAX_VALUE.toInt() || other == Short.MIN_VALUE.toInt()
            delayAt = (delayAt + 1) % delay.size
            val y = delayed * 10f.pow(reductionDb / 20f) * MAKEUP

            if (delayedRail || y > 1f || y < -1f) clipped++
            val s = (y.coerceIn(-1f, 1f) * 0x7fff).toInt()
            pcm[2 * i] = (s and 0xff).toByte()
            pcm[2 * i + 1] = ((s shr 8) and 0xff).toByte()

            // The page's meter reads every fourth sample of what is sent; so does this one.
            if (i % 4 == 0) {
                val v = s / 32768.0
                sum += v * v
                n++
            }
        }
        val rms = if (n > 0) sqrt(sum / n).toFloat() else 0f
        return Frame(pcm, rms, if (count > 0) clipped.toFloat() / count else 0f)
    }
}
