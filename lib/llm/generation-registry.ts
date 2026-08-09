// Tracks in-flight minutes generations so one can be aborted mid-run — e.g. to free the
// single GPU for an urgent recording. `next start` is one Node process, so a module-level
// map is shared across API routes. Minutes generation is single-flight, so there is at most
// one entry, but the map is keyed by meeting id to be explicit.

const controllers = new Map<string, AbortController>();

// Register a new generation and get its AbortController. Aborts any prior controller for the
// same meeting (shouldn't happen given single-flight, but keeps the map consistent).
export function beginGeneration(meetingId: string): AbortController {
  controllers.get(meetingId)?.abort();
  const ac = new AbortController();
  controllers.set(meetingId, ac);
  return ac;
}

// Remove a generation once finished. Guards against deleting a newer controller if the same
// meeting somehow started again.
export function endGeneration(meetingId: string, ac: AbortController): void {
  if (controllers.get(meetingId) === ac) controllers.delete(meetingId);
}

// Abort a specific generation, or all of them when no id is given. Returns the aborted ids.
export function abortGeneration(meetingId?: string): string[] {
  const ids = meetingId ? [meetingId] : [...controllers.keys()];
  const aborted: string[] = [];
  for (const id of ids) {
    const ac = controllers.get(id);
    if (ac) {
      ac.abort();
      controllers.delete(id);
      aborted.push(id);
    }
  }
  return aborted;
}
