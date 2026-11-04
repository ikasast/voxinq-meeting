"use client";

import { PencilIcon, TrashIcon } from "../icons";
import { useState, type ReactNode } from "react";
import {
  type PublicSttProfile,
  type SttProfileKind,
  GEMINI_DEFAULT_BASE,
  PROFILE_PRESETS,
  newProfileId,
} from "@/lib/stt/profiles";
import { profileDestination } from "@/lib/stt/destination";
import { useT } from "@/app/locale-provider";
import { useBackGuard } from "@/app/use-back-guard";

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
// The Voxinq server is a row in the same list. It is a destination like the others -- it is the
// default until you say otherwise, and it is what "local" means in the Re-transcribe picker --
// and the model it runs was a lone select below the list, next to nothing that said what it
// belonged to. In the list it sits where you would look for it. It has no Remove: there is
// always a server, and unlike a saved endpoint you did not add it. It is named as the server
// rather than "this machine", which on a phone read as the phone.

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
  endpoints = true,
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
  /** False while External AI is switched off: this machine is the only place speech goes, so
   *  there is nothing to pick and nothing to add — just its own row. */
  endpoints?: boolean;
  onChange: (next: DraftProfile[]) => void;
  onDefaultChange: (id: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const t = useT();
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
      {endpoints ? (
      <>
      <div>
        {/* "Where", and the place named as the server: read on a phone, "this machine" was the
            phone, which is the one place that never transcribes anything (2026-11-03). */}
        <label htmlFor="sttDefaultProfileId" className={labelClass}>
          {t("Where to transcribe")}
        </label>
        <select
          id="sttDefaultProfileId"
          value={defaultId}
          onChange={(e) => onDefaultChange(e.target.value)}
          disabled={disabled}
          className={inputClass}
        >
          <option value="">{t("Voxinq server (default)")}</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name || "Unnamed"}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          {t("Meetings you record or import are transcribed here. Re-transcribe can pick another place for one run.")}
        </p>
      </div>

      {notice}
      </>
      ) : null}

      {/* A row each, with what was columns as one line under the name. As a table it was wider
          than a phone, and Edit was the column that needed a sideways scroll to reach. */}
      <ul className="divide-y divide-[var(--border)] rounded-md border border-[var(--border)]">
        <li className="flex items-center gap-2 px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium text-[var(--text-strong)]">{t("Voxinq server")}</span>
              {defaultId === "" ? <DefaultBadge /> : null}
            </div>
            <span className="block truncate text-xs text-[var(--text-muted)]">
              <span className="font-mono text-[var(--text-secondary)]">{localModel || "—"}</span>
              {" · "}
              {t("built in")}
            </span>
          </div>
          {/* No Remove. Everything else in this list you added; this one is the app. */}
          <button
            type="button"
            onClick={() => setEditing(editing === LOCAL_ID ? null : LOCAL_ID)}
            disabled={disabled}
            className="btn-icon !h-8 !w-8 shrink-0"
            title={t("Edit {name}", { name: t("Voxinq server") })}
            aria-label={t("Edit {name}", { name: t("Voxinq server") })}
          >
            <PencilIcon />
          </button>
        </li>
        {profiles.map((p) => {
          const host = profileDestination(p);
          return (
            <li key={p.id} className="flex items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-[var(--text-strong)]">{p.name || t("Unnamed")}</span>
                  {p.id === defaultId ? <DefaultBadge /> : null}
                </div>
                {/* The model, the key, and where it goes — the last is the part that has to be
                    read, so a host outside your network is in the warning colour. */}
                <span className="block truncate text-xs text-[var(--text-muted)]" title={host ?? undefined}>
                  <span className="font-mono text-[var(--text-secondary)]">{p.model || "—"}</span>
                  {" · "}
                  {p.apiKey?.trim() ? (
                    <span className="text-[var(--accent-sub)]">{t("key unsaved")}</span>
                  ) : p.hasApiKey ? (
                    t("key saved")
                  ) : (
                    t("no key")
                  )}
                  {" · "}
                  {host ? (
                    <span className="text-[var(--warning)]">{host}</span>
                  ) : (
                    t("your network")
                  )}
                </span>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => setEditing(p.id)}
                  disabled={disabled}
                  className="btn-icon !h-8 !w-8"
                  title={t("Edit {name}", { name: p.name || t("endpoint") })}
                  aria-label={t("Edit {name}", { name: p.name || t("endpoint") })}
                >
                  <PencilIcon />
                </button>
                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  disabled={disabled}
                  className="btn-icon !h-8 !w-8 !text-[var(--error)] hover:!bg-[color-mix(in_srgb,var(--error)_12%,transparent)]"
                  title={t("Remove {name}", { name: p.name || t("endpoint") })}
                  aria-label={t("Remove {name}", { name: p.name || t("endpoint") })}
                >
                  <TrashIcon />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {endpoints ? <AddMenu disabled={disabled} onPick={add} /> : null}

      {editing === LOCAL_ID ? (
        <EditorPanel title={t("Voxinq server")} onClose={() => setEditing(null)}>
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
  const t = useT();
  return (
    // In normal flow rather than fixed: a fixed panel inside a long settings form ends up
    // covering the Save button on a phone. Closing this does not save — the form's own button
    // does, as it does for everything else on the page.
    <div className="rounded-md border border-[var(--accent)] bg-[var(--elevated)] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--text-strong)]">{title}</h3>
        <button type="button" onClick={onClose} className="btn-outline px-2 py-1 text-xs">
          {t("Close")}
        </button>
      </div>
      {children}
    </div>
  );
}

/** "this is the one new work uses". */
function DefaultBadge() {
  const t = useT();
  return (
    <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] px-2 py-0.5 text-[10px] font-medium text-[var(--accent-sub)]">
      {t("default")}
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
  const t = useT();
  const [open, setOpen] = useState(false);
  // Back closes the menu instead of leaving Settings.
  useBackGuard(open, () => setOpen(false));
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="btn-outline px-3 py-1.5 text-sm"
        aria-expanded={open}
      >
        {t("+ Add endpoint")}
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
          <div className="absolute left-0 z-20 mt-1 w-64 overflow-hidden rounded-md border border-[var(--border-strong)] bg-[var(--surface)] shadow-lg">
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
  const t = useT();
  const host = profileDestination(profile);
  return (
    <EditorPanel title={profile.name || "Endpoint"} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor={`name-${profile.id}`}>
            {t("Name")}
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
            {t("API")}
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
            <option value="openai">{t("OpenAI-compatible — /v1/audio/transcriptions")}</option>
            <option value="gemini">{t("Google Gemini — the Interactions API")}</option>
          </select>
          {/* Asked because picking the "My own server" preset and then finding Google Gemini
              in this list reads like a mistake. It is not: this is the request format, and
              the address is the field below. The two are set separately because they vary
              separately -- a gateway on your own network can speak either one. */}
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {t("The request format, not the company. Whisper servers and most hosted providers speak the first one; the second is for Google’s own endpoint, or a gateway that imitates it.")}
          </p>
        </div>
      </div>

      <div className="mt-3">
        <label className={labelClass} htmlFor={`url-${profile.id}`}>
          {t("Base URL")}
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
              {t(
                "Recordings sent here leave this machine and go to {host}, which bills you for the length of the audio.",
                { host },
              )}
            </span>
          ) : (
            t("A local or private address — nothing leaves your network.")
          )}
        </p>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor={`model-${profile.id}`}>
            {t("Model")}
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
              {t(
                "gemini-3.5-transcribe returns word timings and speaker labels. A general model such as gemini-3.5-flash returns text alone, which arrives as one long utterance.",
              )}
            </p>
          ) : null}
        </div>
        <div>
          <label className={labelClass} htmlFor={`key-${profile.id}`}>
            {t("API key")}
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
            {t("Kept on the server, never sent to the browser. Blank leaves the saved one alone.")}
          </p>
          {profile.hasApiKey ? (
            <label className="mt-2 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={profile.clearApiKey === true}
                onChange={(e) => onChange({ clearApiKey: e.target.checked, apiKey: "" })}
                className="accent-[var(--error)]"
              />
              {t("Delete the saved key")}
            </label>
          ) : null}
        </div>
      </div>
    </EditorPanel>
  );
}
