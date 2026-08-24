#!/usr/bin/env node
// voxinq -- run Voxinq without Docker.
//
// Brings up the bundled PostgreSQL, the transcription service and the web app, wires them to
// each other on ports chosen at run time, and opens a browser. Everything runs in the
// background, so the terminal is free afterwards and closing it changes nothing.
//
//   voxinq setup     install what it needs (idempotent; also how you upgrade)
//   voxinq start     bring it up (and open the browser)
//   voxinq stop      shut it down
//   voxinq status    what is running, and where
//   voxinq logs      where the log files are
//
// What it deliberately does not manage: Ollama. It has its own installer on every platform,
// it is optional (a cloud model works instead), and a launcher that half-owns someone else's
// service is worse than one that reports whether it can see it.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { platform } from "node:os";
import { appRoot, paths } from "./paths.mjs";
import { pickPort, portFree, waitForHttp } from "./ports.mjs";
import { alive, clearState, readState, writeState } from "./state.mjs";
import { openBrowser, startService, stopService } from "./processes.mjs";
import { setupInstall } from "./setup.mjs";
import {
  databaseUrl,
  postgresRunning,
  runningPostgresPort,
  startPostgres,
  stopPostgres,
} from "./database.mjs";

const WEB_PORT = 3000;
const STT_PORT = 8000;
const DB_PORT = 5433; // not 5432: a machine with its own PostgreSQL should not have to move it

function say(msg) {
  process.stdout.write(`${msg}\n`);
}

function fail(msg) {
  process.stderr.write(`voxinq: ${msg}\n`);
  process.exit(1);
}

/** The Python that runs the transcription service, or null if setup has not been run. */
function sttPython(appDir) {
  const candidates =
    platform() === "win32"
      ? [join(appDir, "stt-service", ".venv", "Scripts", "python.exe")]
      : [join(appDir, "stt-service", ".venv", "bin", "python")];
  return candidates.find((p) => existsSync(p)) ?? null;
}

async function cmdStart(args) {
  const existing = readState();
  if (existing && alive(existing.web?.pid)) {
    say(`Already running at ${existing.url}`);
    if (!args.includes("--no-open")) openBrowser(existing.url);
    return;
  }

  const appDir = appRoot();
  const python = sttPython(appDir);
  if (!python) {
    fail(
      "The transcription service is not installed.\n" +
        `  Expected a virtualenv at ${join(appDir, "stt-service", ".venv")}\n` +
        '  Run "voxinq setup" to create it.',
    );
  }
  if (!existsSync(join(appDir, "node_modules"))) {
    fail(`The web app's dependencies are not installed in ${appDir}. Run "voxinq setup" first.`);
  }

  for (const dir of [paths.data(), paths.recordings(), paths.cache(), paths.logs()]) {
    mkdirSync(dir, { recursive: true });
  }

  // A database left running by an earlier start -- or by a start that got half way -- is
  // reused rather than fought with. Postgres refuses to start a second server over the same
  // data directory, and rightly so; the answer is not to try.
  const dbAlreadyUp = postgresRunning();
  const dbPort = (dbAlreadyUp && runningPostgresPort()) || (await pickPort(DB_PORT));
  const sttPort = await pickPort(STT_PORT);
  const webPort = await pickPort(WEB_PORT);

  if (dbAlreadyUp) {
    say(`Reusing the database already running on port ${dbPort}.`);
  } else {
    say("Starting the database…");
    const { fresh } = await startPostgres(dbPort);
    if (fresh) say("  created a new database");
  }
  const url = databaseUrl(dbPort);

  say("Applying database migrations…");
  // The package entry point run under this same node, rather than the .bin shim. On Windows a
  // shim is a .cmd that needs a shell, and the pid then belongs to cmd.exe rather than to the
  // thing being run -- which for a service is the difference between stopping it and not.
  const prismaEntry = join(appDir, "node_modules", "prisma", "build", "index.js");
  if (!existsSync(prismaEntry)) {
    fail(`Could not find Prisma in ${appDir}. Run "voxinq setup" first.`);
  }
  const migrate = spawnSync(process.execPath, [prismaEntry, "migrate", "deploy"], {
    cwd: appDir,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
    encoding: "utf-8",
  });
  if (migrate.error || migrate.status !== 0) {
    const detail = (migrate.stderr || migrate.stdout || migrate.error?.message || "").trim();
    fail(`Migrations failed:\n${detail || `exit code ${migrate.status}`}`);
  }

  say("Starting the transcription service…");
  const stt = startService("stt", python, ["-m", "uvicorn", "server:app", "--host", "127.0.0.1", "--port", String(sttPort)], {
    cwd: join(appDir, "stt-service"),
    env: {
      STT_RECORDINGS_DIR: paths.recordings(),
      HF_HOME: join(paths.cache(), "huggingface"),
      STT_PORT: String(sttPort),
    },
  });

  say("Starting the web app…");
  const nextEntry = join(appDir, "node_modules", "next", "dist", "bin", "next");
  if (!existsSync(nextEntry)) fail(`Could not find Next in ${appDir}. Run "voxinq setup" first.`);
  if (!existsSync(join(appDir, ".next"))) {
    fail(`No production build found in ${appDir}. Run "voxinq setup" first.`);
  }
  const web = startService("web", process.execPath, [nextEntry, "start", "-p", String(webPort)], {
    cwd: appDir,
    env: {
      DATABASE_URL: url,
      // Read per request, so the browser reaches the STT service on whichever port it got
      // without anything being rebuilt.
      STT_WS_URL: `ws://127.0.0.1:${sttPort}/ws`,
      STT_INTERNAL_URL: `http://127.0.0.1:${sttPort}`,
      NODE_ENV: "production",
    },
  });

  const appUrl = `http://127.0.0.1:${webPort}`;
  writeState({
    startedAt: new Date().toISOString(),
    url: appUrl,
    db: { port: dbPort },
    stt: { ...stt, port: sttPort },
    web: { ...web, port: webPort },
  });

  say("Waiting for the app to answer…");
  const up = await waitForHttp(`${appUrl}/api/health`, { timeoutMs: 120000 });
  if (!up) {
    say(`  it has not answered yet — check ${web.log}`);
  }

  say("");
  say(`  Voxinq is running at ${appUrl}`);
  say(`  transcription  127.0.0.1:${sttPort}`);
  say(`  database       127.0.0.1:${dbPort}`);
  say(`  logs           ${paths.logs()}`);
  say("");
  say('  Stop it with "voxinq stop".');
  if (!args.includes("--no-open")) openBrowser(appUrl);
}

async function cmdStop() {
  const state = readState();
  if (!state) {
    say("Not running.");
    return;
  }
  const stillUp = [];
  for (const [name, svc] of [
    ["web", state.web],
    ["transcription", state.stt],
  ]) {
    if (svc && alive(svc.pid)) {
      // Say what happened, not what was attempted. A stop that quietly failed leaves the port
      // held, and the next start picks a different one -- two copies, no error, no clue.
      if (stopService(svc.pid)) {
        say(`Stopped the ${name} service.`);
      } else {
        stillUp.push(`${name} (pid ${svc.pid})`);
      }
    }
  }
  if (state.db?.port) {
    try {
      if (await stopPostgres(state.db.port)) say("Stopped the database.");
    } catch (e) {
      stillUp.push(`database (port ${state.db.port})`);
      say(`Could not stop the database: ${e?.message ?? e}`);
    }
  }
  if (stillUp.length) {
    say("");
    say(`Still running: ${stillUp.join(", ")}.`);
    // The state file is what a later `voxinq stop` uses to find these. Deleting it now would
    // strand them: running, untracked, and holding the ports the next start wants.
    say('The state file is kept so "voxinq stop" can try again.');
    return;
  }
  clearState();
}

async function cmdStatus() {
  const state = readState();
  if (!state) {
    say("Not running.");
    return;
  }
  const webUp = alive(state.web?.pid);
  const sttUp = alive(state.stt?.pid);
  const dbUp = state.db?.port ? !(await portFree(state.db.port)) : false;
  say(`url            ${state.url}`);
  say(`started        ${state.startedAt}`);
  say(`web            ${webUp ? `running (pid ${state.web.pid})` : "not running"}`);
  say(`transcription  ${sttUp ? `running (pid ${state.stt.pid})` : "not running"}`);
  say(`database       ${dbUp ? `running (port ${state.db.port})` : "not running"}`);
  if (!webUp && !sttUp && !dbUp) {
    say("");
    say('Nothing is up. The state file is stale — "voxinq start" will replace it.');
  }
}

function cmdSetup() {
  const appDir = appRoot();
  say(`Setting up ${appDir}`);
  say("");
  setupInstall(appDir, { say });
  say("");
  say('  Done. Start it with "voxinq start".');
}

function cmdLogs() {
  say(paths.logs());
  for (const name of ["web", "stt"]) {
    const p = join(paths.logs(), `${name}.log`);
    if (existsSync(p)) say(`  ${p}`);
  }
}

function usage() {
  say("voxinq — run Voxinq without Docker");
  say("");
  say("  voxinq setup               install dependencies and build (safe to re-run)");
  say("  voxinq start [--no-open]   bring everything up and open the browser");
  say("  voxinq stop                shut it down");
  say("  voxinq status              what is running, and where");
  say("  voxinq logs                where the log files are");
  say("");
  say("Environment:");
  say("  VOXINQ_DATA_DIR  where the database, recordings and logs live");
  say("  VOXINQ_APP_DIR   the Voxinq install to run (defaults to the one this CLI sits in)");
}

const [command, ...rest] = process.argv.slice(2);
try {
  switch (command) {
    case "setup":
      cmdSetup();
      break;
    case "start":
      await cmdStart(rest);
      break;
    case "stop":
      await cmdStop();
      break;
    case "status":
      await cmdStatus();
      break;
    case "logs":
      cmdLogs();
      break;
    case undefined:
    case "help":
    case "--help":
    case "-h":
      usage();
      break;
    default:
      fail(`Unknown command "${command}". Try "voxinq help".`);
  }
} catch (e) {
  // embedded-postgres rejects with values that are not Errors, and `e.message` on one of those
  // throws inside the handler -- losing the actual reason and reporting a TypeError instead.
  fail(e?.message ?? (typeof e === "string" ? e : JSON.stringify(e)));
}
