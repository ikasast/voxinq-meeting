"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { UploadIcon } from "./icons";
import { useT } from "./locale-provider";
import { isAuthPath } from "./auth-paths";
import { isRecordingFile, transcribeFile } from "./transcribe-file";

// Drop a recording anywhere and it becomes a meeting, transcribed and then written up (v4,
// design B). The page dims and says so while a file is held over it.
//
// A drop that something on the page already handled — the New meeting form has its own box — is
// left to it.

export function DropToTranscribe() {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const [over, setOver] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const depth = useRef(0);
  const off = isAuthPath(pathname);

  useEffect(() => {
    if (off) return;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current += 1;
      setOver(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setOver(false);
    };
    const overFn = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault(); // without this, the browser opens the file instead
    };
    const drop = (e: DragEvent) => {
      depth.current = 0;
      setOver(false);
      if (e.defaultPrevented || !hasFiles(e)) return;
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      if (!isRecordingFile(file)) {
        setError(t("Please drop an audio file (wav, mp3, m4a, ...)."));
        return;
      }
      setError(null);
      void transcribeFile(file, (p) =>
        setPhase(p === "uploading" ? t("Uploading the recording…") : t("Setting up the meeting…")),
      )
        .then((id) => router.push(`/${id}`))
        .catch((err: Error) => setError(err.message))
        .finally(() => setPhase(null));
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", overFn);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", overFn);
      window.removeEventListener("drop", drop);
    };
  }, [off, router, t]);

  if (off) return null;
  return (
    <>
      {over ? (
        <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-6">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-[var(--accent)] bg-[var(--surface)] px-10 py-8 text-center">
            <UploadIcon className="h-10 w-10 text-[var(--accent)]" />
            <p className="text-base font-semibold text-[var(--text-strong)]">{t("Drop to transcribe")}</p>
            <p className="text-xs text-[var(--text-muted)]">{t("It becomes a new meeting, and its minutes follow.")}</p>
          </div>
        </div>
      ) : null}
      {phase || error ? (
        <div className="fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm shadow-lg">
          {phase ? (
            <span className="text-[var(--text-secondary)]">{phase}</span>
          ) : (
            <span className="flex items-center gap-3 text-[var(--error)]">
              {error}
              <button type="button" onClick={() => setError(null)} className="text-xs text-[var(--text-muted)] underline">
                {t("Close")}
              </button>
            </span>
          )}
        </div>
      ) : null}
    </>
  );
}
