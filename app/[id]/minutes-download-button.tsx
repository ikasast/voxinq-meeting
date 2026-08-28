"use client";

import { useEffect, useRef, useState } from "react";
import { DownloadIcon } from "../icons";

// Downloading the minutes, in whichever format they have to arrive in.
//
// All three are the same document, so they belong on the same control. They used to be split:
// this button saved Markdown with no prompt, while Word and PDF sat in the meeting-level
// export menu next to the transcript and the recording — which made them look like parts of a
// bundle rather than the minutes in another format.
//
// Markdown is written from the text already on the page rather than fetched, so it works
// without a round trip and on a read-only share.
export function MinutesDownloadButton({
  meetingId,
  text,
  filename,
}: {
  meetingId: string;
  text: string;
  filename: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const saveMarkdown = () => {
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setOpen(false);
  };

  return (
    <span ref={box} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn-icon"
        title="Download minutes"
        aria-label="Download minutes"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <DownloadIcon />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={saveMarkdown}
            className="block w-full rounded px-2.5 py-1.5 text-left text-sm hover:bg-[var(--surface-hover)]"
          >
            Markdown (.md)
          </button>
          <a
            role="menuitem"
            href={`/api/meetings/${meetingId}/export?format=docx`}
            onClick={() => setOpen(false)}
            className="block w-full rounded px-2.5 py-1.5 text-left text-sm hover:bg-[var(--surface-hover)]"
          >
            Word (.docx)
          </a>
          <a
            role="menuitem"
            href={`/${meetingId}/print`}
            target="_blank"
            rel="noreferrer"
            onClick={() => setOpen(false)}
            title="Opens a print view — choose “Save as PDF” as the destination"
            className="block w-full rounded px-2.5 py-1.5 text-left text-sm hover:bg-[var(--surface-hover)]"
          >
            PDF (print)
          </a>
        </div>
      ) : null}
    </span>
  );
}
