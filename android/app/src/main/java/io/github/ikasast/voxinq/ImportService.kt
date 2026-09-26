package io.github.ikasast.voxinq

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.util.Log
import android.webkit.CookieManager
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okio.BufferedSink
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Sending a shared recording to the server, as a foreground service.
 *
 * A service rather than the activity that received the share, because an hour of audio over a
 * phone's uplink takes longer than anybody will keep looking at a screen for, and because the
 * person who shared the file was in another app and should be returned to it.
 *
 * What it does *not* do is wait for the transcript. The recognition is asked for and left to
 * the server's queue, which is the only thing that can see the GPU's other work — and which
 * finishes whether or not this phone is still awake. So the service's job is over in the time
 * the upload takes, and the notification it leaves behind is a way back to the meeting.
 */
class ImportService : Service() {
    companion object {
        const val ACTION_IMPORT = "io.github.ikasast.voxinq.action.IMPORT"
        private const val EXTRA_TITLE = "title"
        private const val EXTRA_BYTES = "bytes"

        private const val CHANNEL = "import"
        private const val NOTIFICATION = 2
        /**
         * Each finished import keeps its own notice, so the second does not replace the first.
         * Clear of the reminders' range (1000 plus a 16-bit hash), so neither replaces the other.
         */
        private const val DONE_BASE = 100_000
        private const val TAG = "VoxinqImport"

        /** How often the progress notification is allowed to move. */
        private const val PROGRESS_EVERY_MS = 500L

        fun start(context: Context, uri: Uri, title: String, bytes: Long) {
            ContextCompat.startForegroundService(
                context,
                Intent(context, ImportService::class.java)
                    .setAction(ACTION_IMPORT)
                    // The file is named in `data`, not in an extra, and the flag comes with it:
                    // that is how the read permission the share arrived with is passed on, and
                    // it then lasts as long as this service does. An extra would arrive without
                    // it, and the activity that could open the file will be gone by then.
                    .setData(uri)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    .putExtra(EXTRA_TITLE, title)
                    .putExtra(EXTRA_BYTES, bytes),
            )
        }
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val http by lazy {
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            // An upload is as long as it is; the server's own reply comes quickly once it ends.
            .writeTimeout(0, TimeUnit.SECONDS)
            .readTimeout(120, TimeUnit.SECONDS)
            .build()
    }

    /** One shared file, as it arrived. */
    private data class Pending(val uri: Uri, val title: String, val bytes: Long)

    /**
     * Shares waiting their turn, oldest first.
     *
     * One at a time, because a day of recordings is shared one after another -- the next while
     * the last is still uploading -- and they used to run side by side: whichever finished first
     * stopped the service, which cancelled the other halfway through its upload and left its
     * meeting empty on the server, with nothing on the phone to say so.
     *
     * Touched only on the main thread: onStartCommand runs there, and so does the loop between
     * its uploads, and the upload's progress is handed back there to be shown -- so "nothing
     * left, so stop" cannot miss one that has just arrived.
     */
    private val waiting = ArrayDeque<Pending>()
    private var worker: Job? = null
    private var current: Pending? = null

    /** The newest start, so stopping does not throw away one the system has already sent. */
    private var lastStart = 0

    /** Where the import under way has got to, before the queue is added to it. */
    private var stage = ""

    /** How far through, or -1 for not known. */
    private var percent = -1

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        lastStart = startId
        if (intent?.action != ACTION_IMPORT) {
            stopIfIdle()
            return START_NOT_STICKY
        }
        val title = intent.getStringExtra(EXTRA_TITLE).orEmpty().ifBlank { getString(R.string.import_untitled) }
        val uri = intent.data
        if (uri == null || ServerAddress.load(this) == null) {
            goForeground(ongoing(current?.title ?: title))
            tell(title, getString(R.string.import_failed, getString(R.string.import_no_server)), null)
            stopIfIdle()
            return START_NOT_STICKY
        }
        val job = Pending(uri, title, intent.getLongExtra(EXTRA_BYTES, 0L))
        if (worker?.isActive == true) {
            waiting.addLast(job)
            // A foreground start is answered with a notification even when one is showing: the
            // same one, now saying how many are waiting behind it. Only this one call, too --
            // a second update straight after it can overtake it and be undone by it.
            goForeground(ongoing(current?.title ?: title))
        } else {
            begin()
            goForeground(ongoing(title))
            waiting.addLast(job)
            // Dispatched rather than run on the spot, so `worker` is set before the loop can end.
            worker = scope.launch(Dispatchers.Main) { drain() }
        }
        return START_NOT_STICKY
    }

    private suspend fun drain() {
        while (true) {
            val next = waiting.removeFirstOrNull() ?: break
            current = next
            begin()
            show()
            val origin = ServerAddress.load(this)
            if (origin == null) {
                tell(next.title, getString(R.string.import_failed, getString(R.string.import_no_server)), null)
            } else {
                run(origin, next)
            }
        }
        current = null
        worker = null
        stopIfIdle()
    }

    private fun stopIfIdle() {
        if (worker?.isActive == true || waiting.isNotEmpty()) return
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        // A share sent after this start but not yet delivered keeps the service alive: its
        // onStartCommand is still on the way, and brings the notification back with it.
        stopSelf(lastStart)
    }

    private suspend fun run(origin: String, job: Pending) {
        var meetingId: String? = null
        try {
            val cookie = CookieManager.getInstance().getCookie(origin)
            withContext(Dispatchers.IO) {
                val id = createMeeting(origin, cookie, job.title)
                meetingId = id
                upload(origin, cookie, id, job.uri, job.bytes)
                // The meeting is over — it happened before the file existed. This is also what
                // reads the recording's length back and winds the start time to match it.
                post(origin, cookie, "/api/meetings/$id/end", "{}")
                // Recognition is a queued job from here on. Nothing else to wait for.
                post(origin, cookie, "/api/meetings/$id/transcribe", "{}")
            }
            tell(job.title, getString(R.string.import_queued), meetingId)
        } catch (e: Exception) {
            // The service going away is not the import failing; there is nothing left to tell.
            if (e is CancellationException) throw e
            Log.w(TAG, "import", e)
            // A meeting with nothing in it is litter, and the next attempt will make another.
            // It goes to the trash rather than for good, in case the upload did land.
            meetingId?.let { id ->
                withContext(Dispatchers.IO) {
                    runCatching { discard(origin, CookieManager.getInstance().getCookie(origin), id) }
                }
            }
            tell(job.title, getString(R.string.import_failed, e.message ?: e.javaClass.simpleName), null)
        }
    }

    // ---- The four calls ----

    private fun createMeeting(origin: String, cookie: String?, title: String): String {
        val body = JSONObject().put("title", title).toString()
        val answer = post(origin, cookie, "/api/meetings", body)
        return JSONObject(answer).stringOrNull("id") ?: throw IOException("the server did not name the meeting")
    }

    private fun upload(origin: String, cookie: String?, id: String, uri: Uri, bytes: Long) {
        val request = request(origin, cookie, "/api/meetings/$id/recording")
            .post(fileBody(uri, bytes))
            .build()
        http.newCall(request).execute().use { res ->
            val text = res.body?.string().orEmpty()
            if (!res.isSuccessful) throw IOException(detail(text) ?: "HTTP ${res.code}")
        }
    }

    /**
     * The file, read straight out of the sharing app as it goes.
     *
     * Opened inside `writeTo`, so a connection that fails on its first attempt can be retried:
     * the second attempt gets a fresh stream rather than an exhausted one.
     */
    private fun fileBody(uri: Uri, bytes: Long): RequestBody = object : RequestBody() {
        override fun contentType() = "application/octet-stream".toMediaType()

        override fun contentLength() = if (bytes > 0) bytes else -1

        override fun writeTo(sink: BufferedSink) {
            val input = contentResolver.openInputStream(uri)
                ?: throw IOException("could not open the shared file")
            input.use {
                val buffer = ByteArray(64 * 1024)
                var sent = 0L
                var shown = 0L
                while (true) {
                    val read = it.read(buffer)
                    if (read <= 0) break
                    sink.write(buffer, 0, read)
                    sent += read
                    val now = System.currentTimeMillis()
                    if (now - shown >= PROGRESS_EVERY_MS) {
                        shown = now
                        progress(sent, bytes)
                    }
                }
            }
        }
    }

    private fun post(origin: String, cookie: String?, path: String, body: String): String {
        val request = request(origin, cookie, path)
            .post(body.toRequestBody("application/json".toMediaType()))
            .build()
        http.newCall(request).execute().use { res ->
            val text = res.body?.string().orEmpty()
            if (!res.isSuccessful) throw IOException(detail(text) ?: "HTTP ${res.code}")
            return text
        }
    }

    private fun discard(origin: String, cookie: String?, id: String) {
        val request = request(origin, cookie, "/api/meetings/$id").delete().build()
        http.newCall(request).execute().close()
    }

    private fun request(origin: String, cookie: String?, path: String): Request.Builder {
        val builder = Request.Builder()
            .url("$origin$path")
            .header("Accept", "application/json")
            .header("User-Agent", "VoxinqAndroid/${BuildConfig.VERSION_NAME} (Android ${Build.VERSION.RELEASE})")
        cookie?.let { builder.header("Cookie", it) }
        return builder
    }

    /** The server's own sentence, which is the part the person can act on. */
    private fun detail(text: String): String? = try {
        JSONObject(text).let { it.stringOrNull("error") ?: it.stringOrNull("detail") }
    } catch (_: Exception) {
        null
    }

    // ---- What the person sees ----

    /** From the upload's own thread; shown from the main one, where the queue lives. */
    private fun progress(sent: Long, total: Long) {
        val sentLabel = if (total > 0) {
            "${Import.sizeLabel(sent)} / ${Import.sizeLabel(total)}"
        } else {
            Import.sizeLabel(sent)
        }
        val done = if (total > 0) ((sent * 100) / total).toInt().coerceIn(0, 100) else -1
        scope.launch {
            stage = getString(R.string.import_sending, sentLabel)
            percent = done
            show()
        }
    }

    private fun begin() {
        stage = getString(R.string.import_preparing)
        percent = -1
    }

    private fun show() {
        val title = current?.title ?: return
        notify(NOTIFICATION, ongoing(title))
    }

    /** The notice for the import under way, with how many are waiting behind it. */
    private fun ongoing(title: String): Notification {
        val stage = stage.ifEmpty { getString(R.string.import_preparing) }
        val text = if (waiting.isEmpty()) stage else stage + " · " + getString(R.string.import_waiting, waiting.size)
        return building(title, text, null).setProgress(100, percent.coerceAtLeast(0), percent < 0).build()
    }

    /**
     * How one import ended, in a notice of its own that outlives the service. Keyed by the meeting
     * when there is one -- so it opens that meeting -- and by the moment when there is not.
     */
    private fun tell(title: String, text: String, meetingId: String?) {
        val key = (meetingId ?: (title + System.nanoTime())).hashCode() and 0xffff
        notify(DONE_BASE + key, building(title, text, meetingId).setAutoCancel(true).build())
    }

    private fun goForeground(notification: Notification) {
        channel()
        try {
            ServiceCompat.startForeground(
                this,
                NOTIFICATION,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
            )
        } catch (e: Exception) {
            Log.w(TAG, "startForeground", e)
        }
    }

    private fun channel() {
        NotificationManagerCompat.from(this).createNotificationChannel(
            NotificationChannelCompat.Builder(CHANNEL, NotificationManagerCompat.IMPORTANCE_LOW)
                .setName(getString(R.string.channel_import))
                .setDescription(getString(R.string.channel_import_description))
                .setShowBadge(false)
                .build(),
        )
    }

    private fun building(title: String, text: String, meetingId: String?): NotificationCompat.Builder {
        val builder = NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_recording)
            .setContentTitle(title)
            .setContentText(text)
            .setSilent(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
        if (meetingId != null) builder.setContentIntent(openMeeting(meetingId))
        return builder
    }

    private fun openMeeting(meetingId: String): PendingIntent = PendingIntent.getActivity(
        this,
        meetingId.hashCode(),
        Intent(this, MainActivity::class.java)
            .setAction(MainActivity.ACTION_OPEN_MEETING)
            .putExtra(MainActivity.EXTRA_MEETING, meetingId)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    @SuppressLint("MissingPermission") // checked here
    private fun notify(id: Int, notification: Notification) {
        val allowed = Build.VERSION.SDK_INT < 33 ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        if (allowed) NotificationManagerCompat.from(this).notify(id, notification)
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }
}
