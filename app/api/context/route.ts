import { NextResponse } from "next/server";
import { isExternalRequest } from "@/lib/is-tailnet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Endpoint for the client to learn whether it is "external access (no recording)".
export async function GET() {
  return NextResponse.json({ external: await isExternalRequest() });
}
