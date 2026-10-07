"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { EXTENSIONS, type ExtensionId } from "@/lib/extensions";
import { useLocale, useT } from "@/app/locale-provider";
import { useBackGuard } from "@/app/use-back-guard";
import { useExtensions } from "../extensions-provider";

// Settings → Extensions: what is added on top of recording, transcription and minutes
// (lib/extensions.ts). Switched for the whole instance, by an administrator; everybody else sees
// what is on. Switching one off hides it and keeps its data.
//
// The list is one line each, to be scanned; a row opens the details — when it is worth having,
// where it shows up, and a picture of it — which is what decides whether to switch it on.

type Words = {
  name: string;
  summary: string;
  /** When it is worth having, in the reader's own situations rather than the feature's terms. */
  scenes: string[];
  /** Where it shows up once it is on. */
  where: string;
  needs: string | null;
};

/** The words for each extension, spelled out so the translation table's test can find them. */
function texts(t: (k: string) => string): Record<ExtensionId, Words> {
  return {
    ask: {
      name: t("Ask about meetings"),
      summary: t("Ask a question of a meeting's minutes or transcript, or of a whole series."),
      scenes: [
        t("Before the next meeting, check what was left undecided last time."),
        t("Find who took on what, without reading the transcript again."),
        t("Ask a series what has been decided over several meetings."),
      ],
      where: t(
        "A question box on each meeting's page and each series page. Answers come only from that meeting or series, and are not saved.",
      ),
      needs: t("The minutes model (LLM)"),
    },
    bulkMinutes: {
      name: t("Write minutes in bulk"),
      summary: t("Queue minutes for every listed meeting that has none, in one go."),
      scenes: [
        t("A day of back-to-back sessions, such as a conference: record each one, and write all the minutes in the evening."),
        t("Meetings ended without minutes have piled up, and you want them all done at once."),
      ],
      where: t(
        "A bar above the meeting list whenever a listed meeting has no minutes. They are written one after another; the queue shows how far it has got.",
      ),
      needs: null,
    },
    series: {
      name: t("Series"),
      summary: t(
        "Group recurring meetings: shared background, regular members, and last time's minutes carried into the next.",
      ),
      scenes: [
        t("A weekly meeting whose minutes should pick up from last week's."),
        t("The same people every time, so speaker separation knows how many voices to expect."),
        t("Terms that belong to one project, kept on its series rather than in everyone's glossary."),
      ],
      where: t(
        "Series in the navigation, a Series field on each meeting, and the list folding a series into one row. Each series has a page with its timeline, background, members and glossary.",
      ),
      needs: null,
    },
    schedule: {
      name: t("Schedule and reminders"),
      summary: t("Book meetings ahead on a calendar, and be told when one is due to start."),
      scenes: [
        t("Next week's meetings set up ahead of time: the title, the agenda and who is coming."),
        t("A notice on your phone or watch when a meeting is due, and recording started from it."),
        t("A month of meetings looked back over on a calendar."),
      ],
      where: t(
        "A calendar above the meeting list, a When field on New meeting, and Upcoming in the list. Reminders come to the browser (allowed under Settings, Appearance) and to the Android app.",
      ),
      needs: null,
    },
    minutesFormats: {
      name: t("Minutes formats"),
      summary: t("Formats and writing instructions of your own, and choosing what the model is given."),
      scenes: [
        t("Regular meetings whose minutes should always have the same headings."),
        t("A client meeting and an internal one, each wanting its minutes written differently."),
        t("Leaving the previous minutes or the glossary out of what the model reads, for one run."),
      ],
      where: t(
        "Settings, Minutes, to make formats; and, whenever minutes are written, a choice of format and of what the model is given. Off, minutes are written in the built-in format.",
      ),
      needs: null,
    },
    corrections: {
      name: t("Suggest corrections"),
      summary: t(
        "Check the transcript against the glossary, the series name and the participants, and suggest fixes.",
      ),
      scenes: [
        t("Product names or in-house terms come out wrong in the same way every time."),
        t("A participant's name is written with the wrong characters."),
        t("Before sharing a transcript, check it against the glossary in one pass."),
      ],
      where: t(
        "A Suggest fixes button above the transcript. Each suggestion appears on its own line, and nothing changes until you apply it.",
      ),
      needs: t("The minutes model (LLM)"),
    },
    translation: {
      name: t("Translation"),
      summary: t("A Japanese translation under each line spoken in another language."),
      scenes: [
        t("Meetings with members or partners abroad who speak English."),
        t("Checking a line you did not quite catch, in Japanese, while the meeting goes on."),
        t("Reading a meeting back in Japanese later, with the original kept above each line."),
      ],
      where: t(
        "Under each line of the transcript. Switch it on under Settings, Transcription; it applies to what is transcribed from then on.",
      ),
      needs: t("A translation model (about 1.2 GB), downloaded on first use"),
    },
    externalShare: {
      name: t("Read-only sharing"),
      summary: t("Publish a password-protected, read-only link outside the tailnet."),
      scenes: [
        t("Let someone without Tailscale read the minutes, such as a client or a colleague."),
        t("Read your minutes from a machine where you cannot install anything."),
      ],
      where: t(
        "Settings, Remote access. Visitors from outside sign in with the password and can only read and download; recording and editing stay on the tailnet.",
      ),
      // A product name, the same in every language.
      needs: "Tailscale Funnel",
    },
    externalAi: {
      name: t("External AI"),
      summary: t(
        "Write minutes with Anthropic or an OpenAI-compatible service, and transcribe with a service of your choosing.",
      ),
      scenes: [
        t("There is no GPU for a local model, and meetings may be sent to a cloud service."),
        t("A model larger than this machine can run, for long or difficult meetings."),
        t("A server of your own: LM Studio or vLLM for minutes, a Whisper server on another machine for transcription."),
      ],
      where: t(
        "Settings, LLM and Transcription: where minutes are written and where speech is recognised. Off, everything is done by Ollama and the built-in transcription.",
      ),
      needs: t("An API key, and agreeing to send meetings outside this machine"),
    },
  };
}

export function ExtensionsSettings({ isAdmin }: { isAdmin: boolean }) {
  const t = useT();
  const router = useRouter();
  const state = useExtensions();
  const [busy, setBusy] = useState<ExtensionId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<ExtensionId | null>(null);
  const words = texts(t);

  const toggle = async (id: ExtensionId, on: boolean) => {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch("/api/extensions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [id]: on }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(d?.error ?? `HTTP ${res.status}`);
      }
      // The layout reads the state; refreshing hands every screen the new one.
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const toggleFor = (id: ExtensionId) => (
    <OnOff
      label={words[id].name}
      on={state[id]}
      disabled={!isAdmin || busy !== null}
      onChange={(on) => void toggle(id, on)}
    />
  );

  return (
    <section className="card space-y-4 p-6">
      <h2 className="section-title text-sm font-semibold text-[var(--text-strong)]">{t("Extensions")}</h2>
      <p className="text-xs text-[var(--text-muted)]">
        {t(
          "Recording, transcription and minutes are always there. These are added on top, for everybody on this machine. Switching one off hides it and keeps its data; switching it back on brings everything back.",
        )}
      </p>
      {!isAdmin ? (
        <p className="text-xs text-[var(--text-secondary)]">{t("Only an administrator switches extensions on or off.")}</p>
      ) : null}
      <ul className="divide-y divide-[var(--border)]">
        {EXTENSIONS.map(({ id }) => (
          <li key={id} className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setOpen(id)}
              className="group flex min-w-0 flex-1 items-center gap-3 rounded-md py-3 text-left hover:bg-[var(--hover-surface)] focus-visible:bg-[var(--hover-surface)]"
              aria-haspopup="dialog"
            >
              <span className="min-w-0 flex-1 pl-1">
                <span className="block text-sm font-medium text-[var(--text-strong)]">{words[id].name}</span>
                <span className="mt-0.5 block text-xs text-[var(--text-secondary)]">{words[id].summary}</span>
              </span>
              <span className="shrink-0 text-xs text-[var(--accent-sub)] group-hover:underline">
                {t("Details")}
              </span>
              <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]">
                <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {toggleFor(id)}
          </li>
        ))}
      </ul>
      {error ? <p className="text-xs text-[var(--error)]">{error}</p> : null}
      {open ? (
        <ExtensionDetails id={open} words={words[open]} onClose={() => setOpen(null)}>
          {toggleFor(open)}
        </ExtensionDetails>
      ) : null}
    </section>
  );
}

function OnOff({
  label,
  on,
  disabled,
  onChange,
}: {
  label: string;
  on: boolean;
  disabled: boolean;
  onChange: (on: boolean) => void;
}) {
  const t = useT();
  return (
    <label className="flex shrink-0 items-center gap-2 text-xs text-[var(--text-secondary)]">
      <input
        type="checkbox"
        role="switch"
        checked={on}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-[var(--accent)]"
        aria-label={label}
      />
      {on ? t("On") : t("Off")}
    </label>
  );
}

function ExtensionDetails({
  id,
  words,
  onClose,
  children,
}: {
  id: ExtensionId;
  words: Words;
  onClose: () => void;
  /** The switch, so it can be turned on from here once the picture has made the case. */
  children: React.ReactNode;
}) {
  const t = useT();
  const locale = useLocale();
  const [pictured, setPictured] = useState(true);
  const dialog = useRef<HTMLDivElement>(null);

  // Back closes it, like Escape — otherwise Back leaves Settings with the dialog still open.
  useBackGuard(true, onClose);

  useEffect(() => {
    dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="extension-details-title"
        tabIndex={-1}
        className="card max-h-[90vh] w-full max-w-2xl overflow-y-auto p-5 outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <h2
            id="extension-details-title"
            className="section-title min-w-0 flex-1 text-base font-semibold text-[var(--text-strong)]"
          >
            {words.name}
          </h2>
          {children}
        </div>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">{words.summary}</p>

        {/* Photographed from the demo meetings by scripts/shoot-extension-shots.mjs. One that
            is missing — a new extension not photographed yet — leaves no broken image. */}
        {pictured ? (
          // eslint-disable-next-line @next/next/no-img-element -- a static file, shown as is
          <img
            src={`/extension-shots/${locale}/${id}.webp`}
            alt={t("{name}, as it appears on screen", { name: words.name })}
            onError={() => setPictured(false)}
            className="mx-auto mt-4 block h-auto max-h-[55vh] w-auto max-w-full rounded-lg border border-[var(--border)] bg-[var(--elevated)]"
          />
        ) : null}

        <h3 className="mt-5 text-xs font-semibold text-[var(--text-strong)]">{t("When it helps")}</h3>
        <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-[var(--text-secondary)]">
          {words.scenes.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>

        <h3 className="mt-4 text-xs font-semibold text-[var(--text-strong)]">{t("Where it shows up")}</h3>
        <p className="mt-1.5 text-sm text-[var(--text-secondary)]">{words.where}</p>

        {words.needs ? (
          <>
            <h3 className="mt-4 text-xs font-semibold text-[var(--text-strong)]">{t("What it needs")}</h3>
            <p className="mt-1.5 text-sm text-[var(--text-secondary)]">{words.needs}</p>
          </>
        ) : null}

        <div className="mt-5 flex justify-end">
          <button type="button" onClick={onClose} className="btn-outline">
            {t("Close")}
          </button>
        </div>
      </div>
    </div>
  );
}
