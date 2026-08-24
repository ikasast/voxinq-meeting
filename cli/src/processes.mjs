// Starting and stopping the two long-running services.
//
// Both are started detached, with output to a log file, so `voxinq start` can return and leave
// them running -- the alternative is a terminal window that must stay open for the app to
// exist, which is exactly the friction this launcher is meant to remove.

import { spawn, spawnSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, writeSync } from "node:fs";
import { join } from "node:path";
import { platform } from "node:os";
import { paths } from "./paths.mjs";
import { alive } from "./state.mjs";

/**
 * Start a detached background process writing to `<logs>/<name>.log`.
 *
 * stdio goes to a file rather than a pipe on purpose: a pipe nobody reads fills its buffer and
 * blocks the child, which shows up much later as a service that mysteriously stops responding.
 */
export function startService(name, command, args, { cwd, env }) {
  mkdirSync(paths.logs(), { recursive: true });
  const logPath = join(paths.logs(), `${name}.log`);
  // A raw descriptor, not a WriteStream: streams open lazily, so at spawn time their fd is
  // still null and stdio is rejected. The child inherits this one directly.
  const fd = openSync(logPath, "a");
  writeSync(fd, `\n=== ${new Date().toISOString()} ${command} ${args.join(" ")}\n`);

  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    detached: true,
    stdio: ["ignore", fd, fd],
    // Windows resolves .cmd/.bat launchers only through a shell.
    shell: platform() === "win32" && /\.(cmd|bat)$/i.test(command),
  });
  child.unref();
  // The child holds its own copy; this one would otherwise leak per start.
  closeSync(fd);
  return { pid: child.pid, log: logPath };
}

/**
 * Stop a process and the children it started, and wait until it is really gone.
 *
 * The tree matters: Next spawns workers, and killing only the parent leaves them holding the
 * port, so the next `voxinq start` fails on a port nothing appears to own. Windows has
 * taskkill /T for that; elsewhere the process group gets the signal, which is why services are
 * started detached -- detached puts them in their own group.
 *
 * Waiting matters just as much. Signalling is asynchronous, and an earlier version reported
 * "Stopped the web service" while the port stayed bound for as long as anyone cared to look --
 * a stop command that lies is worse than one that fails, because nobody goes looking.
 *
 * Returns true only if the process is gone.
 */
export function stopService(pid, { timeoutMs = 10000 } = {}) {
  if (!alive(pid)) return true;
  try {
    if (platform() === "win32") {
      spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      try {
        process.kill(-pid, "SIGTERM");
      } catch {
        process.kill(pid, "SIGTERM");
      }
    }
  } catch {
    return !alive(pid);
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!alive(pid)) return true;
    // A short synchronous wait: this runs in a CLI that has nothing else to do, and making it
    // async would mean every caller had to remember to await it.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  if (platform() !== "win32") {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        /* already gone */
      }
    }
  }
  return !alive(pid);
}

/** Open a URL in the default browser. No dependency: every platform ships one of these. */
export function openBrowser(url) {
  const [cmd, args] =
    platform() === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : platform() === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
  } catch {
    // A machine with no browser (a server) is a normal way to run this -- the URL was printed.
  }
}
