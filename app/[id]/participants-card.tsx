"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/app/locale-provider";

export type Participant = { name: string; speaking: boolean };

// Who was in the meeting.
//
// Two things hang off this list, which is why it is worth typing:
//
//   - the number of people ticked as speaking becomes the speaker count diarization is given,
//     and the count is the thing it is worst at guessing on its own;
//   - a name that matches an enrolled voice profile becomes a candidate for automatic naming,
//     and one that is not in the list stops being one.
//
// Attending and speaking are separate on purpose. Someone can sit through a meeting without
// saying a word; unticking them should not remove them from the record of who was there.
export function ParticipantsCard({
  meetingId,
  initial,
  knownNames,
  readOnly = false,
}: {
  meetingId: string;
  initial: Participant[];
  /** Enrolled voice-profile names, offered as suggestions. Typing a new name is fine. */
  knownNames: string[];
  readOnly?: boolean;
}) {
  const [people, setPeople] = useState<Participant[]>(initial);
  const t = useT();
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstRender = useRef(true);

  const save = useCallback(
    async (next: Participant[]) => {
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(`/api/meetings/${meetingId}/participants`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ participants: next }),
        });
        if (!res.ok) {
          const d = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(d?.error ?? `Could not save (HTTP ${res.status})`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : t("Could not save"));
      } finally {
        setSaving(false);
      }
    },
    // `t` is memoised on the locale, so listing it is free — and without it `save` keeps
    // whichever `t` existed on the first render.
    [meetingId, t],
  );

  // Persist on change rather than behind a Save button: the list is small, every edit is one
  // click, and a tick that silently did not save is exactly the failure this must not have.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    void save(people);
  }, [people, save]);

  const add = (from?: string) => {
    const name = (from ?? draft).trim().slice(0, 80);
    if (!name) return;
    if (people.some((p) => p.name === name)) {
      setDraft("");
      return;
    }
    setPeople((prev) => [...prev, { name, speaking: true }]);
    setDraft("");
  };

  const speakers = people.filter((p) => p.speaking).length;

  // Enrolled names not in this meeting yet, as buttons. One tap adds a name.
  //
  // This was once a `<datalist>` on the box as well, and the two overlapped badly. The box is
  // for the person who is *not* on the list — and the moment you started typing one, a dropdown
  // opened offering the same names again, over the buttons that already had them. Worse, it
  // offered all of them, including people already in this meeting, which the buttons correctly
  // leave out. On a phone the popup was also a real bug rather than only noise: it stayed on
  // screen after the field lost focus.
  //
  // So: buttons for the names that exist, a plain box for the ones that do not.
  const suggestions = knownNames.filter((n) => !people.some((p) => p.name === n));

  return (
    <section className="card p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t("Participants")}</h2>
        {saving ? <span className="text-xs text-[var(--text-muted)]">{t("Saving…")}</span> : null}
      </div>

      {people.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">
          {readOnly ? t("Nobody recorded.") : t("Add who was there. Ticked names are the ones expected to speak.")}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {people.map((p) => (
            <li key={p.name} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={p.speaking}
                disabled={readOnly}
                onChange={() =>
                  setPeople((prev) =>
                    prev.map((q) => (q.name === p.name ? { ...q, speaking: !q.speaking } : q)),
                  )
                }
                title={p.speaking ? t("Expected to speak") : t("Attended, but did not speak")}
                aria-label={t("{name} spoke", { name: p.name })}
                className="accent-[var(--accent)]"
              />
              <span
                className={`min-w-0 flex-1 truncate ${
                  p.speaking ? "" : "text-[var(--text-muted)] line-through"
                }`}
              >
                {p.name}
              </span>
              {!readOnly ? (
                <button
                  type="button"
                  onClick={() => setPeople((prev) => prev.filter((q) => q.name !== p.name))}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--error)]"
                  title={t("Remove")}
                  aria-label={t("Remove {name}", { name: p.name })}
                >
                  ✕
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {!readOnly ? (
        <>
          {suggestions.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {suggestions.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => add(n)}
                  className="rounded-full border border-[var(--border-strong)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent-sub)]"
                  title={t("Add {name} to this meeting", { name: n })}
                >
                  + {n}
                </button>
              ))}
            </div>
          ) : null}
          <div className="mt-2 flex gap-1">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              placeholder={t("Add a name")}
              className="input min-w-0 flex-1 !py-1 text-sm"
            />
            <button type="button" onClick={() => add()} className="btn-outline !px-2 !py-1 text-xs">
              {t("Add")}
            </button>
          </div>
        </>
      ) : null}

      {people.length > 0 ? (
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          {t("{speakers} of {total} expected to speak — diarization is told to look for {n}.", {
            speakers,
            total: people.length,
            n: speakers || t("as many as it finds"),
          })}
        </p>
      ) : null}

      {error ? <p className="mt-2 text-xs text-[var(--error)]">{error}</p> : null}
    </section>
  );
}
