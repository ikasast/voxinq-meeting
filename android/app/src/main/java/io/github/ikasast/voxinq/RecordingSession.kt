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
import okio.ByteString
import okio.ByteString.Companion.toByteString
import org.json.JSONObject
import java.io.IOException
import java.net.URLEncoder
import java.util.ArrayDeque

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
        data object BacklogOverflow : Problem
    }

    companion object {
        /** 100 ms x 3000 = five minutes held while the service is out of reach, as the page does. */
        private const val MAX_BACKLOG = 3_000

        /** What OkHttp may queue before the audio is kept here instead. Past 16 MiB it gives up
         *  on the connection, and whatever it was holding goes with it. */
        private const val MAX_QUEUED_BYTES = 1L shl 20

        private const val END_WAIT_MS = 10_000L
        private const val DRAIN_MS = 30_000L
        private val JSON = "application/json".toMediaType()
        private val DIARIZED = Regex("^speaker(\\d+)$")

        /** lib/stt/client.ts: "speaker0" is partner-0; anything else is the one speaker, self. */
        fun speakerKey(label: String?): String =
            DIARIZED.matchEntire(label ?: "")?.let { "partner-" + it.groupValues[1] } ?: "self"
    }

    private sealed interface Work {
        data class Save(val gen: Int, val seq: Int?, val speaker: String, val text: String, val startMs: Long?, val endMs: Long?) : Work
        data class Translate(val gen: Int, val seq: Int, val text: String) : Work
    }

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
    private val backlog = ArrayDeque<ByteString>()
    private var overflowReported = false

    @Volatile private var capturing = false
    @Volatile private var draining = false
    private var recorder: AudioRecord? = null
    private var captureThread: Thread? = null
    private val processor = AudioProcessor(config.room)

    private val work = Channel<Work>(Channel.UNLIMITED)
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

        val closed = CompletableDeferred<Unit>()
        val ws: WebSocket?
        synchronized(lock) {
            stopped = true
            serverClosed = closed
            ws = socket
            if (ws != null && connected) {
                while (backlog.isNotEmpty()) {
                    if (!ws.send(backlog.removeFirst())) break
                }
                ws.send("{\"type\":\"end\"}")
            } else {
                closed.complete(Unit)
            }
        }
        withTimeoutOrNull(END_WAIT_MS) { closed.await() }
        ws?.close(1000, null)

        draining = true
        work.close()
        withTimeoutOrNull(DRAIN_MS) { worker?.join() }
        scope.cancel()
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
            deliver(out.pcm.toByteString())
        }
    }

    private fun deliver(chunk: ByteString) {
        synchronized(lock) {
            if (stopped || fatal) return
            val ws = socket
            if (opened && ws != null) {
                flushLocked(ws)
                if (backlog.isEmpty() && ws.queueSize() < MAX_QUEUED_BYTES && ws.send(chunk)) return
            }
            backlog.addLast(chunk)
            if (backlog.size > MAX_BACKLOG) {
                backlog.removeFirst()
                if (!overflowReported) {
                    overflowReported = true
                    events.problem(Problem.BacklogOverflow)
                }
            }
        }
    }

    private fun flushLocked(ws: WebSocket) {
        while (backlog.isNotEmpty() && ws.queueSize() < MAX_QUEUED_BYTES) {
            if (!ws.send(backlog.first())) return
            backlog.removeFirst()
        }
        if (backlog.isEmpty()) overflowReported = false
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
                        flushLocked(ws)
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
                work.trySend(
                    Work.Save(
                        gen, seq, speakerKey(msg.stringOrNull("speaker")), line,
                        if (timed) Math.round(start * 1000) else null,
                        if (timed) Math.round(end * 1000) else null,
                    ),
                )
            }
            "translation" -> {
                val translated = msg.stringOrNull("text") ?: return
                if (msg.has("seq")) work.trySend(Work.Translate(gen, msg.optInt("seq"), translated))
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

    private suspend fun perform(w: Work) {
        when (w) {
            is Work.Save -> save(w)
            is Work.Translate -> translate(w)
        }
    }

    private fun rowKey(gen: Int, seq: Int): Long = (gen.toLong() shl 32) or (seq.toLong() and 0xffffffffL)

    private suspend fun save(w: Work.Save) {
        val body = JSONObject().apply {
            put("meetingId", config.meetingId)
            put("speakerType", w.speaker)
            put("text", w.text)
            w.startMs?.let { put("audioStartMs", it) }
            w.endMs?.let { put("audioEndMs", it) }
        }.toString()
        val answer = withRetries { call("POST", "/api/transcripts", body) } ?: return
        val row = try {
            JSONObject(answer)
        } catch (_: Exception) {
            return
        }
        val id = row.stringOrNull("id") ?: return
        if (w.seq != null) rowIds[rowKey(w.gen, w.seq)] = id
        events.saved(id, w.speaker, w.text, row.optString("createdAt"), w.seq)
    }

    /** A translation lands after its line, and is saved onto that line's row. */
    private suspend fun translate(w: Work.Translate) {
        val id = rowIds[rowKey(w.gen, w.seq)] ?: return // its line was never saved
        withRetries(attempts = 3) {
            call("PATCH", "/api/transcripts/$id", JSONObject().put("translation", w.text).toString())
        }
        events.translation(w.seq, w.text, id)
    }

    private class Refused(val code: Int) : Exception("HTTP $code")

    /**
     * Tried again while the network is the problem — a phone on Wi-Fi drops requests — but not
     * when the server has answered no, and only briefly once the recording is ending.
     */
    private suspend fun withRetries(attempts: Int = 6, block: suspend () -> String): String? {
        var last = "network"
        for (i in 0 until attempts) {
            try {
                return block()
            } catch (e: Refused) {
                events.problem(Problem.SaveFailed(e.message ?: "HTTP ${e.code}"))
                return null
            } catch (e: IOException) {
                last = e.message ?: e.javaClass.simpleName
            }
            if (i == attempts - 1 || (draining && i >= 2)) break
            delay(1_000L shl i.coerceAtMost(4))
        }
        events.problem(Problem.SaveFailed(last))
        return null
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
