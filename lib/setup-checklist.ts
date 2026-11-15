import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "./prisma";

// What the first-run checklist on the home page remembers (app/setup-checklist.tsx).
//
// Most of what it shows is asked fresh each time — whether the minutes model is there, whether
// the transcription service answers — because the answer can change under it. Two things cannot
// be asked: that somebody closed it, and that a phone once reached the transcription service.
// Those live here, in a file of their own beside settings.json, as extensions.json does: they
// are the instance's, not anybody's preference, and they are not settings anybody edits.

const FILE = path.join(
  path.dirname(process.env.VOXINQ_SETTINGS_PATH ?? path.join(process.cwd(), "settings.json")),
  "setup-checklist.json",
);

export type PhoneReach = {
  /** ISO time of the first time a phone reached the transcription service. */
  at: string;
  /** "app": the Android app. "browser": a phone's browser. */
  via: "app" | "browser";
};

export type ChecklistState = {
  dismissed: boolean;
  phone: PhoneReach | null;
};

/** One decision at a time: the first pages of a fresh start all arrive at once. */
let deciding: Promise<ChecklistState> | null = null;

/**
 * The first time there is no file. An install that already holds meetings of its own was set up
 * before this existed, and a checklist appearing on it after an upgrade would be telling its
 * owner how to do what they did months ago — so it starts closed. The sample meeting does not
 * count: making one is one of the things the checklist offers.
 */
async function decide(): Promise<ChecklistState> {
  try {
    const meetings = await prisma.meeting.count({ where: { sample: false } });
    const state: ChecklistState = { dismissed: meetings > 0, phone: null };
    await fs.writeFile(FILE, JSON.stringify(state, null, 2), "utf8");
    return state;
  } catch (e) {
    // No database yet, or the folder cannot be written: show nothing, and decide next time.
    console.error("[setup-checklist] could not decide whether to show", e);
    return { dismissed: true, phone: null };
  } finally {
    deciding = null;
  }
}

export function parseChecklistState(raw: unknown): ChecklistState {
  const o = (raw ?? {}) as Record<string, unknown>;
  const p = (o.phone ?? null) as Record<string, unknown> | null;
  const phone =
    p && typeof p.at === "string" && !Number.isNaN(Date.parse(p.at)) && (p.via === "app" || p.via === "browser")
      ? { at: p.at, via: p.via as PhoneReach["via"] }
      : null;
  // Anything but an explicit false is closed: a file somebody edited into nonsense should not
  // bring the checklist back.
  return { dismissed: o.dismissed !== false, phone };
}

export async function readChecklistState(): Promise<ChecklistState> {
  let raw: string;
  try {
    raw = await fs.readFile(FILE, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      deciding ??= decide();
      return deciding;
    }
    return { dismissed: true, phone: null };
  }
  try {
    return parseChecklistState(JSON.parse(raw));
  } catch {
    return { dismissed: true, phone: null };
  }
}

async function write(next: ChecklistState): Promise<ChecklistState> {
  await fs.writeFile(FILE, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export async function dismissChecklist(): Promise<ChecklistState> {
  return write({ ...(await readChecklistState()), dismissed: true });
}

/** Remember the first phone to reach the transcription service. Later ones change nothing. */
export async function notePhoneReach(via: PhoneReach["via"]): Promise<ChecklistState> {
  const state = await readChecklistState();
  if (state.phone) return state;
  return write({ ...state, phone: { at: new Date().toISOString(), via } });
}

/** Which kind of phone a User-Agent is, or null for anything that is not one. */
export function phoneKind(userAgent: string | null): PhoneReach["via"] | null {
  if (!userAgent) return null;
  if (/\bVoxinqAndroid\//.test(userAgent)) return "app";
  if (/\b(Android|iPhone|iPad|iPod)\b/.test(userAgent) || /\bMobile\b/.test(userAgent)) return "browser";
  return null;
}
