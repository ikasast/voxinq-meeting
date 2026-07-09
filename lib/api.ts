import { NextResponse } from "next/server";

/** Shared error response for API routes. */
export function apiError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** Safely read the request body JSON (null if malformed). */
export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
