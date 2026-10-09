"use client";

import { useRef, useState } from "react";
import { CheckIcon, CopyIcon } from "../icons";
import { ICON_BUTTON } from "../drop-menu";
import { useT } from "@/app/locale-provider";

// Copies the minutes or the transcript to the clipboard in one press — always in sight beside
// them, never behind a menu, because it is what is done with them most. A tick stands in for the
// icon for a moment once it has worked.
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  const t = useT();
  const timer = useRef<number | undefined>(undefined);

  const copy = () => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setDone(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setDone(false), 1500);
      })
      .catch(() => {});
  };

  return (
    <button
      type="button"
      onClick={copy}
      className={`${ICON_BUTTON} ${done ? "!text-[var(--accent)]" : ""}`}
      title={done ? t("Copied") : label}
      aria-label={label}
    >
      {done ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
    </button>
  );
}
