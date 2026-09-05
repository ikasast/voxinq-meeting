"use client";

import { useCallback, useEffect, useState } from "react";
import { Avatar } from "../avatar";
import { useConfirm } from "../confirm-dialog";

// The people on this server.
//
// What an administrator can do here is run the machine, and that is deliberately not the same
// as being able to read what is on it. There is nothing on this screen about anybody's
// meetings except how many they have — a number that says the disk is filling up and nothing
// about what filled it.

type Person = {
  id: string;
  username: string;
  name: string | null;
  isAdmin: boolean;
  disabled: boolean;
  tailscaleLogin: string | null;
  lastSeenAt: string | null;
  hasImage: boolean;
  hasPassword: boolean;
  meetings: number;
  sessions: number;
};

export function PeopleList({ meId }: { meId: string }) {
  const confirm = useConfirm();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [link, setLink] = useState<{ username: string; url: string; minutes: number } | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPeople(((await res.json()) as { users: Person[] }).users);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = async (id: string, body: Record<string, unknown>) => {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(d?.error ?? `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const issueLink = async (p: Person) => {
    setBusy(p.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${p.id}/reset`, { method: "POST" });
      const d = (await res.json()) as {
        error?: string;
        url?: string;
        expiresInMinutes?: number;
      };
      if (!res.ok || !d.url) throw new Error(d.error ?? `HTTP ${res.status}`);
      setLink({ username: p.username, url: d.url, minutes: d.expiresInMinutes ?? 15 });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const toggleDisabled = async (p: Person) => {
    if (!p.disabled) {
      const ok = await confirm({
        title: `Disable ${p.name || p.username}?`,
        message:
          "They are signed out everywhere and cannot sign in again until this is undone. Their" +
          " meetings, recordings and minutes are untouched and stay theirs.",
        confirmLabel: "Disable",
        danger: true,
      });
      if (!ok) return;
    }
    await patch(p.id, { disabled: !p.disabled });
  };

  if (error && !people) return <p className="text-sm text-[var(--error)]">{error}</p>;
  if (!people) return <p className="text-sm text-[var(--text-muted)]">Loading…</p>;

  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-[var(--error)]">{error}</p> : null}

      {link ? (
        <div className="rounded-lg border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] p-3">
          <p className="text-sm font-medium text-[var(--text-strong)]">
            A link for {link.username}
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            It works once and expires in {link.minutes} minutes. It is shown here and nowhere
            else — only a hash of it is stored, so it cannot be shown again. Hand it over now.
          </p>
          <input
            readOnly
            value={link.url}
            onFocus={(e) => e.currentTarget.select()}
            className="input mt-2 font-mono text-xs"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => void navigator.clipboard?.writeText(link.url)}
              className="btn-outline !px-3 !py-1 !text-xs"
            >
              Copy
            </button>
            <button
              type="button"
              onClick={() => setLink(null)}
              className="btn-outline !px-3 !py-1 !text-xs"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}

      <ul className="overflow-hidden rounded-lg border border-[var(--border)]">
        {people.map((p) => (
          <li
            key={p.id}
            className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] px-3 py-2.5 last:border-b-0"
          >
            <Avatar username={p.username} name={p.name} hasImage={p.hasImage} size={32} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[var(--text-strong)]">
                {p.name || p.username}
                {p.id === meId ? (
                  <span className="ml-1 text-xs font-normal text-[var(--text-muted)]">(you)</span>
                ) : null}
                {p.isAdmin ? <span className="tag-lime ml-2">admin</span> : null}
                {p.disabled ? (
                  <span className="ml-2 text-xs font-normal text-[var(--warning)]">disabled</span>
                ) : null}
              </p>
              <p className="truncate text-xs text-[var(--text-muted)]">
                {p.username}
                {p.tailscaleLogin ? ` · ${p.tailscaleLogin}` : ""}
                {p.hasPassword ? "" : " · no password yet"}
                {` · ${p.meetings} meeting${p.meetings === 1 ? "" : "s"}`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => void issueLink(p)}
                disabled={busy !== null || p.disabled}
                className="btn-outline !px-2 !py-1 !text-xs"
                title="Issue a one-time link so they can set their own password"
              >
                Reset link
              </button>
              <button
                type="button"
                onClick={() => void patch(p.id, { isAdmin: !p.isAdmin })}
                disabled={busy !== null}
                className="btn-outline !px-2 !py-1 !text-xs"
              >
                {p.isAdmin ? "Remove admin" : "Make admin"}
              </button>
              <button
                type="button"
                onClick={() => void toggleDisabled(p)}
                disabled={busy !== null || p.id === meId}
                className={`btn-outline !px-2 !py-1 !text-xs ${p.disabled ? "" : "text-[var(--error)]"}`}
                title={p.id === meId ? "You cannot disable your own account" : undefined}
              >
                {p.disabled ? "Enable" : "Disable"}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <p className="text-xs text-[var(--text-muted)]">
        Accounts are disabled, never deleted. An account holds meetings, and deleting one would
        either destroy them or hand them to somebody who was never in the room.
      </p>

      {adding ? (
        <AddPerson
          onDone={async () => {
            setAdding(false);
            await load();
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="btn-ink">
          + Add someone
        </button>
      )}
    </div>
  );
}

function AddPerson({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [tailscaleLogin, setTailscaleLogin] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, name, tailscaleLogin, isAdmin }),
      });
      const d = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(d?.error ?? `HTTP ${res.status}`);
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card space-y-3 p-4">
      <h2 className="text-sm font-medium text-[var(--text-strong)]">Add someone</h2>
      <div>
        <label htmlFor="u" className="label">
          Username
        </label>
        <input
          id="u"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoCapitalize="none"
          className="input mt-1"
          required
        />
      </div>
      <div>
        <label htmlFor="n" className="label">
          Display name (optional)
        </label>
        <input id="n" value={name} onChange={(e) => setName(e.target.value)} className="input mt-1" />
      </div>
      <div>
        <label htmlFor="t" className="label">
          Tailnet login (optional)
        </label>
        <input
          id="t"
          value={tailscaleLogin}
          onChange={(e) => setTailscaleLogin(e.target.value)}
          placeholder="sam@example.com"
          className="input mt-1"
        />
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Fill this in and they are signed in automatically from inside the tailnet, with no
          password at all. Leave it empty and give them a reset link instead.
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
        An administrator
      </label>
      {error ? <p className="text-sm text-[var(--error)]">{error}</p> : null}
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !username} className="btn-ink">
          {busy ? "Adding…" : "Add"}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className="btn-outline">
          Cancel
        </button>
      </div>
    </form>
  );
}
