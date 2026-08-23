// The bundled PostgreSQL.
//
// Installing and configuring PostgreSQL is the single hardest prerequisite in the native
// setup, and the one most likely to end an install attempt. embedded-postgres ships the real
// server binaries per platform, so this is not a different database with different behaviour:
// the schema, the migrations and the Prisma provider are the same ones the Docker install
// uses, and a dump moves between them.
//
// It runs on loopback only, with a password generated once and kept in the data directory.
// There is no configuration for this and there should not be: a single-user local database
// reachable from the network is a mistake waiting to be made, not a feature.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { paths } from "./paths.mjs";

const USER = "voxinq";
const DATABASE = "voxinq";

/** The password for the bundled database, generated on first run and reused after that. */
function password() {
  const file = join(paths.data(), "db-password");
  if (existsSync(file)) return readFileSync(file, "utf-8").trim();
  const generated = randomBytes(24).toString("base64url");
  mkdirSync(paths.data(), { recursive: true });
  writeFileSync(file, generated, { encoding: "utf-8", mode: 0o600 });
  return generated;
}

export function databaseUrl(port) {
  // 127.0.0.1, never "localhost": on Windows that resolves to ::1 first, and anything else
  // holding the port on IPv6 answers instead -- silently, with no error to point at.
  return `postgresql://${USER}:${encodeURIComponent(password())}@127.0.0.1:${port}/${DATABASE}`;
}

/** The wrapper around the bundled binaries. Constructing it starts nothing and writes nothing. */
async function instance(port) {
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  return new EmbeddedPostgres({
    databaseDir: paths.pgdata(),
    user: USER,
    password: password(),
    port,
    persistent: true,
    // Loopback only. This database holds every meeting transcript on the machine.
    postgresFlags: ["-c", "listen_addresses=127.0.0.1"],
  });
}

/**
 * Start the bundled server, initialising the data directory on first run.
 *
 * Initialisation is detected by the presence of the data directory rather than tracked in
 * state: the state file can be lost, the data directory is the thing that actually matters,
 * and initdb over an existing one would fail.
 */
export async function startPostgres(port) {
  const fresh = !existsSync(paths.pgdata());
  const pg = await instance(port);
  if (fresh) {
    mkdirSync(paths.data(), { recursive: true });
    await pg.initialise();
  }
  await pg.start();
  if (fresh) {
    await pg.createDatabase(DATABASE);
  }
  return { pg, fresh };
}

/**
 * Is a healthy server running against our data directory?
 *
 * Asked of pg_ctl, not of the port. A postmaster that failed part way through startup leaves
 * the port bound and answers connections while being unable to serve any -- reusing that
 * because "something is listening" produced a migration failure whose message pointed at a
 * database that was, as far as the network was concerned, right there.
 */
export function postgresRunning() {
  const dir = paths.pgdata();
  if (!existsSync(dir)) return false;
  const bin = pgCtlPath();
  if (!bin) return false;
  const res = spawnSync(bin, ["-D", dir, "status"], { stdio: "pipe", encoding: "utf-8" });
  return res.status === 0;
}

// @embedded-postgres names its platform packages after the OS, not after process.platform:
// "windows-x64", not "win32-x64". Getting that wrong is silent -- pg_ctl is simply never
// found, postgresRunning() answers false for a server that is running, and start then tries to
// launch a second one over the same data directory.
const PLATFORM_PACKAGE = { win32: "windows", darwin: "darwin", linux: "linux" };

/** The pg_ctl that ships with the platform package, or null if it is not installed. */
function pgCtlPath() {
  const os = PLATFORM_PACKAGE[process.platform];
  if (!os) return null;
  const exe = process.platform === "win32" ? "pg_ctl.exe" : "pg_ctl";
  const url = new URL(
    `../node_modules/@embedded-postgres/${os}-${process.arch}/native/bin/${exe}`,
    import.meta.url,
  );
  const path = fileURLToPath(url);
  return existsSync(path) ? path : null;
}

/**
 * The port a running server is on, read from its own postmaster.pid.
 *
 * Postgres writes the port there on startup (line 4), which makes it the only source that is
 * right by construction. Taking it from the launcher's state file instead means a lost or
 * stale state file turns into "reusing the database on port 5434" while the database sits on
 * 5433 -- a confident sentence about the wrong number.
 */
export function runningPostgresPort() {
  try {
    const lines = readFileSync(join(paths.pgdata(), "postmaster.pid"), "utf-8").split("\n");
    const port = Number.parseInt(lines[3], 10);
    return Number.isInteger(port) && port > 0 ? port : null;
  } catch {
    return null;
  }
}

/**
 * Stop a running server.
 *
 * Its own function because the obvious shortcut is wrong: calling startPostgres here to get an
 * object to stop *starts a server first*, which on an already-stopped instance leaves one
 * running that nobody is tracking. Constructing the wrapper touches nothing on disk.
 */
export function stopPostgres(port, { timeoutSeconds = 30 } = {}) {
  if (!existsSync(paths.pgdata())) return false;
  if (!postgresRunning()) return false;
  const bin = pgCtlPath();
  if (!bin) throw new Error("the bundled PostgreSQL binaries are missing");
  // pg_ctl against the data directory, not the library's own stop(). embedded-postgres stops
  // the child *it* started, and the server is usually not that: it outlives the command that
  // launched it, so the next `voxinq stop` is a different process with no handle to it. pg_ctl
  // needs only the directory, which is what makes it work in both cases. -w waits for the
  // shutdown to finish, so a true return means the port is actually free.
  const res = spawnSync(bin, ["-D", paths.pgdata(), "-m", "fast", "-w", "-t", String(timeoutSeconds), "stop"], {
    stdio: "pipe",
    encoding: "utf-8",
  });
  if (res.status === 0 && !postgresRunning()) return true;
  throw new Error(
    (res.stderr || res.stdout || `pg_ctl exited ${res.status}`).trim().split("\n").pop(),
  );
}
