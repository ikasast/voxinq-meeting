"use client";

import { useEffect, useState } from "react";

// Publish / unpublish the app to the internet via Tailscale Funnel, from within
// the app itself (only usable on a tailnet-connected device). Outside viewers
// get a locked, read-only note; the server refuses the toggle for them anyway.

type FunnelInfo = {
  internal: boolean;
  available: boolean;
  public: boolean | null;
  hostname?: string | null;
  url: string | null;
};

export function RemoteAccess() {
  const [info, setInfo] = useState<FunnelInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    fetch("/api/funnel")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: FunnelInfo) => setInfo(d))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));

  useEffect(() => {
    void load();
  }, []);

  const toggle = async (next: boolean) => {
    if (
      next &&
      !window.confirm(
        "Publish this app to the public internet?\n\n" +
          "Anyone with the URL and the password will be able to view and download " +
          "minutes. Recording, editing and deleting stay blocked from outside. " +
          "The transcription service is never exposed.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/funnel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ public: next }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? `HTTP ${res.status}`);
      }
      setInfo((await res.json()) as FunnelInfo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setBusy(false);
    }
  };

  const Wrap = ({ children }: { children: React.ReactNode }) => (
    <section className="card space-y-4 p-6">
      <h2 className="section-title text-sm font-semibold text-[var(--text-strong)]">
        Remote access (public URL)
      </h2>
      {children}
    </section>
  );

  if (error && !info) {
    return (
      <Wrap>
        <p className="text-sm text-[var(--error)]">{error}</p>
      </Wrap>
    );
  }
  if (!info) {
    return (
      <Wrap>
        <p className="text-sm text-[var(--text-muted)]">Loading…</p>
      </Wrap>
    );
  }

  // Outside the tailnet: this control is not available (server also refuses it).
  if (!info.internal) {
    return (
      <Wrap>
        <p className="text-sm text-[var(--text-secondary)]">
          Publishing is managed from your private network. Open Settings on a device connected to
          your Tailscale tailnet (or the host itself) to turn public access on or off.
        </p>
      </Wrap>
    );
  }

  // On the tailnet but tailscale CLI not reachable from the server process.
  if (!info.available) {
    return (
      <Wrap>
        <p className="text-sm text-[var(--text-secondary)]">
          The Tailscale command line wasn&apos;t reachable from the server, so publishing can&apos;t
          be toggled here. You can still manage it manually on the host:
        </p>
        <pre className="overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--elevated)] p-3 font-mono text-xs">
          {"tailscale funnel --bg --https=443 localhost:3000   # publish\ntailscale funnel --https=443 off                  # unpublish"}
        </pre>
      </Wrap>
    );
  }

  const isPublic = info.public === true;

  return (
    <Wrap>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              isPublic ? "bg-[var(--success)]" : "bg-[var(--text-muted)]"
            }`}
          />
          <span className="text-sm font-medium text-[var(--text-strong)]">
            {isPublic ? "Public — reachable from outside your tailnet" : "Private — tailnet only"}
          </span>
        </div>
        <button
          type="button"
          onClick={() => toggle(!isPublic)}
          disabled={busy}
          className={isPublic ? "btn-outline" : "btn-ink"}
        >
          {busy ? "Working…" : isPublic ? "Make private" : "Publish publicly"}
        </button>
      </div>

      {isPublic && info.url ? (
        <p className="text-sm text-[var(--text-secondary)]">
          Public URL:{" "}
          <a
            href={info.url}
            target="_blank"
            rel="noreferrer"
            className="text-[var(--accent-sub)] underline"
          >
            {info.url}
          </a>
        </p>
      ) : null}

      <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--text-muted)]">
        <li>Only the web app (port 443) is published — the transcription service stays private.</li>
        <li>
          From outside, access is <strong>read-only</strong>: viewing and downloading only, protected
          by your <code>APP_PASSWORD</code>. Recording and editing remain tailnet-only.
        </li>
        <li>Tailnet devices (this one, your phone) always keep full access, public or not.</li>
      </ul>

      {error ? <p className="text-sm text-[var(--error)]">{error}</p> : null}
    </Wrap>
  );
}
