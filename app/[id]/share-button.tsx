"use client";

import { useState } from "react";
import { DownloadIcon, ShareIcon } from "../icons";
import { useT } from "@/app/locale-provider";

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
  const t = useT();

  const share = async () => {
    setDone(null);
    const how = await shareText(text, title);
    if (how === "shared") return;
    setDone(how === "copied" ? t("Copied") : t("Copy failed"));
    if (how === "copied") setTimeout(() => setDone(null), 2500);
  };

  const download = () => downloadText(text, filename ?? "export.txt");

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
          title={t("Save to file")}
          aria-label={t("Save to file")}
        >
          <DownloadIcon />
        </button>
      ) : null}
      {done ? <span className="text-xs text-[var(--text-muted)]">{done}</span> : null}
    </span>
  );
}

/**
 * Hands the text to the device's share sheet where there is one, and otherwise — or when the
 * sheet is dismissed — copies it.
 */
export async function shareText(text: string, title?: string): Promise<"shared" | "copied" | "failed"> {
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
  if (nav.share) {
    try {
      await nav.share({ title, text });
      return "shared";
    } catch {
      // ignore cancel etc. and fall back to copy
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}

/** Saves the text as a file. */
export function downloadText(text: string, filename: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
