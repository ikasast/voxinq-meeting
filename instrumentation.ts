// Next.js runs this once when the server starts, which is the only hook the app has for
// something that must be alive for the life of the process rather than the life of a request.
//
// The queue dispatcher is exactly that. It is not started from a route because a queue that
// only moves while someone is looking at it is not a queue: a job left behind by a crash, or
// one that became runnable when another finished, has to be picked up with nobody watching.
export async function register() {
  // Also called for the edge runtime, where there is no database and no timers worth having.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Off during `next build`: the build imports server code to collect page data, and a loop
  // started there would outlive nothing useful and talk to a database that may not exist.
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  // The time zone chosen in the app, before the first date is formatted (lib/time-zone.ts).
  const { readMachineSettings } = await import("./lib/settings");
  const { applyTimeZone } = await import("./lib/time-zone");
  applyTimeZone((await readMachineSettings()).timeZone);

  const { startDispatcher } = await import("./lib/queue/dispatcher");
  await startDispatcher();

  // The trash, likewise: emptied on a timer, not only when somebody opens it (lib/trash.ts).
  const { startTrashSweep } = await import("./lib/trash");
  startTrashSweep();
}
