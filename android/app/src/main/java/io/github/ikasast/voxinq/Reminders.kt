package io.github.ikasast.voxinq

import android.Manifest
import android.app.AlarmManager
import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.util.Log
import android.webkit.CookieManager
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.time.Instant
import java.util.Date
import java.util.Locale
import java.util.concurrent.TimeUnit

/**
 * The notice at a booked meeting's own time, with a way to record it.
 *
 * A meeting booked in advance is the one most likely to go unrecorded: everybody walks in
 * already talking. The web app has a banner for this, but a banner needs somebody looking at
 * the page — and on a phone the page is not open. Here the phone itself wakes at the meeting's
 * time and says so.
 *
 * **Two mechanisms, because neither alone is enough.** An alarm for each meeting is on time,
 * but the app has to have heard about the meeting to set one. A check every quarter of an hour
 * hears about everything, including a meeting booked on the laptop a minute ago, but is late.
 * So both: the check sets the alarms, and catches anything already past its time.
 *
 * **The server decides what is due, not the phone.** When an alarm goes off it asks, rather
 * than trusting what it was told when the alarm was set — by then the meeting may have been
 * recorded from the laptop, moved, or deleted, and "your meeting is starting" about a meeting
 * that already happened is worse than saying nothing. Only when the server cannot be reached
 * does it fall back to what it knew.
 */
object Reminders {
    /** A booked meeting, as the server describes it. */
    data class Booked(val id: String, val title: String, val at: Long)

    /** What the due endpoint answers: what is happening now, and what is coming. */
    data class Reply(val due: List<Booked>, val soon: List<Booked>)

    /**
     * How far ahead alarms are set. A day and a bit, so a meeting booked this morning for
     * tomorrow morning already has its alarm; the check sets the rest as they come into range.
     */
    const val HORIZON_MS = 26L * 60 * 60 * 1000

    /**
     * How often the backstop check runs.
     *
     * It decides one thing: how late a notice can be for a meeting booked *after* the last
     * check — at worst this. Anything booked earlier has an alarm of its own and is on time.
     */
    const val CHECK_EVERY_MS = 15L * 60 * 1000

    /** How long a meeting stays "already mentioned", comfortably past the endpoint's window. */
    private const val TOLD_FOR_MS = 6L * 60 * 60 * 1000
    private const val TOLD_MAX = 50

    private const val PREFS = "voxinq.reminders"
    private const val KEY_TOLD = "told"
    private const val KEY_ASKED = "asked"
    private const val CHANNEL = "reminders"
    private const val NOTIFICATION_BASE = 1000
    private const val TAG = "VoxinqReminders"

    const val ACTION_CHECK = "io.github.ikasast.voxinq.action.CHECK_MEETINGS"
    const val ACTION_DUE = "io.github.ikasast.voxinq.action.MEETING_DUE"
    const val EXTRA_ID = "meetingId"
    const val EXTRA_TITLE = "title"
    const val EXTRA_AT = "at"

    private val MEETING_ID = Regex("^[A-Za-z0-9_-]{1,100}$")

    private val http by lazy {
        // Short: an alarm that fires in Doze buys the app a few seconds of network and no more,
        // and a server out of reach is the ordinary case for a phone off the tailnet.
        OkHttpClient.Builder()
            .connectTimeout(5, TimeUnit.SECONDS)
            .readTimeout(5, TimeUnit.SECONDS)
            .build()
    }

    // ---- The part worth testing ----

    /**
     * Which meetings get an alarm: still ahead of us, inside the horizon, soonest first.
     *
     * A meeting whose time has passed is not given one — the check reports those as due — and a
     * diary full of next month's meetings does not fill the phone with alarms.
     */
    fun toSchedule(now: Long, soon: List<Booked>, horizonMs: Long = HORIZON_MS): List<Booked> =
        soon.filter { it.at > now && it.at <= now + horizonMs }.sortedBy { it.at }

    /**
     * What `/api/meetings/due` answered.
     *
     * Null when it is not that answer at all: a login page, an error, anything but the two
     * lists. A phone whose session has expired must stay quiet rather than guess.
     */
    fun parse(body: String): Reply? {
        val json = try {
            JSONObject(body)
        } catch (_: Exception) {
            return null
        }
        if (!json.has("meetings")) return null
        return Reply(due = booked(json, "meetings"), soon = booked(json, "soon"))
    }

    private fun booked(json: JSONObject, key: String): List<Booked> {
        val array = json.optJSONArray(key) ?: return emptyList()
        return (0 until array.length()).mapNotNull { i ->
            val row = array.optJSONObject(i) ?: return@mapNotNull null
            // The id goes into a URL path and into a notification the user taps; only an id.
            val id = row.stringOrNull("id")?.takeIf { MEETING_ID.matches(it) } ?: return@mapNotNull null
            val at = row.stringOrNull("scheduledAt")?.let(::parseTime) ?: return@mapNotNull null
            Booked(id, row.stringOrNull("title").orEmpty(), at)
        }
    }

    /** The ISO instant the server sends, as `Date.toISOString` writes it. */
    private fun parseTime(text: String): Long? = try {
        Instant.parse(text).toEpochMilli()
    } catch (_: Exception) {
        null
    }

    /**
     * The meetings already mentioned, with the stale ones dropped.
     *
     * Without this a meeting would be announced again at every check for as long as the server
     * calls it due — eight times over two hours, each one reviving a notification the user
     * dismissed.
     */
    fun prune(told: JSONObject, now: Long, ttlMs: Long = TOLD_FOR_MS, max: Int = TOLD_MAX): JSONObject {
        val kept = told.keys().asSequence()
            .mapNotNull { key -> told.optLong(key, 0L).takeIf { it > now - ttlMs }?.let { key to it } }
            .sortedByDescending { it.second }
            .take(max)
        return JSONObject().apply { for ((key, at) in kept) put(key, at) }
    }

    /** Whether the app has already had its one go at asking for somewhere to put a notice. */
    fun asked(context: Context): Boolean =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_ASKED, false)

    fun markAsked(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_ASKED, true).apply()
    }

    // ---- Alarms ----

    /**
     * Set the next backstop check.
     *
     * Deliberately not an allow-while-idle alarm: in Doze the system lets an app have one of
     * those about every nine minutes, and they are wanted for the meetings themselves. A
     * backstop deferred to the next maintenance window is still a backstop; a meeting notice
     * deferred by nine minutes is nine minutes of the meeting.
     */
    fun arm(context: Context, delayMs: Long = CHECK_EVERY_MS) {
        if (ServerAddress.load(context) == null) return // nothing to ask yet
        val alarms = context.getSystemService(AlarmManager::class.java) ?: return
        alarms.set(
            AlarmManager.RTC_WAKEUP,
            System.currentTimeMillis() + delayMs,
            broadcast(context, 0, Intent(context, ReminderReceiver::class.java).setAction(ACTION_CHECK)),
        )
    }

    fun schedule(context: Context, booked: List<Booked>) {
        val alarms = context.getSystemService(AlarmManager::class.java) ?: return
        for (meeting in booked) {
            // Allowed in Doze, which is the phone's usual state before a meeting, and inexact,
            // which needs no permission the user would have to be asked for. Inexact is worth
            // about two minutes in practice, and a notice two minutes into a meeting is still a
            // notice; the alternative is an exact-alarm permission prompt for a convenience.
            //
            // The request code is derived from the meeting id, so re-running the check replaces
            // a meeting's own alarm instead of adding another, and a meeting moved to a new time
            // moves its alarm. Two ids that happen to share a hash cost one alarm; the check
            // still catches that meeting.
            val intent = Intent(context, ReminderReceiver::class.java)
                .setAction(ACTION_DUE)
                .putExtra(EXTRA_ID, meeting.id)
                .putExtra(EXTRA_TITLE, meeting.title)
                .putExtra(EXTRA_AT, meeting.at)
            alarms.setAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP,
                meeting.at,
                broadcast(context, meeting.id.hashCode(), intent),
            )
        }
    }

    private fun broadcast(context: Context, code: Int, intent: Intent): PendingIntent =
        PendingIntent.getBroadcast(
            context,
            code,
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

    // ---- Asking the server ----

    /**
     * Ask what is due and what is coming, announce the first and set alarms for the second.
     *
     * Returns whether the server answered. A caller woken by a meeting's own alarm uses that to
     * decide whether it may fall back to what it knew when the alarm was set.
     */
    suspend fun check(context: Context): Boolean {
        val origin = ServerAddress.load(context) ?: return false
        val minutes = (HORIZON_MS / 60_000).toInt()
        val cookie = withContext(Dispatchers.Main) {
            runCatching { CookieManager.getInstance().getCookie(origin) }.getOrNull()
        }
        val body = withContext(Dispatchers.IO) {
            val request = Request.Builder()
                .url("$origin/api/meetings/due?soon=$minutes")
                .header("Accept", "application/json")
                .header("User-Agent", "VoxinqAndroid/${BuildConfig.VERSION_NAME}")
                .apply { cookie?.let { header("Cookie", it) } }
                .build()
            try {
                http.newCall(request).execute().use { res ->
                    if (res.isSuccessful) res.body?.string() else null
                }
            } catch (e: Exception) {
                Log.d(TAG, "cannot reach the server: ${e.javaClass.simpleName}")
                null
            }
        } ?: return false
        val reply = parse(body) ?: return false

        schedule(context, toSchedule(System.currentTimeMillis(), reply.soon))
        for (meeting in reply.due) announce(context, meeting)
        return true
    }

    /**
     * Say that a meeting's time has come — once.
     *
     * Not while that meeting is the one being recorded: the phone would be telling the user to
     * start something it is already doing. (The server drops a meeting from the list as soon as
     * it has a line, so this only covers the first minute of one.)
     */
    fun announce(context: Context, meeting: Booked) {
        val state = RecorderBus.state
        if (state.recording && state.meetingId == meeting.id) return
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val now = System.currentTimeMillis()
        val told = prune(
            runCatching { JSONObject(prefs.getString(KEY_TOLD, "{}") ?: "{}") }.getOrElse { JSONObject() },
            now,
        )
        if (told.has(meeting.id)) return
        notifyDue(context, meeting)
        prefs.edit().putString(KEY_TOLD, told.put(meeting.id, now).toString()).apply()
    }

    // ---- The notification ----

    /**
     * Take the notice down, for a meeting that is now being recorded.
     *
     * Tapping **Record** dismisses it by itself; this is for the other way round, where the
     * recording was started from the page and the notice would otherwise sit there telling
     * somebody to do what they have just done.
     */
    fun cancel(context: Context, meetingId: String) {
        NotificationManagerCompat.from(context).cancel(NOTIFICATION_BASE + (meetingId.hashCode() and 0xffff))
    }

    private fun notifyDue(context: Context, meeting: Booked) {
        val manager = NotificationManagerCompat.from(context)
        manager.createNotificationChannel(
            NotificationChannelCompat.Builder(CHANNEL, NotificationManagerCompat.IMPORTANCE_HIGH)
                .setName(context.getString(R.string.channel_reminders))
                .setDescription(context.getString(R.string.channel_reminders_description))
                .build(),
        )
        // Android 13 and up: without the permission there is nowhere to put this. The recording
        // still works; only the reminder is lost, which is why the app asks for it on first run.
        val allowed = ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        if (!allowed || !manager.areNotificationsEnabled()) return
        manager.notify(NOTIFICATION_BASE + (meeting.id.hashCode() and 0xffff), build(context, meeting))
    }

    /**
     * **Record** opens the app on that meeting's recording page, which starts by itself.
     *
     * Not because a notification cannot start work — it can — but because a microphone service
     * started with nothing on screen is at the mercy of a rule that has changed with every
     * other Android version, and a meeting silently not being recorded is the one failure this
     * whole feature exists to prevent.
     */
    private fun build(context: Context, meeting: Booked): Notification {
        val at = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(meeting.at))
        return NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_recording)
            .setContentTitle(meeting.title.ifBlank { context.getString(R.string.reminder_untitled) })
            .setContentText(context.getString(R.string.reminder_text, at))
            .setContentIntent(open(context, meeting, autostart = false))
            .addAction(0, context.getString(R.string.reminder_record), open(context, meeting, autostart = true))
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .build()
    }

    private fun open(context: Context, meeting: Booked, autostart: Boolean): PendingIntent =
        PendingIntent.getActivity(
            context,
            // Two intents for one meeting, so they need request codes that do not collide —
            // with each other or with the alarm's, which is a broadcast and counted separately.
            (meeting.id.hashCode() shl 1) or if (autostart) 1 else 0,
            Intent(context, MainActivity::class.java)
                .setAction(MainActivity.ACTION_OPEN_RECORDING)
                .putExtra(MainActivity.EXTRA_MEETING, meeting.id)
                .putExtra(MainActivity.EXTRA_AUTOSTART, autostart)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
}
