package io.github.ikasast.voxinq

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Process
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString.Companion.toByteString
import org.json.JSONObject
import java.io.IOException
import java.net.URLEncoder

/**
 * One recording: the microphone, the connection to the transcription service, and the saving of
 * each line.
 *
 * This is what the recording page does in JavaScript — lib/stt/client.ts, and the page's
 * saveTranscript — moved to where the screen going off cannot stop it. It speaks the same
 * protocol, message for message, so nothing on the server or the service has to know.
 */
class RecordingSession(
    private val config: RecorderConfig,
    private val client: OkHttpClient,
    /** Where the audio and the unsaved lines are written down. The file is the queue. */
    private val store: PendingStore,
    private val cookie: suspend () -> String?,
    private val userAgent: String,
    private val events: Events,
) {
    interface Events {
        fun status(status: String)
        fun partial(text: String)
        fun saved(id: String, speaker: String, text: String, createdAt: String, seq: Int?)
        fun translation(seq: Int, text: String, id: String)
        fun level(rms: Float, clipRatio: Float)
        fun problem(problem: Problem)
    }

    sealed interface Problem {
        /** The service's own words, as the page shows them. */
        data class Server(val message: String) : Problem
        data class SaveFailed(val detail: String) : Problem
        data class Microphone(val detail: String) : Problem
        data class Storage(val detail: String) : Problem

        /** Kept on the phone rather than lost: the next run sends it. */
        data class Unsent(val seconds: Int, val lines: Int) : Problem
        data object BacklogOverflow : Problem
    }

    companion object {
        /**
         * How much unsent audio is kept before the oldest goes: two hours at 16 kHz mono.
         *
         * The page keeps five minutes in memory. A phone has a disk, and the meeting it is
         * recording is the one thing it cannot be the reason for losing.
         */
        private const val MAX_PENDING_BYTES = 2L * 60 * 60 * 32_000

        /**
         * What OkHttp may hold before more is handed to it — four seconds of audio.
         *
         * Deliberately small. A socket that fails takes its queue with it, so this is also the
         * most audio that can be re-sent after a drop; past 16 MiB OkHttp abandons the
         * connection and takes everything queued with it.
         */
        private const val MAX_QUEUED_BYTES = 128L * 1024

        /** How much is handed over at a time while catching up. */
        private const val PUMP_BYTES = 32_000

        /** How long the end of a meeting waits for the last of its audio to go out. */
        private const val FLUSH_MS = 20_000L

        /** How often lines the web app could not be reached for are tried again. */
        private const val RETRY_SWEEP_MS = 60_000L

        private const val END_WAIT_MS = 10_000L
        private const val DRAIN_MS = 30_000L
        private val JSON = "application/json".toMediaType()
        private val DIARIZED = Regex("^speaker(\\d+)$")

        /** lib/stt/client.ts: "speaker0" is partner-0; anything else is the one speaker, self. */
        fun speakerKey(label: String?): String =
            DIARIZED.matchEntire(label ?: "")?.let { "partner-" + it.groupValues[1] } ?: "self"
    }

    // What the web app still has to be told, in the shape it is written down in: a line to
    // save (kept on disk until it lands) or a translation for one (not kept — it is a
    // nicety, and it needs a row id that only this run knows).

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val lock = Any()

    // Guarded by lock.
    private var socket: WebSocket? = null
    private var generation = 0
    private var connected = false // the start message has gone
    private var opened = false // the service said "open": its model is ready for audio
    private var stopped = false
    private var fatal = false
    private var retries = 0
    private var serverClosed: CompletableDeferred<Unit>? = null
    private var pump: kotlinx.coroutines.Job? = null
    private var sweep: kotlinx.coroutines.Job? = null

    /** Keys already on the way, so a retry sweep cannot save the same line twice. */
    private val inFlight = java.util.Collections.newSetFromMap(java.util.concurrent.ConcurrentHashMap<String, Boolean>())
    private var overflowReported = false

    @Volatile private var capturing = false
    @Volatile private var draining = false
    private var recorder: AudioRecord? = null
    private var captureThread: Thread? = null
    private val processor = AudioProcessor(config.room)

    private val work = Channel<JSONObject>(Channel.UNLIMITED)
    private var worker: kotlinx.coroutines.Job? = null

    /** Row ids by connection and utterance number: seq starts again on each connection. */
    private val rowIds = HashMap<Long, String>()

    /** The caller has checked RECORD_AUDIO. Throws when no microphone can be opened. */
    fun start() {
        val rec = openMicrophone()
        rec.startRecording()
        if (rec.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
            rec.release()
            throw IllegalStateException("the microphone did not start")
        }
        recorder = rec
        capturing = true
        captureThread = Thread({ capture(rec) }, "voxinq-capture").apply { start() }
        worker = scope.launch { for (w in work) perform(w) }
        pump = pumpAudio()
        sweep = retrySweep()
        // Lines a previous run recognised but never managed to save go first: they came before
        // anything this session will record, and the transcript is ordered by when it arrived.
        enqueuePending()
        synchronized(lock) { connectLocked() }
    }

    /**
     * As the page's stop: the rest of the audio and `end`, then up to ten seconds for the service
     * to say `closed` — it has transcribed the last segment and saved the recording — and then up
     * to thirty for the lines still being saved.
     */
    suspend fun stop() {
        capturing = false
        recorder?.let { runCatching { it.stop() } }
        withContext(Dispatchers.IO) { captureThread?.join(2_000) }
        recorder?.release()
        recorder = null

        // The tail of the meeting still has to go. The pump stops on its own once the file is
        // empty; a service that cannot be reached must not hold up the end of the meeting, so
        // there is a deadline, and what does not go stays on disk for the next run.
        val connectedNow = synchronized(lock) {
            stopped = true
            opened
        }
        // Only worth waiting for while there is a connection to send down. With none, the
        // audio is already written down and the meeting should not be held up for it.
        if (connectedNow) withTimeoutOrNull(FLUSH_MS) { pump?.join() }
        pump?.cancel()

        val closed = CompletableDeferred<Unit>()
        val ws: WebSocket?
        synchronized(lock) {
            serverClosed = closed
            ws = socket
            if (ws != null && connected) ws.send("{\"type\":\"end\"}") else closed.complete(Unit)
        }
        withTimeoutOrNull(END_WAIT_MS) { closed.await() }
        ws?.close(1000, null)

        sweep?.cancel()
        draining = true
        work.close()
        withTimeoutOrNull(DRAIN_MS) { worker?.join() }

        // What is still owed stays written down, and says so: it is not lost, it is late.
        val unsentSeconds = (store.unsentBytes() / 32_000).toInt()
        val unsavedLines = store.pending().size
        if (store.close()) events.problem(Problem.Unsent(unsentSeconds, unsavedLines))
        scope.cancel()
    }

    /**
     * Send what an earlier run left behind: the audio it never managed to hand over, and the
     * lines it recognised but never saved.
     *
     * No microphone — this is delivery, not recording. The service is sent the same `start`
     * message, so it appends to the meeting's recording exactly as a reconnect does, and
     * whatever it recognises is saved as any other line. It ends when nothing is owed, or when
     * the deadline passes and what is left stays written down for the run after this one.
     */
    suspend fun deliverLeftovers(deadlineMs: Long) {
        worker = scope.launch { for (w in work) perform(w) }
        sweep = retrySweep()
        enqueuePending()
        pump = pumpAudio()
        synchronized(lock) { connectLocked() }
        withTimeoutOrNull(deadlineMs) {
            while (store.unsentBytes() > 0 || store.pending().isNotEmpty()) delay(500)
        }
        stop()
    }

    /** What the page's "End only" does once its recording has stopped. */
    suspend fun endMeeting() {
        runCatching { call("POST", "/api/meetings/${config.meetingId}/end", "{}") }
        val id = URLEncoder.encode(config.meetingId, "UTF-8")
        runCatching { call("DELETE", "/api/queue/recording?meetingId=$id", null) }
    }

    // ---- The microphone ----

    @SuppressLint("MissingPermission") // checked by the service before a session exists
    private fun openMicrophone(): AudioRecord {
        val rate = AudioProcessor.SAMPLE_RATE
        val format = AudioFormat.Builder()
            .setSampleRate(rate)
            .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .build()
        val min = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        val size = maxOf(min, AudioProcessor.FRAME_SAMPLES * 2) * 4
        // Standard keeps the platform's echo cancellation and noise suppression, as the browser
        // does with them on; Room asks for the source meant for recognition, which has neither
        // (lib/stt/mic-constraints.ts). The plain microphone is the fallback for either.
        val sources = if (config.room) {
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

    private fun capture(rec: AudioRecord) {
        Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_AUDIO)
        val frame = ShortArray(AudioProcessor.FRAME_SAMPLES)
        while (capturing) {
            var filled = 0
            while (filled < frame.size && capturing) {
                val n = rec.read(frame, filled, frame.size - filled)
                if (n < 0) {
                    if (capturing) events.problem(Problem.Microphone("read error $n"))
                    capturing = false
                    break
                }
                filled += n
            }
            if (filled < frame.size) break
            val out = processor.process(frame)
            events.level(out.rms, out.clipRatio)
            if (!store.appendAudio(out.pcm)) {
                if (!overflowReported) {
                    overflowReported = true
                    events.problem(Problem.Storage("the phone would not write the audio down"))
                }
                continue
            }
            // Hours out of reach, or a full disk. The oldest goes, as it does in the page.
            if (store.trim(MAX_PENDING_BYTES) > 0 && !overflowReported) {
                overflowReported = true
                events.problem(Problem.BacklogOverflow)
            }
        }
    }

    /**
     * The one thing that sends audio: read from where the file left off, hand it over, mark it.
     *
     * Nothing is ever held in memory waiting for a connection, so "reconnected after twenty
     * minutes" is the same code path as "sending normally" — it just has more to catch up on.
     * The mark only moves once OkHttp has taken the bytes, and a connection that dies gives
     * its queue back (see `lost`), so a drop costs seconds re-sent rather than seconds lost.
     */
    private fun enqueuePending() {
        for (item in store.pending()) {
            val key = item.optString("key")
            if (key.isNotEmpty() && inFlight.add(key)) work.trySend(item)
        }
    }

    /**
     * Try again for the lines the web app could not be reached for.
     *
     * Their own retries give up after half a minute, which is right — a recording cannot spend
     * itself on one line. But the connection that failed then is usually back long before the
     * meeting ends, and a line that lands during the meeting is a line somebody can read.
     */
    private fun retrySweep() = scope.launch {
        while (true) {
            delay(RETRY_SWEEP_MS)
            if (synchronized(lock) { stopped }) return@launch
            enqueuePending()
        }
    }

    private fun pumpAudio() = scope.launch {
        while (true) {
            val ws = synchronized(lock) {
                if (stopped && store.unsentBytes() == 0L) return@launch
                if (fatal || !opened) null else socket
            }
            if (ws == null || ws.queueSize() >= MAX_QUEUED_BYTES) {
                delay(100)
                continue
            }
            val chunk = store.readNext(PUMP_BYTES)
            if (chunk == null) {
                delay(50)
                continue
            }
            if (ws.send(chunk.toByteString())) store.markSent(chunk.size) else delay(200)
        }
    }

    // ---- The transcription service ----

    private fun connectLocked() {
        val gen = ++generation
        connected = false
        opened = false
        events.status(if (retries > 0) "reconnecting" else "connecting")
        val request = Request.Builder()
            .url(config.wsUrl)
            // The service accepts the web app's origin (a *.ts.net name, a private address,
            // localhost), and this is the web app's recording, so it says so.
            .header("Origin", config.serverOrigin)
            .header("User-Agent", userAgent)
            .build()
        socket = client.newWebSocket(request, Listener(gen))
    }

    private inner class Listener(private val gen: Int) : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            synchronized(lock) {
                if (webSocket !== socket) return
                webSocket.send(config.startMessage())
                connected = true
            }
        }

        override fun onMessage(webSocket: WebSocket, text: String) = received(webSocket, gen, text)

        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
            webSocket.close(1000, null)
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) =
            lost(webSocket, if (reason.isEmpty()) "code=$code" else "code=$code reason=$reason")

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) =
            lost(webSocket, t.message ?: t.javaClass.simpleName)
    }

    private fun received(ws: WebSocket, gen: Int, text: String) {
        val msg = try {
            JSONObject(text)
        } catch (_: Exception) {
            return
        }
        when (msg.optString("type")) {
            "status" -> when (msg.optString("status")) {
                "open" -> {
                    synchronized(lock) {
                        if (ws !== socket) return
                        opened = true
                        retries = 0
                    }
                    events.status("open")
                }
                "closed" -> synchronized(lock) { serverClosed?.complete(Unit) }
                // "loading" keeps showing "connecting", as on the page.
            }
            // An empty partial clears the text being recognised; the service sends one when it
            // throws a segment away as noise.
            "partial" -> events.partial(msg.optString("text", ""))
            "final" -> {
                val line = msg.stringOrNull("text")?.trim()?.takeIf { it.isNotEmpty() } ?: return
                events.partial("")
                val seq = if (msg.has("seq")) msg.optInt("seq") else null
                val start = msg.optDouble("start", Double.NaN)
                val end = msg.optDouble("end", Double.NaN)
                val timed = !start.isNaN() && !end.isNaN()
                val item = JSONObject().apply {
                    put("kind", "save")
                    // Its own name on disk, so the same line is never saved twice.
                    put("key", "$gen:${seq ?: -1}:${Math.round(start * 1000)}")
                    put("gen", gen)
                    seq?.let { put("seq", it) }
                    put("speaker", speakerKey(msg.stringOrNull("speaker")))
                    put("text", line)
                    if (timed) {
                        put("startMs", Math.round(start * 1000))
                        put("endMs", Math.round(end * 1000))
                    }
                }
                // Written down before it is sent: a process the system kills between the two
                // would otherwise lose a line that was already recognised.
                store.addPending(item)
                if (inFlight.add(item.optString("key"))) work.trySend(item)
            }
            "translation" -> {
                val translated = msg.stringOrNull("text") ?: return
                if (msg.has("seq")) {
                    work.trySend(
                        JSONObject()
                            .put("kind", "translation")
                            .put("gen", gen)
                            .put("seq", msg.optInt("seq"))
                            .put("text", translated),
                    )
                }
            }
            "error" -> {
                synchronized(lock) { fatal = true }
                events.problem(Problem.Server(msg.optString("message")))
                events.status("error")
            }
        }
    }

    private fun lost(ws: WebSocket, @Suppress("UNUSED_PARAMETER") reason: String) {
        val attempt: Int
        synchronized(lock) {
            if (ws !== socket) return // an old connection's remains
            // Whatever OkHttp was still holding never left the phone.
            store.rewind(ws.queueSize())
            socket = null
            connected = false
            opened = false
            if (stopped) {
                serverClosed?.complete(Unit)
                return
            }
            if (fatal) return // the service said why; trying again would only say it again
            attempt = ++retries
        }
        events.status("reconnecting")
        scope.launch {
            // The page's two seconds for the first five tries. After that it keeps trying, more
            // slowly, rather than giving up as the page does: with the screen off there is nobody
            // to bring it back, and the audio is being kept meanwhile.
            delay(if (attempt <= 5) 2_000L else 5_000L)
            synchronized(lock) {
                if (!stopped && !fatal && socket == null) connectLocked()
            }
        }
    }

    // ---- Saving ----

    private suspend fun perform(item: JSONObject) {
        try {
            when (item.optString("kind")) {
                "save" -> save(item)
                "translation" -> translate(item)
            }
        } finally {
            inFlight.remove(item.optString("key"))
        }
    }

    private fun rowKey(gen: Int, seq: Int): Long = (gen.toLong() shl 32) or (seq.toLong() and 0xffffffffL)

    private suspend fun save(item: JSONObject) {
        val seq = if (item.has("seq")) item.optInt("seq") else null
        val speaker = item.optString("speaker").ifEmpty { "self" }
        val text = item.optString("text")
        if (text.isBlank()) {
            store.removePending(item.optString("key"))
            return
        }
        val body = JSONObject().apply {
            put("meetingId", config.meetingId)
            put("speakerType", speaker)
            put("text", text)
            if (item.has("startMs")) put("audioStartMs", item.optLong("startMs"))
            if (item.has("endMs")) put("audioEndMs", item.optLong("endMs"))
        }.toString()

        when (val outcome = withRetries { call("POST", "/api/transcripts", body) }) {
            is Outcome.Ok -> {
                store.removePending(item.optString("key"))
                val row = runCatching { JSONObject(outcome.body) }.getOrNull() ?: return
                val id = row.stringOrNull("id") ?: return
                if (seq != null) rowIds[rowKey(item.optInt("gen"), seq)] = id
                events.saved(id, speaker, text, row.optString("createdAt"), seq)
            }
            // The server said no, and will say no again. Keeping it would mean asking on every
            // run from now on.
            Outcome.Refused -> store.removePending(item.optString("key"))
            // Out of reach. It stays written down, and the next run sends it.
            Outcome.Unreachable -> Unit
        }
    }

    /** A translation lands after its line, and is saved onto that line's row. */
    private suspend fun translate(item: JSONObject) {
        val seq = item.optInt("seq")
        val text = item.optString("text")
        val id = rowIds[rowKey(item.optInt("gen"), seq)] ?: return // its line was never saved
        withRetries(attempts = 3) {
            call("PATCH", "/api/transcripts/$id", JSONObject().put("translation", text).toString())
        }
        events.translation(seq, text, id)
    }

    private class Refused(val code: Int) : Exception("HTTP $code")

    /**
     * How a request ended, because the three endings mean different things to a line waiting on
     * disk: landed (let it go), refused (it will be refused again, so let it go anyway), or out
     * of reach (keep it — the next run sends it).
     */
    private sealed interface Outcome {
        data class Ok(val body: String) : Outcome
        data object Refused : Outcome
        data object Unreachable : Outcome
    }

    /**
     * Tried again while the network is the problem — a phone on Wi-Fi drops requests — but not
     * when the server has answered no, and only briefly once the recording is ending.
     */
    private suspend fun withRetries(attempts: Int = 6, block: suspend () -> String): Outcome {
        var last = "network"
        for (i in 0 until attempts) {
            try {
                return Outcome.Ok(block())
            } catch (e: Refused) {
                events.problem(Problem.SaveFailed(e.message ?: "HTTP ${e.code}"))
                return Outcome.Refused
            } catch (e: IOException) {
                last = e.message ?: e.javaClass.simpleName
            }
            if (i == attempts - 1 || (draining && i >= 2)) break
            delay(1_000L shl i.coerceAtMost(4))
        }
        events.problem(Problem.SaveFailed(last))
        return Outcome.Unreachable
    }

    /** The web app, as the signed-in page: its session cookie goes with every request. */
    private suspend fun call(method: String, path: String, body: String?): String {
        val builder = Request.Builder()
            .url(config.serverOrigin + path)
            .header("User-Agent", userAgent)
            .method(method, body?.toRequestBody(JSON))
        cookie()?.let { builder.header("Cookie", it) }
        return withContext(Dispatchers.IO) {
            client.newCall(builder.build()).execute().use { r ->
                val text = r.body?.string() ?: ""
                when {
                    r.isSuccessful -> text
                    r.code == 408 || r.code == 429 || r.code >= 500 -> throw IOException("HTTP ${r.code}")
                    else -> throw Refused(r.code)
                }
            }
        }
    }
}
