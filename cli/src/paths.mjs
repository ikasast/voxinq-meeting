// Where the launcher keeps state, and where it finds the app it is launching.
//
// Nothing lives next to the installed files. A package manager owns that directory and will
// replace it wholesale on upgrade -- putting a database there means an upgrade silently
// deletes every meeting. Data goes in the OS's own per-user location instead, and survives
// the app being reinstalled or removed.

import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Per-user data directory, following each platform's own convention. */
export function dataDir() {
  const override = process.env.VOXINQ_DATA_DIR;
  if (override) return resolve(override);
  const home = homedir();
  switch (platform()) {
    case "win32":
      return join(process.env.LOCALAPPDATA || join(home, "AppData", "Local"), "voxinq");
    case "darwin":
      return join(home, "Library", "Application Support", "voxinq");
    default:
      return join(process.env.XDG_DATA_HOME || join(home, ".local", "share"), "voxinq");
  }
}

export const paths = {
  data: dataDir,
  /** initdb target. Postgres refuses to start if anything else has written here. */
  pgdata: () => join(dataDir(), "pgdata"),
  /** Meeting audio. Large, and the one thing that cannot be regenerated. */
  recordings: () => join(dataDir(), "recordings"),
  /** Model weights, shared by both services. */
  cache: () => join(dataDir(), "cache"),
  logs: () => join(dataDir(), "logs"),
  /** What `start` wrote, so `stop` and `status` know what is running. */
  state: () => join(dataDir(), "state.json"),
};

/**
 * The Voxinq checkout or install this launcher belongs to.
 *
 * Installed from a package manager, the CLI sits inside the app directory, so walking up from
 * this file finds it. Run from a checkout during development it is the repository root. Either
 * way the marker is the same: a package.json that has Next as a dependency, which the CLI's own
 * package.json does not.
 */
export function appRoot() {
  const override = process.env.VOXINQ_APP_DIR;
  if (override) return resolve(override);
  let dir = HERE;
  for (let i = 0; i < 6; i++) {
    dir = dirname(dir);
    if (existsSync(join(dir, "next.config.ts")) || existsSync(join(dir, "next.config.js"))) {
      return dir;
    }
  }
  throw new Error(
    "Could not find the Voxinq app directory. Set VOXINQ_APP_DIR to the directory holding next.config.ts.",
  );
}
