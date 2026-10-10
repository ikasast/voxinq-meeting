"use client";

import { useState, type ReactNode } from "react";
import { type SpeakerNames, freshVoice, shownName, speakersInOrder, toneOf } from "@/lib/speakers";
import { useT } from "@/app/locale-provider";
import { DropMenu, MENU_ITEM, MenuRule } from "@/app/drop-menu";
import { CheckIcon } from "@/app/icons";

// The small pieces a transcript uses to show and change who said what: a line's speaker in their
// colour, the menu that gives the line to someone else, and the row of fields that names them.

/**
 * Who said a line: their name in their colour, as text — no tag around it. Where the line can be
 * given to someone else, the name is the button that does it (SpeakerMenu).
 */
export function SpeakerName({
  who,
  names,
  known,
  onPick,
}: {
  who: string;
  names: SpeakerNames;
  /** The meeting's speakers, to choose from. */
  known?: string[];
  /** Without it, the name is only shown. */
  onPick?: (speaker: string) => void;
}) {
  const t = useT();
  const name = shownName(who, names, t);
  const look = `block max-w-full truncate text-left text-xs font-semibold ${toneOf(who).text}`;
  if (!onPick) return <span className={look}>{name}</span>;
  return (
    <SpeakerMenu
      who={who}
      names={names}
      known={known}
      onPick={onPick}
      trigger={name}
      ariaLabel={`${name} — ${t("Change the speaker of this utterance")}`}
      className={`${look} hover:underline`}
    />
  );
}

/**
 * Gives a line to another speaker: the meeting's speakers, and last a voice nobody has yet, for
 * when separation merged two people into one. Opened from the name, or from the row's tools on a
 * line whose name is left out because the same person went on.
 */
export function SpeakerMenu({
  who,
  names,
  known = [],
  onPick,
  trigger,
  ariaLabel,
  align = "start",
  className,
}: {
  who: string;
  names: SpeakerNames;
  known?: string[];
  onPick: (speaker: string) => void;
  trigger: ReactNode;
  ariaLabel?: string;
  /** Under a name it starts where the name does; from a row's tools at the right, it ends there. */
  align?: "start" | "end";
  className: string;
}) {
  const t = useT();
  // The line's own speaker is listed even when the meeting no longer knows it (older data).
  const choices = speakersInOrder([...known, who], names);
  return (
    <DropMenu
      label={t("Change the speaker of this utterance")}
      ariaLabel={ariaLabel}
      align={align}
      width={200}
      trigger={trigger}
      className={className}
    >
      {(close) => (
        <>
          {choices.map((speaker) => (
            <button
              key={speaker}
              type="button"
              role="menuitemradio"
              aria-checked={speaker === who}
              onClick={() => {
                close();
                if (speaker !== who) onPick(speaker);
              }}
              className={MENU_ITEM}
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${toneOf(speaker).mark}`} />
              <span className="min-w-0 flex-1 truncate">{shownName(speaker, names, t)}</span>
              {speaker === who ? <CheckIcon className="h-3.5 w-3.5 text-[var(--accent)]" /> : null}
            </button>
          ))}
          <MenuRule />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              close();
              onPick(freshVoice(choices));
            }}
            className={MENU_ITEM}
          >
            {t("+ New speaker")}
          </button>
        </>
      )}
    </DropMenu>
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
  const t = useT();
  const saved = shownName(speaker, names, t);
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
