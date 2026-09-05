// A setting that belongs to the machine rather than to the reader.
//
// Whisper's model, the GPU budget and the Ollama context window describe hardware that exists
// once. Everybody sees them, because it is useful to know what the machine is set to and
// confusing for a field to vanish — but only an administrator can change them, and saying why
// is better than a control that is inert for reasons nobody explains.

export function MachineNote({ isAdmin }: { isAdmin: boolean }) {
  if (isAdmin) return null;
  return (
    <p className="mt-1 text-xs text-[var(--text-muted)]">
      Set for the whole machine — there is one card and one transcription service, so this is an
      administrator&rsquo;s to change.
    </p>
  );
}
