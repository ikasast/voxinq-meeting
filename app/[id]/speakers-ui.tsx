"use client";

import { useState } from "react";
import {
  type SpeakerLabels,
  collectSpeakerKeys,
  nextPartnerKey,
  speakerColor,
  speakerName,
} from "@/lib/speakers";

const NEW_SPEAKER_VALUE = "__new__";

/** Colored name badge for a speaker. */
export function SpeakerBadge({
  speakerKey,
  labels,
  size = "sm",
}: {
  speakerKey: string;
  labels: SpeakerLabels;
  size?: "sm" | "xs";
}) {
  return (
    <span
      className={`rounded ${size === "xs" ? "px-1 text-[10px]" : "px-1.5 text-xs"} ${speakerColor(speakerKey).badge}`}
    >
      {speakerName(speakerKey, labels)}
    </span>
  );
}

/**
 * Select to reassign the speaker per utterance.
 * Choosing "＋ 新しい話者" at the end issues and assigns an unused partner key.
 */
export function SpeakerReassignSelect({
  value,
  speakerKeys,
  labels,
  onChange,
}: {
  value: string;
  speakerKeys: string[];
  labels: SpeakerLabels;
  onChange: (nextKey: string) => void;
}) {
  // Always include the current value as an option even if it is missing from the known list (for legacy data).
  const options = collectSpeakerKeys([...speakerKeys, value], labels);

  const handle = (selected: string) => {
    onChange(selected === NEW_SPEAKER_VALUE ? nextPartnerKey(options) : selected);
  };

  return (
    <select
      value={value}
      onChange={(e) => handle(e.target.value)}
      title="Change the speaker of this utterance"
      className="rounded border border-[var(--border-strong)] bg-[var(--elevated)] px-1 py-0.5 text-xs text-[var(--text-secondary)] hover:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
    >
      {options.map((key) => (
        <option key={key} value={key}>
          {speakerName(key, labels)}
        </option>
      ))}
      <option value={NEW_SPEAKER_VALUE}>+ New speaker</option>
    </select>
  );
}

/** Panel to edit all speaker display names at once. Commits on blur / Enter. */
export function SpeakerManager({
  speakerKeys,
  labels,
  onRename,
}: {
  speakerKeys: string[];
  labels: SpeakerLabels;
  onRename: (key: string, name: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {speakerKeys.map((key) => (
        <NameField key={key} speakerKey={key} labels={labels} onRename={onRename} />
      ))}
    </div>
  );
}

function NameField({
  speakerKey,
  labels,
  onRename,
}: {
  speakerKey: string;
  labels: SpeakerLabels;
  onRename: (key: string, name: string) => void;
}) {
  // Hold a local draft only while editing; reset to null on commit/cancel.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = speakerName(speakerKey, labels);

  const commit = () => {
    if (draft !== null) {
      const name = draft.trim();
      if (name && name !== shown) onRename(speakerKey, name);
    }
    setDraft(null);
  };

  return (
    <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${speakerColor(speakerKey).dot}`} />
      <input
        type="text"
        value={draft ?? shown}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") setDraft(null);
        }}
        className="w-24 rounded border border-[var(--border-strong)] bg-[var(--elevated)] px-1.5 py-0.5 text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
      />
    </label>
  );
}
