import { EXTENSION_IDS, type ExtensionState } from "./extensions";
import { getFunnelState } from "./funnel";
import { prismaRaw } from "./prisma-raw";
import { readMachineSettings } from "./settings";

// Which extensions an instance starts with, decided once — the first time it runs without an
// extensions.json — and then written there, so it is never decided again.
//
// A new install starts with none: the core is the app, and an administrator adds what they want.
// An instance coming up from 3.x had every one of these, and must not find on its first morning
// that something it used has gone. So it keeps each one it shows signs of using. The ones that
// leave no sign — a question asked, a batch queued, a correction applied — stay on: there is no
// telling, and the cost of keeping one is a line on the Extensions tab.

/** What the instance already holds, as far as it tells which extensions were in use. */
export type Evidence = {
  /** Meetings other than the sample one. None means a new install. */
  meetings: number;
  speakers: boolean;
  series: boolean;
  schedule: boolean;
  minutesFormats: boolean;
  translation: boolean;
  externalAi: boolean;
  externalShare: boolean;
};

/** The decision, from the evidence. Pure, for the tests. */
export function defaultsFrom(e: Evidence): ExtensionState {
  if (e.meetings === 0) {
    return Object.fromEntries(EXTENSION_IDS.map((id) => [id, false])) as ExtensionState;
  }
  return {
    // No sign is left by using these.
    ask: true,
    bulkMinutes: true,
    corrections: true,
    speakers: e.speakers,
    series: e.series,
    schedule: e.schedule,
    minutesFormats: e.minutesFormats,
    translation: e.translation,
    externalShare: e.externalShare,
    externalAi: e.externalAi,
  };
}

type SettingsLike = {
  llmProvider?: unknown;
  sttProfiles?: unknown;
  minutesTemplates?: unknown;
  sttTranslate?: unknown;
};

const nonEmpty = (v: unknown) => Array.isArray(v) && v.length > 0;

/** Asked of the whole instance, across every account: the decision is the instance's. */
export async function gatherEvidence(): Promise<Evidence> {
  const db = prismaRaw;
  const machine = await readMachineSettings();
  const people = (await db.user.findMany({ select: { settings: true } })).map(
    (u) => (u.settings ?? {}) as SettingsLike,
  );
  const anySettings = (test: (s: SettingsLike) => boolean) =>
    test(machine as SettingsLike) || people.some(test);

  const [meetings, separated, named, voiceprints, series, booked, seriesFormats, translated, funnel] = await Promise.all([
    db.meeting.count({ where: { sample: false } }),
    db.meeting.count({ where: { diarizationEmbeddings: { not: null } } }),
    // Naming speakers is part of it too, and is done without separating — a recording made from
    // the microphone and the PC's sound already has two.
    db.meeting.count({ where: { sample: false, speakerLabels: { not: null } } }),
    db.speakerProfile.count(),
    db.series.count(),
    db.meeting.count({ where: { scheduledAt: { not: null } } }),
    db.series.count({ where: { summaryFormat: { not: null } } }),
    db.transcript.count({ where: { translation: { not: null } } }),
    funnelPublic(),
  ]);

  return {
    meetings,
    speakers: separated > 0 || named > 0 || voiceprints > 0,
    series: series > 0,
    schedule: booked > 0,
    minutesFormats: seriesFormats > 0 || anySettings((s) => nonEmpty(s.minutesTemplates)),
    translation: translated > 0 || anySettings((s) => s.sttTranslate === true),
    externalAi: anySettings(
      (s) => (typeof s.llmProvider === "string" && s.llmProvider !== "ollama") || nonEmpty(s.sttProfiles),
    ),
    // Published right now — or set up to be: reading from outside needs APP_PASSWORD, and in
    // Docker the web container cannot ask Tailscale, which runs on the host.
    externalShare: funnel || Boolean(process.env.APP_PASSWORD?.trim()),
  };
}

/** Whether the web app is published through Tailscale Funnel right now. No answer is a no. */
async function funnelPublic(): Promise<boolean> {
  const timeout = new Promise<false>((resolve) => setTimeout(() => resolve(false), 5000));
  const asked = getFunnelState()
    .then((s) => s.public === true)
    .catch(() => false);
  return Promise.race([asked, timeout]);
}
