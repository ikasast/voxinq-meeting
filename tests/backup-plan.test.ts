import { describe, expect, it } from "vitest";
import { planImport, type ExistingState } from "../lib/backup/import";
import type { BundleDb, BundleMeeting, BundleSpeakerProfile } from "../lib/backup/manifest";

function meeting(id: string, extra: Partial<BundleMeeting> = {}): BundleMeeting {
  return {
    id,
    title: `meeting ${id}`,
    description: null,
    sttLanguage: null,
    whisperModel: null,
    speakerLabels: null,
    summaryStatus: null,
    summaryError: null,
    diarizationEmbeddings: null,
    startedAt: "2026-08-01T00:00:00.000Z",
    endedAt: null,
    recordedMs: null,
    deletedAt: null,
    archivedAt: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    seriesName: null,
    tagNames: [],
    ...extra,
  };
}

function profile(name: string): BundleSpeakerProfile {
  return {
    id: `p-${name}`,
    name,
    embedding: "[0.1,0.2]",
    sampleCount: 1,
    sourceMeetingId: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
}

function db(partial: Partial<BundleDb> = {}): BundleDb {
  return {
    meetings: [],
    transcripts: [],
    summaries: [],
    series: [],
    tags: [],
    speakerProfiles: [],
    ...partial,
  };
}

function existing(partial: Partial<ExistingState> = {}): ExistingState {
  return {
    meetingIds: new Set(),
    seriesNames: new Set(),
    tagNames: new Set(),
    profileNames: new Set(),
    ...partial,
  };
}

describe("planImport", () => {
  it("plans nothing for an empty bundle", () => {
    const plan = planImport(db(), existing());
    expect(plan.meetingsToCreate).toHaveLength(0);
    expect(plan.seriesToCreate).toHaveLength(0);
    expect(plan.tagsToCreate).toHaveLength(0);
  });

  it("imports meetings this instance does not have", () => {
    const plan = planImport(db({ meetings: [meeting("a"), meeting("b")] }), existing());
    expect(plan.meetingsToCreate.map((m) => m.id)).toEqual(["a", "b"]);
    expect(plan.skippedMeetingIds).toEqual([]);
  });

  it("skips meetings already here, so the same bundle can be imported twice", () => {
    const bundle = db({ meetings: [meeting("a"), meeting("b")] });
    const plan = planImport(bundle, existing({ meetingIds: new Set(["a"]) }));
    expect(plan.meetingsToCreate.map((m) => m.id)).toEqual(["b"]);
    expect(plan.skippedMeetingIds).toEqual(["a"]);

    const rerun = planImport(bundle, existing({ meetingIds: new Set(["a", "b"]) }));
    expect(rerun.meetingsToCreate).toHaveLength(0);
    expect(rerun.skippedMeetingIds).toEqual(["a", "b"]);
  });

  it("carries every series and tag, including ones no meeting currently uses", () => {
    const plan = planImport(
      db({
        meetings: [meeting("a", { seriesName: "Weekly", tagNames: ["hr", "budget"] })],
        series: [
          { id: "s1", name: "Weekly", summaryFormat: null, sttGlossary: null, createdAt: "2026-08-01T00:00:00.000Z" },
          { id: "s2", name: "Unused", summaryFormat: null, sttGlossary: null, createdAt: "2026-08-01T00:00:00.000Z" },
        ],
        tags: [
          { id: "t1", name: "hr", createdAt: "2026-08-01T00:00:00.000Z" },
          // A tag on no meetings is still the user's, so a backup has to bring it back.
          { id: "t2", name: "unused-but-mine", createdAt: "2026-08-01T00:00:00.000Z" },
        ],
      }),
      existing(),
    );
    expect(plan.seriesToCreate.sort()).toEqual(["Unused", "Weekly"]);
    expect(plan.tagsToCreate.sort()).toEqual(["budget", "hr", "unused-but-mine"]);
  });

  it("reuses a series or tag that already exists by name", () => {
    const plan = planImport(
      db({ meetings: [meeting("a", { seriesName: "Weekly", tagNames: ["hr"] })] }),
      existing({ seriesNames: new Set(["Weekly"]), tagNames: new Set(["hr"]) }),
    );
    expect(plan.seriesToCreate).toEqual([]);
    expect(plan.tagsToCreate).toEqual([]);
  });

  it("still creates a bundle's series when every meeting on it is being skipped", () => {
    const plan = planImport(
      db({
        meetings: [meeting("a", { seriesName: "Weekly" })],
        series: [
          { id: "s1", name: "Weekly", summaryFormat: "…", sttGlossary: null, createdAt: "2026-08-01T00:00:00.000Z" },
        ],
      }),
      existing({ meetingIds: new Set(["a"]) }),
    );
    expect(plan.meetingsToCreate).toHaveLength(0);
    expect(plan.seriesToCreate).toEqual(["Weekly"]);
  });

  it("keeps an existing voice profile rather than overwriting it with the bundle's", () => {
    const plan = planImport(
      db({ speakerProfiles: [profile("Sasaki"), profile("Kishida")] }),
      existing({ profileNames: new Set(["Sasaki"]) }),
    );
    expect(plan.profilesToCreate).toEqual(["Kishida"]);
    expect(plan.skippedProfileNames).toEqual(["Sasaki"]);
  });

  it("does not duplicate a tag shared by several meetings", () => {
    const plan = planImport(
      db({
        meetings: [meeting("a", { tagNames: ["hr"] }), meeting("b", { tagNames: ["hr", "legal"] })],
      }),
      existing(),
    );
    expect(plan.tagsToCreate).toEqual(["hr", "legal"]);
  });

  it("carries trashed and archived meetings, which a backup must not silently drop", () => {
    const plan = planImport(
      db({
        meetings: [
          meeting("a", { deletedAt: "2026-08-10T00:00:00.000Z" }),
          meeting("b", { archivedAt: "2026-08-10T00:00:00.000Z" }),
        ],
      }),
      existing(),
    );
    expect(plan.meetingsToCreate.map((m) => m.id)).toEqual(["a", "b"]);
  });
});
