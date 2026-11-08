import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { sttFetch } from "./internal";

// The browser's way to the transcription service, for everything but recording itself.
//
// It used to call the service directly, which meant the service answered anybody in the tailnet
// who knew a meeting's ID, audio included. Now the browser asks these routes; they check the
// meeting is the reader's own (prisma is scoped to the reader, so somebody else's is not found)
// and pass the request on, signed. The answer comes back as the service gave it.

/** Headers worth passing back: what the body is, and, for audio, what makes seeking work. */
const PASSED_BACK = ["content-type", "content-length", "content-range", "accept-ranges", "last-modified", "etag"];

/** Whether this meeting is the reader's own. Trashed meetings count: the trash plays them. */
export async function readerOwns(meetingId: string): Promise<boolean> {
  const m = await prisma.meeting.findUnique({ where: { id: meetingId }, select: { id: true } });
  return m !== null;
}

/** Of these meetings, the reader's own. */
export async function readerOwnsOf(ids: unknown, max = 500): Promise<string[]> {
  if (!Array.isArray(ids)) return [];
  const wanted = [...new Set(ids.filter((x): x is string => typeof x === "string"))].slice(0, max);
  if (wanted.length === 0) return [];
  const rows = await prisma.meeting.findMany({ where: { id: { in: wanted } }, select: { id: true } });
  return rows.map((r) => r.id);
}

/** Pass a request on and its answer back, body streamed. 502 when the service cannot be reached. */
export async function relay(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<Response> {
  const { timeoutMs, ...rest } = init ?? {};
  let res: Response;
  try {
    res = await sttFetch(path, {
      cache: "no-store",
      ...rest,
      signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : rest.signal,
    });
  } catch {
    return apiError("Cannot reach the transcription service.", 502);
  }
  const headers = new Headers({ "Cache-Control": "no-store" });
  for (const h of PASSED_BACK) {
    const v = res.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new NextResponse(res.body, { status: res.status, headers });
}
