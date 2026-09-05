// What the microphone is asked for.
//
// Shared so that checking the mic and recording with it ask for the same thing. A check that
// ran with echo cancellation on and a recording that ran with it off would be a check of
// something else — and the failure it is meant to catch, a mic that hears nothing, is exactly
// the kind that processing settings can cause.

export function micConstraints(source: string, micMode?: string): MediaTrackConstraints {
  // room: to better pick up distant voices in a meeting room, turn off echo/noise suppression
  //       and raise auto-gain. standard: the default for near/call use.
  const room = micMode === "room";
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
