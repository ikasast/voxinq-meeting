"use client";

import { useRef, useState } from "react";
import { useConfirm } from "../confirm-dialog";

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
  return (
    <section className="card space-y-6 p-6">
      <h2 className="section-title text-sm font-semibold text-[var(--text-strong)]">
        Backup &amp; restore
      </h2>
      {children}
    </section>
  );
}

export function DataBackup() {
  const confirm = useConfirm();

  const [exportPassword, setExportPassword] = useState("");
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
      setError("Choose a password of at least 8 characters.");
      return;
    }
    if (exportPassword !== exportConfirm) {
      setError("The two passwords do not match.");
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
        `Saved ${name} (${(blob.size / 1048576).toFixed(1)} MB, ${res.headers.get("X-Voxinq-Meetings") ?? "?"} meetings, ${res.headers.get("X-Voxinq-Recordings") ?? "0"} recordings)`,
      );
      setExportPassword("");
      setExportConfirm("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
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
      setError("Choose a backup file first.");
      return;
    }
    if (!importPassword) {
      setError("Enter the password this backup was created with.");
      return;
    }

    const ok = await confirm({
      title: "Restore from this backup?",
      message:
        `Meetings in ${file.name} that are not already here will be added. Nothing existing is ` +
        `deleted or overwritten` +
        (restoreSettings ? ", except your settings, which will be replaced." : "."),
      confirmLabel: "Restore",
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
      setError(e instanceof Error ? e.message : "Import failed");
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
        <h3 className="text-sm font-semibold text-[var(--text-strong)]">Export</h3>
        <p className="text-xs text-[var(--text-muted)]">
          <strong>Your</strong> meetings, transcripts, minutes, series, tags and voice profiles, plus
          your settings, in one file. On a server several people share this is yours alone — nobody
          can export what they cannot read, so everyone takes their own. The file is encrypted with
          the password below — <strong>without it the backup cannot be opened</strong>, and there is
          no way to recover it, so store it somewhere safe.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Password</span>
            <input
              type="password"
              className="input mt-1"
              value={exportPassword}
              onChange={(e) => setExportPassword(e.target.value)}
              placeholder="at least 8 characters"
              autoComplete="new-password"
              disabled={busy}
            />
          </label>
          <label className="block">
            <span className="label">Password again</span>
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
            Include the audio recordings
            <span className="ml-1 text-xs text-[var(--text-muted)]">
              (much larger; without them a restored meeting cannot be played, re-transcribed or
              diarized)
            </span>
          </span>
        </label>

        <button type="button" className="btn-ink" onClick={runExport} disabled={busy}>
          {exporting ? "Exporting…" : "Export backup"}
        </button>
      </div>

      <hr className="border-[var(--border)]" />

      {/* --- Import ------------------------------------------------------------------ */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-[var(--text-strong)]">Restore</h3>
        <p className="text-xs text-[var(--text-muted)]">
          Adds the meetings from a backup that are not already here. Existing meetings, series,
          tags and voice profiles are left untouched, so this is safe to run against a live
          install — and running the same file twice changes nothing the second time.
        </p>

        <input
          ref={fileRef}
          type="file"
          accept=".voxbak"
          className="block w-full text-sm text-[var(--text-muted)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--elevated)] file:px-3 file:py-1.5 file:text-sm file:text-[var(--text-strong)]"
          disabled={busy}
        />

        <label className="block sm:max-w-xs">
          <span className="label">Password</span>
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
            Also replace my settings
            <span className="ml-1 text-xs text-[var(--text-muted)]">
              (models, glossary, API keys — off by default so a restore does not disturb this
              machine&apos;s configuration)
            </span>
          </span>
        </label>

        <button type="button" className="btn-outline" onClick={runImport} disabled={busy}>
          {importing ? "Restoring…" : "Restore from backup"}
        </button>
      </div>

      {phase ? <p className="text-sm text-[var(--text-muted)]">{phase}</p> : null}

      {result ? (
        <div className="space-y-1 rounded-md border border-[var(--border)] bg-[var(--elevated)] p-4 text-sm">
          <p className="font-semibold text-[var(--text-strong)]">Restore complete</p>
          <p>
            {result.meetingsImported} meetings added, {result.meetingsSkipped} already here
            {result.meetingsFailed.length > 0 ? `, ${result.meetingsFailed.length} failed` : ""}.
          </p>
          <p className="text-[var(--text-muted)]">
            {result.transcriptsImported} utterances · {result.summariesImported} minutes ·{" "}
            {result.seriesCreated} series · {result.tagsCreated} tags · {result.profilesCreated} voice
            profiles ({result.profilesSkipped} kept)
          </p>
          <p className="text-[var(--text-muted)]">
            Recordings: {result.recordingsRestored} restored, {result.recordingsSkipped} already
            present
            {result.recordingsFailed > 0 ? `, ${result.recordingsFailed} could not be written` : ""}.
          </p>
          {result.settingsRestored ? <p className="text-[var(--text-muted)]">Settings replaced.</p> : null}
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
            From Voxinq {result.bundle.appVersion}, exported{" "}
            {result.bundle.exportedAt ? new Date(result.bundle.exportedAt).toLocaleString() : "unknown"}
          </p>
        </div>
      ) : null}
    </Wrap>
  );
}
