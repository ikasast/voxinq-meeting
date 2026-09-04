export { sttDestination } from "@/lib/stt/destination";

// What sending recognition elsewhere actually does, said on the screen that does it.
//
// Amber for the same reason as the LLM notice: a supported choice, not a mistake. The list is
// ordered by what someone would regret not knowing — the audio going, then the bill, then the
// two behaviours that differ from local recognition.
export function RemoteSttNotice({ host }: { host: string }) {
  return (
    <div
      role="note"
      className="rounded-md border border-[color-mix(in_srgb,var(--warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] p-3"
    >
      <p className="text-xs font-semibold text-[var(--warning)]">
        Speech will be recognised by {host}, not on this machine
      </p>
      <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-[var(--text-secondary)]">
        <li>
          The <strong>recording itself</strong> is uploaded — not the transcript, the audio.
          Every voice in the room, including anything said that nobody meant to write down.
        </li>
        <li>
          Their terms decide how long it is kept and whether it trains anything. Voxinq cannot
          change that.
        </li>
        <li>
          You are billed for the length of the audio — roughly $0.25–0.40 an hour at current
          rates, so a weekly hour-long meeting is a few dollars a year.
        </li>
        <li>
          <strong>No live transcript.</strong> The meeting is recorded and recognised once it
          ends.
        </li>
        <li>
          These endpoints cap the upload, so long meetings are split at a silent moment and sent
          in pieces. Timestamps are stitched back together.
        </li>
      </ul>
      {/* "Recordings ... stay on this machine either way" sat directly under a bullet saying
          the recording is uploaded, and read as a contradiction. The stored file does stay —
          that is the true and useful half — but saying it in the same breath as "either way"
          invited the reading that nothing goes at all. */}
      <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
        The saved file, the voiceprints and speaker separation all stay here — a copy of the
        audio is sent for recognition, and nothing else moves.
      </p>
    </div>
  );
}
