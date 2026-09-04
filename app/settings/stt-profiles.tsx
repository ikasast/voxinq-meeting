"use client";

import { useState, type ReactNode } from "react";
import {
  type PublicSttProfile,
  type SttProfileKind,
  GEMINI_DEFAULT_BASE,
  PROFILE_PRESETS,
  newProfileId,
} from "@/lib/stt/profiles";
import { profileDestination } from "@/lib/stt/destination";

// Saved recognition endpoints: a list you scan, not a stack of forms you scroll.
//
// The first version put every field of every endpoint on the page at once. With one saved that
// reads fine; with three it is a wall, and the control to add another sits somewhere in the
// middle of it. What this page is for is seeing what is saved and which one is in use, so that
// is what it shows -- a row each, and the fields behind a click.
//
// Keys never come back from the server, so a saved one shows as dots and an empty box means
// "leave it alone". Editing a name must not silently forget a key.
//
// This machine is a row in the same table. It is a destination like the others -- it is the
// default until you say otherwise, and it is what "local" means in the Re-transcribe picker --
// and the model it runs was a lone select below the table, next to nothing that said what it
// belonged to. In the list it sits where you would look for it. It has no Remove: there is
// always a machine, and unlike a saved endpoint you did not add it.

const inputClass = "input mt-1";
const labelClass = "label";

export type DraftProfile = PublicSttProfile & { apiKey?: string; clearApiKey?: boolean };

/** The row for this machine. Not a saved profile, so it needs an id no profile can hold --
 *  every `newProfileId` starts with "p" -- and it is the word the transcribe route already
 *  understands for "here". */
const LOCAL_ID = "local";

export function SttProfiles({
  profiles,
  defaultId,
  disabled,
  localModel,
  localEditor,
  notice,
  onChange,
  onDefaultChange,
}: {
  profiles: DraftProfile[];
  defaultId: string;
  disabled: boolean;
  /** What this machine runs, for its row in the table. */
  localModel: string;
  /** The controls behind that row's Edit. The settings page owns them -- it knows the model
   *  list and the warnings that go with it; this component only decides when to show them. */
  localEditor: ReactNode;
  /** Shown under the picker when the default sends recordings off this machine. Rendered here
   *  rather than at the top of the card because it is about the choice in that select, and a
   *  warning above the control it is about reads as being about the page. */
  notice: ReactNode;
  onChange: (next: DraftProfile[]) => void;
  onDefaultChange: (id: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const draft = profiles.find((p) => p.id === editing) ?? null;

  const update = (id: string, patch: Partial<DraftProfile>) =>
    onChange(profiles.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const add = (preset: (typeof PROFILE_PRESETS)[number]) => {
    const created: DraftProfile = {
      id: newProfileId(),
      name: preset.label,
      kind: preset.kind,
      baseUrl: preset.baseUrl,
      model: preset.model,
      hasApiKey: false,
    };
    onChange([...profiles, created]);
    // Straight into the editor: a row that has just appeared carrying a preset's defaults is
    // not finished, and it has no key yet.
    setEditing(created.id);
  };

  const remove = (id: string) => {
    onChange(profiles.filter((p) => p.id !== id));
    if (defaultId === id) onDefaultChange("");
    if (editing === id) setEditing(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor="sttDefaultProfileId" className={labelClass}>
            Recognise speech
          </label>
          <select
            id="sttDefaultProfileId"
            value={defaultId}
            onChange={(e) => onDefaultChange(e.target.value)}
            disabled={disabled}
            className={inputClass}
          >
            <option value="">On this machine (default)</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || "Unnamed"}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            What new work uses. Any of these — and this machine — can still be picked for a
            single run from <em>Re-transcribe</em>.
          </p>
        </div>
        <AddMenu disabled={disabled} onPick={add} />
      </div>

      {notice}

      <div className="overflow-x-auto rounded-md border border-[var(--border)]">
        <table className="w-full min-w-[26rem] text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
              <th className="whitespace-nowrap px-3 py-2 font-medium">Name</th>
              <th className="whitespace-nowrap px-3 py-2 font-medium">Model</th>
              <th className="whitespace-nowrap px-3 py-2 font-medium">Key</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-[var(--border)] last:border-b-0">
              <td className="w-full min-w-[9rem] max-w-0 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-[var(--text-strong)]">
                    On this machine
                  </span>
                  {defaultId === "" ? <DefaultBadge /> : null}
                </div>
                <span className="block truncate text-xs text-[var(--text-muted)]">
                  built in
                </span>
              </td>
              <td className="px-3 py-2 font-mono text-xs text-[var(--text-secondary)]">
                {localModel || "—"}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--text-muted)]">
                not needed
              </td>
              {/* No Remove. Everything else in this table you added; this one is the app. */}
              <td className="px-3 py-2">
                <div className="flex justify-end whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => setEditing(editing === LOCAL_ID ? null : LOCAL_ID)}
                    disabled={disabled}
                    className="btn-outline px-2 py-1 text-xs"
                  >
                    Edit
                  </button>
                </div>
              </td>
            </tr>
            {profiles.map((p) => {
              const host = profileDestination(p);
              return (
                <tr key={p.id} className="border-b border-[var(--border)] last:border-b-0">
                  <td className="w-full min-w-[9rem] max-w-0 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-[var(--text-strong)]">
                        {p.name || "Unnamed"}
                      </span>
                      {p.id === defaultId ? <DefaultBadge /> : null}
                    </div>
                    {/* Where it goes, under the name rather than in a column of its own: six
                        columns did not fit the card, and the actions were the ones pushed off
                        the edge. This is the line that has to be read anyway. */}
                    <span className="block truncate text-xs" title={host ?? undefined}>
                      {host ? (
                        <span className="text-[var(--warning)]">{host}</span>
                      ) : (
                        <span className="text-[var(--text-muted)]">your network</span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-[var(--text-secondary)]">
                    {p.model || "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">
                    {p.apiKey?.trim() ? (
                      <span className="text-[var(--accent-sub)]">unsaved</span>
                    ) : p.hasApiKey ? (
                      <span className="font-mono text-[var(--text-secondary)]">••••</span>
                    ) : (
                      <span className="text-[var(--text-muted)]">none</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setEditing(p.id)}
                        disabled={disabled}
                        className="btn-outline px-2 py-1 text-xs"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(p.id)}
                        disabled={disabled}
                        className="btn-outline px-2 py-1 text-xs text-[var(--error)]"
                        aria-label={`Remove ${p.name || "endpoint"}`}
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing === LOCAL_ID ? (
        <EditorPanel title="On this machine" onClose={() => setEditing(null)}>
          {localEditor}
        </EditorPanel>
      ) : draft ? (
        <EndpointEditor
          profile={draft}
          onChange={(patch) => update(draft.id, patch)}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

/** What an Edit opens, so the machine and a saved endpoint open the same thing. */
function EditorPanel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    // In normal flow rather than fixed: a fixed panel inside a long settings form ends up
    // covering the Save button on a phone. Closing this does not save — the form's own button
    // does, as it does for everything else on the page.
    <div className="rounded-md border border-[var(--accent)] bg-[var(--elevated)] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--text-strong)]">{title}</h3>
        <button type="button" onClick={onClose} className="btn-outline px-2 py-1 text-xs">
          Close
        </button>
      </div>
      {children}
    </div>
  );
}

/** "this is the one new work uses". */
function DefaultBadge() {
  return (
    <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] px-2 py-0.5 text-[10px] font-medium text-[var(--accent-sub)]">
      default
    </span>
  );
}

/** Add, with the preset chosen by the same click rather than from a select beside a button. */
function AddMenu({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (preset: (typeof PROFILE_PRESETS)[number]) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="btn-ink px-3 py-2 text-sm"
        aria-expanded={open}
      >
        + Add endpoint
      </button>
      {open ? (
        <>
          {/* Click anywhere else to dismiss. A menu that closes only by its own button is one
              people leave open and then click through. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-20 mt-1 w-64 overflow-hidden rounded-md border border-[var(--border-strong)] bg-[var(--surface)] shadow-lg">
            {PROFILE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  onPick(preset);
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--hover-surface)]"
              >
                <span className="text-[var(--text-strong)]">{preset.label}</span>
                <span className="block truncate text-xs text-[var(--text-muted)]">
                  {preset.model}
                </span>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function EndpointEditor({
  profile,
  onChange,
  onClose,
}: {
  profile: DraftProfile;
  onChange: (patch: Partial<DraftProfile>) => void;
  onClose: () => void;
}) {
  const host = profileDestination(profile);
  return (
    <EditorPanel title={profile.name || "Endpoint"} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor={`name-${profile.id}`}>
            Name
          </label>
          <input
            id={`name-${profile.id}`}
            type="text"
            value={profile.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor={`kind-${profile.id}`}>
            API
          </label>
          <select
            id={`kind-${profile.id}`}
            value={profile.kind}
            onChange={(e) => {
              const kind = e.target.value as SttProfileKind;
              onChange({
                kind,
                baseUrl:
                  kind === "gemini" && !profile.baseUrl ? GEMINI_DEFAULT_BASE : profile.baseUrl,
              });
            }}
            className={inputClass}
          >
            <option value="openai">OpenAI-compatible — /v1/audio/transcriptions</option>
            <option value="gemini">Google Gemini — the Interactions API</option>
          </select>
          {/* Asked because picking the "My own server" preset and then finding Google Gemini
              in this list reads like a mistake. It is not: this is the request format, and
              the address is the field below. The two are set separately because they vary
              separately -- a gateway on your own network can speak either one. */}
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            The request format, not the company. Whisper servers and most hosted providers
            speak the first one; the second is for Google&apos;s own endpoint, or a gateway
            that imitates it.
          </p>
        </div>
      </div>

      <div className="mt-3">
        <label className={labelClass} htmlFor={`url-${profile.id}`}>
          Base URL
        </label>
        <input
          id={`url-${profile.id}`}
          type="text"
          value={profile.baseUrl}
          onChange={(e) => onChange({ baseUrl: e.target.value })}
          className={inputClass}
        />
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          {host ? (
            <span className="text-[var(--warning)]">
              Recordings sent here leave this machine and go to {host}, which bills you for the
              length of the audio.
            </span>
          ) : (
            "A local or private address — nothing leaves your network."
          )}
        </p>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor={`model-${profile.id}`}>
            Model
          </label>
          <input
            id={`model-${profile.id}`}
            type="text"
            value={profile.model}
            onChange={(e) => onChange({ model: e.target.value })}
            className={inputClass}
          />
          {profile.kind === "gemini" ? (
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              <code>gemini-3.5-transcribe</code> returns word timings and speaker labels. A
              general model such as <code>gemini-3.5-flash</code> returns text alone, which
              arrives as one long utterance.
            </p>
          ) : null}
        </div>
        <div>
          <label className={labelClass} htmlFor={`key-${profile.id}`}>
            API key
          </label>
          <input
            id={`key-${profile.id}`}
            type="password"
            autoComplete="off"
            value={profile.apiKey ?? ""}
            onChange={(e) => onChange({ apiKey: e.target.value, clearApiKey: false })}
            placeholder={profile.hasApiKey ? "•••••••• (saved)" : "not set"}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Kept on the server, never sent to the browser. Blank leaves the saved one alone.
          </p>
          {profile.hasApiKey ? (
            <label className="mt-2 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={profile.clearApiKey === true}
                onChange={(e) => onChange({ clearApiKey: e.target.checked, apiKey: "" })}
                className="accent-[var(--error)]"
              />
              Delete the saved key
            </label>
          ) : null}
        </div>
      </div>
    </EditorPanel>
  );
}
