package io.github.ikasast.voxinq

/**
 * A recording that was made somewhere else.
 *
 * Phones are full of audio that belongs in a meeting: a voice recorder app's file, something a
 * colleague sent in a chat, the dictation from a handset nobody had Voxinq on. Android's answer
 * to "put this in that app" is the share sheet, so the app appears in it and turns what arrives
 * into a meeting with a transcript.
 *
 * The decisions worth making before anything is created are here, and they are the whole of
 * what a test can check: whether this is audio at all, whether it is small enough to send, and
 * what the meeting should be called.
 */
object Import {
    /**
     * The most that will be sent. The transcription service reads the body into memory to
     * decode it, so something has to say no before the machine does — and half a gigabyte is
     * hours of anything a phone records.
     */
    const val MAX_BYTES = 512L * 1024 * 1024

    /** The longest title the server takes (`TITLE_MAX` in app/api/meetings/route.ts), in UTF-16 units. */
    const val TITLE_MAX = 200

    /** What the web app's own drop zone accepts, so both doors take the same files. */
    private val AUDIO_EXT =
        Regex("\\.(wav|mp3|m4a|aac|ogg|oga|flac|webm|mp4|mov|mkv|opus)$", RegexOption.IGNORE_CASE)

    /**
     * Whether this is worth sending.
     *
     * The type the sharing app declares is the better answer, but plenty send
     * `application/octet-stream` for a file they read off storage, so the name gets a say too.
     * Video counts: the service decodes whatever ffmpeg can read, and a meeting recorded as
     * video is still a meeting.
     */
    fun looksLikeAudio(mimeType: String?, displayName: String?): Boolean {
        val type = mimeType?.lowercase().orEmpty()
        if (type.startsWith("audio/") || type.startsWith("video/")) return true
        return displayName != null && AUDIO_EXT.containsMatchIn(displayName)
    }

    fun tooBig(bytes: Long): Boolean = bytes > MAX_BYTES

    /**
     * What to call the meeting: the file's own name, without the extension.
     *
     * Left otherwise as it is. A recorder app's `REC_20260926_101500` is not a title anybody
     * would choose, but it is what the person will recognise in the list, and it is one tap to
     * rename. Inventing something tidier would only hide which file this was.
     *
     * Cut to the length the server takes, though: it refuses a longer title outright, and a
     * file name has no such limit -- so a long one would fail the whole import over its name.
     */
    fun titleFrom(displayName: String?): String {
        val name = displayName?.trim().orEmpty().substringAfterLast('/').substringAfterLast('\\')
        if (name.isEmpty()) return ""
        val dot = name.lastIndexOf('.')
        // A leading dot is the whole name of a hidden file, not an extension.
        val stem = (if (dot > 0) name.substring(0, dot) else name).trim()
        if (stem.length <= TITLE_MAX) return stem
        // Not through the middle of a character outside the BMP (an emoji, say).
        val end = if (Character.isHighSurrogate(stem[TITLE_MAX - 1])) TITLE_MAX - 1 else TITLE_MAX
        return stem.substring(0, end).trim()
    }

    /** Human-sized, for a confirmation that has to say how much is about to be sent. */
    fun sizeLabel(bytes: Long): String = when {
        bytes <= 0 -> ""
        bytes < 1024 -> "$bytes B"
        bytes < 1024 * 1024 -> "${bytes / 1024} KB"
        bytes < 100L * 1024 * 1024 -> String.format("%.1f MB", bytes / (1024.0 * 1024.0))
        else -> "${bytes / (1024 * 1024)} MB"
    }
}
