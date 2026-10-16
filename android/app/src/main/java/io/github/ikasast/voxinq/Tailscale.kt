package io.github.ikasast.voxinq

import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities

/**
 * Whether the server cannot be reached because Tailscale is off on this phone.
 *
 * The likeliest reason of all for a phone not reaching a server on a tailnet, and the one the
 * person holding it can fix in two taps — but from the outside it looks exactly like the server
 * being down. Told apart by two things the phone knows: the address is a tailnet's (a `.ts.net`
 * name, or an address in the range Tailscale hands out), and no VPN is up. Tailscale is the VPN
 * when it is on, so with none up it is not on.
 *
 * Only said when both hold. A VPN that is up and still does not reach the server is a server
 * problem, or another VPN's, and is said as one.
 */
object Tailscale {
    const val PACKAGE = "com.tailscale.ipn"

    /** A tailnet's address: MagicDNS (`*.ts.net`) or Tailscale's CGNAT range, 100.64.0.0/10. */
    fun onTailnet(host: String?): Boolean {
        val h = host?.lowercase()?.trimEnd('.') ?: return false
        if (h.endsWith(".ts.net")) return true
        val parts = h.split('.')
        if (parts.size != 4) return false
        val octets = parts.map { it.toIntOrNull() ?: return false }
        if (octets.any { it !in 0..255 }) return false
        return octets[0] == 100 && octets[1] in 64..127
    }

    private fun vpnUp(context: Context): Boolean {
        val cm = context.getSystemService(ConnectivityManager::class.java) ?: return true
        val active = cm.activeNetwork ?: return false
        // Not knowing is not a reason to blame Tailscale.
        val caps = cm.getNetworkCapabilities(active) ?: return true
        return caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)
    }

    /** Whether the server at [origin] is out of reach because Tailscale is off. */
    fun looksOff(context: Context, origin: String?): Boolean {
        val host = runCatching { java.net.URI(origin ?: return false).host }.getOrNull()
        return onTailnet(host) && !vpnUp(context)
    }

    /** Tailscale's own app, to turn it on, or null when it is not installed. */
    fun openIntent(context: Context): Intent? =
        context.packageManager.getLaunchIntentForPackage(PACKAGE)?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
}
