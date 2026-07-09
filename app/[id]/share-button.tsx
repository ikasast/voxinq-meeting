"use client";

import { useState } from "react";
import { DownloadIcon, ShareIcon } from "../icons";

// Share button: Web Share on mobile, clipboard copy where unsupported.
// If filename is passed, also shows a button to save as a text file.
export function ShareButton({
  text,
  title,
  label = "Share",
  filename,
}: {
  text: string;
  title?: string;
  label?: string;
  filename?: string;
}) {
  const [done, setDone] = useState<string | null>(null);

  const share = async () => {
    setDone(null);
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title, text });
        return;
      } catch {
        // ignore cancel etc. and fall back to copy
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setDone("Copied");
      setTimeout(() => setDone(null), 2500);
    } catch {
      setDone("Copy failed");
    }
  };

  const download = () => {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename ?? "export.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={share} className="btn-icon" title={label} aria-label={label}>
        <ShareIcon />
      </button>
      {filename ? (
        <button
          type="button"
          onClick={download}
          className="btn-icon"
          title="Save to file"
          aria-label="Save to file"
        >
          <DownloadIcon />
        </button>
      ) : null}
      {done ? <span className="text-xs text-[var(--text-muted)]">{done}</span> : null}
    </span>
  );
}
