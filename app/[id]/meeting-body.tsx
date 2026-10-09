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
  // Where the open panel's left edge is, from the right of the screen: the tab that closes it sits
  // there, at the same height as the one that opened it.
  const aside = useRef<HTMLElement>(null);
  const [edge, setEdge] = useState<number | null>(null);
  useEffect(() => {
    const el = aside.current;
    if (!panel || !el) return;
    const place = () => setEdge(window.innerWidth - el.getBoundingClientRect().left);
    place();
    const watch = new ResizeObserver(place);
    watch.observe(el);
    watch.observe(window.document.body);
    window.addEventListener("resize", place);
    return () => {
      watch.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [panel, transcriptFirst]);

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

      {/* A wide screen: the panel at the right, or the tab that opens it. One tab does both, at
          the same height: on the screen's edge while the panel is shut, on the panel's own edge
          while it is open — so what opened it is where you look to put it back. */}
      <aside
        ref={aside}
        aria-label={t("Transcript")}
        className={`relative min-w-0 ${tab === "minutes" ? "max-lg:hidden" : ""} ${
          panel ? "lg:sticky lg:top-0 lg:-my-6 lg:h-dvh lg:w-[min(36rem,44vw)] lg:shrink-0" : "lg:hidden"
        }`}
      >
        <div
          className={
            panel
              ? "lg:h-full lg:overflow-y-auto lg:border-l lg:border-[var(--border)] lg:py-6 lg:pl-6 lg:[&>section.card]:border-0 lg:[&>section.card]:bg-transparent lg:[&>section.card]:p-0 lg:[&>section.card]:shadow-none"
              : ""
          }
        >
          {transcript}
        </div>
      </aside>
      {panel ? (
        edge !== null ? (
          <PanelTab open onClick={() => togglePanel(false)} count={lineCount} right={edge} />
        ) : null
      ) : (
        <PanelTab open={false} onClick={() => togglePanel(true)} count={lineCount} right={0} />
      )}
    </div>
  );
}

function PanelTab({
  open,
  onClick,
  count,
  right,
}: {
  open: boolean;
  onClick: () => void;
  count: number;
  /** Distance from the screen's right edge: 0 when shut, the panel's edge when open. */
  right: number;
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
      style={{ right }}
      className={`fixed top-1/3 z-20 hidden flex-col items-center gap-1 rounded-l-xl border border-r-0 border-[var(--border)] bg-[var(--surface)] px-2 py-3 text-xs font-medium text-[var(--text-secondary)] shadow-md hover:text-[var(--foreground)] lg:flex`}
    >
      <span aria-hidden className="text-sm leading-none">
        {open ? "›" : "‹"}
      </span>
      <span className="[writing-mode:vertical-rl]">{t("Transcript")}</span>
      <span className="text-[10px] text-[var(--text-muted)]">{count}</span>
    </button>
  );
}
