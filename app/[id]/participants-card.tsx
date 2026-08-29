"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listId = `voxinq-known-speakers-${meetingId}`;
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
        setError(e instanceof Error ? e.message : "Could not save");
      } finally {
        setSaving(false);
      }
    },
    [meetingId],
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

  const add = () => {
    const name = draft.trim().slice(0, 80);
    if (!name) return;
    if (people.some((p) => p.name === name)) {
      setDraft("");
      return;
    }
    setPeople((prev) => [...prev, { name, speaking: true }]);
    setDraft("");
  };

  const speakers = people.filter((p) => p.speaking).length;

  return (
    <section className="card p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--text-strong)]">Participants</h2>
        {saving ? <span className="text-xs text-[var(--text-muted)]">Saving…</span> : null}
      </div>

      {people.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">
          {readOnly ? "Nobody recorded." : "Add who was there. Ticked names are the ones expected to speak."}
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
                title={p.speaking ? "Expected to speak" : "Attended, but did not speak"}
                aria-label={`${p.name} spoke`}
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
                  title="Remove"
                  aria-label={`Remove ${p.name}`}
                >
                  ✕
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {!readOnly ? (
        <div className="mt-2 flex gap-1">
          <input
            list={listId}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder="Add a name"
            className="input min-w-0 flex-1 !py-1 text-sm"
          />
          <datalist id={listId}>
            {knownNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <button type="button" onClick={add} className="btn-outline !px-2 !py-1 text-xs">
            Add
          </button>
        </div>
      ) : null}

      {people.length > 0 ? (
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          {speakers} of {people.length} expected to speak — diarization is told to look for{" "}
          {speakers || "as many as it finds"}.
        </p>
      ) : null}

      {error ? <p className="mt-2 text-xs text-[var(--error)]">{error}</p> : null}
    </section>
  );
}
