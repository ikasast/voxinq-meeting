"use client";

import { useRef, useState } from "react";
import { CheckIcon, CopyIcon } from "../icons";

// Button to copy the minutes text to the clipboard. Briefly changes its display on success.
export function CopySummaryButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
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
      className="btn-icon"
      title={done ? "Copied" : "Copy minutes"}
      aria-label="Copy minutes"
    >
      {done ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}
