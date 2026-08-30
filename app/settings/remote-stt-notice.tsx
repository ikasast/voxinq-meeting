// Recognition is being done by someone else's machine, and the app should say so.
//
// Unlike the LLM provider, this is not chosen here: the API key would have to reach the
// browser to be configured from this screen, and the browser is what talks to the STT service
// directly. It is set on the service, in `.env` — which is exactly why this exists. Someone
// looking at the app has no other way to find out that their meeting audio is leaving the
// machine, and "it is in a file the person who set this up edited" is not an answer.
//
// Amber for the same reason as the LLM notice: a supported choice, not a mistake.
export function RemoteSttNotice({ host }: { host: string }) {
  return (
    <div
      role="note"
      className="rounded-md border border-[color-mix(in_srgb,var(--warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] p-3"
    >
      <p className="text-xs font-semibold text-[var(--warning)]">
        Speech is recognised by {host}, not on this machine
      </p>
      <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-[var(--text-secondary)]">
        <li>
          The <strong>recording itself</strong> is uploaded — not the transcript, the audio.
          Every voice in the room, including anything said that nobody meant to write down.
        </li>
        <li>
          You are billed by them for the length of the audio. Roughly $0.25–0.40 an hour at
          current rates, so a weekly hour-long meeting is a few dollars a year.
        </li>
        <li>
          These endpoints cap the upload — 25 MB is typical, about thirteen minutes — so long
          meetings are split at a silent moment and sent in pieces.
        </li>
        <li>
          There is no live transcript on this setting. The meeting is recorded and recognised
          once it ends.
        </li>
      </ul>
      <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
        Recordings, voiceprints and speaker separation stay on this machine either way. Set by{" "}
        <code>STT_BACKEND</code> and <code>STT_CLOUD_*</code> on the transcription service; unset
        them to go back to recognising locally.
      </p>
    </div>
  );
}
