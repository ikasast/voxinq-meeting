"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "../locale-provider";
import { useOpenSpeakers } from "./speaker-bus";
import { useShowLine } from "./line-bus";
import { PrepView, type PrepStart, usePrep } from "./prep-panel";

// A meeting's page in v4 (design B): the minutes are the document, and what was said sits in a
// panel at the right that opens and closes, remembered per device. On a phone the two are tabs.
//
// Before there are minutes, what was said is the document: it stays in the page's own column,
// below the minutes' empty state, with no panel and no tabs.
//
// The questions being prepared for after a talk are read while what was said runs on down the
// page, so with no minutes yet they get a column of their own that stays put. Once there are
// minutes the transcript has that place, and they are a tab beside the minutes.
//
// The transcript is rendered once and only moved by CSS: it is a live component — it follows a
// recording, holds edits — and two copies of it would be two of everything. That goes for
// switching the questions on in the middle of a recording too: only classes change.

const PANEL_KEY = "voxinq.transcriptPanel";
const WIDTH_KEY = "voxinq.transcriptWidth";
/** The panel's width before anyone drags it, and the limits a drag keeps to. */
const DEFAULT_WIDTH = "min(36rem,44vw)";
const MIN_WIDTH = 320;
const maxWidth = () => Math.min(960, window.innerWidth * 0.6);
const clamp = (w: number) => Math.round(Math.min(Math.max(w, MIN_WIDTH), maxWidth()));
type Tab = "minutes" | "transcript" | "review" | "prep";

function saveWidth(w: number | null) {
  try {
    if (w === null) localStorage.removeItem(WIDTH_KEY);
    else localStorage.setItem(WIDTH_KEY, String(w));
  } catch {}
}

export function MeetingBody({
  meetingId,
  header,
  document,
  transcript,
  lineCount,
  transcriptFirst,
  review,
  prep: prepStart,
}: {
  meetingId: string;
  /** The title, its actions and the meeting's details: the top of the document. */
  header: ReactNode;
  document: ReactNode;
  transcript: ReactNode;
  lineCount: number;
  /** No minutes yet: the transcript is the page. */
  transcriptFirst: boolean;
  /** Meeting feedback, when its extension is on: a tab beside the minutes. */
  review?: ReactNode;
  prep: PrepStart;
}) {
  const t = useT();
  const [panel, setPanel] = useState(true);
  const [tab, setTab] = useState<Tab>("minutes");
  const prep = usePrep(meetingId, prepStart);
  const questionsLabel = prep.openCount > 0 ? `${t("Questions")} · ${prep.openCount}` : t("Questions");
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

  // Dragged wider or narrower by its left edge, and remembered per device. Null is the default.
  const [width, setWidth] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; w: number; last: number } | null>(null);

  useEffect(() => {
    try {
      setPanel(localStorage.getItem(PANEL_KEY) !== "closed");
      const w = Number(localStorage.getItem(WIDTH_KEY));
      if (w > 0) setWidth(clamp(w));
    } catch {}
  }, []);
  const togglePanel = (open: boolean) => {
    setPanel(open);
    try {
      localStorage.setItem(PANEL_KEY, open ? "open" : "closed");
    } catch {}
  };

  // The speakers row in the details asks for the speaker tools: show the transcript they are in.
  const showTranscript = useCallback(() => {
    setPanel(true);
    setTab("transcript");
    try {
      localStorage.setItem(PANEL_KEY, "open");
    } catch {}
  }, []);
  useOpenSpeakers(meetingId, showTranscript);
  // A point of feedback asks for the line it rests on.
  useShowLine(meetingId, showTranscript);

  if (transcriptFirst) {
    // Past the end of the recording as well: the questions are asked right after it, while the
    // minutes are still being written.
    const side = prep.live || prep.has;
    // White like any meeting's page, with what was said in the grey it has in the panel — so a
    // meeting does not change colour the moment its minutes arrive.
    return (
      <div data-paper className={side ? "lg:flex lg:items-start lg:gap-6" : ""}>
        {/* On a phone neither wrapper makes a box, as below, for the sticky tabs. */}
        <div className={side ? "min-w-0 flex-1 max-lg:contents lg:pr-4" : ""}>
          <div className={`mx-auto w-full max-w-[50rem] space-y-6 ${side ? "max-lg:contents" : ""}`}>
            {header}
            {document}
            {side ? null : <PrepView model={prep} boxed />}
            {side ? (
              <PhoneTabs
                tabs={[
                  ["transcript", `${t("Transcript")} · ${lineCount}`],
                  ["prep", questionsLabel],
                ]}
                current={tab === "prep" ? "prep" : "transcript"}
                onChange={setTab}
              />
            ) : null}
            <div className={`rounded-xl bg-[var(--panel)] px-4 py-4 sm:px-5 ${side && tab === "prep" ? "max-lg:hidden" : ""}`}>
              {transcript}
            </div>
            {/* Room under the last line for the recording dock. Inside the column, not after it:
                the questions stay put only as far as the end of what holds them, and a recording
                keeps the page at the very bottom. */}
            {prepStart.ended ? null : <div aria-hidden className="h-28" />}
          </div>
        </div>
        {/* Reaches the window's right edge like the transcript's panel. Room at the foot for the
            button that floats there. */}
        {side ? (
          <aside
            aria-label={t("Questions")}
            className={`min-w-0 max-lg:mt-6 lg:sticky lg:top-0 lg:-mb-12 lg:-mr-8 lg:-mt-6 lg:h-dvh lg:w-[min(24rem,38vw)] lg:shrink-0 lg:overflow-y-auto lg:border-l lg:border-[var(--border)] lg:bg-[var(--panel)] lg:px-6 lg:pb-24 lg:pt-6 ${
              tab === "prep" ? "" : "max-lg:hidden"
            }`}
          >
            <PrepView model={prep} />
          </aside>
        ) : null}
      </div>
    );
  }

  const docTabs: [Tab, string][] = [
    ["minutes", t("Minutes")],
    ...(prep.offered ? ([["prep", questionsLabel]] as [Tab, string][]) : []),
    ...(review ? ([["review", t("Feedback")]] as [Tab, string][]) : []),
  ];
  const inDocument = tab === "review" || tab === "prep";

  return (
    // data-paper: the page behind a meeting is white (globals.css), with the sidebar and this
    // panel the grey around it.
    <div data-paper className={`lg:flex lg:items-start lg:gap-6 ${dragging ? "select-none" : ""}`}>
      {/* The document: a page at a readable width, centred in whatever room the panel leaves —
          so with the panel shut it sits in the middle rather than leaving the right side bare. */}
      {/* Room at the right for the panel's tab, which rides over the gap and would otherwise sit
          on the buttons at the end of the minutes' heading. */}
      {/* On a phone neither wrapper makes a box (`contents`), so the sticky tabs below are held
          by the whole page — the transcript included — rather than by this column, which ends
          right under them when the transcript is the tab showing. */}
      <div className="min-w-0 flex-1 max-lg:contents lg:pr-4">
        <div className="mx-auto w-full max-w-[50rem] space-y-6 max-lg:contents">
          {header}
          {/* A phone: the two as tabs. */}
          <PhoneTabs
            tabs={[docTabs[0], ["transcript", `${t("Transcript")} · ${lineCount}`], ...docTabs.slice(1)]}
            current={tab}
            onChange={setTab}
          />
          {/* A wide screen: what goes with the minutes, as tabs over the document. */}
          {docTabs.length > 1 ? (
            <div role="tablist" className="hidden gap-5 border-b border-[var(--border)] text-sm lg:flex">
              {docTabs.map(([k, label]) => {
                const on = k === "minutes" ? !inDocument : tab === k;
                return (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setTab(k)}
                    className={`-mb-px border-b-2 pb-2 ${
                      on ? "border-[var(--accent)] font-semibold text-[var(--text-strong)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ) : null}
          <div className={`space-y-6 ${tab === "transcript" ? "max-lg:hidden" : ""} ${inDocument ? "hidden" : ""}`}>{document}</div>
          {review && tab === "review" ? <div>{review}</div> : null}
          {tab === "prep" ? <PrepView model={prep} /> : null}
        </div>
      </div>

      {/* A wide screen: the panel at the right, sliding open and shut. Its width is what moves —
          the contents keep theirs, so nothing re-wraps on the way — and the one tab that opens
          and closes it rides on its edge. */}
      {/* It reaches the right edge of the window, past the page's own padding, so shut it is the
          tab alone on that edge rather than a tab hanging in the air. */}
      <aside
        ref={aside}
        aria-label={t("Transcript")}
        style={{ "--tw": width ? `${width}px` : DEFAULT_WIDTH } as React.CSSProperties}
        className={`relative min-w-0 max-lg:mt-6 lg:sticky lg:top-0 lg:-my-6 lg:-mr-8 lg:h-dvh lg:shrink-0 lg:bg-[var(--panel)] ${
          dragging ? "" : "lg:transition-[width] lg:duration-300 lg:ease-out motion-reduce:lg:transition-none"
        } ${tab !== "transcript" ? "max-lg:hidden" : ""} ${panel ? "lg:w-[var(--tw)]" : "lg:w-0"}`}
      >
        {tabTop !== null ? (
          <PanelTab open={panel} onClick={() => togglePanel(!panel)} count={lineCount} top={tabTop} />
        ) : null}
        {/* The left edge, to drag. Double-click puts the width back. */}
        {panel ? (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={t("Resize the transcript")}
            title={t("Drag to change the width; double-click to reset it")}
            tabIndex={0}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              const w = aside.current?.getBoundingClientRect().width ?? MIN_WIDTH;
              drag.current = { x: e.clientX, w, last: w };
              setDragging(true);
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d) return;
              d.last = clamp(d.w + d.x - e.clientX);
              setWidth(d.last);
            }}
            onPointerUp={() => {
              const d = drag.current;
              drag.current = null;
              setDragging(false);
              if (d) saveWidth(d.last);
            }}
            onDoubleClick={() => {
              setWidth(null);
              saveWidth(null);
            }}
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              e.preventDefault();
              const now = aside.current?.getBoundingClientRect().width ?? MIN_WIDTH;
              const next = clamp(now + (e.key === "ArrowLeft" ? 32 : -32));
              setWidth(next);
              saveWidth(next);
            }}
            className={`absolute inset-y-0 left-0 z-10 hidden w-2 -translate-x-1/2 cursor-col-resize outline-none hover:bg-[color-mix(in_srgb,var(--accent)_45%,transparent)] focus-visible:bg-[color-mix(in_srgb,var(--accent)_45%,transparent)] lg:block ${
              dragging ? "bg-[color-mix(in_srgb,var(--accent)_45%,transparent)]" : ""
            }`}
          />
        ) : null}
        <div className="lg:h-full lg:overflow-hidden">
          <div
            inert={!panel}
            className="lg:h-full lg:w-[var(--tw)] lg:overflow-y-auto lg:border-l lg:border-[var(--border)] lg:py-6 lg:pl-6 lg:pr-8"
          >
            {transcript}
          </div>
        </div>
      </aside>
    </div>
  );
}

/** Kept in sight under the phone's bar (h-14 in sidebar.tsx) while any of them is scrolled:
 *  switching is what you want after reading down a long transcript. */
function PhoneTabs({
  tabs,
  current,
  onChange,
}: {
  tabs: [Tab, string][];
  current: Tab;
  onChange: (tab: Tab) => void;
}) {
  return (
    <div className="sticky top-14 z-20 -mx-4 bg-[var(--paper)] px-4 py-2 lg:hidden">
      <div role="tablist" className="flex rounded-lg border border-[var(--border)] bg-[var(--panel)] p-1">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={current === k}
            onClick={() => onChange(k)}
            className={`min-w-0 flex-1 rounded-md py-1.5 text-sm font-medium ${tabs.length > 3 ? "px-1" : "px-3"} ${
              current === k
                ? "bg-[var(--surface)] text-[var(--text-strong)] shadow-sm"
                : "text-[var(--text-secondary)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
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
      className={`absolute right-full z-20 hidden flex-col items-center gap-1 rounded-l-xl border border-r-0 border-[var(--border)] bg-[var(--panel)] px-2 py-3 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--foreground)] lg:flex`}
    >
      <span aria-hidden className="text-sm leading-none">
        {open ? "›" : "‹"}
      </span>
      <span className="[writing-mode:vertical-rl]">{t("Transcript")}</span>
      <span className="text-[10px] text-[var(--text-muted)]">{count}</span>
    </button>
  );
}
