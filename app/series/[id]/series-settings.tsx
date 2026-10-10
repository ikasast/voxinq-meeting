"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "../../locale-provider";
import { useExtensions } from "../../extensions-provider";
import { PencilIcon } from "../../icons";
import { PROP_BUTTON, PROPS_GRID, PROPS_WIDE, Prop } from "../../[id]/property";

/** Which field the editor opens on. */
type Focus = "name" | "members" | "description" | "format" | "glossary";

// What every meeting in a series shares, as rows of the series' details (v4) — the same table a
// meeting's page has under its title: the regular members, the shared background, the minutes
// format and the glossary. Each row's pencil opens one editor for all of them, on that row's
// field, in place of the rows — the series' name among them.
//
// They apply to every meeting filed under the series, over the global Settings.
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
  const [editing, setEditing] = useState<Focus | null>(startEditing ? "description" : null);
  const [draftName, setDraftName] = useState(name);
  const [draftFormat, setDraftFormat] = useState(summaryFormat ?? "");
  // A series' own format is one of the formats Minutes formats adds; switched off, it is kept
  // and not shown.
  const formats = useExtensions().minutesFormats;
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

  const cancel = () => {
    setDraftName(name);
    setDraftFormat(summaryFormat ?? "");
    setDraftGlossary(sttGlossary ?? "");
    setDraftDescription(description ?? "");
    setDraftMembers(members);
    setMemberInput("");
    setError(null);
    setEditing(null);
  };

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
      setEditing(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Failed to save"));
    } finally {
      setPending(false);
    }
  };

  const pencil = (focus: Focus, label: string) =>
    readOnly ? undefined : (
      <button type="button" onClick={() => setEditing(focus)} title={label} aria-label={label} className={PROP_BUTTON}>
        <PencilIcon className="h-3.5 w-3.5" />
      </button>
    );

  if (editing) {
    return (
      <div className={`${PROPS_WIDE} space-y-3 border-y border-[var(--border)] py-3`}>
        <div className={PROPS_GRID}>
          <Prop label={t("Series name")} fill>
            <input
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              maxLength={60}
              autoFocus={editing === "name"}
              disabled={pending}
              aria-label={t("Series name")}
              className="input"
            />
          </Prop>
          <Prop label={t("Regular members")} fill>
            {draftMembers.length > 0 ? (
              <ul className="mb-1.5 flex flex-wrap gap-1.5">
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
              <div className="mb-1.5 flex flex-wrap gap-1">
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
            <div className="flex gap-1">
              <input
                value={memberInput}
                onChange={(e) => setMemberInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                  e.preventDefault();
                  addMember();
                }}
                autoFocus={editing === "members"}
                disabled={pending}
                placeholder={t("Add a name")}
                aria-label={t("Add a name")}
                className="input min-w-0 flex-1 !py-1 text-sm"
              />
              <button type="button" onClick={addMember} disabled={pending} className="btn-outline !px-2 !py-1 text-xs">
                {t("Add")}
              </button>
            </div>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {t("Copied onto each new meeting in the series, so speaker separation knows who to expect.")}
            </p>
          </Prop>
          <Prop label={t("Shared background")} fill>
            <textarea
              value={draftDescription}
              onChange={(e) => setDraftDescription(e.target.value)}
              rows={5}
              maxLength={4000}
              autoFocus={editing === "description"}
              disabled={pending}
              aria-label={t("Shared background")}
              placeholder={t(
                "What every meeting in this series has in common: what it is for, who the parties are, what was settled long ago.",
              )}
              className="input resize-y"
            />
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {t("Read with each meeting's minutes. Only you see it, but it is not encrypted.")}
            </p>
          </Prop>
          {formats ? (
            <Prop label={t("Minutes format")} fill>
              <textarea
                value={draftFormat}
                onChange={(e) => setDraftFormat(e.target.value)}
                rows={6}
                autoFocus={editing === "format"}
                disabled={pending}
                aria-label={t("Minutes format")}
                placeholder={"## Summary\n" + t("…heading structure the minutes must follow for this series")}
                className="input resize-y font-mono text-xs"
              />
              <p className="mt-1 text-xs text-[var(--text-muted)]">{t("Empty: the global setting.")}</p>
            </Prop>
          ) : null}
          <Prop label={t("Glossary")} fill>
            <textarea
              value={draftGlossary}
              onChange={(e) => setDraftGlossary(e.target.value)}
              rows={2}
              autoFocus={editing === "glossary"}
              disabled={pending}
              aria-label={t("Glossary")}
              placeholder={t("Terms and proper nouns that come up in this series")}
              className="input resize-y"
            />
            <p className="mt-1 text-xs text-[var(--text-muted)]">{t("Added to the global glossary.")}</p>
          </Prop>
        </div>
        {error ? <p className="text-sm text-[var(--error)]">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={cancel} disabled={pending} className="btn-outline">
            {t("Cancel")}
          </button>
          <button type="button" onClick={() => void save()} disabled={pending || !draftName.trim()} className="btn-ink">
            {pending ? t("Saving…") : t("Save")}
          </button>
        </div>
      </div>
    );
  }

  const notSet = <span className="text-[var(--text-muted)]">{t("Not set")}</span>;
  return (
    <>
      <Prop label={t("Regular members")} action={pencil("members", t("Edit the regular members"))}>
        {members.length > 0 ? members.join(t(", ")) : notSet}
      </Prop>
      <Prop label={t("Shared background")} action={pencil("description", t("Edit the shared background"))}>
        {description?.trim() ? <span className="line-clamp-3 whitespace-pre-wrap">{description.trim()}</span> : notSet}
      </Prop>
      {formats ? (
        <Prop label={t("Minutes format")} action={pencil("format", t("Edit the minutes format"))}>
          {summaryFormat?.trim() ? (
            <span className="line-clamp-2 whitespace-pre-wrap font-mono text-xs">{summaryFormat.trim()}</span>
          ) : (
            <span className="text-[var(--text-muted)]">{t("Global setting")}</span>
          )}
        </Prop>
      ) : null}
      <Prop label={t("Glossary")} action={pencil("glossary", t("Edit the glossary"))}>
        {sttGlossary?.trim() || <span className="text-[var(--text-muted)]">{t("Global setting")}</span>}
      </Prop>
    </>
  );
}

