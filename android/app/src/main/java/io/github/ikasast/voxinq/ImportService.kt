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
import kotlinx.coroutines.Dispatchers
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
        private const val DONE_NOTIFICATION = 3
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

    private var title = ""

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action != ACTION_IMPORT) {
            stopSelf()
            return START_NOT_STICKY
        }
        val uri = intent.data
        val bytes = intent.getLongExtra(EXTRA_BYTES, 0L)
        title = intent.getStringExtra(EXTRA_TITLE).orEmpty().ifBlank { getString(R.string.import_untitled) }
        goForeground()
        val origin = ServerAddress.load(this)
        if (uri == null || origin == null) {
            finish(getString(R.string.import_failed, getString(R.string.import_no_server)))
            return START_NOT_STICKY
        }
        scope.launch { run(origin, uri, bytes) }
        return START_NOT_STICKY
    }

    private suspend fun run(origin: String, uri: Uri, bytes: Long) {
        var meetingId: String? = null
        try {
            val cookie = CookieManager.getInstance().getCookie(origin)
            withContext(Dispatchers.IO) {
                val id = createMeeting(origin, cookie)
                meetingId = id
                upload(origin, cookie, id, uri, bytes)
                // The meeting is over — it happened before the file existed. This is also what
                // reads the recording's length back and winds the start time to match it.
                post(origin, cookie, "/api/meetings/$id/end", "{}")
                // Recognition is a queued job from here on. Nothing else to wait for.
                post(origin, cookie, "/api/meetings/$id/transcribe", "{}")
            }
            done(meetingId!!)
        } catch (e: Exception) {
            Log.w(TAG, "import", e)
            // A meeting with nothing in it is litter, and the next attempt will make another.
            // It goes to the trash rather than for good, in case the upload did land.
            meetingId?.let { id ->
                withContext(Dispatchers.IO) {
                    runCatching { discard(origin, CookieManager.getInstance().getCookie(origin), id) }
                }
            }
            finish(getString(R.string.import_failed, e.message ?: e.javaClass.simpleName))
        }
    }

    // ---- The four calls ----

    private fun createMeeting(origin: String, cookie: String?): String {
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

    private fun progress(sent: Long, total: Long) {
        val sentLabel = if (total > 0) {
            "${Import.sizeLabel(sent)} / ${Import.sizeLabel(total)}"
        } else {
            Import.sizeLabel(sent)
        }
        val percent = if (total > 0) ((sent * 100) / total).toInt().coerceIn(0, 100) else 0
        notify(NOTIFICATION, building(getString(R.string.import_sending, sentLabel), null).apply {
            setProgress(100, percent, total <= 0)
        }.build())
    }

    private fun done(meetingId: String) {
        notify(
            DONE_NOTIFICATION,
            building(getString(R.string.import_queued), meetingId)
                .setAutoCancel(true)
                .build(),
        )
        finish(null)
    }

    /** The end of the service either way: the message, if there is one, outlives it. */
    private fun finish(message: String?) {
        if (message != null) {
            notify(DONE_NOTIFICATION, building(message, null).setAutoCancel(true).build())
        }
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun goForeground() {
        channel()
        try {
            ServiceCompat.startForeground(
                this,
                NOTIFICATION,
                building(getString(R.string.import_preparing), null).setProgress(0, 0, true).build(),
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

    private fun building(text: String, meetingId: String?): NotificationCompat.Builder {
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
