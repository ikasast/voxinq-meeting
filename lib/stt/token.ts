// The token a recording shows the transcription service, as the browser gets it.
//
// The web app issues it to the meeting's owner (app/api/meetings/[id]/stt-token); the service
// checks it in the `start` message (stt-service/auth.py). Asked for afresh before each connection,
// so a long meeting never outlives its token. When the web app cannot be reached — the moment a
// reconnect is most likely — the last one is used while it is still good.

type Issued = { token: string | null; expiresAt?: number };

/** A minute's margin: a token that expires while the connection opens is no use. */
const MARGIN_MS = 60_000;

export function sttTokens(meetingId: string | undefined): () => Promise<string | undefined> {
  let last: Issued | null = null;
  return async () => {
    if (!meetingId) return undefined;
    try {
      const res = await fetch(`/api/meetings/${encodeURIComponent(meetingId)}/stt-token`, {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) last = (await res.json()) as Issued;
    } catch {
      // Unreachable: fall back to the last one below.
    }
    if (!last?.token) return undefined;
    if (last.expiresAt !== undefined && last.expiresAt - MARGIN_MS < Date.now()) return undefined;
    return last.token;
  };
}
