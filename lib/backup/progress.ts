// Single-flight guard and progress for backup operations.
//
// Export and import both hold the whole bundle in memory and both talk to the STT service, so
// running two at once would double the memory and let an import race an export of the same
// rows. One at a time, process-wide.
//
// Held on globalThis for the same reason lib/prisma.ts is: Next's dev server re-evaluates
// modules, and a fresh module instance would forget that an operation is already running.

export type BackupOperation = "export" | "import";

export type BackupProgress = {
  operation: BackupOperation;
  /** Short human phrase for the UI, e.g. "recordings 3/12". */
  phase: string;
  startedAt: number;
};

const globalForBackup = globalThis as unknown as { voxinqBackup?: { current: BackupProgress | null } };
const state = (globalForBackup.voxinqBackup ??= { current: null });

export class BackupBusyError extends Error {
  constructor(public readonly running: BackupProgress) {
    super(`a backup ${running.operation} is already running`);
    this.name = "BackupBusyError";
  }
}

/** Claim the slot. Throws {@link BackupBusyError} when one is already held. */
export function beginBackup(operation: BackupOperation): void {
  if (state.current) throw new BackupBusyError(state.current);
  state.current = { operation, phase: "starting", startedAt: Date.now() };
}

export function setPhase(phase: string): void {
  if (state.current) state.current.phase = phase;
}

export function endBackup(): void {
  state.current = null;
}

export function currentBackup(): BackupProgress | null {
  return state.current;
}
