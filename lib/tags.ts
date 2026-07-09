import { prisma } from "./prisma";

/**
 * Delete tags no longer attached to any meeting (orphan-tag cleanup).
 * Call after re-tagging or deleting a meeting. Failures do not block the main flow.
 */
export async function pruneOrphanTags(): Promise<void> {
  try {
    await prisma.tag.deleteMany({ where: { meetings: { none: {} } } });
  } catch {
    // cleanup is best-effort, so swallow errors
  }
}
