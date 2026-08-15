import { describe, expect, it } from "vitest";
import {
  BUNDLE_FORMAT,
  BUNDLE_VERSION,
  InvalidBundleError,
  validateDb,
  validateManifest,
} from "../lib/backup/manifest";

const MIGRATIONS = ["20260801000000_init", "20260812090000_add_profile_sample_count"];

function manifest(extra: Record<string, unknown> = {}) {
  return {
    format: BUNDLE_FORMAT,
    bundleVersion: BUNDLE_VERSION,
    appVersion: "1.3.1",
    dbMigration: "20260812090000_add_profile_sample_count",
    exportedAt: "2026-08-15T00:00:00.000Z",
    includesRecordings: true,
    counts: { meetings: 2, transcripts: 10, summaries: 1, series: 1, tags: 2, speakerProfiles: 0 },
    recordings: [{ meetingId: "m1", wavBytes: 1234, keep: true, hasSegments: true }],
    ...extra,
  };
}

describe("validateManifest", () => {
  it("accepts a manifest from this version", () => {
    const out = validateManifest(manifest(), MIGRATIONS);
    expect(out.counts.meetings).toBe(2);
    expect(out.recordings[0]).toMatchObject({ meetingId: "m1", keep: true, hasSegments: true });
    expect(out.recordings[0].hasSpeakers).toBe(false);
  });

  it("accepts a bundle from an older schema, which the importer maps field by field", () => {
    const out = validateManifest(manifest({ dbMigration: "20260801000000_init" }), MIGRATIONS);
    expect(out.dbMigration).toBe("20260801000000_init");
  });

  it("refuses a bundle from a newer schema rather than importing it half-way", () => {
    expect(() =>
      validateManifest(manifest({ dbMigration: "20270101000000_future_column" }), MIGRATIONS),
    ).toThrow(InvalidBundleError);
  });

  it("refuses a newer bundle format", () => {
    expect(() => validateManifest(manifest({ bundleVersion: BUNDLE_VERSION + 1 }), MIGRATIONS)).toThrow(
      /newer Voxinq/,
    );
  });

  it("rejects a file that is not a Voxinq bundle", () => {
    expect(() => validateManifest({ format: "something-else" }, MIGRATIONS)).toThrow(InvalidBundleError);
    expect(() => validateManifest(null, MIGRATIONS)).toThrow(InvalidBundleError);
    expect(() => validateManifest("nope", MIGRATIONS)).toThrow(InvalidBundleError);
  });

  it("rejects a manifest with no bundle version", () => {
    const rest: Record<string, unknown> = manifest();
    delete rest.bundleVersion;
    expect(() => validateManifest(rest, MIGRATIONS)).toThrow(/bundle version/);
  });

  it("skips the schema check when the server has no migration list", () => {
    const out = validateManifest(manifest({ dbMigration: "20270101000000_future" }), []);
    expect(out.dbMigration).toBe("20270101000000_future");
  });

  it("tolerates missing counts rather than failing the import over cosmetics", () => {
    const out = validateManifest(manifest({ counts: undefined, recordings: undefined }), MIGRATIONS);
    expect(out.counts.meetings).toBe(0);
    expect(out.recordings).toEqual([]);
  });
});

describe("validateDb", () => {
  it("defaults missing tables to empty arrays", () => {
    const db = validateDb({ meetings: [] });
    expect(db.transcripts).toEqual([]);
    expect(db.speakerProfiles).toEqual([]);
  });

  it("rejects a meeting with no id, which could not be merged", () => {
    expect(() => validateDb({ meetings: [{ title: "no id" }] })).toThrow(InvalidBundleError);
  });

  it("rejects a payload that is not an object", () => {
    expect(() => validateDb([])).toThrow(InvalidBundleError);
  });
});
