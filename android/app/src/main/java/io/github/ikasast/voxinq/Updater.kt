package io.github.ikasast.voxinq

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

/**
 * Updating the app from inside it (4.0).
 *
 * The page knows the server's version and the app's (the user agent says it), and when the app
 * is behind it offers the update. This fetches that version's signed APK from its GitHub release
 * and hands it to Android's own installer, which asks once — there is no silent update outside
 * the Play Store — and keeps the server address and anything not yet sent, as an update does.
 *
 * Only ever this repository's release asset for a version the page names, and only a version
 * string that looks like one: the address is built here, not taken from the page. Android then
 * refuses anything not signed with the app's own key.
 */
object Updater {
    private val VERSION = Regex("^\\d+\\.\\d+\\.\\d+(-[0-9A-Za-z.]+)?$")
    private const val ACTION_DONE = "io.github.ikasast.voxinq.UPDATE_DONE"

    /** The release asset for a version, or null when the version is not one. */
    fun apkUrl(version: String): String? =
        if (VERSION.matches(version)) {
            "https://github.com/ikasast/voxinq-meeting/releases/download/v$version/voxinq-$version.apk"
        } else {
            null
        }

    @Volatile
    private var running = false

    /** Fetch and install `version`. Progress and failures go to the page as `update` messages. */
    fun start(context: Context, version: String) {
        val url = apkUrl(version) ?: return
        if (running) return
        running = true
        val app = context.applicationContext
        Thread {
            try {
                RecorderBus.post(message("update", "state" to "downloading", "percent" to 0))
                val client = OkHttpClient.Builder().readTimeout(60, TimeUnit.SECONDS).build()
                client.newCall(Request.Builder().url(url).build()).execute().use { res ->
                    if (!res.isSuccessful) throw IllegalStateException("HTTP ${res.code}")
                    val body = res.body ?: throw IllegalStateException("empty response")
                    val total = body.contentLength()
                    val installer = app.packageManager.packageInstaller
                    val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
                    params.setAppPackageName(app.packageName)
                    // Updating itself, it may be allowed to skip the question on Android 12 and
                    // later; where it is not, Android asks, which is the most there is anyway.
                    if (Build.VERSION.SDK_INT >= 31) {
                        params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
                    }
                    val id = installer.createSession(params)
                    installer.openSession(id).use { session ->
                        session.openWrite("voxinq.apk", 0, if (total > 0) total else -1).use { out ->
                            body.byteStream().use { input ->
                                val buf = ByteArray(64 * 1024)
                                var done = 0L
                                var shown = -1
                                while (true) {
                                    val n = input.read(buf)
                                    if (n < 0) break
                                    out.write(buf, 0, n)
                                    done += n
                                    val percent = if (total > 0) (done * 100 / total).toInt() else 0
                                    if (percent != shown) {
                                        shown = percent
                                        RecorderBus.post(message("update", "state" to "downloading", "percent" to percent))
                                    }
                                }
                            }
                            session.fsync(out)
                        }
                        val done = Intent(app, UpdateReceiver::class.java).setAction(ACTION_DONE)
                        val pending = PendingIntent.getBroadcast(
                            app,
                            id,
                            done,
                            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
                        )
                        RecorderBus.post(message("update", "state" to "installing"))
                        session.commit(pending.intentSender)
                    }
                }
            } catch (e: Exception) {
                RecorderBus.post(message("update", "state" to "failed", "reason" to (e.message ?: e.javaClass.simpleName)))
            } finally {
                running = false
            }
        }.start()
    }
}

/** What Android says about the install: ask the person, or report how it ended. */
class UpdateReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                @Suppress("DEPRECATION")
                val confirm = if (Build.VERSION.SDK_INT >= 33) {
                    intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
                } else {
                    intent.getParcelableExtra(Intent.EXTRA_INTENT)
                }
                confirm?.let { context.startActivity(it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
            }
            // On success the app is replaced and restarted by Android; nothing is left to say.
            PackageInstaller.STATUS_SUCCESS -> Unit
            else -> RecorderBus.post(
                message(
                    "update",
                    "state" to "failed",
                    "reason" to (intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: "status $status"),
                ),
            )
        }
    }
}
