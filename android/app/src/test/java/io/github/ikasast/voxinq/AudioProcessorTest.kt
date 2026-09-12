package io.github.ikasast.voxinq

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.sin
import kotlin.math.sqrt

// The transcription service decides what is silence against the level the browser's graph
// produces. These pin the phone to the same graph: the same make-up, four times louder in Room
// mode, and a loud room rounded off rather than clipped.
class AudioProcessorTest {
    private val n = AudioProcessor.FRAME_SAMPLES

    private fun sine(amplitude: Double, frame: Int): ShortArray = ShortArray(n) { i ->
        val t = (frame * n + i).toDouble() / AudioProcessor.SAMPLE_RATE
        (amplitude * 32767 * sin(2 * PI * 440 * t)).toInt().toShort()
    }

    private fun samples(frame: AudioProcessor.Frame): ShortArray = ShortArray(frame.pcm.size / 2) { i ->
        ((frame.pcm[2 * i].toInt() and 0xff) or (frame.pcm[2 * i + 1].toInt() shl 8)).toShort()
    }

    private fun rms(s: ShortArray): Double = sqrt(s.sumOf { (it / 32768.0) * (it / 32768.0) } / s.size)

    /** The last of a few frames, once the limiter and its look-ahead have settled. */
    private fun settled(p: AudioProcessor, amplitude: Double): AudioProcessor.Frame {
        var last: AudioProcessor.Frame? = null
        for (f in 0 until 5) last = p.process(sine(amplitude, f))
        return last!!
    }

    @Test
    fun theCurveIsTheOneThePageConfigures() {
        assertEquals(-20f, AudioProcessor.curveDb(-20f), 1e-4f)
        assertEquals(-5f, AudioProcessor.curveDb(6f), 1e-4f) // -6 + 12 / 12
        // Web Audio adds (1 / curve(0 dB)) ^ 0.6 on its own: 3.3 dB here.
        assertEquals(1.462f, AudioProcessor.MAKEUP, 0.002f)
    }

    @Test
    fun silenceStaysSilent() {
        val frame = AudioProcessor(room = true).process(ShortArray(n))
        assertEquals(n * 2, frame.pcm.size)
        assertTrue(frame.pcm.all { it == 0.toByte() })
        assertEquals(0f, frame.rms, 0f)
        assertEquals(0f, frame.clipRatio, 0f)
    }

    @Test
    fun quietSpeechIsMadeUpButNotLimited() {
        val out = samples(settled(AudioProcessor(room = false), 0.1))
        assertEquals(0.1 / sqrt(2.0) * AudioProcessor.MAKEUP, rms(out), 0.004)
    }

    @Test
    fun roomModeIsFourTimesLouder() {
        val standard = rms(samples(settled(AudioProcessor(room = false), 0.05)))
        val room = rms(samples(settled(AudioProcessor(room = true), 0.05)))
        assertEquals(4.0, room / standard, 0.05)
    }

    @Test
    fun aLoudRoomIsRoundedOffRatherThanClipped() {
        val p = AudioProcessor(room = true)
        p.process(sine(0.9, 0)) // the first peaks arrive before the limiter has caught up
        for (f in 1 until 6) {
            val frame = p.process(sine(0.9, f))
            assertEquals("frame $f clipped", 0f, frame.clipRatio, 0f)
            val peak = samples(frame).maxOf { abs(it.toInt()) }
            assertTrue("frame $f squashed to $peak", peak in 22_000..32_767)
        }
    }

    @Test
    fun aSampleAtTheRailIsReportedAsClippedOnce() {
        val input = ShortArray(n) { if (it % 10 == 0) Short.MAX_VALUE else 0 }
        val p = AudioProcessor(room = false)
        p.process(input) // fills the look-ahead
        // Once each: at the rail on the way in and over 1.0 on the way out is still one sample.
        assertEquals(0.1f, p.process(input).clipRatio, 1e-6f)
    }

    @Test
    fun theMeterReadsWhatIsSent() {
        val frame = settled(AudioProcessor(room = false), 0.2)
        assertEquals(rms(samples(frame)), frame.rms.toDouble(), 0.01)
    }
}
