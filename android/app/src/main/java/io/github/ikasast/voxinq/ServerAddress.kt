package io.github.ikasast.voxinq

import android.content.Context
import java.net.URI

/**
 * The one server this app talks to.
 *
 * Asked for once and kept. It is also the only origin the page bridge answers to, so what is
 * stored is an origin — scheme, host and port — and never a page within it.
 */
object ServerAddress {
    private const val PREFS = "voxinq"
    private const val KEY = "server"

    fun load(context: Context): String? =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null)

    fun save(context: Context, origin: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, origin).apply()
    }

    /**
     * What somebody typed, as an origin: `https://host[:port]`.
     *
     * A bare host means HTTPS, which is how the server is reached over Tailscale. A path is
     * dropped: the app is served from the root, and a path kept here would only make the stored
     * address and the bridge's origin disagree.
     */
    fun normalize(input: String): String? {
        val text = input.trim()
        if (text.isEmpty() || text.any { it.isWhitespace() }) return null
        return originOf(if (text.contains("://")) text else "https://$text")
    }

    /** The origin of a full URL, or null when it is not an http(s) URL with a host. */
    fun originOf(url: String?): String? {
        if (url == null) return null
        val uri = try {
            URI(url)
        } catch (_: Exception) {
            return null
        }
        val scheme = uri.scheme?.lowercase() ?: return null
        if (scheme != "https" && scheme != "http") return null
        if (uri.rawUserInfo != null) return null
        val host = uri.host?.lowercase()?.takeIf { it.isNotEmpty() } ?: return null
        val defaultPort = if (scheme == "https") 443 else 80
        return if (uri.port == -1 || uri.port == defaultPort) "$scheme://$host" else "$scheme://$host:${uri.port}"
    }
}
