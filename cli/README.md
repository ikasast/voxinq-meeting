# voxinq

Run Voxinq without Docker. One command brings up the database, the transcription service and
the web app, and opens a browser.

```bash
voxinq setup     # install dependencies and build (safe to re-run; also how you upgrade)
voxinq start     # bring it up
voxinq stop      # shut it down
voxinq status    # what is running, and where
voxinq logs      # where the log files are
voxinq autostart on   # start Voxinq when you log in (off / status too)
```

## Autostart

`voxinq autostart on` registers Voxinq with whatever the OS already uses for it, and `off`
removes exactly what `on` created:

| | |
| --- | --- |
| Windows | a Task Scheduler task, at logon |
| macOS | a launchd LaunchAgent, `RunAtLoad` |
| Linux | a systemd user service, wanted by `default.target` |

No daemon of our own, and nothing that has to be running for it to work — a supervisor that
itself needs supervising is the thing to avoid.

It registers `voxinq start --no-open --no-wait`. No browser at login, and the registration
finishes in seconds rather than holding on through the health check.

**On Windows the task shows as "Running" for as long as Voxinq is up.** Windows counts a task
as running while any of its descendants is, and the services are descendants. That is honest
rather than broken — stopping the task stops Voxinq — and the task is registered with no
execution time limit, because the default three-day one would otherwise kill the services on a
machine left switched on.

It is registered through PowerShell's `Register-ScheduledTask`, not `schtasks`: `schtasks
/SC ONLOGON` creates a task that fires for every user and is refused without elevation.

## What it does and does not manage

| | |
| --- | --- |
| **PostgreSQL** | bundled. Nothing to install, nothing to configure. |
| **Transcription service** | started from `stt-service/.venv`, which the setup script creates. |
| **Web app** | started from the build in the app directory. |
| **Ollama** | **not managed.** It has its own installer everywhere, it is optional (a cloud model works instead), and half-owning someone else's service is worse than not touching it. |

## Why the database is bundled

Installing and configuring PostgreSQL is the hardest prerequisite in a native install and the
one most likely to end an install attempt. `embedded-postgres` ships the real server binaries
per platform, so this is not a different database with different behaviour — same schema, same
migrations, same Prisma provider as the Docker install, and a dump moves between them.

It listens on `127.0.0.1` only, with a password generated on first run and kept in the data
directory. There is no setting for that: a single-user local database reachable from the
network is a mistake waiting to happen.

**The bundled binaries are the server, not the client** — `pg_ctl` and `postgres`, no `psql`
and no `pg_dump`. Back up through the app's own **Export** in Settings, which produces a
password-encrypted `.voxbak`; a `pg_dump`-based routine will not find the tool it needs.

## Where things live

Not next to the installed files: a package manager owns that directory and replaces it
wholesale on upgrade, so a database there would be deleted by an update.

| | |
| --- | --- |
| Windows | `%LOCALAPPDATA%\voxinq` |
| macOS | `~/Library/Application Support/voxinq` |
| Linux | `$XDG_DATA_HOME/voxinq`, else `~/.local/share/voxinq` |

`VOXINQ_DATA_DIR` overrides it. `VOXINQ_APP_DIR` points at the Voxinq install to run, which is
otherwise the one this CLI sits inside.

## Ports

Chosen at start time — 3000, 8000 and 5433 if free, the next ones up if not — because a
launcher that refuses to start over a port clash is a launcher someone has to debug. The
browser is told where the transcription service ended up through `STT_WS_URL`, which the web
app reads per request, so nothing is rebuilt when a port moves.

A port counts as in use if something answers on it *or* if the wildcard address cannot be
bound. Both checks are needed: on Windows a socket can take `127.0.0.1:8000` while another
already holds `0.0.0.0:8000`, and the newcomer then shadows the running service for every local
client, silently.

## Requirements

Node 20+ and Python 3.11+. `voxinq setup` does the rest: web dependencies, the production
build, both service virtualenvs, and the diarization models. On a machine with an NVIDIA GPU it
also installs the pyannote backend, which is several gigabytes and is not chosen anywhere else.

It is what `scripts/setup.sh` and `scripts/setup.ps1` do, in one place that behaves the same on
all three platforms -- the two shell scripts had drifted apart. Re-running it is how you upgrade
after pulling new code, and how you recover from an install interrupted half way through.

Node and Python are not installed by this — a package manager provides them, which is what
`packaging/` is for. Everything above those two runtimes, setup does itself.
