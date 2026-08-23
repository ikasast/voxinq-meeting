// What is running, recorded between commands.
//
// `start` writes it, `stop` and `status` read it. A pid on its own is not proof: pids are
// reused, and a machine that lost power leaves a state file describing processes that no
// longer exist. So everything read back out is checked against the live process before it is
// believed.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { paths } from "./paths.mjs";

export function readState() {
  try {
    return JSON.parse(readFileSync(paths.state(), "utf-8"));
  } catch {
    return null;
  }
}

export function writeState(state) {
  mkdirSync(dirname(paths.state()), { recursive: true });
  writeFileSync(paths.state(), JSON.stringify(state, null, 2), "utf-8");
}

export function clearState() {
  rmSync(paths.state(), { force: true });
}

/** Is this pid a process that still exists? Signal 0 checks without delivering anything. */
export function alive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM means it exists and belongs to someone else -- still running, as far as we care.
    return e.code === "EPERM";
  }
}
