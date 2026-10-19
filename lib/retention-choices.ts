// The periods Settings → Data offers, in days. Apart from lib/retention.ts so that settings.ts,
// which validates against them, does not import what talks to the transcription service.

/** How long an unprotected recording is kept. 0: kept until deleted by hand. */
export const RECORDING_RETENTION_CHOICES = [7, 30, 90, 365, 0] as const;

/** How long a meeting stays in the trash. */
export const TRASH_RETENTION_CHOICES = [7, 30, 90] as const;
