package io.github.ikasast.voxinq

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Where the meeting notices are woken up: a meeting's own alarm and the quarter-hourly check.
 *
 * Not exported, so the only things that reach it are this app's own alarms and its own
 * [checkNow]. Exported, anything on the phone could ask for a notice about any meeting id it
 * cared to invent.
 */
class ReminderReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "VoxinqReminders"

        /**
         * How long the work is given. An alarm that fires in Doze buys a few seconds of network;
         * a broadcast that never finishes holds a wake lock the system will eventually take
         * away, complaining.
         */
        private const val BUDGET_MS = 20_000L

        /** Ask now: the app has come to the front, so the answer is wanted and cheap. */
        fun checkNow(context: Context) {
            if (ServerAddress.load(context) == null) return
            context.sendBroadcast(
                Intent(context, ReminderReceiver::class.java).setAction(Reminders.ACTION_CHECK),
            )
        }
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    override fun onReceive(context: Context, intent: Intent) {
        // The receiver itself is gone the moment onReceive returns, so everything below works
        // against the application context.
        val app = context.applicationContext
        when (intent.action) {
            Reminders.ACTION_CHECK -> background {
                Reminders.check(app)
                // Always, answered or not: the chain is the only thing that brings the next one.
                Reminders.arm(app)
            }

            Reminders.ACTION_DUE -> {
                // What the check knew when it set this alarm, in case the server cannot be
                // reached now. The extras are this app's own, put there by Reminders.schedule.
                val id = intent.getStringExtra(Reminders.EXTRA_ID)
                val at = intent.getLongExtra(Reminders.EXTRA_AT, 0L)
                val knew = if (id != null && at > 0) {
                    Reminders.Booked(id, intent.getStringExtra(Reminders.EXTRA_TITLE).orEmpty(), at)
                } else {
                    null
                }
                background {
                    // The server has the last word on whether this meeting is still worth a
                    // notice. Only when it says nothing at all does the alarm speak for itself.
                    if (!Reminders.check(app) && knew != null) Reminders.announce(app, knew)
                }
            }
        }
    }

    private fun background(work: suspend () -> Unit) {
        val pending = goAsync()
        scope.launch {
            try {
                withTimeoutOrNull(BUDGET_MS) { work() }
            } catch (e: Exception) {
                Log.w(TAG, "reminder work", e)
            } finally {
                pending.finish()
            }
        }
    }
}

/**
 * The two moments at which every alarm the phone was holding has been forgotten: a reboot, and
 * an install over the top. Both are broadcasts only the system can send, which is why this one
 * is exported and the other is not.
 *
 * There is no network worth waiting for at boot, so only the chain is restarted; its first run
 * sets the meetings' own alarms again.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED ->
                Reminders.arm(context.applicationContext)
        }
    }
}
