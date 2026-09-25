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
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
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
import okhttp3.OkHttpClient
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * The recording, held in a foreground service of type microphone: the one kind of work Android
 * leaves running with the screen off and another app in front. Its notification stays for as
 * long as it records, and its Stop ends the meeting without the app being open.
 */
class RecorderService : Service() {
    companion object {
        const val ACTION_START = "io.github.ikasast.voxinq.action.START"
        const val ACTION_STOP = "io.github.ikasast.voxinq.action.STOP"
        const val ACTION_END = "io.github.ikasast.voxinq.action.END"

        /** Deliver what an earlier run left behind. No microphone; see deliverLeftovers. */
        const val ACTION_DELIVER = "io.github.ikasast.voxinq.action.DELIVER"
        private const val EXTRA_CONFIG = "config"
        /** One directory per recording that still owes the server something. */
        const val PENDING_DIR = "pending"

        private const val CHANNEL = "recorder"
        private const val NOTIFICATION = 1
        private const val TAG = "VoxinqRecorder"

        /** How long delivery of one leftover recording is given before it is left for later. */
        private const val DELIVER_DEADLINE_MS = 10 * 60 * 1000L

        /** From the visible page: Android only lets a microphone service start from there. */
        fun start(context: Context, config: RecorderConfig) {
            val intent = Intent(context, RecorderService::class.java)
                .setAction(ACTION_START)
                .putExtra(EXTRA_CONFIG, config.toJson())
            ContextCompat.startForegroundService(context, intent)
        }

        /**
         * Send anything a killed or disconnected run left on the phone.
         *
         * Called when the app comes to the front, which is the one moment a service is allowed
         * to be started and the network is likely to be the user's own again.
         */
        fun deliverLeftovers(context: Context) {
            if (PendingStore.leftovers(File(context.filesDir, PENDING_DIR)).isEmpty()) return
            ContextCompat.startForegroundService(
                context,
                Intent(context, RecorderService::class.java).setAction(ACTION_DELIVER),
            )
        }

        /** The page's Stop: the recording ends, the meeting does not — the page does that. */
        fun stop(context: Context) {
            context.startService(Intent(context, RecorderService::class.java).setAction(ACTION_STOP))
        }
    }

    private val main = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val http by lazy {
        OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            // A connection that died quietly — Wi-Fi gone with the screen off — shows up within
            // a ping or two instead of never.
            .pingInterval(20, TimeUnit.SECONDS)
            .build()
    }

    private var session: RecordingSession? = null
    private var config: RecorderConfig? = null
    private var status = "connecting"
    private var startedAt = 0L
    private var stopping = false
    private var delivering = false
    private var deliverJob: kotlinx.coroutines.Job? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null

    private fun userAgent() =
        "VoxinqAndroid/${BuildConfig.VERSION_NAME} (Android ${Build.VERSION.RELEASE})"

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> begin(RecorderConfig.fromJson(intent.getStringExtra(EXTRA_CONFIG)))
            ACTION_STOP -> finish(endMeeting = false)
            ACTION_END -> finish(endMeeting = true)
            ACTION_DELIVER -> deliver()
            else -> if (session == null) stopSelf()
        }
        return START_NOT_STICKY
    }

    private fun begin(requested: RecorderConfig?) {
        // A recording owns its meeting's queue. Delivery of what earlier runs left can wait —
        // it is picked up again the next time the app comes to the front.
        deliverJob?.cancel()
        delivering = false

        // A foreground start has to be answered with a notification, even one that is refused.
        goForeground(config ?: requested)
        val running = config
        if (running != null) {
            // The page came back — reloaded, or opened from the notification. Carry on.
            if (requested?.meetingId == running.meetingId) {
                RecorderBus.post(message("status", "status" to status))
            } else {
                RecorderBus.post(message("error", "message" to getString(R.string.another_recording)))
            }
            return
        }
        if (requested == null) {
            stopEverything()
            return
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            refuse(getString(R.string.mic_permission_denied))
            return
        }

        config = requested
        status = "connecting"
        stopping = false
        startedAt = System.currentTimeMillis()
        RecorderBus.update { RecorderBus.State(true, requested.meetingId, status, startedAt) }
        goForeground(requested)
        holdLocks()

        val origin = requested.serverOrigin
        // Where this recording's audio and unsaved lines are written down, named after the
        // meeting so a run that is killed can be found again.
        val store = PendingStore(File(File(filesDir, PENDING_DIR), requested.meetingId))
        store.open()
        store.writeMeta(JSONObject(requested.toJson()).put("startedAt", startedAt))
        val s = RecordingSession(
            config = requested,
            client = http,
            store = store,
            cookie = { withContext(Dispatchers.Main) { CookieManager.getInstance().getCookie(origin) } },
            userAgent = userAgent(),
            events = Events(),
        )
        try {
            s.start()
        } catch (e: Exception) {
            Log.w(TAG, "microphone", e)
            config = null
            RecorderBus.update { RecorderBus.State() }
            refuse(getString(R.string.mic_failed, e.message ?: e.javaClass.simpleName))
            return
        }
        session = s
    }

    /**
     * Hand over what earlier runs could not.
     *
     * Each leftover recording is opened, sent the same `start` message a reconnect sends — so
     * the service appends to that meeting's recording — and emptied. A recording in progress
     * owns its own queue, so this stands aside for one.
     */
    private fun deliver() {
        if (session != null || delivering) return
        val waiting = PendingStore.leftovers(File(filesDir, PENDING_DIR))
        if (waiting.isEmpty()) {
            stopEverything()
            return
        }
        delivering = true
        goForeground(null, delivering = true)
        deliverJob = main.launch {
            for (store in waiting) {
                if (session != null) break // a recording started; the rest waits for next time
                store.open()
                val cfg = RecorderConfig.fromJson(store.meta()?.toString())
                if (cfg == null) {
                    // Nothing here can ever be delivered; keeping it would mean trying forever.
                    Log.w(TAG, "discarding a leftover recording with no readable details")
                    store.discard()
                    continue
                }
                val s = RecordingSession(
                    config = cfg,
                    client = http,
                    store = store,
                    cookie = { withContext(Dispatchers.Main) { CookieManager.getInstance().getCookie(cfg.serverOrigin) } },
                    userAgent = userAgent(),
                    events = Events(),
                )
                try {
                    withContext(Dispatchers.IO) {
                        runCatching { s.deliverLeftovers(DELIVER_DEADLINE_MS) }
                            .onFailure { Log.w(TAG, "delivering leftovers", it) }
                    }
                } finally {
                    // Also the way out when a recording cancels this: the file handle is closed
                    // and what is still owed stays written down.
                    store.close()
                }
            }
            delivering = false
            stopEverything()
        }
    }

    private fun refuse(reason: String) {
        RecorderBus.post(message("error", "message" to reason))
        RecorderBus.post(message("status", "status" to "error"))
        stopEverything()
    }

    private fun finish(endMeeting: Boolean) {
        val s = session
        val cfg = config
        if (s == null || cfg == null) {
            RecorderBus.post(message("stopped"))
            stopEverything()
            return
        }
        if (stopping) return
        stopping = true
        status = "saving"
        showStatus()
        main.launch {
            withContext(Dispatchers.IO) {
                s.stop()
                if (endMeeting) s.endMeeting()
            }
            session = null
            config = null
            RecorderBus.update { RecorderBus.State() }
            RecorderBus.post(message("status", "status" to "closed"))
            RecorderBus.post(message(if (endMeeting) "ended" else "stopped", "meetingId" to cfg.meetingId))
            stopEverything()
        }
    }

    private fun stopEverything() {
        releaseLocks()
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        // Stopped by something other than the two Stops. Nothing can be saved any more, but the
        // microphone must not be left open.
        session?.let { s -> CoroutineScope(Dispatchers.IO).launch { s.stop() } }
        session = null
        config = null
        RecorderBus.update { RecorderBus.State() }
        releaseLocks()
        main.cancel()
        super.onDestroy()
    }

    private inner class Events : RecordingSession.Events {
        override fun status(status: String) {
            main.launch {
                if (!stopping) this@RecorderService.status = status
                RecorderBus.update { it.copy(status = status) }
                showStatus()
            }
            RecorderBus.post(message("status", "status" to status))
        }

        override fun partial(text: String) = RecorderBus.post(message("partial", "text" to text), live = true)

        override fun saved(id: String, speaker: String, text: String, createdAt: String, seq: Int?) =
            RecorderBus.post(
                message("saved", "id" to id, "speaker" to speaker, "text" to text, "createdAt" to createdAt, "seq" to seq),
            )

        override fun translation(seq: Int, text: String, id: String) =
            RecorderBus.post(message("translation", "seq" to seq, "text" to text, "id" to id))

        override fun level(rms: Float, clipRatio: Float) {
            RecorderBus.post(message("level", "rms" to rms.toDouble()), live = true)
            if (clipRatio > 0.001f) RecorderBus.post(message("clipping", "ratio" to clipRatio.toDouble()), live = true)
        }

        override fun problem(problem: RecordingSession.Problem) {
            val text = when (problem) {
                is RecordingSession.Problem.Server -> problem.message
                is RecordingSession.Problem.SaveFailed -> getString(R.string.save_failed, problem.detail)
                is RecordingSession.Problem.Microphone -> getString(R.string.mic_failed, problem.detail)
                RecordingSession.Problem.BacklogOverflow -> getString(R.string.backlog_overflow)
                is RecordingSession.Problem.Storage -> getString(R.string.storage_failed, problem.detail)
                is RecordingSession.Problem.Unsent ->
                    getString(R.string.unsent_kept, problem.seconds, problem.lines)
            }
            RecorderBus.post(message("error", "message" to text))
        }
    }

    // ---- The notification ----

    private fun goForeground(cfg: RecorderConfig?, delivering: Boolean = false) {
        // Default importance, but silent. A low-importance channel files the notification under
        // "Silent", collapsed, where its Stop is a tap further away than it should be.
        NotificationManagerCompat.from(this).createNotificationChannel(
            NotificationChannelCompat.Builder(CHANNEL, NotificationManagerCompat.IMPORTANCE_DEFAULT)
                .setName(getString(R.string.channel_recording))
                .setDescription(getString(R.string.channel_recording_description))
                .setSound(null, null)
                .setVibrationEnabled(false)
                .setShowBadge(false)
                .build(),
        )
        try {
            // Delivery holds no microphone — it is only sending what is already recorded — so
            // it runs as a data-sync service. Claiming the microphone type without one is how
            // an app gets its microphone access taken away.
            ServiceCompat.startForeground(
                this,
                NOTIFICATION,
                notification(cfg, delivering),
                if (delivering) ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
                else ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE,
            )
        } catch (e: Exception) {
            Log.w(TAG, "startForeground", e)
        }
    }

    @SuppressLint("MissingPermission") // checked just above the call
    private fun showStatus() {
        val cfg = config ?: return
        val allowed = Build.VERSION.SDK_INT < 33 ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        if (allowed) NotificationManagerCompat.from(this).notify(NOTIFICATION, notification(cfg))
    }

    private fun notification(cfg: RecorderConfig?, delivering: Boolean = false): Notification {
        val open = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java)
                .setAction(MainActivity.ACTION_OPEN_RECORDING)
                .putExtra(MainActivity.EXTRA_MEETING, cfg?.meetingId)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val title = when {
            delivering -> getString(R.string.app_name)
            cfg?.title != null -> getString(R.string.notification_title, cfg.title)
            else -> getString(R.string.notification_title_untitled)
        }
        val text = if (delivering) getString(R.string.sending_leftovers) else getString(
            when (status) {
                "open" -> R.string.status_open
                "reconnecting" -> R.string.status_reconnecting
                "error" -> R.string.status_error
                "saving" -> R.string.status_saving
                else -> R.string.status_connecting
            },
        )
        val builder = NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_recording)
            .setContentTitle(title)
            .setContentText(text)
            .setContentIntent(open)
            .setOngoing(true)
            .setSilent(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
        if (startedAt > 0 && !delivering) {
            builder.setWhen(startedAt).setShowWhen(true).setUsesChronometer(true)
        }
        if (!stopping && cfg != null) {
            val stop = PendingIntent.getService(
                this, 1, Intent(this, RecorderService::class.java).setAction(ACTION_END), PendingIntent.FLAG_IMMUTABLE,
            )
            builder.addAction(0, getString(R.string.action_stop), stop)
        }
        return builder.build()
    }

    // ---- Staying awake ----

    private fun holdLocks() {
        val power = getSystemService(POWER_SERVICE) as PowerManager
        wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "voxinq:recording").apply {
            setReferenceCounted(false)
            acquire(8 * 60 * 60 * 1000L) // a ceiling, not a plan: Stop releases it
        }
        val wifi = applicationContext.getSystemService(WIFI_SERVICE) as WifiManager
        @Suppress("DEPRECATION") // the replacement only works with the screen on
        wifiLock = wifi.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "voxinq:recording").apply {
            setReferenceCounted(false)
            acquire()
        }
    }

    private fun releaseLocks() {
        wakeLock?.let { if (it.isHeld) it.release() }
        wakeLock = null
        wifiLock?.let { if (it.isHeld) it.release() }
        wifiLock = null
    }
}
