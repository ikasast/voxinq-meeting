import { NextResponse } from "next/server";
import { apiError, readJson } from "@/lib/api";
import { encryptContainer } from "@/lib/backup/container";
import { SttUnavailableError, buildBundle } from "@/lib/backup/export";
import { BackupBusyError, beginBackup, endBackup } from "@/lib/backup/progress";
import { isExternalRequest } from "@/lib/is-tailnet";

export const runtime = "nodejs";
export const maxDuration = 300;

// POST, although this only reads.
//
// Two reasons, both about the password: a GET would put it in the URL, where it lands in logs
// and history, and proxy.ts refuses mutating methods from outside the tailnet — so being a
// POST is also what keeps a full database download away from an external viewer. The
// isExternalRequest check below says the same thing directly rather than relying on that.
export async function POST(req: Request) {
  if (await isExternalRequest()) {
    return apiError("backups are only available from inside your private network", 403);
  }

  const body = await readJson<{ password?: unknown; includeRecordings?: unknown }>(req);
  const password = typeof body?.password === "string" ? body.password : "";
  if (password.length < 8) {
    return apiError("choose a password of at least 8 characters", 400);
  }
  const includeRecordings = body?.includeRecordings !== false;

  try {
    beginBackup("export");
  } catch (e) {
    if (e instanceof BackupBusyError) return apiError(e.message, 409);
    throw e;
  }

  try {
    const { zip, manifest } = await buildBundle({ includeRecordings });
    const file = await encryptContainer(zip, password);

    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
    const name = `voxinq-backup-${stamp}.voxbak`;
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Content-Length": String(file.length),
        "Cache-Control": "no-store",
        // So the browser can show what it just downloaded without opening the file.
        "X-Voxinq-Meetings": String(manifest.counts.meetings),
        "X-Voxinq-Recordings": String(manifest.recordings.length),
      },
    });
  } catch (e) {
    if (e instanceof SttUnavailableError) return apiError(e.message, 502);
    return apiError(e instanceof Error ? e.message : "export failed", 500);
  } finally {
    endBackup();
  }
}
