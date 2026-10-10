"use client";

import { useState } from "react";
import { formatOffset, formatTime } from "@/lib/utils";
import type { SpeakerNames } from "@/lib/speakers";
import { useT } from "@/app/locale-provider";
import { useExtensions } from "@/app/extensions-provider";
import { type CueMark, marks, readCues } from "@/lib/voice-cues";
import { emotionMark, readEmotion } from "@/lib/emotion";
import {
  FaceAngerIcon,
  FaceJoyIcon,
  FaceSadIcon,
  PencilIcon,
  PersonIcon,
  PitchDownIcon,
  PitchUpIcon,
  RabbitIcon,
  TrashIcon,
  TurtleIcon,
  VolumeDownIcon,
  VolumeUpIcon,
} from "../icons";
import { SpeakerMenu, SpeakerName } from "./speakers-ui";
import { ROW_BUTTON } from "./transcript-buttons";

/** One line of the transcript, as the page has it. */
export type Item = {
  id: string;
  speakerType: string;
  text: string;
  createdAt: string;
  // Japanese translation of a non-Japanese utterance (null when none was produced).
  translation?: string | null;
  // Where this utterance starts in the recording. Null on rows saved before this was stored.
  audioStartMs?: number | null;
  // Set when this line was split off another at a speaker change — the id of the line it came
  // from. Its presence is what offers the way back.
  splitOfId?: string | null;
  // How it was said against the speaker's own average (Voice cues): stored JSON, lib/voice-cues.ts.
  voice?: string | null;
  // What it sounded like (Emotion): stored JSON, lib/emotion.ts.
  emotion?: string | null;
};

// A single utterance, laid out like a line of a script: who said it and when at the left, what
// they said at the right. When the same person goes on, the name is left out and only the time
// stays. The time is from the start of the recording (0:00); with a recording it plays from
// there, and the clock time is in its tooltip. The speaker is shown only with two or more.
export function TranscriptRow({
  item,
  elapsed,
  labels,
  reassignKeys,
  showSpeaker,
  sameSpeaker,
  canSeek,
  onSeek,
  onReassign,
  onDelete,
  onEdit,
  showTranslation,
  readOnly,
}: {
  showTranslation: boolean;
  item: Item;
  elapsed: number;
  labels: SpeakerNames;
  reassignKeys: string[];
  showSpeaker: boolean;
  /** Said by whoever said the line before: the name is not repeated. */
  sameSpeaker: boolean;
  canSeek: boolean;
  onSeek: () => void;
  onReassign: (nextKey: string) => void;
  onDelete: () => void;
  onEdit: (text: string) => Promise<boolean>;
  readOnly: boolean;
}) {
  const t = useT();
  // Who said it is changed here only with Speaker separation on.
  const { speakers: speakersOn, voiceCues: voiceOn, emotion: emotionOn } = useExtensions();
  const canReassign = showSpeaker && !readOnly && speakersOn;
  // Correcting a misheard word in place. Recognition gets names and jargon wrong often
  // enough that retyping one line beats re-transcribing the whole meeting.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setDraft(item.text);
    setEditing(true);
  };

  const save = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === item.text) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const ok = await onEdit(trimmed);
    setSaving(false);
    if (ok) setEditing(false);
  };

  return (
    // Focusable so that on a touch screen, which has no hover, tapping a line shows its tools.
    <li
      id={`line-${item.id}`}
      tabIndex={-1}
      className={`group relative grid gap-x-3 rounded-md px-1.5 py-1.5 text-sm outline-none transition-shadow hover:bg-[color-mix(in_srgb,var(--hover-surface)_45%,transparent)] focus-within:bg-[color-mix(in_srgb,var(--hover-surface)_45%,transparent)] ${
        showSpeaker ? "grid-cols-[5rem_minmax(0,1fr)]" : "grid-cols-[2.75rem_minmax(0,1fr)]"
      } ${showSpeaker && !sameSpeaker ? "mt-2 first:mt-0" : ""}`}
    >
      <div className="min-w-0 pt-0.5">
        {showSpeaker && !sameSpeaker ? (
          <SpeakerName
            who={item.speakerType}
            names={labels}
            known={reassignKeys}
            onPick={canReassign ? onReassign : undefined}
          />
        ) : null}
        {canSeek ? (
          <button
            type="button"
            onClick={onSeek}
            title={t("Play from here ({time})", { time: formatTime(item.createdAt) })}
            className="block text-[11px] tabular-nums text-[var(--text-muted)] hover:text-[var(--accent)] hover:underline"
          >
            {formatOffset(elapsed)}
          </button>
        ) : (
          <span className="block text-[11px] tabular-nums text-[var(--text-muted)]" title={formatTime(item.createdAt)}>
            {formatOffset(elapsed)}
          </span>
        )}
      </div>

      <div className="min-w-0">
        {editing ? (
          <div className="space-y-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Enter saves (the common case is a short correction); Shift+Enter adds a line.
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void save();
                } else if (e.key === "Escape") {
                  setEditing(false);
                }
              }}
              rows={Math.min(8, Math.max(2, draft.split("\n").length + 1))}
              autoFocus
              disabled={saving}
              className="input resize-y text-sm"
            />
            <div className="flex items-center justify-end gap-2">
              <span className="mr-auto text-[11px] text-[var(--text-muted)]">
                {t("Enter to save · Shift+Enter for a new line · Esc to cancel")}
              </span>
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={saving}
                className="rounded-md border border-[var(--border-strong)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--hover-surface)] disabled:opacity-50"
              >
                {t("Cancel")}
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || !draft.trim()}
                className="rounded-md bg-[var(--accent-solid)] px-2.5 py-1 text-xs font-medium text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] disabled:opacity-50"
              >
                {saving ? t("Saving…") : t("Save")}
              </button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap leading-relaxed text-[var(--foreground)]">
            {item.text}
            {voiceOn || emotionOn ? (
              <VoiceMarks
                marks={voiceOn ? marks(readCues(item.voice)) : []}
                emotion={emotionOn ? emotionMark(readEmotion(item.emotion)) : null}
              />
            ) : null}
          </p>
        )}
        {/* Japanese translation, shown under the original rather than replacing it — the
            transcript stays the record of what was actually said. */}
        {showTranslation && item.translation ? (
          <p className="mt-1 border-l-2 border-[var(--border-strong)] pl-2 text-xs whitespace-pre-wrap text-[var(--text-muted)]">
            {item.translation}
          </p>
        ) : null}
      </div>

      {/* Fix or drop a misheard line so the minutes are built from the right words, or — where
          the name is left out — give it to someone else. Out of the way until the line is
          pointed at or tapped, then floating over its corner rather than taking a column. */}
      {!readOnly && !editing ? (
        <div className="absolute right-1 top-1 hidden items-center rounded-md border border-[var(--border)] bg-[var(--elevated)] shadow-sm group-hover:flex group-focus-within:flex">
          {canReassign && sameSpeaker ? (
            <SpeakerMenu
              who={item.speakerType}
              names={labels}
              known={reassignKeys}
              onPick={onReassign}
              trigger={<PersonIcon className="h-3.5 w-3.5" />}
              align="end"
              className={ROW_BUTTON}
            />
          ) : null}
          <button
            type="button"
            onClick={startEdit}
            title={t("Edit this utterance")}
            aria-label={t("Edit this utterance")}
            className={ROW_BUTTON}
          >
            <PencilIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            title={t("Delete this utterance (it will no longer feed minutes generation)")}
            aria-label={t("Delete this utterance")}
            className={`${ROW_BUTTON} hover:!text-[var(--error)]`}
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
    </li>
  );
}

/** A face and a colour for each emotion a line can be labelled with. */
const MOOD = {
  joy: { icon: FaceJoyIcon, color: "--mood-joy" },
  anger: { icon: FaceAngerIcon, color: "--mood-anger" },
  sadness: { icon: FaceSadIcon, color: "--mood-sad" },
} as const;

/**
 * How a line was said, under it: the voice cues that stood out (lib/voice-cues.ts) and, where it
 * was clear, the emotion it sounded like (lib/emotion.ts).
 */
function VoiceMarks({
  marks: list,
  emotion,
}: {
  marks: CueMark[];
  emotion: ReturnType<typeof emotionMark>;
}) {
  const t = useT();
  if (list.length === 0 && !emotion) return null;
  const feeling = emotion
    ? emotion.emotion === "joy"
      ? t("Sounded joyful")
      : emotion.emotion === "anger"
        ? t("Sounded angry")
        : t("Sounded sad")
    : null;
  const word = (m: CueMark) =>
    m.cue === "loud"
      ? m.up
        ? t("Louder")
        : t("Quieter")
      : m.cue === "pitch"
        ? m.up
          ? t("Higher")
          : t("Lower")
        : m.up
          ? t("Faster")
          : t("Slower");
  const Icon = (m: CueMark) =>
    m.cue === "loud"
      ? m.up
        ? VolumeUpIcon
        : VolumeDownIcon
      : m.cue === "pitch"
        ? m.up
          ? PitchUpIcon
          : PitchDownIcon
        : m.up
          ? RabbitIcon
          : TurtleIcon;
  return (
    <span className="ml-1.5 inline-flex items-center gap-1 align-[-2px]">
      {/* Pictures alone: the words are in the tooltips and read out, not printed. */}
      {emotion ? (
        <span
          role="img"
          aria-label={`${feeling} — ${t("Judged from the voice alone ({p}% sure): how the line sounded, not what anybody felt.", { p: Math.round(emotion.p * 100) })}`}
          title={`${feeling} — ${t("Judged from the voice alone ({p}% sure): how the line sounded, not what anybody felt.", { p: Math.round(emotion.p * 100) })}`}
          className="inline-flex"
          style={{ color: `var(${MOOD[emotion.emotion].color})` }}
        >
          {(() => {
            const Face = MOOD[emotion.emotion].icon;
            return <Face className="h-3.5 w-3.5 shrink-0" />;
          })()}
        </span>
      ) : null}
      {list.map((m) => {
        const I = Icon(m);
        const said = `${word(m)} — ${t("Compared with this speaker's other lines in this meeting")}`;
        return (
          <span
            key={m.cue}
            role="img"
            aria-label={said}
            title={said}
            className={`inline-flex ${m.up ? "text-[var(--warning)]" : "text-[var(--text-muted)]"}`}
          >
            <I className="h-3.5 w-3.5 shrink-0" />
          </span>
        );
      })}
    </span>
  );
}
