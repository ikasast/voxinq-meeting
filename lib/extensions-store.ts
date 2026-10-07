import { promises as fs } from "node:fs";
import path from "node:path";
import { EXTENSION_IDS, type ExtensionId, type ExtensionState, isExtensionId, resolveExtensions } from "./extensions";
import { defaultsFrom, gatherEvidence } from "./extensions-defaults";

// Which extensions are on, for the whole instance (lib/extensions.ts).
//
// A file of its own beside settings.json — the same folder, which is the `settings` volume in
// Docker — rather than a field of the settings: those are per person with a machine fallback,
// edited on one big form, and this is neither. One switch per extension, changed only by an
// administrator.
//
// The first time there is no file, what the instance starts with is decided from what it already
// holds (lib/extensions-defaults.ts) and written, so it is decided once.

const FILE = path.join(
  path.dirname(process.env.VOXINQ_SETTINGS_PATH ?? path.join(process.cwd(), "settings.json")),
  "extensions.json",
);

/** One decision at a time: the first pages of a fresh start all arrive at once. */
let deciding: Promise<ExtensionState> | null = null;

async function decide(): Promise<ExtensionState> {
  try {
    const state = defaultsFrom(await gatherEvidence());
    await fs.writeFile(FILE, JSON.stringify(state, null, 2), "utf8");
    return state;
  } catch (e) {
    // The database is not there yet, or the folder cannot be written. Nothing is hidden for it —
    // everything 3.x had stays on — and nothing is written, so it is decided again next time.
    console.error("[extensions] could not decide the starting set", e);
    return Object.fromEntries(EXTENSION_IDS.map((id) => [id, true])) as ExtensionState;
  } finally {
    deciding = null;
  }
}

export async function readExtensions(): Promise<ExtensionState> {
  let raw: string;
  try {
    raw = await fs.readFile(FILE, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      deciding ??= decide();
      return deciding;
    }
    // Cannot be read (permissions): hide nothing.
    return Object.fromEntries(EXTENSION_IDS.map((id) => [id, true])) as ExtensionState;
  }
  try {
    return resolveExtensions(JSON.parse(raw));
  } catch {
    // A file that does not parse was not written by this: keep everything rather than hide it.
    return Object.fromEntries(EXTENSION_IDS.map((id) => [id, true])) as ExtensionState;
  }
}

export async function extensionEnabled(id: ExtensionId): Promise<boolean> {
  return (await readExtensions())[id];
}

/** Switch some on or off. Unknown ids and non-booleans are ignored. */
export async function writeExtensions(patch: Record<string, unknown>): Promise<ExtensionState> {
  const next = { ...(await readExtensions()) };
  for (const [id, on] of Object.entries(patch)) {
    if (isExtensionId(id) && typeof on === "boolean") next[id] = on;
  }
  await fs.writeFile(FILE, JSON.stringify(next, null, 2), "utf8");
  return next;
}
