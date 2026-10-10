"use client";

import { useRef, useState } from "react";
import { useConfirm } from "../confirm-dialog";
import { useT } from "@/app/locale-provider";

// Backup and restore of everything the reader can see, as one encrypted file.
//
// Not everything the *server* holds, on an instance with accounts: the export runs through the
// scoped client, so it carries the exporter's own meetings and nobody else's. That falls out of
// encryption rather than being a policy — an administrator cannot put other people's transcripts
// in a file they would then be able to read. Everyone takes their own, and a database dump is
// still the whole-machine answer.
//
// The file carries every transcript and the API keys from settings.json, so it is encrypted
// with a password the user chooses here — a backup is meant to be copied to another machine or
// a drive, where it is no longer protected by this server.

type ImportResult = {
  meetingsImported: number;
  meetingsSkipped: number;
  meetingsFailed: { meetingId: string; error: string }[];
  transcriptsImported: number;
  summariesImported: number;
  seriesCreated: number;
  tagsCreated: number;
  profilesCreated: number;
  profilesSkipped: number;
  recordingsRestored: number;
  recordingsSkipped: number;
  recordingsFailed: number;
  settingsRestored: boolean;
  bundle: { appVersion: string; exportedAt: string; includesRecordings: boolean };
};

function Wrap({ children }: { children: React.ReactNode }) {
  const t = useT();
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-[var(--text-strong)]">
        {t("Backup & restore")}
      </h2>
      {children}
    </section>
  );
}

/**
 * A backup's progress, in the reader's language.
 *
 * The server reports where it has got to in a few fixed phrases (lib/backup/export.ts and
 * import.ts), two of them with a count. Each is a key here; anything it says that is not is
 * shown as it came, which is still better than nothing.
 */
function phaseLabel(t: (key: string, vars?: Record<string, string | number>) => string, phase: string): string {
  const counted = /^(recordings|meetings) (\d+)\/(\d+)$/.exec(phase);
  if (counted) {
    const vars = { done: counted[2], total: counted[3] };
    return counted[1] === "recordings" ? t("Recordings {done}/{total}", vars) : t("Meetings {done}/{total}", vars);
  }
  switch (phase) {
    case "starting":
      return t("Starting…");
    case "reading the file":
      return t("Reading the file…");
    case "reading the database":
      return t("Reading the database…");
    case "packing":
      return t("Packing…");
    case "checking what is already here":
      return t("Checking what is already here…");
    case "series and tags":
      return t("Series and tags…");
    case "voice profiles":
      return t("Voice profiles…");
    case "settings":
      return t("Settings…");
    default:
      return phase;
  }
}

export function DataBackup() {
  const confirm = useConfirm();

  const [exportPassword, setExportPassword] = useState("");
  const t = useT();
  const [exportConfirm, setExportConfirm] = useState("");
  const [includeRecordings, setIncludeRecordings] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [importPassword, setImportPassword] = useState("");
  const [restoreSettings, setRestoreSettings] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The work happens inside one long request, so progress comes from a side channel.
  const followProgress = (active: () => boolean) => {
    const tick = async () => {
      if (!active()) return;
      const d = (await fetch("/api/backup/status", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)) as { running: boolean; phase?: string } | null;
      if (!active()) return;
      if (d?.running && d.phase) setPhase(d.phase);
      setTimeout(tick, 1000);
    };
    setTimeout(tick, 600);
  };

  const runExport = async () => {
    setError(null);
    setResult(null);
    if (exportPassword.length < 8) {
      setError(t("Choose a password of at least 8 characters."));
      return;
    }
    if (exportPassword !== exportConfirm) {
      setError(t("The two passwords do not match."));
      return;
    }

    setExporting(true);
    setPhase("starting");
    let running = true;
    followProgress(() => running);
    try {
      const res = await fetch("/api/backup/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: exportPassword, includeRecordings }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const name =
        res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "voxinq-backup.voxbak";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      setPhase(
        t("Saved {name} ({size} MB, {meetings} meetings, {recordings} recordings)", {
          name,
          size: (blob.size / 1048576).toFixed(1),
          meetings: res.headers.get("X-Voxinq-Meetings") ?? "?",
          recordings: res.headers.get("X-Voxinq-Recordings") ?? "0",
        }),
      );
      setExportPassword("");
      setExportConfirm("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Export failed"));
      setPhase(null);
    } finally {
      running = false;
      setExporting(false);
    }
  };

  const runImport = async () => {
    setError(null);
    setResult(null);
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError(t("Choose a backup file first."));
      return;
    }
    if (!importPassword) {
      setError(t("Enter the password this backup was created with."));
      return;
    }

    const ok = await confirm({
      title: t("Restore from this backup?"),
      message: t(
        restoreSettings
          ? "Meetings in {file} that are not already here will be added. Nothing existing is deleted or overwritten, except your settings, which will be replaced."
          : "Meetings in {file} that are not already here will be added. Nothing existing is deleted or overwritten.",
        { file: file.name },
      ),
      confirmLabel: t("Restore"),
    });
    if (!ok) return;

    setImporting(true);
    setPhase("reading the file");
    let running = true;
    followProgress(() => running);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("password", importPassword);
      if (restoreSettings) body.set("restoreSettings", "1");

      const res = await fetch("/api/backup/import", { method: "POST", body });
      const data = (await res.json().catch(() => null)) as (ImportResult & { error?: string }) | null;
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setResult(data as ImportResult);
      setPhase(null);
      setImportPassword("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Import failed"));
      setPhase(null);
    } finally {
      running = false;
      setImporting(false);
    }
  };

  const busy = exporting || importing;

  return (
    <Wrap>
      {error ? (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      ) : null}

      {/* --- Export ------------------------------------------------------------------ */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-[var(--text-strong)]">{t("Export")}</h3>
        <p className="text-xs text-[var(--text-muted)]">
          {t(
            "Your meetings, transcripts, minutes, series, tags and voice profiles, plus your settings, in one file. On a server several people share this is yours alone — nobody can export what they cannot read, so everyone takes their own.",
          )}{" "}
          <strong>
            {t(
              "The file is encrypted with the password below — without it the backup cannot be opened, and there is no way to recover it, so store it somewhere safe.",
            )}
          </strong>
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">{t("Password")}</span>
            <input
              type="password"
              className="input mt-1"
              value={exportPassword}
              onChange={(e) => setExportPassword(e.target.value)}
              placeholder={t("at least 8 characters")}
              autoComplete="new-password"
              disabled={busy}
            />
          </label>
          <label className="block">
            <span className="label">{t("Password again")}</span>
            <input
              type="password"
              className="input mt-1"
              value={exportConfirm}
              onChange={(e) => setExportConfirm(e.target.value)}
              autoComplete="new-password"
              disabled={busy}
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeRecordings}
            onChange={(e) => setIncludeRecordings(e.target.checked)}
            disabled={busy}
          />
          <span>
            {t("Include the audio recordings")}
            <span className="ml-1 text-xs text-[var(--text-muted)]">
              {t("(much larger; without them a restored meeting cannot be played, re-transcribed or diarized)")}
            </span>
          </span>
        </label>

        <button type="button" className="btn-ink" onClick={runExport} disabled={busy}>
          {exporting ? t("Exporting…") : t("Export backup")}
        </button>
      </div>

      <hr className="border-[var(--border)]" />

      {/* --- Import ------------------------------------------------------------------ */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-[var(--text-strong)]">{t("Restore")}</h3>
        <p className="text-xs text-[var(--text-muted)]">
          {t("Adds the meetings from a backup that are not already here. Existing meetings, series, tags and voice profiles are left untouched, so this is safe to run against a live install — and running the same file twice changes nothing the second time.")}
        </p>

        <input
          ref={fileRef}
          type="file"
          accept=".voxbak"
          className="block w-full text-sm text-[var(--text-muted)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--elevated)] file:px-3 file:py-1.5 file:text-sm file:text-[var(--text-strong)]"
          disabled={busy}
        />

        <label className="block sm:max-w-xs">
          <span className="label">{t("Password")}</span>
          <input
            type="password"
            className="input mt-1"
            value={importPassword}
            onChange={(e) => setImportPassword(e.target.value)}
            autoComplete="off"
            disabled={busy}
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={restoreSettings}
            onChange={(e) => setRestoreSettings(e.target.checked)}
            disabled={busy}
          />
          <span>
            {t("Also replace my settings")}
            <span className="ml-1 text-xs text-[var(--text-muted)]">
              {t("(models, glossary, API keys — off by default so a restore does not disturb this machine’s configuration)")}
            </span>
          </span>
        </label>

        <button type="button" className="btn-outline" onClick={runImport} disabled={busy}>
          {importing ? t("Restoring…") : t("Restore from backup")}
        </button>
      </div>

      {phase ? <p className="text-sm text-[var(--text-muted)]">{phaseLabel(t, phase)}</p> : null}

      {result ? (
        <div className="space-y-1 rounded-md border border-[var(--border)] bg-[var(--elevated)] p-4 text-sm">
          <p className="font-semibold text-[var(--text-strong)]">{t("Restore complete")}</p>
          <p>
            {t("Meetings: {added} added, {skipped} already here.", {
              added: result.meetingsImported,
              skipped: result.meetingsSkipped,
            })}
            {result.meetingsFailed.length > 0 ? ` ${t("{n} failed.", { n: result.meetingsFailed.length })}` : ""}
          </p>
          <p className="text-[var(--text-muted)]">
            {t(
              "{utterances} utterances · {minutes} minutes · {series} series · {tags} tags · {profiles} voice profiles ({kept} kept)",
              {
                utterances: result.transcriptsImported,
                minutes: result.summariesImported,
                series: result.seriesCreated,
                tags: result.tagsCreated,
                profiles: result.profilesCreated,
                kept: result.profilesSkipped,
              },
            )}
          </p>
          <p className="text-[var(--text-muted)]">
            {t("Recordings: {restored} restored, {present} already present.", {
              restored: result.recordingsRestored,
              present: result.recordingsSkipped,
            })}
            {result.recordingsFailed > 0
              ? ` ${t("{n} could not be written.", { n: result.recordingsFailed })}`
              : ""}
          </p>
          {result.settingsRestored ? <p className="text-[var(--text-muted)]">{t("Settings replaced.")}</p> : null}
          {result.meetingsFailed.length > 0 ? (
            <ul className="mt-2 list-inside list-disc text-xs text-red-400">
              {result.meetingsFailed.slice(0, 5).map((f) => (
                <li key={f.meetingId}>
                  {f.meetingId}: {f.error}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="pt-1 text-xs text-[var(--text-muted)]">
            {t("From Voxinq {version}, exported {when}", {
              version: result.bundle.appVersion,
              when: result.bundle.exportedAt ? new Date(result.bundle.exportedAt).toLocaleString() : t("unknown"),
            })}
          </p>
        </div>
      ) : null}
    </Wrap>
  );
}
