// Saved minutes formats, and how the app talks about them.
//
// There was one format: a single field in settings, plus an optional override on a series. That
// works while every meeting is the same kind of meeting. It stops working the moment one of
// them is a lecture -- a talk has a speaker and a subject, not a round of reports and a list of
// decisions, and forcing it through the meeting format produces headings with nothing under
// them.
//
// So formats are saved with names and chosen when the minutes are written. The same shape as
// the recognition endpoints, for the same reason: the setting decides the default, the run
// decides what actually happens.

export type MinutesTemplate = {
  /** Stable across renames: it is what a saved default refers to. */
  id: string;
  /** Shown in the picker. "会議", "講演". */
  name: string;
  /** The format spec, as it goes into the prompt. */
  body: string;
};

/** Ids are only compared, never parsed. */
export function newTemplateId(): string {
  return "t" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function normalizeTemplates(raw: unknown): MinutesTemplate[] {
  if (!Array.isArray(raw)) return [];
  const out: MinutesTemplate[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const t = item as Record<string, unknown>;
    const id = typeof t.id === "string" ? t.id.trim() : "";
    const name = typeof t.name === "string" ? t.name.trim() : "";
    const body = typeof t.body === "string" ? t.body : "";
    // A template with no body would silently produce the built-in format under a name that
    // says otherwise, which is worse than not having it.
    if (!id || !name || !body.trim()) continue;
    out.push({ id, name: name.slice(0, 60), body });
  }
  return out;
}

/**
 * Bring a settings file written before templates existed up to date.
 *
 * The single `summaryFormat` becomes one template, because an install that had one is using it
 * for every meeting -- dropping it would change what the minutes look like with nothing said.
 * It becomes the default for the same reason.
 */
export function migrateMinutesTemplates(
  parsed: Record<string, unknown>,
): { minutesTemplates: MinutesTemplate[]; defaultMinutesTemplateId: string } | null {
  if (normalizeTemplates(parsed.minutesTemplates).length > 0) return null;
  const body = typeof parsed.summaryFormat === "string" ? parsed.summaryFormat : "";
  if (!body.trim()) return null;
  const migrated: MinutesTemplate = { id: "migrated", name: "Saved format", body };
  return { minutesTemplates: [migrated], defaultMinutesTemplateId: migrated.id };
}

/**
 * The format for one run.
 *
 * Order, most specific first. A series' own format still wins over the default template: it was
 * set for that series deliberately, and a new default should not quietly override it. An
 * explicitly chosen template beats even that, because it was chosen for this run.
 */
export function resolveTemplate(
  templates: MinutesTemplate[],
  opts: { chosenId?: string; seriesFormat?: string | null; defaultId?: string },
): string | undefined {
  const byId = (id?: string) => (id ? templates.find((t) => t.id === id)?.body : undefined);
  if (opts.chosenId === "default") return undefined; // built-in, asked for on purpose
  return byId(opts.chosenId) || opts.seriesFormat?.trim() || byId(opts.defaultId) || undefined;
}
