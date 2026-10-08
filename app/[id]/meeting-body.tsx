"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CloseIcon } from "../icons";
import { useT } from "../locale-provider";

// A meeting's page in v4 (design B): the minutes are the document, and what was said sits in a
// panel at the right that opens and closes, remembered per device. On a phone the two are tabs.
//
// Before there are minutes, what was said is the document: it stays in the page's own column,
// below the minutes' empty state, with no panel and no tabs.
//
// The transcript is rendered once and only moved by CSS: it is a live component — it follows a
// recording, holds edits — and two copies of it would be two of everything.

const PANEL_KEY = "voxinq.transcriptPanel";

export function MeetingBody({
  document,
  transcript,
  lineCount,
  transcriptFirst,
}: {
  document: ReactNode;
  transcript: ReactNode;
  lineCount: number;
  /** No minutes yet: the transcript is the page. */
  transcriptFirst: boolean;
}) {
  const t = useT();
  const [panel, setPanel] = useState(true);
  const [tab, setTab] = useState<"minutes" | "transcript">("minutes");

  useEffect(() => {
    try {
      setPanel(localStorage.getItem(PANEL_KEY) !== "closed");
    } catch {}
  }, []);
  const togglePanel = (open: boolean) => {
    setPanel(open);
    try {
      localStorage.setItem(PANEL_KEY, open ? "open" : "closed");
    } catch {}
  };

  if (transcriptFirst) {
    return (
      <div className="space-y-6">
        {document}
        {transcript}
      </div>
    );
  }

  return (
    <div className="lg:flex lg:items-start lg:gap-6">
      {/* A phone: the two as tabs. */}
      <div role="tablist" className="mb-4 flex rounded-full border border-[var(--border)] bg-[var(--surface)] p-1 lg:hidden">
        {(["minutes", "transcript"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`flex-1 rounded-full px-3 py-1.5 text-sm font-medium ${
              tab === k
                ? "bg-[var(--accent-solid)] text-[var(--accent-contrast)]"
                : "text-[var(--text-secondary)]"
            }`}
          >
            {k === "minutes" ? t("Minutes") : `${t("Transcript")} · ${lineCount}`}
          </button>
        ))}
      </div>

      <div className={`min-w-0 flex-1 space-y-6 ${tab === "transcript" ? "max-lg:hidden" : ""}`}>{document}</div>

      {/* A wide screen: the panel at the right, or the tab that opens it. */}
      <aside
        aria-label={t("Transcript")}
        className={`relative min-w-0 ${tab === "minutes" ? "max-lg:hidden" : ""} ${
          panel
            ? "lg:sticky lg:top-0 lg:-my-6 lg:h-dvh lg:w-[min(36rem,44vw)] lg:shrink-0 lg:overflow-y-auto lg:border-l lg:border-[var(--border)] lg:py-6 lg:pl-6 lg:[&>section.card]:border-0 lg:[&>section.card]:bg-transparent lg:[&>section.card]:p-0 lg:[&>section.card]:shadow-none"
            : "lg:hidden"
        }`}
      >
        {/* The transcript names itself; the panel only adds the way to close it. */}
        <button
          type="button"
          onClick={() => togglePanel(false)}
          title={t("Close the transcript")}
          aria-label={t("Close the transcript")}
          className="absolute right-0 top-6 z-10 hidden h-8 w-8 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] lg:flex"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
        {transcript}
      </aside>
      {!panel ? (
        <button
          type="button"
          onClick={() => togglePanel(true)}
          className="fixed right-0 top-1/3 z-20 hidden flex-col items-center gap-1 rounded-l-xl border border-r-0 border-[var(--border)] bg-[var(--surface)] px-2 py-3 text-xs font-medium text-[var(--text-secondary)] shadow-md hover:text-[var(--foreground)] lg:flex"
          title={t("Open the transcript")}
          aria-label={t("Open the transcript")}
        >
          <span className="[writing-mode:vertical-rl]">{t("Transcript")}</span>
          <span className="text-[10px] text-[var(--text-muted)]">{lineCount}</span>
        </button>
      ) : null}
    </div>
  );
}
