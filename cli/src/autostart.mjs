// Starting Voxinq when the machine does, through whatever each OS already uses for it.
//
// No daemon of our own, and nothing that has to be running for this to work: every OS is
// already good at "run this at login", and a supervisor that itself needs supervising is the
// thing to avoid. Each platform gets its native mechanism, and `off` removes exactly what `on`
// created.
//
//   Windows   a Task Scheduler task, at logon
//   macOS     a launchd LaunchAgent, RunAtLoad
//   Linux     a systemd user service, wanted by default.target
//
// All three register `voxinq start --no-open`: opening a browser is not what someone asked for
// by saying "start with the machine".

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, platform, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { paths } from "./paths.mjs";

const TASK_NAME = "Voxinq";
const LABEL = "com.voxinq.launcher";
const NL = "\n";

/** How this CLI would be re-invoked at login: this node, running this entry point. */
function command() {
  return { node: process.execPath, entry: fileURLToPath(new URL("./index.mjs", import.meta.url)) };
}

/**
 * Environment worth carrying into the login session.
 *
 * Only what was set deliberately. A login task gets its own environment, and copying this
 * process's whole one would freeze today's PATH into a registration that then breaks the first
 * time Node is upgraded.
 */
function carried() {
  const out = {};
  for (const key of ["VOXINQ_APP_DIR", "VOXINQ_DATA_DIR"]) {
    if (process.env[key]) out[key] = process.env[key];
  }
  return out;
}

// ---- Windows ------------------------------------------------------------------------------

/** A PowerShell single-quoted literal. Inside one, the only character with meaning is `'`. */
function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Run a PowerShell script from a file, so nothing has to survive a second round of parsing. */
function powershell(script) {
  const file = join(tmpdir(), `voxinq-autostart-${process.pid}.ps1`);
  writeFileSync(file, script, "utf-8");
  try {
    return spawnSync(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", file],
      { stdio: "pipe", encoding: "utf-8" },
    );
  } finally {
    rmSync(file, { force: true });
  }
}

/** Where the login task's script lives. Beside the data, which is where per-user state goes. */
function launcherScriptPath() {
  return join(paths.data(), "autostart.ps1");
}

function windowsOn() {
  const { node, entry } = command();

  // The task runs a script file, and that file holds the paths. The alternative is a -Command
  // nested inside an -Argument nested inside a .ps1 -- three rounds of quoting over paths that
  // contain spaces, and the default Node install path breaks it at the first one.
  //
  // --no-wait so the task finishes in seconds: the services are already spawned by then, and
  // waiting for the health check only keeps a login task alive for no benefit.
  const lines = [
    '# Written by "voxinq autostart on". Remove it with "voxinq autostart off".',
    ...Object.entries(carried()).map(([k, v]) => `$env:${k} = ${psQuote(v)}`),
    `& ${psQuote(node)} ${psQuote(entry)} start --no-open --no-wait`,
  ];
  mkdirSync(paths.data(), { recursive: true });
  writeFileSync(launcherScriptPath(), lines.join(NL) + NL, "utf-8");

  // Register-ScheduledTask, not schtasks. `schtasks /SC ONLOGON` registers a task that fires
  // for every user and is refused without elevation -- measured, "Access is denied" on every
  // variant of it. The PowerShell API registers against this user and needs no elevation.
  const argument = `-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "${launcherScriptPath()}"`;
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ${psQuote(argument)}`,
    '$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\\$env:USERNAME"',
    // ExecutionTimeLimit 0 = no limit, and it is load-bearing. Windows counts a task as
    // running while any descendant is, so this task stays "Running" for as long as Voxinq is
    // up -- which is honest, and means stopping the task stops Voxinq. The default three-day
    // limit would otherwise kill the services out from under a machine left switched on.
    "$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)",
    `Register-ScheduledTask -TaskName ${psQuote(TASK_NAME)} -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null`,
  ].join(NL);

  const res = powershell(script);
  if (res.status !== 0) {
    throw new Error((res.stderr || res.stdout || "Register-ScheduledTask failed").trim());
  }
  return `Task Scheduler task "${TASK_NAME}"`;
}

function windowsOff() {
  const res = powershell(
    `Unregister-ScheduledTask -TaskName ${psQuote(TASK_NAME)} -Confirm:$false -ErrorAction Stop`,
  );
  rmSync(launcherScriptPath(), { force: true });
  return res.status === 0;
}

function windowsStatus() {
  const res = powershell(
    `if (Get-ScheduledTask -TaskName ${psQuote(TASK_NAME)} -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }`,
  );
  return res.status === 0;
}

// ---- macOS --------------------------------------------------------------------------------

function plistPath() {
  return join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
}

function macOn() {
  const { node, entry } = command();
  const env = carried();
  const envBlock = Object.keys(env).length
    ? [
        "  <key>EnvironmentVariables</key>",
        "  <dict>",
        ...Object.entries(env).flatMap(([k, v]) => [`    <key>${k}</key>`, `    <string>${v}</string>`]),
        "  </dict>",
      ]
    : [];
  const plist = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    "  <key>Label</key>",
    `  <string>${LABEL}</string>`,
    "  <key>ProgramArguments</key>",
    "  <array>",
    `    <string>${node}</string>`,
    `    <string>${entry}</string>`,
    "    <string>start</string>",
    "    <string>--no-open</string>",
    "  </array>",
    ...envBlock,
    "  <key>RunAtLoad</key>",
    "  <true/>",
    "</dict>",
    "</plist>",
  ].join(NL);

  mkdirSync(dirname(plistPath()), { recursive: true });
  writeFileSync(plistPath(), plist + NL, "utf-8");
  // Not fatal if this fails: the plist is what survives a reboot, and load only makes it take
  // effect now.
  spawnSync("launchctl", ["load", plistPath()], { stdio: "ignore" });
  return plistPath();
}

function macOff() {
  if (!existsSync(plistPath())) return false;
  spawnSync("launchctl", ["unload", plistPath()], { stdio: "ignore" });
  rmSync(plistPath(), { force: true });
  return true;
}

// ---- Linux --------------------------------------------------------------------------------

function unitPath() {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "systemd", "user", "voxinq.service");
}

function linuxOn() {
  const { node, entry } = command();
  const unit = [
    "[Unit]",
    "Description=Voxinq",
    "",
    "[Service]",
    // oneshot with RemainAfterExit: `voxinq start` spawns the services and returns, so systemd
    // must not read that exit as the service having stopped.
    "Type=oneshot",
    "RemainAfterExit=yes",
    ...Object.entries(carried()).map(([k, v]) => `Environment=${k}=${v}`),
    `ExecStart=${node} ${entry} start --no-open --no-wait`,
    `ExecStop=${node} ${entry} stop`,
    "",
    "[Install]",
    "WantedBy=default.target",
  ].join(NL);

  mkdirSync(dirname(unitPath()), { recursive: true });
  writeFileSync(unitPath(), unit + NL, "utf-8");
  spawnSync("systemctl", ["--user", "daemon-reload"], { stdio: "ignore" });
  const res = spawnSync("systemctl", ["--user", "enable", "voxinq.service"], {
    stdio: "pipe",
    encoding: "utf-8",
  });
  if (res.status !== 0) throw new Error((res.stderr || "systemctl enable failed").trim());
  return unitPath();
}

function linuxOff() {
  if (!existsSync(unitPath())) return false;
  spawnSync("systemctl", ["--user", "disable", "voxinq.service"], { stdio: "ignore" });
  rmSync(unitPath(), { force: true });
  spawnSync("systemctl", ["--user", "daemon-reload"], { stdio: "ignore" });
  return true;
}

// ---- dispatch -----------------------------------------------------------------------------

export function autostartOn() {
  if (platform() === "win32") return windowsOn();
  if (platform() === "darwin") return macOn();
  return linuxOn();
}

export function autostartOff() {
  if (platform() === "win32") return windowsOff();
  if (platform() === "darwin") return macOff();
  return linuxOff();
}

export function autostartEnabled() {
  if (platform() === "win32") return windowsStatus();
  if (platform() === "darwin") return existsSync(plistPath());
  return existsSync(unitPath());
}
