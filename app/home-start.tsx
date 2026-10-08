"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { CalendarIcon, MicIcon, UploadIcon } from "./icons";
import { useT } from "./locale-provider";
import { useExtensions } from "./extensions-provider";
import { isRecordingFile, transcribeFile } from "./transcribe-file";

// The first screen's three ways to start (v4, design B): record now, set one up ahead of time, or
// bring a recording. Big, because starting a meeting is what the app is for.

export function HomeStart({ external }: { external: boolean }) {
  const t = useT();
  const router = useRouter();
  const { schedule } = useExtensions();
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!isRecordingFile(file)) {
      setError(t("Please drop an audio file (wav, mp3, m4a, ...)."));
      return;
    }
    setError(null);
    try {
      const id = await transcribeFile(file, (p) =>
        setBusy(p === "uploading" ? t("Uploading the recording…") : t("Setting up the meeting…")),
      );
      router.push(`/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  return (
    <section>
      <h1 className="text-2xl font-semibold text-[var(--text-strong)]">{t("Start a meeting")}</h1>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {external ? (
          <Tile
            icon={<MicIcon />}
            title={t("Record now")}
            hint={t("Recording is available over Tailscale.")}
            disabled
          />
        ) : (
          <Tile href="/quick-record" icon={<MicIcon />} title={t("Record now")} hint={t("One tap, and it is recording.")} primary />
        )}
        <Tile
          href="/new"
          icon={<CalendarIcon />}
          title={schedule ? t("Plan a meeting") : t("Set up a meeting")}
          hint={schedule ? t("Name it, give it an agenda and a time.") : t("Name it and give it an agenda first.")}
        />
        {external ? (
          <Tile icon={<UploadIcon />} title={t("Audio file")} hint={t("Recording is available over Tailscale.")} disabled />
        ) : (
          <Tile
            onClick={() => picker.current?.click()}
            icon={<UploadIcon />}
            title={busy ?? t("Audio file")}
            hint={t("Or drop one anywhere on the page.")}
            disabled={busy !== null}
          />
        )}
      </div>
      <input
        ref={picker}
        type="file"
        accept="audio/*,video/*"
        className="hidden"
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error ? <p className="mt-3 text-sm text-[var(--error)]">{error}</p> : null}
    </section>
  );
}

function Tile({
  href,
  onClick,
  icon,
  title,
  hint,
  primary = false,
  disabled = false,
}: {
  href?: string;
  onClick?: () => void;
  icon: ReactNode;
  title: string;
  hint: string;
  primary?: boolean;
  disabled?: boolean;
}) {
  // A row on a phone, where three tall cards would push everything else off the screen; a card
  // from there up.
  const cls = `flex items-center gap-4 rounded-2xl border p-4 text-left transition-colors sm:min-h-36 sm:flex-col sm:items-start sm:justify-between sm:gap-6 sm:p-5 ${
    disabled
      ? "cursor-not-allowed border-[var(--border)] bg-[var(--surface)] opacity-60"
      : primary
        ? "border-transparent bg-[var(--accent-solid)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)]"
        : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)] hover:bg-[var(--surface-hover)]"
  }`;
  const inner = (
    <>
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full [&_svg]:h-6 [&_svg]:w-6 ${
          primary ? "bg-white/20" : "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--accent-sub)]"
        }`}
      >
        {icon}
      </span>
      <span>
        <span className={`block text-base font-semibold ${primary ? "" : "text-[var(--text-strong)]"}`}>{title}</span>
        <span className={`mt-1 block text-xs ${primary ? "opacity-85" : "text-[var(--text-muted)]"}`}>{hint}</span>
      </span>
    </>
  );
  if (href && !disabled) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {inner}
    </button>
  );
}
