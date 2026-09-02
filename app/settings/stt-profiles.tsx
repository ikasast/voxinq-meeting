"use client";

import { useState } from "react";
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

const inputClass = "input mt-1";
const labelClass = "label";

export type DraftProfile = PublicSttProfile & { apiKey?: string; clearApiKey?: boolean };

const KIND_LABEL: Record<SttProfileKind, string> = {
  openai: "OpenAI-compatible",
  gemini: "Google Gemini",
};

export function SttProfiles({
  profiles,
  defaultId,
  disabled,
  onChange,
  onDefaultChange,
}: {
  profiles: DraftProfile[];
  defaultId: string;
  disabled: boolean;
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

      {profiles.length === 0 ? (
        <p className="rounded-md border border-dashed border-[var(--border)] p-4 text-xs text-[var(--text-muted)]">
          No endpoints saved. Recognition runs on this machine, choosing faster-whisper or
          whisper.cpp from the hardware.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">API</th>
                <th className="px-3 py-2 font-medium">Model</th>
                <th className="px-3 py-2 font-medium">Key</th>
                <th className="px-3 py-2 font-medium">Sends to</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => {
                const host = profileDestination(p);
                return (
                  <tr key={p.id} className="border-b border-[var(--border)] last:border-b-0">
                    <td className="px-3 py-2">
                      <span className="font-medium text-[var(--text-strong)]">
                        {p.name || "Unnamed"}
                      </span>
                      {p.id === defaultId ? (
                        <span className="ml-2 rounded-full bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] px-2 py-0.5 text-[10px] font-medium text-[var(--accent-sub)]">
                          default
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{KIND_LABEL[p.kind]}</td>
                    <td className="px-3 py-2 font-mono text-xs text-[var(--text-secondary)]">
                      {p.model || "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {p.apiKey?.trim() ? (
                        <span className="text-[var(--accent-sub)]">unsaved</span>
                      ) : p.hasApiKey ? (
                        <span className="font-mono text-[var(--text-secondary)]">••••</span>
                      ) : (
                        <span className="text-[var(--text-muted)]">none</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {host ? (
                        <span className="text-[var(--warning)]">{host}</span>
                      ) : (
                        <span className="text-[var(--text-muted)]">your network</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
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
      )}

      {draft ? (
        <EndpointEditor
          profile={draft}
          onChange={(patch) => update(draft.id, patch)}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
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
    // In normal flow rather than fixed: a fixed panel inside a long settings form ends up
    // covering the Save button on a phone. Closing this does not save — the form's own button
    // does, as it does for everything else on the page.
    <div className="rounded-md border border-[var(--accent)] bg-[var(--elevated)] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--text-strong)]">
          {profile.name || "Endpoint"}
        </h3>
        <button type="button" onClick={onClose} className="btn-outline px-2 py-1 text-xs">
          Close
        </button>
      </div>

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
            <option value="openai">OpenAI-compatible (Groq, OpenAI, your own server)</option>
            <option value="gemini">Google Gemini</option>
          </select>
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
    </div>
  );
}
