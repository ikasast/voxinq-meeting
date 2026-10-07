"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EXTENSIONS, type ExtensionId } from "@/lib/extensions";
import { useT } from "@/app/locale-provider";
import { useExtensions } from "../extensions-provider";

// Settings → Extensions: what is added on top of recording, transcription and minutes
// (lib/extensions.ts). Switched for the whole instance, by an administrator; everybody else sees
// what is on. Switching one off hides it and keeps its data.

/** The words for each extension, spelled out so the translation table's test can find them. */
function texts(t: (k: string) => string): Record<ExtensionId, { name: string; description: string; needs: string | null }> {
  return {
    ask: {
      name: t("Ask about meetings"),
      description: t("Ask a question of a meeting's minutes or transcript, or of a whole series."),
      needs: t("The minutes model (LLM)"),
    },
    bulkMinutes: {
      name: t("Write minutes in bulk"),
      description: t("Queue minutes for every listed meeting that has none, in one go."),
      needs: null,
    },
    corrections: {
      name: t("Suggest corrections"),
      description: t(
        "Check the transcript against the glossary, the series name and the participants, and suggest fixes.",
      ),
      needs: null,
    },
    translation: {
      name: t("Translation"),
      description: t("A Japanese translation under each line spoken in another language."),
      needs: t("A translation model (about 1.2 GB), downloaded on first use"),
    },
    externalShare: {
      name: t("Read-only sharing"),
      description: t("Publish a password-protected, read-only link outside the tailnet."),
      // A product name, the same in every language.
      needs: "Tailscale Funnel",
    },
  };
}

export function ExtensionsSettings({ isAdmin }: { isAdmin: boolean }) {
  const t = useT();
  const router = useRouter();
  const state = useExtensions();
  const [busy, setBusy] = useState<ExtensionId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const words = texts(t);

  const toggle = async (id: ExtensionId, on: boolean) => {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch("/api/extensions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [id]: on }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(d?.error ?? `HTTP ${res.status}`);
      }
      // The layout reads the state; refreshing hands every screen the new one.
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="card space-y-4 p-6">
      <h2 className="section-title text-sm font-semibold text-[var(--text-strong)]">{t("Extensions")}</h2>
      <p className="text-xs text-[var(--text-muted)]">
        {t(
          "Recording, transcription and minutes are always there. These are added on top, for everybody on this machine. Switching one off hides it and keeps its data; switching it back on brings everything back.",
        )}
      </p>
      {!isAdmin ? (
        <p className="text-xs text-[var(--text-secondary)]">{t("Only an administrator switches extensions on or off.")}</p>
      ) : null}
      <ul className="divide-y divide-[var(--border)]">
        {EXTENSIONS.map(({ id }) => (
          <li key={id} className="flex items-start gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--text-strong)]">{words[id].name}</p>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{words[id].description}</p>
              {words[id].needs ? (
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  {t("Needs: {what}", { what: words[id].needs ?? "" })}
                </p>
              ) : null}
            </div>
            <label className="flex shrink-0 items-center gap-2 text-xs text-[var(--text-secondary)]">
              <input
                type="checkbox"
                role="switch"
                checked={state[id]}
                disabled={!isAdmin || busy !== null}
                onChange={(e) => void toggle(id, e.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
                aria-label={words[id].name}
              />
              {state[id] ? t("On") : t("Off")}
            </label>
          </li>
        ))}
      </ul>
      {error ? <p className="text-xs text-[var(--error)]">{error}</p> : null}
    </section>
  );
}
