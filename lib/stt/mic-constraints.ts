// What the microphone is asked for.
//
// Shared so that checking the mic and recording with it ask for the same thing. A check that
// ran with echo cancellation on and a recording that ran with it off would be a check of
// something else — and the failure it is meant to catch, a mic that hears nothing, is exactly
// the kind that processing settings can cause.

export function isRoomMode(micMode?: string): boolean {
  return micMode === "room";
}

/**
 * How much louder room mode makes what the microphone hears.
 *
 * Turning the browser's processing off was the whole of "room" mode, and it is not enough. A
 * phone three metres from whoever is speaking captures a signal several times quieter than a
 * laptop at arm's length, and everything downstream is measured against a fixed level: the
 * service's segmenter treats anything under an RMS of 0.012 as silence and never hands it to
 * the recogniser. So a voice from across the table was not mis-recognised — it was never heard.
 *
 * Four times, which is 12dB. It is applied before the limiter that was already in the graph, so
 * a loud moment is rounded off rather than clipped, and clipping is the one distortion
 * recognition cannot see past. Room noise comes up with the voice, which is intended: the
 * energy VAD is a cheap segmenter, and what tells speech from noise afterwards is Whisper's own
 * VAD and its no-speech threshold, both of which want the words at a workable level first.
 */
export const ROOM_GAIN = 4;

/**
 * The level below which the transcription service hears silence.
 *
 * `VAD_ENERGY_THRESH` in `stt-service/server.py`, and the same number rather than a second one:
 * the microphone check used to test against 0.02 while the recogniser used 0.012, so the check
 * could call a room silent that the recogniser would have transcribed — a check answering
 * wrongly about the thing it exists to answer. If the service's threshold moves, this moves.
 */
export const HEARD_RMS = 0.012;

export function micConstraints(source: string, micMode?: string): MediaTrackConstraints {
  // room: to better pick up distant voices in a meeting room, turn off echo/noise suppression.
  //       The gain that goes with it is ROOM_GAIN, applied in the graph — a constraint cannot
  //       ask for "louder", only for the browser's own automatic gain, which on a phone is
  //       tuned for a handset held to the ear.
  const room = isRoomMode(micMode);
  // In both (mic + PC audio), the mic picks up PC audio from the speakers and double-captures
  // (echo). The browser AEC can cancel it by referencing the system playback, so force AEC/NS
  // ON for both even in room mode.
  const useAec = source === "both" ? true : !room;
  return {
    channelCount: 1,
    echoCancellation: useAec,
    noiseSuppression: useAec,
    autoGainControl: true,
  };
}

/** Is this stream still worth handing to a recording? A device unplugged mid-check is not. */
export function streamIsLive(stream: MediaStream | null | undefined): boolean {
  return Boolean(stream && stream.getAudioTracks().some((t) => t.readyState === "live"));
}
