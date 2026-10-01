"use client";

import { useState } from "react";
import { type SpeakerNames, freshVoice, nameOf, speakersInOrder, toneOf } from "@/lib/speakers";
import { useT } from "@/app/locale-provider";

// The small pieces a transcript uses to show and change who said what: a coloured tag on a line,
// a picker that gives the line to someone else, and the row of fields that names the speakers.

/** The picker's last entry. Not a key a line could ever have, so it cannot collide with one. */
const ADD_VOICE = "+voice";

/** A speaker's name on a line, in their colour. */
export function SpeakerChip({ who, names }: { who: string; names: SpeakerNames }) {
  return <span className={`rounded px-1.5 text-xs ${toneOf(who).chip}`}>{nameOf(who, names)}</span>;
}

/**
 * Gives a line to another speaker. The last entry hands it to a voice nobody has yet, for when
 * separation merged two people into one.
 */
export function SpeakerPicker({
  current,
  known,
  names,
  onPick,
}: {
  current: string;
  known: string[];
  names: SpeakerNames;
  onPick: (speaker: string) => void;
}) {
  const t = useT();
  // The line's own speaker is listed even when the meeting no longer knows it (older data).
  const choices = speakersInOrder([...known, current], names);
  return (
    <select
      value={current}
      onChange={(e) => onPick(e.target.value === ADD_VOICE ? freshVoice(choices) : e.target.value)}
      title={t("Change the speaker of this utterance")}
      className="rounded border border-[var(--border-strong)] bg-[var(--elevated)] px-1 py-0.5 text-xs text-[var(--text-secondary)] hover:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
    >
      {choices.map((speaker) => (
        <option key={speaker} value={speaker}>
          {nameOf(speaker, names)}
        </option>
      ))}
      <option value={ADD_VOICE}>{t("+ New speaker")}</option>
    </select>
  );
}

/** One field per speaker, to name them all from one place. */
export function SpeakerNamesEditor({
  speakers,
  names,
  onName,
}: {
  speakers: string[];
  names: SpeakerNames;
  onName: (speaker: string, name: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {speakers.map((speaker) => (
        <NameInput key={speaker} speaker={speaker} names={names} onName={onName} />
      ))}
    </div>
  );
}

// Typing changes only this field. The name is saved when the field is left or Enter is pressed,
// and only if it says something new; Escape puts back what was there.
function NameInput({
  speaker,
  names,
  onName,
}: {
  speaker: string;
  names: SpeakerNames;
  onName: (speaker: string, name: string) => void;
}) {
  const saved = nameOf(speaker, names);
  const [typing, setTyping] = useState<string | null>(null);

  const save = () => {
    const name = typing?.trim();
    setTyping(null);
    if (name && name !== saved) onName(speaker, name);
  };

  return (
    <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${toneOf(speaker).mark}`} />
      <input
        type="text"
        value={typing ?? saved}
        onChange={(e) => setTyping(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setTyping(null);
        }}
        className="w-24 rounded border border-[var(--border-strong)] bg-[var(--elevated)] px-1.5 py-0.5 text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
      />
    </label>
  );
}
