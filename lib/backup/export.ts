// Building a backup bundle: every row, the settings, and optionally the recordings.

import { promises as fs } from "fs";
import path from "path";
import JSZip from "jszip";
import { prisma } from "../prisma";
import { readSettings } from "../settings";
import { sttInternalUrl } from "../stt/internal";
import {
  BUNDLE_FORMAT,
  BUNDLE_VERSION,
  type BackupManifest,
  type BundleDb,
  type RecordingEntry,
} from "./manifest";
import { setPhase } from "./progress";

export type ExportOptions = {
  includeRecordings: boolean;
  onPhase?: (phase: string) => void;
};

export class SttUnavailableError extends Error {
  constructor() {
    super("the transcription service is unreachable, so recordings cannot be included");
    this.name = "SttUnavailableError";
  }
}

/** Newest applied migration — recorded so an import can refuse a bundle from a newer schema. */
async function latestMigration(): Promise<string | null> {
  try {
    const dir = path.join(process.cwd(), "prisma", "migrations");
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const names = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
    return names.at(-1) ?? null;
  } catch {
    return null;
  }
}

async function collectDb(): Promise<BundleDb> {
  // Trash and archive included: a backup that quietly dropped them would be a surprise the
  // day someone restores one and finds their 29-day-old deletion gone for good.
  const meetings = await prisma.meeting.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      series: { select: { name: true } },
      tags: { select: { name: true }, orderBy: { name: "asc" } },
    },
  });
  const [transcripts, summaries, series, tags, speakerProfiles] = await Promise.all([
    prisma.transcript.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.meetingSummary.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.series.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.tag.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.speakerProfile.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  return {
    meetings: meetings.map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      sttLanguage: m.sttLanguage,
      whisperModel: m.whisperModel,
      speakerLabels: m.speakerLabels,
      summaryStatus: m.summaryStatus,
      summaryError: m.summaryError,
      diarizationEmbeddings: m.diarizationEmbeddings,
      startedAt: m.startedAt.toISOString(),
      endedAt: m.endedAt?.toISOString() ?? null,
      recordedMs: m.recordedMs,
      deletedAt: m.deletedAt?.toISOString() ?? null,
      archivedAt: m.archivedAt?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
      seriesName: m.series?.name ?? null,
      tagNames: m.tags.map((t) => t.name),
    })),
    transcripts: transcripts.map((t) => ({
      id: t.id,
      meetingId: t.meetingId,
      speakerType: t.speakerType,
      text: t.text,
      translation: t.translation,
      // Verbatim: transcripts are ordered by this, and diarization maps speakers onto
      // utterances by position, so the ordering has to survive a round trip exactly.
      createdAt: t.createdAt.toISOString(),
    })),
    summaries: summaries.map((s) => ({
      id: s.id,
      meetingId: s.meetingId,
      summaryText: s.summaryText,
      provider: s.provider,
      model: s.model,
      createdAt: s.createdAt.toISOString(),
    })),
    series: series.map((s) => ({
      id: s.id,
      name: s.name,
      summaryFormat: s.summaryFormat,
      sttGlossary: s.sttGlossary,
      createdAt: s.createdAt.toISOString(),
    })),
    tags: tags.map((t) => ({ id: t.id, name: t.name, createdAt: t.createdAt.toISOString() })),
    speakerProfiles: speakerProfiles.map((p) => ({
      id: p.id,
      name: p.name,
      embedding: p.embedding,
      sampleCount: p.sampleCount,
      sourceMeetingId: p.sourceMeetingId,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })),
  };
}

type Sidecars = {
  exists: boolean;
  keep: boolean;
  segments: unknown | null;
  speakers: unknown | null;
  embeddings: unknown | null;
};

/** Build the inner zip. Returned as a Buffer — see the memory note in container.ts. */
export async function buildBundle(opts: ExportOptions): Promise<{ zip: Buffer; manifest: BackupManifest }> {
  const phase = (p: string) => {
    setPhase(p);
    opts.onPhase?.(p);
  };

  phase("reading the database");
  const db = await collectDb();
  const settings = await readSettings();

  const zip = new JSZip();
  const recordings: RecordingEntry[] = [];

  if (opts.includeRecordings) {
    const base = sttInternalUrl();
    // Fail loudly rather than hand back a backup quietly missing what was asked for.
    const health = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
    if (!health || !health.ok) throw new SttUnavailableError();

    let done = 0;
    for (const m of db.meetings) {
      done += 1;
      phase(`recordings ${done}/${db.meetings.length}`);

      const meta = (await fetch(`${base}/recordings/${m.id}/sidecars`, {
        signal: AbortSignal.timeout(15000),
      })
        .then((r) => (r.ok ? (r.json() as Promise<Sidecars>) : null))
        .catch(() => null)) as Sidecars | null;
      // No recording is ordinary: they expire, and older meetings predate saving them.
      if (!meta?.exists) continue;

      const audio = await fetch(`${base}/recordings/${m.id}/audio`, {
        signal: AbortSignal.timeout(120000),
      })
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .catch(() => null);
      if (!audio) continue;

      const wav = Buffer.from(audio);
      // STORE, not DEFLATE: PCM barely compresses, and paying CPU for a few percent would
      // slow every export and make the memory ceiling harder to reason about.
      zip.file(`recordings/${m.id}/audio.wav`, wav, { compression: "STORE" });
      if (meta.segments) zip.file(`recordings/${m.id}/segments.json`, JSON.stringify(meta.segments));
      if (meta.speakers) zip.file(`recordings/${m.id}/speakers.json`, JSON.stringify(meta.speakers));
      if (meta.embeddings) {
        zip.file(`recordings/${m.id}/embeddings.json`, JSON.stringify(meta.embeddings));
      }

      recordings.push({
        meetingId: m.id,
        wavBytes: wav.length,
        keep: meta.keep === true,
        hasSegments: Boolean(meta.segments),
        hasSpeakers: Boolean(meta.speakers),
        hasEmbeddings: Boolean(meta.embeddings),
      });
    }
  }

  const manifest: BackupManifest = {
    format: BUNDLE_FORMAT,
    bundleVersion: BUNDLE_VERSION,
    appVersion: process.env.npm_package_version ?? "unknown",
    dbMigration: await latestMigration(),
    exportedAt: new Date().toISOString(),
    includesRecordings: opts.includeRecordings,
    counts: {
      meetings: db.meetings.length,
      transcripts: db.transcripts.length,
      summaries: db.summaries.length,
      series: db.series.length,
      tags: db.tags.length,
      speakerProfiles: db.speakerProfiles.length,
    },
    recordings,
  };

  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("db.json", JSON.stringify(db));
  zip.file("settings.json", JSON.stringify(settings, null, 2));

  phase("packing");
  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return { zip: buf, manifest };
}
