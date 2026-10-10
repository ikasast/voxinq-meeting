"use client";

import { useT } from "@/app/locale-provider";
import { PeopleIcon, PencilIcon } from "@/app/icons";
import { toneOf } from "@/lib/speakers";
import { PROP_BUTTON, Prop } from "./property";
import { type SpeakerSummary, openSpeakers, useSpeakerSummary } from "./speaker-bus";

// Who spoke, as a row of the meeting's details (v4) — under the participants, who are who was
// there. Speaker separation is one of the things the app is for, and until now the only sign of
// it was a picture of two people at the top of the transcript: nothing said whether a meeting's
// lines had been told apart, or that a name was still missing.
//
// So the row says where it stands — not yet, under way, or the voices with their names — and
// its button opens the transcript's speaker tools, where the count is checked before it runs.
export function SpeakersRow({
  meetingId,
  initial,
  readOnly = false,
}: {
  meetingId: string;
  /** Worked out on the server from the lines, until the transcript's panel says otherwise. */
  initial: SpeakerSummary;
  readOnly?: boolean;
}) {
  const t = useT();
  const s = useSpeakerSummary(meetingId, initial);
  const unnamed = s.speakers.filter((x) => !x.named).length;
  const open = () => openSpeakers(meetingId);

  return (
    <Prop
      label={t("Speakers")}
      action={
        s.separated && !readOnly && !s.running ? (
          <button
            type="button"
            onClick={open}
            title={t("Name the speakers")}
            aria-label={t("Name the speakers")}
            className={PROP_BUTTON}
          >
            <PencilIcon className="h-3.5 w-3.5" />
          </button>
        ) : null
      }
    >
      {s.running ? (
        <span className="inline-flex items-center gap-2 text-[var(--accent-sub)]">
          <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
          {s.running}
        </span>
      ) : s.separated ? (
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {s.speakers.map((x) => (
            <span key={x.key} className={`font-medium ${toneOf(x.key).text}`}>
              {x.name}
            </span>
          ))}
          {unnamed > 0 && !readOnly ? (
            <span className="text-xs text-[var(--text-muted)]">
              {t(unnamed === 1 ? "1 without a name" : "{n} without a name", { n: unnamed })}
            </span>
          ) : null}
        </span>
      ) : (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[var(--text-muted)]">
            {s.possible ? t("Not separated yet") : t("Not separated — there is no recording to read")}
          </span>
          {s.possible && !readOnly ? (
            <button type="button" onClick={open} className="btn-ink !px-3 !py-1 text-xs">
              <PeopleIcon className="h-3.5 w-3.5" />
              {t("Separate speakers")}
            </button>
          ) : null}
        </span>
      )}
    </Prop>
  );
}
