package io.github.ikasast.voxinq

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.KeyEvent
import android.view.View
import android.view.inputmethod.EditorInfo
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.isVisible
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

/**
 * The web app, in a WebView on the user's own server. Every screen is the existing one; the only
 * native part is the recorder, which the recording page reaches through `window.VoxinqAndroid`.
 */
class MainActivity : ComponentActivity() {
    companion object {
        const val ACTION_CHANGE_SERVER = "io.github.ikasast.voxinq.CHANGE_SERVER"
        const val ACTION_OPEN_RECORDING = "io.github.ikasast.voxinq.OPEN_RECORDING"

        /** A meeting's own page, for a notification about one that is not being recorded. */
        const val ACTION_OPEN_MEETING = "io.github.ikasast.voxinq.OPEN_MEETING"

        /** From the widget and the launcher shortcuts: start recording a new meeting, or set one up. */
        const val ACTION_QUICK_RECORD = "io.github.ikasast.voxinq.QUICK_RECORD"
        const val ACTION_NEW_MEETING = "io.github.ikasast.voxinq.NEW_MEETING"

        /** The offline recording's notification: the screen with its timer and Stop. */
        const val ACTION_SHOW_OFFLINE = "io.github.ikasast.voxinq.SHOW_OFFLINE"

        /** How long the widget's Record now waits for the server before recording on the phone. */
        private const val PROBE_MS = 4_000
        const val EXTRA_MEETING = "meetingId"
        const val EXTRA_AUTOSTART = "autostart"
        private const val BRIDGE = "VoxinqAndroid"
        private val MEETING_ID = Regex("^[A-Za-z0-9_-]{1,100}$")
    }

    private lateinit var webContainer: FrameLayout
    private lateinit var progress: View
    private lateinit var setup: View
    private lateinit var offline: View
    private var web: WebView? = null
    private var webOrigin: String? = null
    private var server: String? = null

    private var pendingStart: RecorderConfig? = null
    /** Recording on the phone was asked for before the microphone was allowed. */
    private var pendingOffline = false
    /** Whether the page being loaded failed, so a finished load can be told from an error page. */
    private var loadFailed = false
    private val ticker = android.os.Handler(android.os.Looper.getMainLooper())
    private var pendingMicGrant: PermissionRequest? = null
    private var fileCallback: ValueCallback<Array<Uri>>? = null

    private val permissions = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
        val mic = result[Manifest.permission.RECORD_AUDIO] ?: hasMic()
        pendingMicGrant?.let { if (mic) it.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) else it.deny() }
        pendingMicGrant = null
        if (pendingOffline) {
            pendingOffline = false
            if (mic) recordOffline() else Toast.makeText(this, R.string.mic_permission_denied, Toast.LENGTH_SHORT).show()
            return@registerForActivityResult
        }
        val start = pendingStart ?: return@registerForActivityResult
        pendingStart = null
        if (mic) {
            RecorderService.start(this, start)
        } else {
            RecorderBus.post(message("error", "message" to getString(R.string.mic_permission_denied)))
            RecorderBus.post(message("status", "status" to "error"))
        }
    }

    private val chooser = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data))
        fileCallback = null
    }

    /** An update asked for while the app was not yet allowed to install one. */
    private var pendingUpdate: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        val root = findViewById<View>(R.id.root)
        webContainer = findViewById(R.id.web_container)
        progress = findViewById(R.id.progress)
        setup = findViewById(R.id.setup)
        offline = findViewById(R.id.offline)

        // The page draws inside the bars, never under them: its own top and bottom bars hold the
        // recording controls.
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime(),
            )
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }

        val input = findViewById<EditText>(R.id.server_input)
        findViewById<Button>(R.id.connect).setOnClickListener { connect() }
        // Go on the on-screen keyboard, or Enter on a real one — which arrives as IME_NULL.
        input.setOnEditorActionListener { _, action, event ->
            val go = action == EditorInfo.IME_ACTION_GO ||
                (action == EditorInfo.IME_NULL && event?.action == KeyEvent.ACTION_DOWN)
            if (go) connect()
            go
        }
        findViewById<Button>(R.id.retry).setOnClickListener {
            offline.isVisible = false
            web?.reload()
        }
        findViewById<Button>(R.id.change_server).setOnClickListener { showSetup() }
        findViewById<Button>(R.id.record_offline).setOnClickListener { recordOffline() }
        findViewById<Button>(R.id.offline_stop).setOnClickListener {
            startService(Intent(this, RecorderService::class.java).setAction(RecorderService.ACTION_STOP_OFFLINE))
            ticker.postDelayed({ refreshOffline() }, 400)
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val w = web
                when {
                    setup.isVisible && w != null -> setup.isVisible = false
                    w != null && w.canGoBack() -> w.goBack()
                    else -> {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                        isEnabled = true
                    }
                }
            }
        })

        server = ServerAddress.load(this)
        route(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        route(intent)
    }

    override fun onStart() {
        super.onStart()
        RecorderBus.setVisible(true)
        web?.onResume()
        // Anything an earlier run could not hand over — a recording the system killed, or one
        // that ended while the server was out of reach — goes now. This is the moment it is
        // allowed to: the app is in front, and the network is likely to be the user's own.
        if (!RecorderBus.state.recording) RecorderService.deliverLeftovers(this)
        // What is booked for today, so the phone can say so at the time even with nothing open
        // (Reminders). Asking now is also how a meeting booked minutes ago is heard about.
        if (server != null) {
            askAboutNotices()
            ReminderReceiver.checkNow(this)
            Reminders.arm(this)
        }
        // Lines saved while nobody was looking are not replayed one by one: the page reloads
        // the transcript instead.
        if (RecorderBus.state.recording) RecorderBus.post(message("resync"))
        if (offline.isVisible || OfflineState.recording) refreshOffline()
        // Back from allowing the app to install updates: carry on with the one that asked.
        pendingUpdate?.let { version ->
            if (Build.VERSION.SDK_INT < 26 || packageManager.canRequestPackageInstalls()) {
                pendingUpdate = null
                Updater.start(this, version)
            }
        }
    }

    override fun onStop() {
        ticker.removeCallbacksAndMessages(null)
        RecorderBus.setVisible(false)
        web?.onPause()
        // And again on the way out. A meeting booked in the app was booked after onStart asked,
        // so without this the phone did not know about it until the app was next opened — which
        // is when its notice then appeared.
        if (server != null) ReminderReceiver.checkNow(this)
        super.onStop()
    }

    override fun onDestroy() {
        RecorderBus.detach()
        web?.destroy()
        web = null
        super.onDestroy()
    }

    private fun route(intent: Intent?) {
        val origin = server
        if (origin == null || intent?.action == ACTION_CHANGE_SERVER) {
            showSetup()
            return
        }
        // The activity is exported, so these extras can come from anywhere: only an id goes in
        // a path, and the most a forged intent can do is open a meeting's own page.
        val action = intent?.action
        if (action == ACTION_SHOW_OFFLINE || OfflineState.recording) {
            showOffline(origin)
            return
        }
        // Record now, from the widget: the server is asked first, briefly, because a meeting
        // that cannot be created there is recorded on the phone instead of not at all.
        if (action == ACTION_QUICK_RECORD) {
            progress.isVisible = true
            Thread {
                val probe = probe(origin)
                runOnUiThread {
                    progress.isVisible = false
                    if (probe == Probe.UP) {
                        open(origin, "/quick-record")
                    } else {
                        showOffline(origin, noDatabase = probe == Probe.NO_DATABASE)
                        recordOffline()
                    }
                }
            }.start()
            return
        }
        // The widget's two buttons: fixed pages, nothing from the intent goes into the path.
        QuickWidget.pathFor(action)?.let {
            open(origin, it)
            return
        }
        val opening = intent?.takeIf { action == ACTION_OPEN_RECORDING || action == ACTION_OPEN_MEETING }
        val meeting = opening?.getStringExtra(EXTRA_MEETING)?.takeIf { MEETING_ID.matches(it) }
        // Record, from a meeting's reminder: the page starts the recording itself when it is
        // opened this way, which is what the web app's own one-tap links already do.
        val autostart = meeting != null &&
            action == ACTION_OPEN_RECORDING &&
            opening?.getBooleanExtra(EXTRA_AUTOSTART, false) == true
        val path = meeting?.let { if (action == ACTION_OPEN_MEETING) "/$it" else "/$it/recording" }
        open(origin, path, if (autostart) "?autostart=1" else "")
    }

    private fun open(origin: String, path: String?, query: String = "") {
        setup.isVisible = false
        offline.isVisible = false
        val current = web
        if (current != null && webOrigin == origin) {
            // Already there: the notification tapped while the recording page is on screen must
            // not reload it. Being asked to start recording is different — that has to arrive
            // at the page, so it is loaded again with the request on it.
            val here = current.url?.let { Uri.parse(it).path }
            if (path == null || (here == path && query.isEmpty())) return
            current.loadUrl(origin + path + query)
            return
        }
        createWebView(origin).loadUrl(origin + (path ?: "/") + query)
    }

    /**
     * Ask once for somewhere to put the meeting notices.
     *
     * Every other permission here is asked for on a tap — the microphone when a recording
     * starts. A reminder has no tap: it is the notification *itself* that the user would be
     * waiting for, so the one chance to ask is before there is anything to show.
     */
    private fun askAboutNotices() {
        if (Build.VERSION.SDK_INT < 33 || granted(Manifest.permission.POST_NOTIFICATIONS)) return
        if (Reminders.asked(this)) return
        Reminders.markAsked(this)
        permissions.launch(arrayOf(Manifest.permission.POST_NOTIFICATIONS))
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun createWebView(origin: String): WebView {
        web?.let {
            webContainer.removeView(it)
            it.destroy()
        }
        val w = WebView(this)
        webContainer.addView(w, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        w.settings.javaScriptEnabled = true
        w.settings.domStorageEnabled = true
        w.settings.userAgentString = "${w.settings.userAgentString} VoxinqAndroid/${BuildConfig.VERSION_NAME}"
        CookieManager.getInstance().setAcceptCookie(true)
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        w.webViewClient = Client(origin)
        w.webChromeClient = Chrome(origin)
        // The bridge exists for the server's own pages and nothing else: a page from anywhere
        // else does not get `window.VoxinqAndroid`, and so cannot reach the microphone.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(w, BRIDGE, setOf(origin)) { _, msg, _, isMainFrame, reply ->
                val data = msg.data
                if (isMainFrame && data != null) bridge(data, reply, origin)
            }
        }
        web = w
        webOrigin = origin
        return w
    }

    private fun bridge(data: String, reply: JavaScriptReplyProxy, origin: String) {
        val msg = try {
            JSONObject(data)
        } catch (_: Exception) {
            return
        }
        RecorderBus.attach(reply)
        when (msg.optString("type")) {
            "hello" -> RecorderBus.post(RecorderBus.stateMessage())
            "start" -> {
                val config = RecorderConfig.from(msg, origin) ?: return
                val needed = buildList {
                    if (!hasMic()) add(Manifest.permission.RECORD_AUDIO)
                    // Without it the recording still happens; only its notification is hidden.
                    if (Build.VERSION.SDK_INT >= 33 && !granted(Manifest.permission.POST_NOTIFICATIONS)) {
                        add(Manifest.permission.POST_NOTIFICATIONS)
                    }
                }
                if (needed.isEmpty()) {
                    RecorderService.start(this, config)
                } else {
                    pendingStart = config
                    permissions.launch(needed.toTypedArray())
                }
            }
            "stop" -> if (RecorderBus.state.recording) RecorderService.stop(this) else RecorderBus.post(message("stopped"))
            // The page offers an update when the app is behind the server (Updater).
            "update" -> {
                val version = msg.optString("version")
                if (Updater.apkUrl(version) == null) return
                if (Build.VERSION.SDK_INT >= 26 && !packageManager.canRequestPackageInstalls()) {
                    // Android asks once whether this app may install apps. The settings screen is
                    // where that is answered; coming back to the app carries on (onStart).
                    pendingUpdate = version
                    RecorderBus.post(message("update", "state" to "permission"))
                    try {
                        startActivity(
                            Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName")),
                        )
                    } catch (_: ActivityNotFoundException) {
                        RecorderBus.post(message("update", "state" to "failed", "reason" to "settings"))
                    }
                } else {
                    Updater.start(this, version)
                }
            }
        }
    }

    private fun granted(permission: String) =
        ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

    private fun hasMic() = granted(Manifest.permission.RECORD_AUDIO)

    private fun connect() {
        val input = findViewById<EditText>(R.id.server_input)
        val origin = ServerAddress.normalize(input.text.toString())
        findViewById<View>(R.id.setup_error).isVisible = origin == null
        if (origin == null) return
        ServerAddress.save(this, origin)
        server = origin
        // onStart ran before there was a server to ask, so this is where the meeting notices
        // start for somebody who has just set the app up.
        askAboutNotices()
        ReminderReceiver.checkNow(this)
        Reminders.arm(this)
        WindowCompat.getInsetsController(window, input).hide(WindowInsetsCompat.Type.ime())
        open(origin, null)
    }

    /** What asking the server found: whether it can take a recording. */
    private enum class Probe { UP, DOWN, NO_DATABASE }

    /**
     * Whether the server can take a recording. Down: no answer, or a proxy in front of it
     * (tailscale serve) saying the app behind it is not answering. No database: the app answers
     * and says it cannot reach its own, so nothing it is asked to make can be kept. Any other
     * reply, a login page included, is up.
     */
    private fun probe(origin: String): Probe = try {
        val c = java.net.URL("$origin/api/health").openConnection() as java.net.HttpURLConnection
        c.connectTimeout = PROBE_MS
        // Longer to read than to connect: with its database down the server takes a few seconds
        // to say so, waiting out its own check of it.
        c.readTimeout = PROBE_MS + 3_000
        c.instanceFollowRedirects = false
        try {
            when (c.responseCode) {
                502, 503, 504 -> Probe.DOWN
                200 -> {
                    val db = runCatching {
                        org.json.JSONObject(c.inputStream.bufferedReader().readText()).optJSONObject("db")
                    }.getOrNull()
                    if (db != null && !db.optBoolean("ok", true)) Probe.NO_DATABASE else Probe.UP
                }
                else -> Probe.UP
            }
        } finally {
            c.disconnect()
        }
    } catch (_: Exception) {
        Probe.DOWN
    }

    // ---- Recording on the phone, while the server cannot be reached ----

    private fun showOffline(origin: String, noDatabase: Boolean = false) {
        setup.isVisible = false
        findViewById<TextView>(R.id.offline_body).text =
            if (noDatabase) getString(R.string.offline_body_database) else getString(R.string.offline_body, origin)
        offline.isVisible = true
        refreshOffline()
    }

    private fun recordOffline() {
        if (RecorderBus.state.recording || OfflineState.recording) {
            refreshOffline()
            return
        }
        val needed = buildList {
            if (!hasMic()) add(Manifest.permission.RECORD_AUDIO)
            if (Build.VERSION.SDK_INT >= 33 && !granted(Manifest.permission.POST_NOTIFICATIONS)) {
                add(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
        if (!hasMic()) {
            pendingOffline = true
            permissions.launch(needed.toTypedArray())
            return
        }
        RecorderService.startOffline(this)
        ticker.postDelayed({ refreshOffline() }, 400)
    }

    /** The offline screen as things stand: recording or not, and what is waiting to be sent. */
    private fun refreshOffline() {
        ticker.removeCallbacksAndMessages(null)
        val recording = OfflineState.recording
        findViewById<View>(R.id.offline_idle).isVisible = !recording
        findViewById<View>(R.id.offline_recording).isVisible = recording
        val timer = findViewById<android.widget.Chronometer>(R.id.offline_timer)
        if (recording) {
            timer.base = android.os.SystemClock.elapsedRealtime() - (System.currentTimeMillis() - OfflineState.startedAt)
            timer.start()
            val meter = findViewById<android.widget.ProgressBar>(R.id.offline_meter)
            val tick = object : Runnable {
                override fun run() {
                    if (!OfflineState.recording) {
                        refreshOffline()
                        return
                    }
                    meter.progress = (kotlin.math.sqrt(OfflineState.level) * 140).toInt().coerceIn(0, 100)
                    ticker.postDelayed(this, 150)
                }
            }
            ticker.post(tick)
        } else {
            timer.stop()
        }

        val saved = OfflineStore.list(filesDir, OfflineState.dir)
        findViewById<View>(R.id.offline_list_title).isVisible = saved.isNotEmpty()
        val list = findViewById<android.widget.LinearLayout>(R.id.offline_list)
        list.removeAllViews()
        val date = java.text.DateFormat.getDateTimeInstance(java.text.DateFormat.MEDIUM, java.text.DateFormat.SHORT)
        for (s in saved) {
            val row = layoutInflater.inflate(android.R.layout.simple_list_item_2, list, false)
            row.findViewById<TextView>(android.R.id.text1).apply {
                text = s.title ?: getString(R.string.offline_item_title, date.format(java.util.Date(s.startedAt)))
                setTextColor(getColor(R.color.foreground))
            }
            row.findViewById<TextView>(android.R.id.text2).apply {
                val length = if (s.seconds < 60) getString(R.string.offline_seconds, s.seconds) else getString(R.string.offline_minutes, s.seconds / 60)
                text = getString(if (s.meetingId != null) R.string.offline_item_booked else R.string.offline_item_waiting, length)
                setTextColor(getColor(R.color.text_secondary))
            }
            row.setOnClickListener { offlineMenu(it, s) }
            list.addView(row)
        }
    }

    private fun offlineMenu(anchor: View, s: OfflineStore.Saved) {
        val menu = android.widget.PopupMenu(this, anchor)
        menu.menu.add(0, 1, 0, R.string.offline_send_now)
        menu.menu.add(0, 2, 1, R.string.offline_share)
        menu.menu.add(0, 3, 2, R.string.offline_delete)
        menu.setOnMenuItemClickListener { item ->
            when (item.itemId) {
                1 -> {
                    ImportService.sendOffline(this)
                    Toast.makeText(this, R.string.import_started, Toast.LENGTH_SHORT).show()
                }
                2 -> shareOffline(s)
                3 -> android.app.AlertDialog.Builder(this)
                    .setMessage(R.string.offline_delete_confirm)
                    .setPositiveButton(R.string.offline_delete) { _, _ ->
                        OfflineStore.delete(s)
                        refreshOffline()
                    }
                    .setNegativeButton(R.string.cancel, null)
                    .show()
            }
            true
        }
        menu.show()
    }

    /** As a WAV file, to keep or send another way — the copy goes in the cache, not the phone. */
    private fun shareOffline(s: OfflineStore.Saved) {
        Thread {
            // One copy at a time: an earlier share's file has done its job.
            val dir = java.io.File(cacheDir, "shared").apply { deleteRecursively(); mkdirs() }
            val out = java.io.File(dir, "voxinq-${s.startedAt}.wav")
            runCatching {
                out.outputStream().buffered().use { o ->
                    o.write(OfflineStore.wavHeader(s.bytes))
                    s.audio.inputStream().use { it.copyTo(o) }
                }
            }.onSuccess {
                val uri = androidx.core.content.FileProvider.getUriForFile(this, "$packageName.files", out)
                runOnUiThread {
                    val send = Intent(Intent.ACTION_SEND).setType("audio/wav").putExtra(Intent.EXTRA_STREAM, uri)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    startActivity(Intent.createChooser(send, null))
                }
            }.onFailure {
                runOnUiThread { Toast.makeText(this, it.message ?: it.javaClass.simpleName, Toast.LENGTH_SHORT).show() }
            }
        }.start()
    }

    private fun showSetup() {
        offline.isVisible = false
        setup.isVisible = true
        findViewById<EditText>(R.id.server_input).setText(server ?: "")
    }

    private inner class Client(private val origin: String) : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            if (ServerAddress.originOf(request.url.toString()) == origin) return false
            // Anything that is not the server — the repository, a link in the minutes — opens
            // outside the app, where it is not handed the bridge.
            try {
                startActivity(Intent(Intent.ACTION_VIEW, request.url))
            } catch (_: ActivityNotFoundException) {
                Toast.makeText(this@MainActivity, getString(R.string.open_failed, request.url.toString()), Toast.LENGTH_SHORT).show()
            }
            return true
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            progress.isVisible = true
            loadFailed = false
        }

        override fun onPageFinished(view: WebView, url: String?) {
            progress.isVisible = false
            // The server answered: whatever was recorded on the phone while it did not goes now.
            if (!loadFailed && !OfflineState.recording) ImportService.sendOffline(this@MainActivity)
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (!request.isForMainFrame) return
            progress.isVisible = false
            loadFailed = true
            showOffline(origin)
        }

        /**
         * A page that came back as an error. From a proxy whose app is not answering (tailscale
         * serve says 502) it is the same as no answer, and used to be shown as that proxy's bare
         * "Bad Gateway". From the app itself it is the app's own error page, unless the reason is
         * its database: then nothing can be kept there, and the phone records instead.
         */
        override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) {
            if (!request.isForMainFrame) return
            when (response.statusCode) {
                502, 503, 504 -> {
                    progress.isVisible = false
                    loadFailed = true
                    showOffline(origin)
                }
                500 -> Thread {
                    if (probe(origin) == Probe.NO_DATABASE) {
                        runOnUiThread {
                            loadFailed = true
                            showOffline(origin, noDatabase = true)
                        }
                    }
                }.start()
            }
        }
    }

    private inner class Chrome(private val origin: String) : WebChromeClient() {
        /** The microphone check before a meeting runs in the page, with the page's microphone. */
        override fun onPermissionRequest(request: PermissionRequest) {
            val fromServer = ServerAddress.originOf(request.origin.toString()) == origin
            if (!fromServer || PermissionRequest.RESOURCE_AUDIO_CAPTURE !in request.resources) {
                request.deny()
                return
            }
            if (hasMic()) {
                request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
            } else {
                pendingMicGrant?.deny()
                pendingMicGrant = request
                permissions.launch(arrayOf(Manifest.permission.RECORD_AUDIO))
            }
        }

        override fun onShowFileChooser(
            view: WebView,
            callback: ValueCallback<Array<Uri>>,
            params: FileChooserParams,
        ): Boolean {
            fileCallback?.onReceiveValue(null)
            fileCallback = callback
            return try {
                chooser.launch(params.createIntent())
                true
            } catch (_: ActivityNotFoundException) {
                fileCallback = null
                false
            }
        }
    }
}
