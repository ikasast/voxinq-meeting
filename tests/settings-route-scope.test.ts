import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// The settings page posts everything it holds, machine keys included, because a hand-kept list
// of fields is how fields went missing from saves before. So a non-administrator's save always
// carries the Whisper model and the VRAM budget, unchanged, and that must not read as an
// attempt to change them.

const machine = {
  whisperModel: "large-v3-turbo",
  vramBudgetMb: 0,
  ollamaNumCtx: 0,
  requireAppLock: false,
  recordingRetentionDays: -1,
  trashRetentionDays: 30,
  sttProfiles: [],
};
const me = { id: "u1", isAdmin: false };
const writeSettings = vi.fn(async (p: object) => ({ ...machine, ...p }));
const writeUserSettings = vi.fn(async (_id: string, p: object) => ({ ...machine, ...p }));

vi.mock("@/lib/settings", () => ({
  readSettings: async () => machine,
  readMachineSettings: async () => machine,
  writeSettings: (p: object) => writeSettings(p),
  writeUserSettings: (id: string, p: object) => writeUserSettings(id, p),
  toPublic: (s: object) => s,
}));
vi.mock("@/lib/auth/session", () => ({ currentUser: async () => me }));
vi.mock("@/lib/extensions-store", () => ({ readExtensions: async () => ({}) }));
vi.mock("@/lib/extensions-settings", () => ({
  keysKeptWhileOff: () => [],
  withExtensions: (s: object) => s,
}));
vi.mock("@/lib/api", () => ({
  apiError: (error: string, status: number) => Response.json({ error }, { status }),
}));
vi.mock("@/lib/retention", () => ({ pushRecordingRetention: async () => {} }));

const { PATCH } = await import("@/app/api/settings/route");

function patch(body: object) {
  return PATCH({ json: async () => body } as unknown as NextRequest);
}

describe("PATCH /api/settings as a non-administrator", () => {
  beforeEach(() => {
    writeSettings.mockClear();
    writeUserSettings.mockClear();
  });

  it("saves their own settings when the form carries the machine's values unchanged", async () => {
    const res = await patch({ ...machine, sttLanguage: "ja" });
    expect(res.status).toBe(200);
    expect(writeSettings).not.toHaveBeenCalled();
    expect(writeUserSettings).toHaveBeenCalledWith("u1", expect.objectContaining({ sttLanguage: "ja" }));
    expect(writeUserSettings.mock.calls[0][1]).not.toHaveProperty("whisperModel");
  });

  it("is still refused a change to a machine key", async () => {
    const res = await patch({ ...machine, whisperModel: "small" });
    expect(res.status).toBe(403);
    expect(writeSettings).not.toHaveBeenCalled();
    expect(writeUserSettings).not.toHaveBeenCalled();
  });
});
