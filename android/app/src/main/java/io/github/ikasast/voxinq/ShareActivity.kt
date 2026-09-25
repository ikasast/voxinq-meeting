package io.github.ikasast.voxinq

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.database.Cursor
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.util.Log
import android.widget.Toast

/**
 * Where a shared recording arrives.
 *
 * Its own activity rather than the app's: the person is in another app — a voice recorder, a
 * chat — and should be returned to it, not left holding Voxinq. So this asks one question over
 * whatever they were looking at, hands the file to [ImportService], and gets out of the way.
 *
 * It asks at all because a share is one tap away from a mis-tap, and the answer costs something:
 * a meeting is created and the transcription queue is given work. Naming the file and its size
 * is also the only chance to say *what* is about to be sent.
 */
class ShareActivity : Activity() {
    private companion object {
        private const val TAG = "VoxinqShare"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val uri = shared(intent)
        if (uri == null) {
            Log.w(TAG, "nothing to import in ${intent?.action}")
            done(getString(R.string.import_not_audio))
            return
        }
        if (ServerAddress.load(this) == null) {
            // Nothing can be sent anywhere until the app has been opened once and told where.
            done(getString(R.string.import_no_server))
            return
        }
        // A recording in progress owns the uplink, and it is the one thing here that cannot be
        // done again later.
        if (RecorderBus.state.recording) {
            done(getString(R.string.import_while_recording))
            return
        }

        val name = displayName(uri)
        val bytes = sizeOf(uri)
        // Two sources, because either can be missing: what the provider says the file is, and
        // what the app that shared it declared. A share from a file manager often has only the
        // second, and a provider that answers nothing at all leaves only the name.
        val type = contentResolver.getType(uri) ?: intent.type
        if (!Import.looksLikeAudio(type, name)) {
            Log.w(TAG, "not audio: type=$type name=$name")
            done(getString(R.string.import_not_audio))
            return
        }
        if (Import.tooBig(bytes)) {
            done(getString(R.string.import_too_big, Import.sizeLabel(Import.MAX_BYTES)))
            return
        }

        val title = Import.titleFrom(name).ifBlank { getString(R.string.import_untitled) }
        val size = Import.sizeLabel(bytes)
        AlertDialog.Builder(this)
            .setTitle(R.string.import_title)
            .setMessage(
                if (size.isEmpty()) title else getString(R.string.import_message, title, size),
            )
            .setPositiveButton(R.string.import_confirm) { _, _ ->
                // Handing the file on means handing on the permission that came with the share,
                // and a sharing app that granted none leaves nothing to hand on. Refused, that
                // throws — and a crash is a poor way to say "I cannot read your file".
                val handed = runCatching { ImportService.start(this, uri, title, bytes) }
                handed.exceptionOrNull()?.let { Log.w(TAG, "cannot read the shared file", it) }
                done(getString(if (handed.isSuccess) R.string.import_started else R.string.import_unreadable))
            }
            .setNegativeButton(R.string.cancel) { _, _ -> finish() }
            .setOnCancelListener { finish() }
            .show()
    }

    /** The one file a share carried, or nothing this app can do anything with. */
    private fun shared(intent: Intent?): Uri? {
        if (intent?.action != Intent.ACTION_SEND) return null
        @Suppress("DEPRECATION") // the typed replacement is API 33 and this app starts at 29
        return intent.getParcelableExtra(Intent.EXTRA_STREAM) as? Uri
    }

    private fun displayName(uri: Uri): String? = ask(uri, OpenableColumns.DISPLAY_NAME) { c, i ->
        if (c.isNull(i)) null else c.getString(i)
    } ?: uri.lastPathSegment

    private fun sizeOf(uri: Uri): Long = ask(uri, OpenableColumns.SIZE) { c, i ->
        if (c.isNull(i)) null else c.getLong(i)
    } ?: 0L

    private fun <T> ask(uri: Uri, column: String, read: (Cursor, Int) -> T?): T? = try {
        contentResolver.query(uri, arrayOf(column), null, null, null)?.use { c ->
            val i = c.getColumnIndex(column)
            if (i >= 0 && c.moveToFirst()) read(c, i) else null
        }
    } catch (_: Exception) {
        // A provider is allowed to answer none of this. The file may still be readable, so a
        // missing name or size is not a reason to refuse it.
        null
    }

    private fun done(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
        finish()
    }
}
