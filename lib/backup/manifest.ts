// Shape of a backup bundle, and the compatibility rules for opening one.
//
// Inside the encrypted container is a zip:
//
//   manifest.json                              what this file is and what is in it
//   db.json                                    every row of every table
//   settings.json                              the app settings, API keys included
//   recordings/<meetingId>/audio.wav           the meeting audio
//   recordings/<meetingId>/segments.json       utterance boundaries (diarization maps onto these)
//   recordings/<meetingId>/speakers.json       diarization result, when it has been run
//   recordings/<meetingId>/embeddings.json     per-cluster voice embeddings
//
// The database rows are carried as plain arrays rather than a pg_dump, so a bundle can be
// imported into a Voxinq whose schema has moved on: the importer maps fields explicitly, and
// anything added since simply takes its default.

import type { AppSettings } from "../settings";

export const BUNDLE_VERSION = 1;
export const BUNDLE_FORMAT = "voxinq-bundle";

export type BundleMeeting = {
  id: string;
  title: string;
  description: string | null;
  sttLanguage: string | null;
  whisperModel: string | null;
  speakerLabels: string | null;
  summaryStatus: string | null;
  summaryError: string | null;
  diarizationEmbeddings: string | null;
  startedAt: string;
  endedAt: string | null;
  recordedMs: number | null;
  deletedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Series are matched by name on import, because ids differ between instances.
  seriesName: string | null;
  tagNames: string[];
};

export type BundleTranscript = {
  id: string;
  meetingId: string;
  speakerType: string;
  text: string;
  translation: string | null;
  createdAt: string;
};

export type BundleSummary = {
  id: string;
  meetingId: string;
  summaryText: string;
  provider: string | null;
  model: string | null;
  createdAt: string;
};

export type BundleSeries = {
  id: string;
  name: string;
  summaryFormat: string | null;
  sttGlossary: string | null;
  createdAt: string;
};

export type BundleTag = { id: string; name: string; createdAt: string };

export type BundleSpeakerProfile = {
  id: string;
  name: string;
  embedding: string;
  sampleCount: number;
  sourceMeetingId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BundleDb = {
  meetings: BundleMeeting[];
  transcripts: BundleTranscript[];
  summaries: BundleSummary[];
  series: BundleSeries[];
  tags: BundleTag[];
  speakerProfiles: BundleSpeakerProfile[];
};

export type RecordingEntry = {
  meetingId: string;
  wavBytes: number;
  /** Protected from the STT service's retention sweep. */
  keep: boolean;
  hasSegments: boolean;
  hasSpeakers: boolean;
  hasEmbeddings: boolean;
};

export type BackupManifest = {
  format: typeof BUNDLE_FORMAT;
  bundleVersion: number;
  appVersion: string;
  /** Newest applied Prisma migration, used to refuse a bundle from a newer schema. */
  dbMigration: string | null;
  exportedAt: string;
  includesRecordings: boolean;
  counts: {
    meetings: number;
    transcripts: number;
    summaries: number;
    series: number;
    tags: number;
    speakerProfiles: number;
  };
  recordings: RecordingEntry[];
};

export type Bundle = {
  manifest: BackupManifest;
  db: BundleDb;
  settings: AppSettings | null;
};

export class InvalidBundleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidBundleError";
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Check a decrypted manifest before anything is written.
 *
 * `knownMigrations` is the set of migration directory names this server has. A bundle naming a
 * migration we do not know came from a newer Voxinq — its rows may use columns that do not
 * exist here yet, so importing it would either fail halfway or silently drop data. An *older*
 * migration is fine: the importer names every field it writes.
 */
export function validateManifest(value: unknown, knownMigrations: string[]): BackupManifest {
  if (!isRecord(value)) throw new InvalidBundleError("the bundle has no readable manifest");
  if (value.format !== BUNDLE_FORMAT) throw new InvalidBundleError("this is not a Voxinq backup");

  const bundleVersion = value.bundleVersion;
  if (typeof bundleVersion !== "number" || !Number.isFinite(bundleVersion)) {
    throw new InvalidBundleError("the manifest has no bundle version");
  }
  if (bundleVersion > BUNDLE_VERSION) {
    throw new InvalidBundleError(
      `this backup was written by a newer Voxinq (bundle version ${bundleVersion}). Update this instance first.`,
    );
  }

  const dbMigration = typeof value.dbMigration === "string" ? value.dbMigration : null;
  if (dbMigration && knownMigrations.length > 0 && !knownMigrations.includes(dbMigration)) {
    throw new InvalidBundleError(
      `this backup comes from a newer database schema (${dbMigration}). Update this instance first.`,
    );
  }

  const counts = isRecord(value.counts) ? value.counts : {};
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

  return {
    format: BUNDLE_FORMAT,
    bundleVersion,
    appVersion: typeof value.appVersion === "string" ? value.appVersion : "unknown",
    dbMigration,
    exportedAt: typeof value.exportedAt === "string" ? value.exportedAt : "",
    includesRecordings: value.includesRecordings === true,
    counts: {
      meetings: num(counts.meetings),
      transcripts: num(counts.transcripts),
      summaries: num(counts.summaries),
      series: num(counts.series),
      tags: num(counts.tags),
      speakerProfiles: num(counts.speakerProfiles),
    },
    recordings: Array.isArray(value.recordings)
      ? value.recordings.filter(isRecord).map((r) => ({
          meetingId: String(r.meetingId ?? ""),
          wavBytes: num(r.wavBytes),
          keep: r.keep === true,
          hasSegments: r.hasSegments === true,
          hasSpeakers: r.hasSpeakers === true,
          hasEmbeddings: r.hasEmbeddings === true,
        }))
      : [],
  };
}

/** Check the row payload well enough that the importer can trust its shape. */
export function validateDb(value: unknown): BundleDb {
  if (!isRecord(value)) throw new InvalidBundleError("the bundle has no readable database");
  const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  const db: BundleDb = {
    meetings: arr<BundleMeeting>(value.meetings),
    transcripts: arr<BundleTranscript>(value.transcripts),
    summaries: arr<BundleSummary>(value.summaries),
    series: arr<BundleSeries>(value.series),
    tags: arr<BundleTag>(value.tags),
    speakerProfiles: arr<BundleSpeakerProfile>(value.speakerProfiles),
  };
  for (const m of db.meetings) {
    if (!m || typeof m.id !== "string" || !m.id) {
      throw new InvalidBundleError("the bundle contains a meeting without an id");
    }
  }
  return db;
}
