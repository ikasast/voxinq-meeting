import { prisma } from "./prisma";

/**
 * Delete series no longer attached to any meeting (orphan cleanup).
 * Call after reassigning or deleting a meeting. Failures do not block the main flow.
 */
export async function pruneOrphanSeries(): Promise<void> {
  try {
    await prisma.series.deleteMany({ where: { meetings: { none: {} } } });
  } catch {
    // cleanup is best-effort, so swallow errors
  }
}
