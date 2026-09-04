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

  const { startDispatcher } = await import("./lib/queue/dispatcher");
  await startDispatcher();
}
