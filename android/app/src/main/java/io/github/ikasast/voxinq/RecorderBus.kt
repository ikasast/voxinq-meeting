package io.github.ikasast.voxinq

import android.os.Handler
import android.os.Looper
import androidx.webkit.JavaScriptReplyProxy
import org.json.JSONObject

/**
 * Between the recorder and whichever page is showing.
 *
 * The recording outlives the page: the screen goes off, the page reloads, the activity is
 * closed and comes back from the notification. So the service never holds a page. It posts
 * here, and this forwards to the page that last said hello — on the main thread, where the
 * WebView lives.
 */
object RecorderBus {
    data class State(
        val recording: Boolean = false,
        val meetingId: String? = null,
        val status: String? = null,
        val startedAt: Long = 0L,
    )

    private val main = Handler(Looper.getMainLooper())
    private var page: JavaScriptReplyProxy? = null
    private var visible = false

    @Volatile
    var state = State()
        private set

    @Synchronized
    fun update(change: (State) -> State) {
        state = change(state)
    }

    /** Main thread: the page that will be told from now on. */
    fun attach(proxy: JavaScriptReplyProxy) {
        page = proxy
    }

    /** Main thread. */
    fun detach() {
        page = null
    }

    /** Main thread: whether anybody can see the page. */
    fun setVisible(value: Boolean) {
        visible = value
    }

    /**
     * Any thread. `live` is for what only matters to someone looking — the level ten times a
     * second, the words still being recognised. It is not sent to a page nobody can see, which
     * is most of a meeting with the screen off. What the page needs later, it reloads.
     */
    fun post(message: JSONObject, live: Boolean = false) {
        val text = message.toString()
        main.post {
            if (live && !visible) return@post
            try {
                page?.postMessage(text)
            } catch (_: Exception) {
                // A page that has gone away; the next one says hello.
            }
        }
    }

    fun stateMessage(): JSONObject = state.let {
        message(
            "state",
            "recording" to it.recording,
            "meetingId" to it.meetingId,
            "status" to it.status,
            "startedAt" to it.startedAt,
        )
    }
}
