"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { defaultMeetingTitle } from "@/lib/meeting-title";
import { dayFromKey } from "@/lib/utils";
import { useT } from "@/app/locale-provider";
import { useExtensions } from "@/app/extensions-provider";
import { CalendarIcon, MicIcon } from "@/app/icons";
import { PROPS_GRID, Prop } from "@/app/[id]/property";

// A new meeting (v4): its name and, if wanted, when it is, its series and what it is for — in
// the same table the meeting's own page shows them in, since that is where they will be read.
//
// What this form used to ask besides — the model, the language, the microphone mode and the
// source for this one recording — comes from Settings now, and the source is chosen on the
// meeting page beside the record button, where it can also be changed mid-meeting. The box to
// drop a recording on went too: a file dropped anywhere in the app becomes a meeting
// (drop-to-transcribe.tsx), and the start screen has a button for one.

/**
 * @param external Reached from outside the private network. The transcription service is not
 *   reachable from there, so recording is not on offer — but setting a meeting up is the part
 *   that needs no GPU and no audio, and it is the part someone does from a work laptop the
 *   evening before. It always lands on the meeting.
 */
export default function NewMeetingForm({
  external = false,
  date,
  titleFormat,
}: {
  external?: boolean;
  /** "2026-09-18" from the calendar. Books the meeting on that day rather than recording now. */
  date?: string;
  /** Which shape the default title takes — this reader's setting, resolved on the server. */
  titleFormat?: string;
}) {
  const router = useRouter();
  // The day this meeting is for, which is not always today. Arriving from the calendar's
  // "+ Add a meeting on this day" and being handed today's date as the title is the click
  // appearing to have been ignored — the whole point of that link was to say which day.
  const bookedDay = dayFromKey(date);
  const t = useT();
  const { schedule, series: seriesOn } = useExtensions();
  const dayTitle = defaultMeetingTitle(bookedDay, titleFormat);
  const [title, setTitle] = useState(dayTitle);
  const [description, setDescription] = useState("");
  const [series, setSeries] = useState("");
  // Empty means "record it now", which is how every meeting was made until this existed.
  // A day picked in the calendar fills it in: arriving here from "+ Add a meeting on this day"
  // and finding the date blank would make the click look like it did nothing. The hour is a
  // starting point, not a guess to be defended — it is the first thing anybody changes.
  const [scheduledAt, setScheduledAt] = useState(() => (bookedDay ? `${date}T09:00` : ""));
  const [seriesOptions, setSeriesOptions] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!seriesOn) return;
    let cancelled = false;
    fetch("/api/series")
      .then((r) => (r.ok ? r.json() : null))
      .then((list: { name: string }[] | null) => {
        if (!cancelled && list) setSeriesOptions(list.map((s) => s.name));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [seriesOn]);

  // Booked for later, or made from outside: an entry under Upcoming, not a recording about to start.
  const later = Boolean(scheduledAt) || external;

  // Create it and open it. Not yet recording: the meeting page is the recording screen, with the
  // microphone check and the source beside the record button, and recording starts there when
  // it is pressed. Booked for later, it lands on the same page to fill in calmly beforehand.
  //
  // Every way out of this form replaces it in the history: the meeting exists now, and Back to a
  // blank form — which makes another meeting if sent — is not a way back to anything.
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError(t("Please enter a title."));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || dayTitle,
          description: description.trim(),
          series: series.trim(),
          // datetime-local has no zone; it is wall-clock time on this device, which is what
          // somebody writing "Tuesday at 14:00" means. new Date() reads it as local.
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      const meeting = (await res.json()) as { id: string };
      router.replace(`/${meeting.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Failed to create meeting."));
      setSubmitting(false);
    }
  };

  return (
    <form data-paper onSubmit={onSubmit} className="mx-auto max-w-2xl space-y-6 pt-2 lg:pt-6">
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-strong)]">{t("New meeting")}</h1>

      <div className={`${PROPS_GRID} !items-center`}>
        <Prop label={t("Title")} fill>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("Weekly research sync #2")}
            maxLength={200}
            autoFocus
            disabled={submitting}
            aria-label={t("Title")}
            className="input"
          />
        </Prop>

        {schedule ? (
          <Prop label={t("When")} fill>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <input
                id="scheduled"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                disabled={submitting}
                aria-label={t("When")}
                className="input !w-auto"
              />
              <span className="text-xs text-[var(--text-muted)]">
                {scheduledAt ? t("Goes under Upcoming") : t("Empty: record now")}
              </span>
            </div>
          </Prop>
        ) : null}

        {seriesOn ? (
          <Prop label={t("Series")} fill>
            <input
              id="series"
              type="text"
              list="series-options"
              value={series}
              onChange={(e) => setSeries(e.target.value)}
              placeholder={t("e.g. Weekly sync — links meetings so minutes carry context")}
              maxLength={60}
              disabled={submitting}
              aria-label={t("Series")}
              className="input"
            />
            <datalist id="series-options">
              {seriesOptions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Prop>
        ) : null}

        <div className="self-start pt-2 text-[var(--text-muted)]">{t("Purpose")}</div>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("Purpose, agenda, and background of the meeting. Improves minutes quality.")}
          rows={4}
          disabled={submitting}
          aria-label={t("Purpose")}
          className="input resize-y"
        />
      </div>

      {error ? <p className="text-sm text-[var(--error)]">{error}</p> : null}

      <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] pt-4">
        <Link href="/" className="btn-outline">
          {t("Cancel")}
        </Link>
        <button type="submit" disabled={submitting} className="btn-ink">
          {later ? <CalendarIcon /> : <MicIcon />}
          {submitting
            ? later
              ? t("Adding…")
              : t("Setting up…")
            : later
              ? t("Add to Upcoming")
              : t("Set up meeting")}
        </button>
      </div>
    </form>
  );
}
