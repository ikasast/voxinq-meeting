"use client";

import { useState } from "react";
import { sttHttpBase } from "@/lib/stt/client";
import { DownloadIcon } from "../icons";
import { useT } from "@/app/locale-provider";
import { DropMenu, ICON_BUTTON, MENU_ITEM, MenuRule } from "../drop-menu";

// Everything a meeting can be taken away as, in one menu beside its title (v4).
//
// It was in three places: this button opened a panel of checkboxes for a zip, the minutes' "…"
// had Markdown, Word and PDF, and the transcript's "…" had "Save to file". Each was the meeting
// in some file, and which menu held which file was something to remember. Now the minutes in
// each format, the transcript, the meeting's details, the recording and all of them in one zip
// are the rows of one menu. Sharing stays beside what it shares.
//
// The files come from the export route, which names them; the recording comes from the speech
// service — another origin, where a link's `download` is ignored and the browser would play it
// instead — so that one is fetched and saved.
export function DownloadMeetingButton({
  meetingId,
  title,
  hasMinutes,
  hasTranscript,
}: {
  meetingId: string;
  title: string;
  hasMinutes: boolean;
  hasTranscript: boolean;
}) {
  const t = useT();
  // Asked of the speech service when the menu opens: the recording may have expired.
  const [hasRecording, setHasRecording] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const askRecording = () => {
    setError(null);
    fetch(`${sttHttpBase()}/recordings/${meetingId}`, { signal: AbortSignal.timeout(5000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { exists?: boolean } | null) => setHasRecording(Boolean(d?.exists)))
      .catch(() => setHasRecording(false));
  };

  const saveRecording = async () => {
    setSaving(true);
    try {
      // Not from the cache: the page's own player has usually loaded this file already, as a
      // media request without CORS, and a fetch that reuses that copy is refused by the browser.
      const res = await fetch(`${sttHttpBase()}/recordings/${meetingId}/audio`, { cache: "no-store" });
      if (!res.ok) throw new Error(t("Recording download failed (HTTP {status})", { status: res.status }));
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title}.wav`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Download failed"));
    } finally {
      setSaving(false);
    }
  };

  const file = (parts: string) => `/api/meetings/${meetingId}/export?parts=${parts}`;
  const all = ["minutes", "transcript", "meta"].filter(
    (p) => (p !== "minutes" || hasMinutes) && (p !== "transcript" || hasTranscript),
  );
  const row = (
    kind: FileKind,
    href: string,
    label: string,
    enabled = true,
    extra?: { target?: string; title?: string },
  ) =>
    enabled ? (
      <a role="menuitem" href={href} className={MENU_ITEM} {...extra}>
        <FileBadge kind={kind} />
        {label}
      </a>
    ) : (
      <span role="menuitem" aria-disabled className={`${MENU_ITEM} opacity-50`}>
        <FileBadge kind={kind} />
        {label}
      </span>
    );

  return (
    <span className="relative inline-flex items-center">
      <DropMenu
        label={t("Download meeting")}
        trigger={saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--accent)]" /> : <DownloadIcon className="h-4 w-4" />}
        className={ICON_BUTTON}
        width={248}
        onOpen={askRecording}
      >
        {(close) => (
          <div onClick={() => void close()}>
            <p className="px-3 pb-1 pt-1.5 text-[11px] font-medium text-[var(--text-muted)]">{t("Minutes")}</p>
            {row("md", file("minutes"), "Markdown", hasMinutes)}
            {row("docx", `/api/meetings/${meetingId}/export?format=docx`, "Word", hasMinutes)}
            {row("pdf", `/${meetingId}/print`, t("Print and save"), hasMinutes, {
              target: "_blank",
              title: t("Opens a print view — choose “Save as PDF” as the destination"),
            })}
            <MenuRule />
            {row("txt", file("transcript"), t("Transcript"), hasTranscript)}
            {row("md", file("meta"), t("Meeting info"))}
            {hasRecording ? (
              <button type="button" role="menuitem" onClick={() => void saveRecording()} className={MENU_ITEM}>
                <FileBadge kind="wav" />
                {t("Recording")}
              </button>
            ) : (
              <span role="menuitem" aria-disabled className={`${MENU_ITEM} opacity-50`}>
                <FileBadge kind="wav" />
                {t("Recording")}
                {hasRecording === false ? (
                  <span className="ml-auto text-[10px]">{t("no recording")}</span>
                ) : null}
              </span>
            )}
            <MenuRule />
            {row("zip", file(all.join(",")), t("Everything"), all.length > 1)}
          </div>
        )}
      </DropMenu>
      {error ? (
        <span role="alert" className="absolute right-0 top-full mt-1 whitespace-nowrap text-xs text-[var(--error)]">
          {error}
        </span>
      ) : null}
    </span>
  );
}

type FileKind = "md" | "docx" | "pdf" | "txt" | "wav" | "zip";

/** What the row's file is, first and in its format's colour (`.file-badge` in globals.css). */
function FileBadge({ kind }: { kind: FileKind }) {
  return <span className={`file-badge file-${kind}`}>{kind.toUpperCase()}</span>;
}
