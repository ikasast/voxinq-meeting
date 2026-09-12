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
import android.view.KeyEvent
import android.view.View
import android.view.inputmethod.EditorInfo
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
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
        const val EXTRA_MEETING = "meetingId"
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
    private var pendingMicGrant: PermissionRequest? = null
    private var fileCallback: ValueCallback<Array<Uri>>? = null

    private val permissions = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
        val mic = result[Manifest.permission.RECORD_AUDIO] ?: hasMic()
        pendingMicGrant?.let { if (mic) it.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) else it.deny() }
        pendingMicGrant = null
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
        // Lines saved while nobody was looking are not replayed one by one: the page reloads
        // the transcript instead.
        if (RecorderBus.state.recording) RecorderBus.post(message("resync"))
    }

    override fun onStop() {
        RecorderBus.setVisible(false)
        web?.onPause()
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
        // The activity is exported, so this extra can come from anywhere: only an id goes in a path.
        val meeting = intent?.takeIf { it.action == ACTION_OPEN_RECORDING }
            ?.getStringExtra(EXTRA_MEETING)
            ?.takeIf { MEETING_ID.matches(it) }
        open(origin, meeting?.let { "/$it/recording" })
    }

    private fun open(origin: String, path: String?) {
        setup.isVisible = false
        offline.isVisible = false
        val current = web
        if (current != null && webOrigin == origin) {
            // Already there: the notification tapped while the recording page is on screen must
            // not reload it.
            val here = current.url?.let { Uri.parse(it).path }
            if (path == null || here == path) return
            current.loadUrl(origin + path)
            return
        }
        createWebView(origin).loadUrl(origin + (path ?: "/"))
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
        WindowCompat.getInsetsController(window, input).hide(WindowInsetsCompat.Type.ime())
        open(origin, null)
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
        }

        override fun onPageFinished(view: WebView, url: String?) {
            progress.isVisible = false
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (!request.isForMainFrame) return
            progress.isVisible = false
            findViewById<TextView>(R.id.offline_body).text = getString(R.string.offline_body, origin)
            offline.isVisible = true
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
