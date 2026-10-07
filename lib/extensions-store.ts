import { promises as fs } from "node:fs";
import path from "node:path";
import { type ExtensionId, type ExtensionState, isExtensionId, resolveExtensions } from "./extensions";

// Which extensions are on, for the whole instance (lib/extensions.ts).
//
// A file of its own beside settings.json — the same folder, which is the `settings` volume in
// Docker — rather than a field of the settings: those are per person with a machine fallback,
// edited on one big form, and this is neither. One switch per extension, changed only by an
// administrator.

const FILE = path.join(
  path.dirname(process.env.VOXINQ_SETTINGS_PATH ?? path.join(process.cwd(), "settings.json")),
  "extensions.json",
);

export async function readExtensions(): Promise<ExtensionState> {
  try {
    return resolveExtensions(JSON.parse(await fs.readFile(FILE, "utf8")));
  } catch {
    return resolveExtensions(null); // no file yet: everything on, as in 3.x
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

