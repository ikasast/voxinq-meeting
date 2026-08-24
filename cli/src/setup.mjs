// Preparing an install so `voxinq start` has something to start.
//
// This is what scripts/setup.sh and scripts/setup.ps1 do, in one place that works on all three
// platforms -- the shell scripts had drifted apart, and a launcher that can start an install
// but not create one leaves the hardest part exactly where it was.
//
// Everything here is idempotent: re-running it is how you upgrade after pulling new code, and
// how you recover from an install that was interrupted half way through.

import { spawnSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { platform, tmpdir } from "node:os";

const WINDOWS = platform() === "win32";

/** Run a command, showing its output. Long installs need to look like they are progressing. */
function run(command, args, { cwd, env, label }) {
  const res = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: "inherit",
    shell: WINDOWS && /\.(cmd|bat)$/i.test(command),
  });
  if (res.error) throw new Error(`${label}: ${res.error.message}`);
  if (res.status !== 0) throw new Error(`${label}: exited with ${res.status}`);
}

function which(command, args = ["--version"]) {
  const res = spawnSync(command, args, { stdio: "pipe", encoding: "utf-8", shell: WINDOWS });
  return res.status === 0 ? (res.stdout || res.stderr).trim().split("\n")[0] : null;
}

/**
 * A Python that can build the service venvs, as an absolute path.
 *
 * Resolving to a path rather than trusting a name, because on Windows a name is not an answer:
 *   - `py` may not exist at all
 *   - `python3.11` is often the Store's execution-alias stub, which exits 0 and prints nothing
 *   - `python` resolves differently with and without a shell, so a version probe can succeed
 *     while the identical spawn later fails with exit 9009
 * Asking the interpreter for `sys.executable` sidesteps every one of those, and everything
 * after this point runs that path directly with no shell involved.
 *
 * 3.11 is looked for by name first. The project targets it, and "python" on a machine can be
 * anything -- including a version with no wheel for one of the native dependencies, which
 * surfaces as a compiler error in the middle of a pip install rather than as "wrong Python".
 */
export function findPython() {
  // A file, not `python -c`: a `-c` argument gets mangled by the .bat shims that pyenv and
  // similar version managers put on PATH.
  const probe = join(tmpdir(), `voxinq-python-probe-${process.pid}.py`);
  writeFileSync(probe, "import sys; print(sys.executable); print('%d.%d' % sys.version_info[:2])");
  try {
    for (const candidate of WINDOWS
      ? ["py -3.11", "python3.11", "python", "py -3"]
      : ["python3.11", "python3", "python"]) {
      const res = spawnSync(`${candidate} "${probe}"`, {
        stdio: "pipe",
        encoding: "utf-8",
        shell: true,
      });
      if (res.status !== 0) continue;
      const [executable, version] = (res.stdout || "").trim().split(/\s+/);
      if (!executable || !existsSync(executable)) continue;
      const [major, minor] = (version ?? "").split(".").map(Number);
      if (major === 3 && minor >= 11) return { executable, version };
    }
    return null;
  } finally {
    rmSync(probe, { force: true });
  }
}

function venvPython(dir) {
  return WINDOWS ? join(dir, "Scripts", "python.exe") : join(dir, "bin", "python");
}

/** Create a venv if it is not there, then install requirements into it. */
function buildVenv({ python, dir, requirements, label }) {
  if (!existsSync(venvPython(dir))) {
    run(python.executable, ["-m", "venv", dir], { label: `${label} (venv)` });
  }
  run(venvPython(dir), ["-m", "pip", "install", "--upgrade", "--quiet", "pip"], {
    label: `${label} (pip)`,
  });
  run(venvPython(dir), ["-m", "pip", "install", "-r", requirements], { label });
  return venvPython(dir);
}

/** Is there an NVIDIA GPU? Decides whether pyannote is worth several gigabytes here. */
function hasNvidia() {
  return Boolean(which("nvidia-smi", ["--query-gpu=name", "--format=csv,noheader"]));
}

export function setupInstall(appDir, { say }) {
  say("Checking what is already here…");
  const node = which("node");
  if (!node) throw new Error("node was not found on PATH");
  say(`  node ${node}`);

  const python = findPython();
  if (!python) {
    throw new Error(
      "Python 3.11 or newer was not found.\n" +
        "  The transcription service needs it. Install it from https://www.python.org/downloads/",
    );
  }
  say(`  Python ${python.version} (${python.executable})`);

  say("");
  say("Installing web dependencies (npm install)…");
  run(WINDOWS ? "npm.cmd" : "npm", ["install"], { cwd: appDir, label: "npm install" });

  say("");
  say("Generating the database client…");
  // Before the build, not after: the build type-checks against the generated types, and
  // without this it fails with "Prisma has no exported member 'MeetingWhereInput'" -- which
  // reads like broken source rather than a missing step. `npm install` does not do it.
  // DATABASE_URL only has to be *present* for generate; it connects to nothing here.
  run(process.execPath, [join(appDir, "node_modules", "prisma", "build", "index.js"), "generate"], {
    cwd: appDir,
    env: { DATABASE_URL: process.env.DATABASE_URL || "postgresql://build:build@127.0.0.1:5432/build" },
    label: "prisma generate",
  });

  say("");
  say("Building the web app…");
  run(WINDOWS ? "npm.cmd" : "npm", ["run", "build"], {
    cwd: appDir,
    env: { DATABASE_URL: process.env.DATABASE_URL || "postgresql://build:build@127.0.0.1:5432/build" },
    label: "npm run build",
  });

  say("");
  say("Installing the transcription service…");
  buildVenv({
    python,
    dir: join(appDir, "stt-service", ".venv"),
    requirements: join(appDir, "stt-service", "requirements.txt"),
    label: "stt-service requirements",
  });

  say("");
  say("Installing speaker separation…");
  const diaPython = buildVenv({
    python,
    dir: join(appDir, "diarization", ".venv"),
    requirements: join(appDir, "diarization", "requirements.txt"),
    label: "diarization requirements",
  });
  run(diaPython, [join(appDir, "diarization", "fetch_models.py")], { label: "diarization models" });

  if (hasNvidia()) {
    say("");
    say("NVIDIA GPU found — adding the pyannote backend (several GB)…");
    installPyannote(appDir, diaPython, say);
  }
}

/**
 * The accurate diarization backend, installed only where CUDA makes it the one that runs.
 *
 * Best-effort on purpose. It is an accuracy upgrade over a backend that is already installed
 * and working, so failing the whole setup at the last step -- after the build, both venvs and
 * the models -- would trade something that works for something that does not.
 */
function installPyannote(appDir, diaPython, say) {
  const CU128 = "https://download.pytorch.org/whl/cu128";
  try {
    // torchcodec is not on the CUDA index for Windows; only Linux wheels are published there.
    // It is on PyPI for all three platforms, so Windows takes it from there and everything
    // else keeps the paired build, which is what the Linux install has always needed: a PyPI
    // torchcodec against cu128 torch produces a library that cannot load, and every diarize
    // run then fails with "torchcodec is not available".
    run(diaPython, ["-m", "pip", "install", "torch", "torchaudio", "--index-url", CU128], {
      label: "torch (cu128)",
    });
    run(
      diaPython,
      WINDOWS
        ? ["-m", "pip", "install", "torchcodec"]
        : ["-m", "pip", "install", "torchcodec", "--index-url", CU128],
      { label: "torchcodec" },
    );
    run(diaPython, ["-m", "pip", "install", "-r", join(appDir, "diarization", "requirements-pyannote.txt")], {
      label: "pyannote",
    });
    say("  Set HF_TOKEN before the first Diarize — see docs/setup.md.");
  } catch (e) {
    say("");
    say(`  Could not install pyannote: ${e.message}`);
    say("  Speaker separation still works — it uses the ONNX backend, which is already");
    say("  installed. pyannote is more accurate on long meetings; the Docker install has it");
    say("  if you want it. See docs/design-decisions.md.");
  }
}
