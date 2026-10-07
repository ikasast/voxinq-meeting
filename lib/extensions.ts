// Extensions: what is on top of recording, transcription and minutes.
//
// v4 keeps the core small and lets an administrator add the rest. An extension is not code
// fetched from somewhere: everything ships with the app, and an extension is a part of it that is
// switched on or off for the whole instance. Off hides it — its screens, its API, its work in the
// queue — and keeps its data, so switching it back on brings everything back as it was.
//
// Pure, so the page and the server share one list. The on/off state lives on the server
// (lib/extensions-store.ts); the page receives it from the layout (app/extensions-provider.tsx).
//
// An extension is listed here only once it is actually gated. One that could be switched off
// and went on showing would be worse than none.

export const EXTENSIONS = [
  {
    id: "ask",
    name: "Ask about meetings",
    description: "Ask a question of a meeting's minutes or transcript, or of a whole series.",
    needs: "The minutes model (LLM)",
  },
  {
    id: "bulkMinutes",
    name: "Write minutes in bulk",
    description: "Queue minutes for every listed meeting that has none, in one go.",
    needs: null,
  },
  {
    id: "corrections",
    name: "Suggest corrections",
    description: "Check the transcript against the glossary, the series name and the participants, and suggest fixes.",
    needs: null,
  },
  {
    id: "translation",
    name: "Translation",
    description: "A Japanese translation under each line spoken in another language.",
    needs: "A translation model (about 1.2 GB), downloaded on first use",
  },
  {
    id: "externalShare",
    name: "Read-only sharing",
    description: "Publish a password-protected, read-only link outside the tailnet.",
    needs: "Tailscale Funnel",
  },
] as const;

export type ExtensionId = (typeof EXTENSIONS)[number]["id"];
export type ExtensionState = Record<ExtensionId, boolean>;

export const EXTENSION_IDS = EXTENSIONS.map((e) => e.id) as ExtensionId[];

export function isExtensionId(v: unknown): v is ExtensionId {
  return typeof v === "string" && (EXTENSION_IDS as string[]).includes(v);
}

/**
 * The state from what was stored. Absent means on: every one of these was simply part of 3.x,
 * so an instance upgrading keeps everything it had until an administrator switches something off.
 */
export function resolveExtensions(stored: unknown): ExtensionState {
  const s = stored && typeof stored === "object" ? (stored as Record<string, unknown>) : {};
  return Object.fromEntries(
    EXTENSION_IDS.map((id) => [id, typeof s[id] === "boolean" ? (s[id] as boolean) : true]),
  ) as ExtensionState;
}
