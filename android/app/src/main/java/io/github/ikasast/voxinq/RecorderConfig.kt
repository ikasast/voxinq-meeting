package io.github.ikasast.voxinq

import org.json.JSONObject

/** One recording, as the page asked for it. */
data class RecorderConfig(
    /** The app's server, never the page's say: a page cannot point the saves anywhere else. */
    val serverOrigin: String,
    val wsUrl: String,
    val meetingId: String,
    val title: String?,
    val model: String?,
    val language: String?,
    val initialPrompt: String?,
    val translate: Boolean,
    val liveTranscript: Boolean?,
    val micMode: String?,
) {
    val room: Boolean get() = micMode == "room"

    /**
     * The browser's start message (lib/stt/client.ts), key for key.
     *
     * What the page left out stays out, as `JSON.stringify` drops `undefined`: the service reads
     * a missing `liveTranscript` as "whatever this host can do", which is not the same as false.
     */
    fun startMessage(): String = JSONObject().apply {
        put("type", "start")
        model?.let { put("model", it) }
        put("meetingId", meetingId)
        language?.let { put("language", it) }
        initialPrompt?.let { put("initialPrompt", it) }
        put("translate", translate)
        liveTranscript?.let { put("liveTranscript", it) }
    }.toString()

    fun toJson(): String = JSONObject().apply {
        put("serverOrigin", serverOrigin)
        put("wsUrl", wsUrl)
        put("meetingId", meetingId)
        title?.let { put("title", it) }
        model?.let { put("model", it) }
        language?.let { put("language", it) }
        initialPrompt?.let { put("initialPrompt", it) }
        put("translate", translate)
        liveTranscript?.let { put("liveTranscript", it) }
        micMode?.let { put("micMode", it) }
    }.toString()

    companion object {
        private val MEETING_ID = Regex("^[A-Za-z0-9_-]{1,100}$")

        fun from(json: JSONObject, serverOrigin: String): RecorderConfig? {
            val meetingId = json.stringOrNull("meetingId")?.takeIf { MEETING_ID.matches(it) } ?: return null
            val wsUrl = json.stringOrNull("wsUrl")
                ?.takeIf { it.startsWith("ws://") || it.startsWith("wss://") } ?: return null
            return RecorderConfig(
                serverOrigin = serverOrigin,
                wsUrl = wsUrl,
                meetingId = meetingId,
                title = json.stringOrNull("title"),
                model = json.stringOrNull("model"),
                language = json.stringOrNull("language"),
                initialPrompt = json.stringOrNull("initialPrompt"),
                translate = json.optBoolean("translate", false),
                liveTranscript = if (json.has("liveTranscript") && !json.isNull("liveTranscript")) {
                    json.optBoolean("liveTranscript")
                } else {
                    null
                },
                micMode = json.stringOrNull("micMode"),
            )
        }

        /** Read back what [toJson] wrote, to hand the recording to the service. */
        fun fromJson(text: String?): RecorderConfig? {
            val json = try {
                JSONObject(text ?: return null)
            } catch (_: Exception) {
                return null
            }
            return from(json, json.stringOrNull("serverOrigin") ?: return null)
        }
    }
}

/** A string that is present and not JSON null. org.json's optString reads null as "null". */
fun JSONObject.stringOrNull(key: String): String? =
    if (has(key) && !isNull(key)) optString(key).takeIf { it.isNotEmpty() } else null

/** A message for the page: `{"type": type, ...}`. */
fun message(type: String, vararg fields: Pair<String, Any?>): JSONObject = JSONObject().apply {
    put("type", type)
    for ((key, value) in fields) put(key, value ?: JSONObject.NULL)
}
