"use client";

import { useEffect, useState } from "react";

// Speaker separation is done in the transcript's panel, and its state is shown in the meeting's
// details at the top of the page (v4). The two are far apart in the tree — one in the document,
// one in a panel that may be shut — so they talk through the window: the panel says what it
// knows, and the row asks the panel to open.
//
// The last word for each meeting is kept here, so a row drawn after the panel spoke still has it.

export type SpeakerSummary = {
  /** Lines have been told apart into voices. */
  separated: boolean;
  /** Separation is queued or running: what it is doing, in words. */
  running: string | null;
  /** Something to separate: lines, and a recording to read. */
  possible: boolean;
  /** The voices, in order, with what they are called and whether anybody named them. */
  speakers: { key: string; name: string; named: boolean }[];
};

const SAID = "voxinq:speakers";
const OPEN = "voxinq:open-speakers";
const last = new Map<string, SpeakerSummary>();

/** The panel says where speaker separation stands. */
export function tellSpeakers(meetingId: string, summary: SpeakerSummary) {
  last.set(meetingId, summary);
  window.dispatchEvent(new CustomEvent(SAID, { detail: { meetingId, summary } }));
}

/** Where speaker separation stands, from the panel once it has said; until then, `initial`. */
export function useSpeakerSummary(meetingId: string, initial: SpeakerSummary): SpeakerSummary {
  const [summary, setSummary] = useState<SpeakerSummary>(() => last.get(meetingId) ?? initial);
  useEffect(() => {
    const known = last.get(meetingId);
    if (known) setSummary(known);
    const heard = (e: Event) => {
      const d = (e as CustomEvent<{ meetingId: string; summary: SpeakerSummary }>).detail;
      if (d.meetingId === meetingId) setSummary(d.summary);
    };
    window.addEventListener(SAID, heard);
    return () => window.removeEventListener(SAID, heard);
  }, [meetingId]);
  return summary;
}

/** Ask for the speaker tools: the panel opens, and its speaker separation with it. */
export function openSpeakers(meetingId: string) {
  window.dispatchEvent(new CustomEvent(OPEN, { detail: { meetingId } }));
}

/** Do something when the speaker tools are asked for. */
export function useOpenSpeakers(meetingId: string, then: () => void) {
  useEffect(() => {
    const asked = (e: Event) => {
      if ((e as CustomEvent<{ meetingId: string }>).detail.meetingId === meetingId) then();
    };
    window.addEventListener(OPEN, asked);
    return () => window.removeEventListener(OPEN, asked);
  }, [meetingId, then]);
}
