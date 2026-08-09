"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { sttHttpBase } from "@/lib/stt/client";

// "Resume recording" for an ended meeting — shown only when the recording (WAV) is still kept.
// Resuming appends a new session to the existing recording (STT appends the WAV and offsets
// the new utterance times; new lines are added after the existing transcript). Without a kept
// recording there would be no audio to re-transcribe the whole meeting from, so we don't offer
// it (the recording auto-deletes after the retention period unless protected).
export function ResumeRecordingButton({ meetingId }: { meetingId: string }) {
  const [exists, setExists] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${sttHttpBase()}/recordings/${meetingId}`, { signal: AbortSignal.timeout(6000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { exists?: boolean } | null) => {
        if (!cancelled && d?.exists) setExists(true);
      })
      .catch(() => {
        // STT unreachable (e.g. external access) — just don't offer resume.
      });
    return () => {
      cancelled = true;
    };
  }, [meetingId]);

  if (!exists) return null;
  return (
    <Link
      href={`/${meetingId}/recording?autostart=1&resume=1`}
      className="btn-ink"
      title="Continue recording — appends to the existing recording and transcript"
    >
      Resume recording
    </Link>
  );
}
