import { promises as fs } from "fs";
import path from "path";
import JSZip from "jszip";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import {
  BadFormatError,
  UnsupportedVersionError,
  WrongPasswordError,
  decryptContainer,
} from "@/lib/backup/container";
import { runImport, type RecordingFiles } from "@/lib/backup/import";
import { InvalidBundleError, validateDb, validateManifest } from "@/lib/backup/manifest";
import { BackupBusyError, beginBackup, endBackup } from "@/lib/backup/progress";
import { isExternalRequest } from "@/lib/is-tailnet";
import type { AppSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const maxDuration = 300;

async function knownMigrations(): Promise<string[]> {
  try {
    const entries = await fs.readdir(path.join(process.cwd(), "prisma", "migrations"), {
      withFileTypes: true,
    });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

// Multipart rather than a raw body with the password in a header: headers are logged by
// proxies far more often than bodies are, and a URL is worse still. Route handlers have no
// body-size limit of their own (the one in next.config.ts governs Server Actions).
export async function POST(req: Request) {
  if (await isExternalRequest()) {
    return apiError("backups are only available from inside your private network", 403);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return apiError("expected a file upload", 400);
  }

  const uploaded = form.get("file");
  const password = form.get("password");
  const restoreSettings = form.get("restoreSettings") === "1";
  if (!(uploaded instanceof File)) return apiError("no backup file was uploaded", 400);
  if (typeof password !== "string" || !password) return apiError("the password is required", 400);

  try {
    beginBackup("import");
  } catch (e) {
    if (e instanceof BackupBusyError) return apiError(e.message, 409);
    throw e;
  }

  try {
    const encrypted = Buffer.from(await uploaded.arrayBuffer());
    const zipBuf = await decryptContainer(encrypted, password);

    const zip = await JSZip.loadAsync(zipBuf).catch(() => null);
    if (!zip) throw new InvalidBundleError("the backup could not be opened");

    const readJsonEntry = async (name: string): Promise<unknown | null> => {
      const entry = zip.file(name);
      if (!entry) return null;
      try {
        return JSON.parse(await entry.async("string"));
      } catch {
        return null;
      }
    };

    const manifest = validateManifest(await readJsonEntry("manifest.json"), await knownMigrations());
    const db = validateDb(await readJsonEntry("db.json"));
    const settings = (await readJsonEntry("settings.json")) as AppSettings | null;

    const result = await runImport({
      db,
      settings,
      restoreSettings,
      readRecording: async (meetingId): Promise<RecordingFiles | null> => {
        const wavEntry = zip.file(`recordings/${meetingId}/audio.wav`);
        if (!wavEntry) return null;
        const readSidecar = async (name: string) => {
          const f = zip.file(`recordings/${meetingId}/${name}.json`);
          if (!f) return undefined;
          try {
            return JSON.parse(await f.async("string"));
          } catch {
            return undefined;
          }
        };
        return {
          wav: await wavEntry.async("nodebuffer"),
          segments: await readSidecar("segments"),
          speakers: await readSidecar("speakers"),
          embeddings: await readSidecar("embeddings"),
          keep: manifest.recordings.find((r) => r.meetingId === meetingId)?.keep === true,
        };
      },
    });

    return NextResponse.json({
      ...result,
      bundle: {
        appVersion: manifest.appVersion,
        exportedAt: manifest.exportedAt,
        includesRecordings: manifest.includesRecordings,
        counts: manifest.counts,
      },
    });
  } catch (e) {
    if (e instanceof WrongPasswordError) return apiError(e.message, 400);
    if (e instanceof BadFormatError) return apiError(e.message, 400);
    if (e instanceof UnsupportedVersionError) return apiError(e.message, 400);
    if (e instanceof InvalidBundleError) return apiError(e.message, 400);
    return apiError(e instanceof Error ? e.message : "import failed", 500);
  } finally {
    endBackup();
  }
}
