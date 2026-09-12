"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "../../locale-provider";

// Per-series defaults: rename the series and set a minutes format / STT glossary that
// override the global settings for every meeting in the series.
export function SeriesSettings({
  id,
  name,
  summaryFormat,
  sttGlossary,
  description,
  members,
  readOnly = false,
  startEditing = false,
  knownNames = [],
}: {
  id: string;
  name: string;
  summaryFormat: string | null;
  sttGlossary: string | null;
  /** What every meeting in the series shares. Passed to the LLM when minutes are written. */
  description: string | null;
  /** The people who are always here. Copied onto a new meeting filed under this series. */
  members: string[];
  readOnly?: boolean;
  /** Open in the editor — arriving from New series, where the name is all there is yet. */
  startEditing?: boolean;
  /** One-tap candidates for the members: enrolled voices, and who has attended this series. */
  knownNames?: string[];
}) {
  const t = useT();
  const router = useRouter();
  const [editing, setEditing] = useState(startEditing);
  const [draftName, setDraftName] = useState(name);
  const [draftFormat, setDraftFormat] = useState(summaryFormat ?? "");
  const [draftGlossary, setDraftGlossary] = useState(sttGlossary ?? "");
  const [draftDescription, setDraftDescription] = useState(description ?? "");
  const [draftMembers, setDraftMembers] = useState<string[]>(members);
  const [memberInput, setMemberInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addName = (raw: string) => {
    const name = raw.trim().slice(0, 80);
    if (!name || draftMembers.includes(name)) return;
    setDraftMembers((prev) => [...prev, name]);
  };
  const addMember = () => {
    addName(memberInput);
    setMemberInput("");
  };
  // As on a meeting's participant list: the names that exist are buttons, the box is for a name
  // that does not. (A dropdown on the box offered the same names again over the buttons, and on
  // a phone it stayed on screen — see ParticipantsCard.)
  const suggestions = knownNames.filter((n) => !draftMembers.includes(n));

  const save = async () => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/series/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draftName.trim(),
          summaryFormat: draftFormat.trim() || null,
          sttGlossary: draftGlossary.trim() || null,
          description: draftDescription.trim() || null,
          members: draftMembers,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? `HTTP ${res.status}`);
      }
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Failed to save"));
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="section-title text-lg font-semibold text-[var(--text-strong)]">
          {t("Series defaults")}
        </h2>
        {!editing && !readOnly ? (
          <button type="button" onClick={() => setEditing(true)} className="btn-outline">
            {t("Edit")}
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        {t("Apply to every meeting in this series, overriding the global Settings.")}
      </p>

      {editing ? (
        <div className="mt-3 space-y-3">
          <div>
            <label htmlFor="series-name" className="label">
              {t("Series name")}
            </label>
            <input
              id="series-name"
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              maxLength={60}
              disabled={pending}
              className="input mt-1 max-w-sm"
            />
          </div>
          <div>
            <label htmlFor="series-description" className="label">
              {t("Shared background")}
            </label>
            <textarea
              id="series-description"
              value={draftDescription}
              onChange={(e) => setDraftDescription(e.target.value)}
              rows={5}
              maxLength={4000}
              disabled={pending}
              placeholder={t(
                "What every meeting in this series has in common: what it is for, who the parties are, what was settled long ago.",
              )}
              className="input mt-1 resize-y"
            />
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {t(
                "Passed to the LLM alongside each meeting's own agenda when minutes are written, and read for proper nouns when the transcript is checked against the glossary.",
              )}
            </p>
            {/* A series is one person's now, so nobody else reads this — but unlike a transcript
                it is not encrypted, and that is worth saying where it is typed. */}
            <p className="mt-1 text-xs text-[var(--warning)]">
              {t("Only you can see this, but it is not encrypted. Anything confidential belongs on the meeting instead.")}
            </p>
          </div>
          <div>
            <label htmlFor="series-member" className="label">
              {t("Regular members")}
            </label>
            {draftMembers.length > 0 ? (
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {draftMembers.map((m) => (
                  <li
                    key={m}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-strong)] px-2.5 py-1 text-xs text-[var(--text-secondary)]"
                  >
                    {m}
                    <button
                      type="button"
                      onClick={() => setDraftMembers((prev) => prev.filter((x) => x !== m))}
                      disabled={pending}
                      className="text-[var(--text-muted)] hover:text-[var(--error)]"
                      aria-label={t("Remove {name}", { name: m })}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {suggestions.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {suggestions.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => addName(n)}
                    disabled={pending}
                    className="rounded-full border border-[var(--border-strong)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent-sub)]"
                    title={t("Add {name} to this series", { name: n })}
                  >
                    + {n}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="mt-1 flex gap-1">
              <input
                id="series-member"
                value={memberInput}
                onChange={(e) => setMemberInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  addMember();
                }}
                disabled={pending}
                placeholder={t("Add a name")}
                className="input min-w-0 flex-1 !py-1 text-sm"
              />
              <button
                type="button"
                onClick={addMember}
                disabled={pending}
                className="btn-outline !px-2 !py-1 text-xs"
              >
                {t("Add")}
              </button>
            </div>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {t(
                "Copied onto each new meeting filed under this series, so diarization knows how many voices to expect and enrolled voiceprints name them. Who was actually there is still edited per meeting.",
              )}
            </p>
          </div>
          <div>
            <label htmlFor="series-format" className="label">
              {t("Minutes format (empty = use the global setting)")}
            </label>
            <textarea
              id="series-format"
              value={draftFormat}
              onChange={(e) => setDraftFormat(e.target.value)}
              rows={6}
              disabled={pending}
              placeholder={
                "## Summary\n" +
                t("…heading structure the minutes must follow for this series")
              }
              className="input mt-1 resize-y font-mono text-xs"
            />
          </div>
          <div>
            <label htmlFor="series-glossary" className="label">
              {t("Transcription glossary (appended to the global glossary)")}
            </label>
            <textarea
              id="series-glossary"
              value={draftGlossary}
              onChange={(e) => setDraftGlossary(e.target.value)}
              rows={2}
              disabled={pending}
              placeholder={t("Terms and proper nouns that come up in this series")}
              className="input mt-1 resize-y"
            />
          </div>
          {error ? <p className="text-sm text-[var(--error)]">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setDraftName(name);
                setDraftFormat(summaryFormat ?? "");
                setDraftGlossary(sttGlossary ?? "");
                setDraftDescription(description ?? "");
                setDraftMembers(members);
                setMemberInput("");
                setError(null);
                setEditing(false);
              }}
              disabled={pending}
              className="btn-outline"
            >
              {t("Cancel")}
            </button>
            <button type="button" onClick={save} disabled={pending} className="btn-ink">
              {pending ? t("Saving…") : t("Save")}
            </button>
          </div>
        </div>
      ) : (
        <dl className="mt-3 space-y-2 text-sm">
          <div>
            <dt className="text-xs text-[var(--text-muted)]">{t("Shared background")}</dt>
            <dd className="whitespace-pre-wrap text-[var(--text-secondary)]">
              {description?.trim() || t("Not set")}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--text-muted)]">{t("Regular members")}</dt>
            <dd className="text-[var(--text-secondary)]">
              {members.length > 0 ? members.join(" / ") : t("Not set")}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--text-muted)]">{t("Minutes format")}</dt>
            <dd className="text-[var(--text-secondary)]">
              {summaryFormat ? (
                <pre className="mt-1 whitespace-pre-wrap rounded-md border border-[var(--border)] bg-[var(--elevated)] p-2 font-mono text-xs">
                  {summaryFormat}
                </pre>
              ) : (
                t("Global setting")
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--text-muted)]">
              {t("Transcription glossary")}
            </dt>
            <dd className="text-[var(--text-secondary)]">{sttGlossary || t("Global setting")}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
