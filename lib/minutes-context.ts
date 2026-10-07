// What a set of minutes is told besides the transcript.
//
// Seven things the app knows about a meeting can go into the prompt. Each was simply included
// whenever its field had been filled in, which meant nobody decided, at the moment of writing,
// what the model was given -- or, with a cloud provider, what left the machine. Now each is
// chosen per run: a template says which are on by default, and the run can change that.
//
// Shared by the browser (the choices) and the server (the prompt), so nothing here reads data.

export const CONTEXT_KEYS = [
  "meeting",
  "participants",
  "purpose",
  "glossary",
  "series",
  "previous",
  "background",
] as const;

export type ContextKey = (typeof CONTEXT_KEYS)[number];

const KNOWN = new Set<string>(CONTEXT_KEYS);

/**
 * The keys in a stored or requested list, in the canonical order, unknown ones dropped.
 * Undefined when there is no list at all -- which is not the same as an empty one: an empty
 * list is "give it nothing but the transcript", and that is a choice somebody can make.
 */
export function normalizeInclude(raw: unknown): ContextKey[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const asked = new Set(raw.filter((k): k is string => typeof k === "string" && KNOWN.has(k)));
  return CONTEXT_KEYS.filter((k) => asked.has(k));
}

/**
 * The defaults for one run: the chosen template's, else the default template's, else all of
 * them -- everything was included before this was a choice, and a template saved before then
 * should keep writing the same minutes.
 */
export function resolveInclude(
  templates: { id: string; include?: ContextKey[] }[],
  opts: { chosenId?: string; defaultId?: string },
): ContextKey[] {
  if (opts.chosenId === "default") return [...CONTEXT_KEYS];
  const byId = (id?: string) => (id ? templates.find((t) => t.id === id) : undefined);
  const template = byId(opts.chosenId) ?? byId(opts.defaultId);
  return template?.include ? [...template.include] : [...CONTEXT_KEYS];
}

/**
 * After a change of format: the new template's defaults, except where the person ticked or
 * unticked a piece by hand in this panel. A template sets the defaults, not the answer.
 */
export function includeForFormat(
  defaults: ContextKey[],
  byHand: Partial<Record<ContextKey, boolean>>,
): ContextKey[] {
  const on = new Set(defaults);
  return CONTEXT_KEYS.filter((k) => byHand[k] ?? on.has(k));
}
