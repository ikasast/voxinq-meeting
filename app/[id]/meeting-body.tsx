"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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
  // The tab rides on the panel's edge, at a third of the way down the screen whether or not the
  // page has scrolled: the panel is sticky, so its own top moves until it sticks.
  const aside = useRef<HTMLElement>(null);
  const [tabTop, setTabTop] = useState<number | null>(null);
  useEffect(() => {
    const el = aside.current;
    if (!el || transcriptFirst) return;
    const place = () => setTabTop(Math.max(0, window.innerHeight / 3 - el.getBoundingClientRect().top));
    place();
    window.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
    };
  }, [transcriptFirst]);

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

      {/* A wide screen: the panel at the right, sliding open and shut. Its width is what moves —
          the contents keep theirs, so nothing re-wraps on the way — and the one tab that opens
          and closes it rides on its edge. */}
      <aside
        ref={aside}
        aria-label={t("Transcript")}
        className={`relative min-w-0 lg:sticky lg:top-0 lg:-my-6 lg:h-dvh lg:shrink-0 lg:transition-[width] lg:duration-300 lg:ease-out motion-reduce:lg:transition-none ${
          tab === "minutes" ? "max-lg:hidden" : ""
        } ${panel ? "lg:w-[min(36rem,44vw)]" : "lg:w-0"}`}
      >
        {tabTop !== null ? (
          <PanelTab open={panel} onClick={() => togglePanel(!panel)} count={lineCount} top={tabTop} />
        ) : null}
        <div className="lg:h-full lg:overflow-hidden">
          <div
            inert={!panel}
            className="lg:h-full lg:w-[min(36rem,44vw)] lg:overflow-y-auto lg:border-l lg:border-[var(--border)] lg:py-6 lg:pl-6 lg:[&>section.card]:border-0 lg:[&>section.card]:bg-transparent lg:[&>section.card]:p-0 lg:[&>section.card]:shadow-none"
          >
            {transcript}
          </div>
        </div>
      </aside>
    </div>
  );
}

function PanelTab({
  open,
  onClick,
  count,
  top,
}: {
  open: boolean;
  onClick: () => void;
  count: number;
  /** From the panel's top: a third of the way down the screen. */
  top: number;
}) {
  const t = useT();
  const label = open ? t("Close the transcript") : t("Open the transcript");
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-expanded={open}
      style={{ top }}
      className={`absolute right-full z-20 hidden flex-col items-center gap-1 rounded-l-xl border border-r-0 border-[var(--border)] bg-[var(--surface)] px-2 py-3 text-xs font-medium text-[var(--text-secondary)] shadow-md hover:text-[var(--foreground)] lg:flex`}
    >
      <span aria-hidden className="text-sm leading-none">
        {open ? "›" : "‹"}
      </span>
      <span className="[writing-mode:vertical-rl]">{t("Transcript")}</span>
      <span className="text-[10px] text-[var(--text-muted)]">{count}</span>
    </button>
  );
}
