// The only writes allowed from outside the private network.
//
// The boundary used to be one rule — external access is read-only — which is easy to hold in
// your head and wrong for one case: setting a meeting up needs no GPU, no audio and no
// transcription service, and it is the part someone does from a work laptop the evening
// before. So there is a list.
//
// **An allow-list, not a deny-list**, and that is the whole point: a route added next year is
// refused by default. Listing what is forbidden instead would leave every new endpoint open
// until somebody remembered it, and the failure would be silent.
//
// Nothing here touches audio, the GPU, or anything that cannot be undone. Editing a meeting
// goes through PATCH, which can also archive it and rename its speakers; the route refuses
// those for an external caller rather than this list trying to express "part of a request".
// It lives in lib/ rather than in proxy.ts so it can be tested without pulling in next/server.

export const EXTERNAL_WRITES: { method: string; path: RegExp }[] = [
  // Create a meeting, including one booked for later.
  { method: "POST", path: /^\/api\/meetings$/ },
  // Its title, agenda, series and tags. See app/api/meetings/[id]/route.ts for what it refuses.
  //
  // `bulk` is excluded by name because it is a sibling of the id, not an id: `[^/]+` matched it
  // happily. It only answers POST today, so nothing was reachable — but the point of an
  // allow-list is that a PATCH added there next year is refused without anyone remembering
  // this, and without it the opposite would have been true.
  { method: "PATCH", path: /^\/api\/meetings\/(?!bulk$)[^/]+$/ },
  // Who is expected to be there, which is what diarization is later told to look for.
  { method: "PUT", path: /^\/api\/meetings\/[^/]+\/participants$/ },
];

// Filing a meeting under a series needs no entry of its own: `/api/series` only answers GET,
// and a series is created by naming it in the meeting's own PATCH, which connects or creates.
// An allow-list entry for a method the route does not have looks like permission and is only
// a 405 — it was in here until the boundary was exercised for real and returned one.

export function allowedFromOutside(method: string, pathname: string): boolean {
  return EXTERNAL_WRITES.some((r) => r.method === method && r.path.test(pathname));
}
