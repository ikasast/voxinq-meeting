// Merging a backup bundle into this instance.
//
// Merge, not replace: importing adds what this instance does not have and leaves everything
// else alone. That makes an import safe to run against a live install, and safe to run twice —
// the second run finds every id already present and skips it.
//
// Matching rules, and why:
//   - Meetings by id. Ids are cuids, so a collision means the same meeting, not a different
//     one that happens to clash.
//   - Series and tags by *name*, because their ids differ between instances while the name is
//     what the user actually means. An existing one is never overwritten: local wins.
//   - Voice profiles by name, likewise — an imported embedding must not silently replace a
//     profile someone enrolled here.

import type { PrismaClient } from "@prisma/client";
import { prisma } from "../prisma";
import { writeSettings, type AppSettings } from "../settings";
import { sttInternalUrl } from "../stt/internal";
import type { BundleDb, BundleMeeting } from "./manifest";
import { setPhase } from "./progress";

export type ExistingState = {
  meetingIds: Set<string>;
  seriesNames: Set<string>;
  tagNames: Set<string>;
  profileNames: Set<string>;
};

export type ImportPlan = {
  meetingsToCreate: BundleMeeting[];
  skippedMeetingIds: string[];
  seriesToCreate: string[];
  tagsToCreate: string[];
  profilesToCreate: string[];
  skippedProfileNames: string[];
};

export type ImportResult = {
  meetingsImported: number;
  meetingsSkipped: number;
  meetingsFailed: { meetingId: string; error: string }[];
  transcriptsImported: number;
  summariesImported: number;
  seriesCreated: number;
  tagsCreated: number;
  profilesCreated: number;
  profilesSkipped: number;
  recordingsRestored: number;
  recordingsSkipped: number;
  recordingsFailed: number;
  settingsRestored: boolean;
};

/**
 * Decide what the import will do, without touching anything.
 *
 * Pure so the merge rules can be tested against fixtures rather than a database.
 */
export function planImport(db: BundleDb, existing: ExistingState): ImportPlan {
  const meetingsToCreate: BundleMeeting[] = [];
  const skippedMeetingIds: string[] = [];
  for (const m of db.meetings) {
    if (existing.meetingIds.has(m.id)) skippedMeetingIds.push(m.id);
    else meetingsToCreate.push(m);
  }

  // Every series and tag in the bundle, not only the ones the imported meetings reference. A
  // tag with no meetings on it right now is still something the user made, and a backup that
  // quietly dropped it would not be a backup. Names already here are left alone.
  const neededSeries = new Set<string>(db.series.map((s) => s.name));
  const neededTags = new Set<string>(db.tags.map((t) => t.name));
  for (const m of meetingsToCreate) {
    if (m.seriesName) neededSeries.add(m.seriesName);
    for (const t of m.tagNames ?? []) neededTags.add(t);
  }

  const profilesToCreate: string[] = [];
  const skippedProfileNames: string[] = [];
  for (const p of db.speakerProfiles) {
    if (existing.profileNames.has(p.name)) skippedProfileNames.push(p.name);
    else profilesToCreate.push(p.name);
  }

  return {
    meetingsToCreate,
    skippedMeetingIds,
    seriesToCreate: [...neededSeries].filter((n) => !existing.seriesNames.has(n)),
    tagsToCreate: [...neededTags].filter((n) => !existing.tagNames.has(n)),
    profilesToCreate,
    skippedProfileNames,
  };
}

async function readExisting(bundleMeetingIds: string[]): Promise<ExistingState> {
  // Only ask about the ids in the bundle: on a large instance, listing every meeting id to
  // answer "which of these 12 exist" would be pointless work.
  const [meetings, series, tags, profiles] = await Promise.all([
    prisma.meeting.findMany({ where: { id: { in: bundleMeetingIds } }, select: { id: true } }),
    prisma.series.findMany({ select: { name: true } }),
    prisma.tag.findMany({ select: { name: true } }),
    prisma.speakerProfile.findMany({ select: { name: true } }),
  ]);
  return {
    meetingIds: new Set(meetings.map((m) => m.id)),
    seriesNames: new Set(series.map((s) => s.name)),
    tagNames: new Set(tags.map((t) => t.name)),
    profileNames: new Set(profiles.map((p) => p.name)),
  };
}

/** Files for one meeting, as laid out inside the bundle zip. */
export type RecordingFiles = {
  wav: Buffer;
  segments?: unknown;
  speakers?: unknown;
  embeddings?: unknown;
  keep?: boolean;
};

export type ImportInput = {
  db: BundleDb;
  settings: AppSettings | null;
  restoreSettings: boolean;
  /** Returns the recording files for a meeting, or null when the bundle has none. */
  readRecording: (meetingId: string) => Promise<RecordingFiles | null>;
  onPhase?: (phase: string) => void;
};

export async function runImport(input: ImportInput): Promise<ImportResult> {
  const phase = (p: string) => {
    setPhase(p);
    input.onPhase?.(p);
  };

  phase("checking what is already here");
  const existing = await readExisting(input.db.meetings.map((m) => m.id));
  const plan = planImport(input.db, existing);

  const result: ImportResult = {
    meetingsImported: 0,
    meetingsSkipped: plan.skippedMeetingIds.length,
    meetingsFailed: [],
    transcriptsImported: 0,
    summariesImported: 0,
    seriesCreated: 0,
    tagsCreated: 0,
    profilesCreated: 0,
    profilesSkipped: plan.skippedProfileNames.length,
    recordingsRestored: 0,
    recordingsSkipped: 0,
    recordingsFailed: 0,
    settingsRestored: false,
  };

  // --- Series and tags, so meetings can connect to them -------------------------------------
  phase("series and tags");
  const bundleSeries = new Map(input.db.series.map((s) => [s.name, s]));
  for (const name of plan.seriesToCreate) {
    const src = bundleSeries.get(name);
    try {
      await prisma.series.create({
        data: {
          name,
          summaryFormat: src?.summaryFormat ?? null,
          sttGlossary: src?.sttGlossary ?? null,
        },
      });
      result.seriesCreated += 1;
    } catch {
      // Unique violation: something created it between the read and now. Fine — local wins.
    }
  }
  for (const name of plan.tagsToCreate) {
    try {
      await prisma.tag.create({ data: { name } });
      result.tagsCreated += 1;
    } catch {
      // Same as above.
    }
  }

  const seriesIdByName = new Map(
    (await prisma.series.findMany({ select: { id: true, name: true } })).map((s) => [s.name, s.id]),
  );

  // --- Voice profiles ------------------------------------------------------------------------
  const newProfiles = input.db.speakerProfiles.filter((p) => plan.profilesToCreate.includes(p.name));
  if (newProfiles.length > 0) {
    phase("voice profiles");
    const created = await prisma.speakerProfile.createMany({
      data: newProfiles.map((p) => ({
        id: p.id,
        name: p.name,
        embedding: p.embedding,
        sampleCount: p.sampleCount,
        sourceMeetingId: p.sourceMeetingId,
        createdAt: new Date(p.createdAt),
        updatedAt: new Date(p.updatedAt),
      })),
      skipDuplicates: true,
    });
    result.profilesCreated = created.count;
  }

  // --- Meetings ------------------------------------------------------------------------------
  const transcriptsByMeeting = new Map<string, typeof input.db.transcripts>();
  for (const t of input.db.transcripts) {
    const list = transcriptsByMeeting.get(t.meetingId) ?? [];
    list.push(t);
    transcriptsByMeeting.set(t.meetingId, list);
  }
  const summariesByMeeting = new Map<string, typeof input.db.summaries>();
  for (const s of input.db.summaries) {
    const list = summariesByMeeting.get(s.meetingId) ?? [];
    list.push(s);
    summariesByMeeting.set(s.meetingId, list);
  }

  const imported: string[] = [];
  let n = 0;
  for (const m of plan.meetingsToCreate) {
    n += 1;
    phase(`meetings ${n}/${plan.meetingsToCreate.length}`);

    const transcripts = transcriptsByMeeting.get(m.id) ?? [];
    const summaries = summariesByMeeting.get(m.id) ?? [];

    try {
      // One transaction per meeting rather than one for everything: a single bad row then
      // costs one meeting instead of the whole import, and because re-importing skips ids
      // that already landed, a partial import can simply be run again.
      await prisma.$transaction(async (tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]) => {
        await tx.meeting.create({
          data: {
            id: m.id,
            title: m.title,
            description: m.description,
            sttLanguage: m.sttLanguage,
            whisperModel: m.whisperModel,
            speakerLabels: m.speakerLabels,
            summaryStatus: m.summaryStatus,
            summaryError: m.summaryError,
            diarizationEmbeddings: m.diarizationEmbeddings,
            startedAt: new Date(m.startedAt),
            endedAt: m.endedAt ? new Date(m.endedAt) : null,
            recordedMs: m.recordedMs,
            deletedAt: m.deletedAt ? new Date(m.deletedAt) : null,
            archivedAt: m.archivedAt ? new Date(m.archivedAt) : null,
            createdAt: new Date(m.createdAt),
            updatedAt: new Date(m.updatedAt),
            seriesId: m.seriesName ? (seriesIdByName.get(m.seriesName) ?? null) : null,
            tags: m.tagNames?.length ? { connect: m.tagNames.map((name) => ({ name })) } : undefined,
          },
        });
        if (transcripts.length > 0) {
          await tx.transcript.createMany({
            data: transcripts.map((t) => ({
              id: t.id,
              meetingId: t.meetingId,
              speakerType: t.speakerType,
              text: t.text,
              translation: t.translation,
              // Verbatim, never defaulted: this is the transcript's running order, and
              // diarization maps speakers onto utterances by position.
              createdAt: new Date(t.createdAt),
            })),
          });
        }
        if (summaries.length > 0) {
          await tx.meetingSummary.createMany({
            data: summaries.map((s) => ({
              id: s.id,
              meetingId: s.meetingId,
              summaryText: s.summaryText,
              provider: s.provider,
              model: s.model,
              createdAt: new Date(s.createdAt),
            })),
          });
        }
      });
      result.meetingsImported += 1;
      result.transcriptsImported += transcripts.length;
      result.summariesImported += summaries.length;
      imported.push(m.id);
    } catch (e) {
      result.meetingsFailed.push({
        meetingId: m.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // --- Recordings ----------------------------------------------------------------------------
  // After the rows, and outside their transactions: a recording without its meeting is
  // useless, and a meeting without its recording is merely diminished.
  if (imported.length > 0) {
    const base = sttInternalUrl();
    let r = 0;
    for (const meetingId of imported) {
      r += 1;
      const files = await input.readRecording(meetingId);
      if (!files) continue;
      phase(`recordings ${r}/${imported.length}`);

      try {
        const res = await fetch(`${base}/recordings/${meetingId}/restore`, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: new Uint8Array(files.wav),
          signal: AbortSignal.timeout(60000),
        });
        if (!res.ok) {
          result.recordingsFailed += 1;
          continue;
        }
        const body = (await res.json().catch(() => null)) as { skipped?: boolean } | null;
        if (body?.skipped) result.recordingsSkipped += 1;
        else result.recordingsRestored += 1;

        if (files.segments || files.speakers || files.embeddings || files.keep) {
          await fetch(`${base}/recordings/${meetingId}/sidecars`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              segments: files.segments ?? null,
              speakers: files.speakers ?? null,
              embeddings: files.embeddings ?? null,
              keep: files.keep === true,
            }),
            signal: AbortSignal.timeout(30000),
          }).catch(() => null);
        }
      } catch {
        // The database half is what matters; report the shortfall rather than fail the import.
        result.recordingsFailed += 1;
      }
    }
  }

  // --- Settings ------------------------------------------------------------------------------
  if (input.restoreSettings && input.settings) {
    phase("settings");
    // writeSettings merges over the current values and re-validates, so a bundle from an older
    // version cannot write a field this one would reject.
    await writeSettings(input.settings);
    result.settingsRestored = true;
  }

  return result;
}
