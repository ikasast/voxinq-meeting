package io.github.ikasast.voxinq

import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.hardware.biometrics.BiometricManager
import android.hardware.biometrics.BiometricPrompt
import android.os.Build
import android.os.CancellationSignal
import android.os.SystemClock
import android.provider.Settings
import org.json.JSONObject

/**
 * Locking the app behind the phone's fingerprint, face or screen lock.
 *
 * What it guards is what is on screen — the minutes, the transcripts, the list of meetings — for
 * a phone that is lost or picked up. Starting a recording is deliberately not behind it: the
 * notification, the widget and a watch start one without opening anything, and a recording
 * reveals nothing that was already there.
 *
 * It is the person's choice, offered once, unless the server's administrator requires it
 * (`/api/app-lock`). That is a rule the app keeps, not one the server can check: an app too old
 * to know about it, or one rebuilt to ignore it, opens as before.
 *
 * Unlocking lasts a while: leaving the app and coming back within the chosen time does not ask
 * again. The time is counted on the clock that stops at a reboot, so a restarted phone always asks.
 */
object AppLock {
    private const val PREFS = "voxinq.lock"
    private const val ENABLED = "enabled"
    private const val AFTER_MIN = "afterMinutes"
    private const val REQUIRED = "required"
    private const val OFFERED = "offered"
    private const val LEFT_AT = "leftAt"
    private const val LEFT_BOOT = "leftBoot"
    private const val LEFT_UNLOCKED = "leftUnlocked"

    /** The times offered, in minutes. 0: every time the app is left. */
    val CHOICES = listOf(0, 1, 5, 15, 60)
    const val DEFAULT_MINUTES = 5

    /** Unlocked in this process, and not yet left for longer than the chosen time. */
    @Volatile
    var unlocked = false
        private set

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun enabled(ctx: Context) = prefs(ctx).getBoolean(ENABLED, false)
    fun required(ctx: Context) = prefs(ctx).getBoolean(REQUIRED, false)

    /** Whether the app locks at all: chosen here, or required by the server. */
    fun active(ctx: Context) = enabled(ctx) || required(ctx)

    fun afterMinutes(ctx: Context): Int =
        prefs(ctx).getInt(AFTER_MIN, DEFAULT_MINUTES).takeIf { it in CHOICES } ?: DEFAULT_MINUTES

    fun setEnabled(ctx: Context, on: Boolean) {
        prefs(ctx).edit().putBoolean(ENABLED, on).apply()
    }

    fun setAfterMinutes(ctx: Context, minutes: Int) {
        if (minutes in CHOICES) prefs(ctx).edit().putInt(AFTER_MIN, minutes).apply()
    }

    /**
     * What the server says. Newly required while the app is in use counts as unlocked now: the
     * person is already looking, and it is the next opening that asks.
     */
    fun setRequired(ctx: Context, on: Boolean) {
        if (on && !required(ctx)) unlocked = true
        prefs(ctx).edit().putBoolean(REQUIRED, on).apply()
    }

    fun offered(ctx: Context) = prefs(ctx).getBoolean(OFFERED, false)
    fun markOffered(ctx: Context) {
        prefs(ctx).edit().putBoolean(OFFERED, true).apply()
    }

    /** Whether the phone has a screen lock — without one there is nothing to unlock with. */
    fun secure(ctx: Context): Boolean = ctx.getSystemService(KeyguardManager::class.java)?.isDeviceSecure == true

    fun markUnlocked() {
        unlocked = true
    }

    private fun bootCount(ctx: Context): Int =
        Settings.Global.getInt(ctx.contentResolver, Settings.Global.BOOT_COUNT, -1)

    /** The app is out of sight: from now, the chosen time counts. */
    fun left(ctx: Context) {
        prefs(ctx).edit()
            .putLong(LEFT_AT, SystemClock.elapsedRealtime())
            .putInt(LEFT_BOOT, bootCount(ctx))
            .putBoolean(LEFT_UNLOCKED, unlocked)
            .apply()
    }

    /**
     * The app is in sight again: whether it has to be unlocked first. Stored rather than only
     * remembered, so a process the system ended in the background keeps its time as well.
     * `atLeastMinutes` is for coming back from somewhere the app itself sent the person — a
     * file to attach, a share — which "every time" should not turn into a prompt.
     */
    fun needsUnlock(ctx: Context, atLeastMinutes: Int = 0): Boolean {
        if (!active(ctx)) return false
        val p = prefs(ctx)
        val still = withinTime(
            leftUnlocked = p.getBoolean(LEFT_UNLOCKED, unlocked),
            sameBoot = p.getInt(LEFT_BOOT, Int.MIN_VALUE) == bootCount(ctx),
            leftAt = p.getLong(LEFT_AT, -1L),
            now = SystemClock.elapsedRealtime(),
            afterMinutes = maxOf(afterMinutes(ctx), atLeastMinutes),
        )
        unlocked = still
        return !still
    }

    /** Pure, for the tests: whether coming back now is still inside the chosen time. */
    fun withinTime(leftUnlocked: Boolean, sameBoot: Boolean, leftAt: Long, now: Long, afterMinutes: Int): Boolean {
        if (!leftUnlocked || !sameBoot || leftAt < 0) return false
        val away = now - leftAt
        return away >= 0 && away <= afterMinutes * 60_000L
    }

    /** For the settings page: what it shows. `supported` is how the page knows this app has one. */
    fun stateMessage(ctx: Context): JSONObject = message(
        "lock",
        "supported" to true,
        "enabled" to active(ctx),
        "chosen" to enabled(ctx),
        "required" to required(ctx),
        "afterMinutes" to afterMinutes(ctx),
        "secure" to secure(ctx),
    )

    /**
     * Ask for the fingerprint, the face or the screen lock. Android draws the prompt; the PIN
     * fallback is its own screen, so the activity is stopped and started around it — the caller
     * must not take that for the app being left.
     */
    fun prompt(activity: Activity, title: String, done: (Boolean) -> Unit) {
        if (!secure(activity)) {
            done(false)
            return
        }
        val builder = BiometricPrompt.Builder(activity).setTitle(title)
        if (Build.VERSION.SDK_INT >= 30) {
            builder.setAllowedAuthenticators(
                BiometricManager.Authenticators.BIOMETRIC_WEAK or BiometricManager.Authenticators.DEVICE_CREDENTIAL,
            )
        } else {
            @Suppress("DEPRECATION")
            builder.setDeviceCredentialAllowed(true)
        }
        builder.build().authenticate(
            CancellationSignal(),
            activity.mainExecutor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) = done(true)
                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) = done(false)
                // A finger not recognised: the prompt stays and says so itself.
                override fun onAuthenticationFailed() = Unit
            },
        )
    }
}
