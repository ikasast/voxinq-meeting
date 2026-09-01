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

// Saved recognition endpoints, and which one is the default.
//
// A list rather than one endpoint, because a single setting answered "where does recognition
// happen" for everything -- and choosing a remote one meant losing the ability to re-transcribe
// on this machine. Here you save what you have; the choice is made per run.
//
// Keys never come back from the server, so an entry with a saved key shows a placeholder and an
// empty box means "leave it alone". Editing anything else about a profile must not silently
// forget its key.

const inputClass = "input mt-1";
const labelClass = "label";

export type DraftProfile = PublicSttProfile & { apiKey?: string; clearApiKey?: boolean };

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
  const [preset, setPreset] = useState(PROFILE_PRESETS[0].label);

  const update = (id: string, patch: Partial<DraftProfile>) =>
    onChange(profiles.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const add = () => {
    const chosen = PROFILE_PRESETS.find((x) => x.label === preset) ?? PROFILE_PRESETS[0];
    onChange([
      ...profiles,
      {
        id: newProfileId(),
        name: chosen.label,
        kind: chosen.kind,
        baseUrl: chosen.baseUrl,
        model: chosen.model,
        hasApiKey: false,
      },
    ]);
  };

  const remove = (id: string) => {
    onChange(profiles.filter((p) => p.id !== id));
    // A default that no longer exists would silently fall back to local, which is the right
    // behaviour but a confusing way to learn it.
    if (defaultId === id) onDefaultChange("");
  };

  return (
    <div className="space-y-3">
      <div>
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
          What new work uses. Every saved endpoint can still be picked for a single run from{" "}
          <em>Re-transcribe</em>, and so can this machine — whichever is set here.
        </p>
      </div>

      {profiles.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">
          No endpoints saved. Recognition runs here, choosing faster-whisper or whisper.cpp from
          the hardware.
        </p>
      ) : null}

      {profiles.map((p) => {
        const host = profileDestination(p);
        return (
          <fieldset
            key={p.id}
            disabled={disabled}
            className="space-y-3 rounded-md border border-[var(--border)] p-4"
          >
            <legend className="px-1 text-xs font-medium text-[var(--text-secondary)]">
              {p.name || "Unnamed"}
            </legend>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor={`name-${p.id}`}>
                  Name
                </label>
                <input
                  id={`name-${p.id}`}
                  type="text"
                  value={p.name}
                  onChange={(e) => update(p.id, { name: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor={`kind-${p.id}`}>
                  API
                </label>
                <select
                  id={`kind-${p.id}`}
                  value={p.kind}
                  onChange={(e) => {
                    const kind = e.target.value as SttProfileKind;
                    update(p.id, {
                      kind,
                      baseUrl: kind === "gemini" && !p.baseUrl ? GEMINI_DEFAULT_BASE : p.baseUrl,
                    });
                  }}
                  className={inputClass}
                >
                  <option value="openai">OpenAI-compatible (Groq, OpenAI, your own server)</option>
                  <option value="gemini">Google Gemini</option>
                </select>
              </div>
            </div>

            <div>
              <label className={labelClass} htmlFor={`url-${p.id}`}>
                Base URL
              </label>
              <input
                id={`url-${p.id}`}
                type="text"
                value={p.baseUrl}
                onChange={(e) => update(p.id, { baseUrl: e.target.value })}
                className={inputClass}
              />
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {host ? (
                  <span className="text-[var(--warning)]">
                    Recordings sent here leave this machine and go to {host}, which bills you for
                    the length of the audio.
                  </span>
                ) : (
                  "A local or private address — nothing leaves your network."
                )}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor={`model-${p.id}`}>
                  Model
                </label>
                <input
                  id={`model-${p.id}`}
                  type="text"
                  value={p.model}
                  onChange={(e) => update(p.id, { model: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor={`key-${p.id}`}>
                  API key
                </label>
                <input
                  id={`key-${p.id}`}
                  type="password"
                  autoComplete="off"
                  value={p.apiKey ?? ""}
                  onChange={(e) => update(p.id, { apiKey: e.target.value, clearApiKey: false })}
                  placeholder={p.hasApiKey ? "•••••••• (saved)" : "not set"}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              {p.hasApiKey ? (
                <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={p.clearApiKey === true}
                    onChange={(e) => update(p.id, { clearApiKey: e.target.checked, apiKey: "" })}
                    className="accent-[var(--error)]"
                  />
                  Delete the saved key
                </label>
              ) : null}
              <button
                type="button"
                onClick={() => remove(p.id)}
                className="btn-outline ml-auto text-[var(--error)]"
              >
                Remove
              </button>
            </div>
          </fieldset>
        );
      })}

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={preset}
          onChange={(e) => setPreset(e.target.value)}
          disabled={disabled}
          className="input w-auto"
          aria-label="Endpoint to add"
        >
          {PROFILE_PRESETS.map((x) => (
            <option key={x.label} value={x.label}>
              {x.label}
            </option>
          ))}
        </select>
        <button type="button" onClick={add} disabled={disabled} className="btn-outline">
          Add endpoint
        </button>
      </div>
    </div>
  );
}
