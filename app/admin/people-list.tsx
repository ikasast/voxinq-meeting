"use client";

import { useCallback, useEffect, useState } from "react";
import { Avatar } from "../avatar";
import { useConfirm } from "../confirm-dialog";
import { useT } from "@/app/locale-provider";
import { DropMenu, ICON_BUTTON, MENU_ITEM, MenuRule } from "../drop-menu";
import { DotsIcon, KeyIcon, UserPlusIcon } from "../icons";
import { PROPS_GRID, PROPS_WIDE, Prop } from "../[id]/property";

// The people on this server.
//
// What an administrator can do here is run the machine, and that is deliberately not the same
// as being able to read what is on it. There is nothing on this screen about anybody's
// meetings except how many they have — a number that says the disk is filling up and nothing
// about what filled it.

type Person = {
  id: string;
  username: string;
  email: string | null;
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

export function PeopleList({ meId, title, intro }: { meId: string; title: string; intro: string }) {
  const confirm = useConfirm();
  const [people, setPeople] = useState<Person[] | null>(null);
  const t = useT();
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
        title: t("Disable {name}?", { name: p.name || p.username }),
        // One key, not two literals joined: the sentence is translated whole.
        message: t(
          "They are signed out everywhere and cannot sign in again until this is undone. Their meetings, recordings and minutes are untouched and stay theirs.",
        ),
        confirmLabel: t("Disable"),
        danger: true,
      });
      if (!ok) return;
    }
    await patch(p.id, { disabled: !p.disabled });
  };

  if (error && !people) return <p className="text-sm text-[var(--error)]">{error}</p>;
  if (!people) return <p className="text-sm text-[var(--text-muted)]">{t("Loading…")}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-strong)]">{title}</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{intro}</p>
        </div>
        {!adding ? (
          <button type="button" onClick={() => setAdding(true)} className="btn-ink">
            <UserPlusIcon className="h-4 w-4" />
            {t("Add someone")}
          </button>
        ) : null}
      </div>

      {adding ? (
        <AddPerson
          onDone={async () => {
            setAdding(false);
            await load();
          }}
          onCancel={() => setAdding(false)}
        />
      ) : null}

      {error ? <p className="text-sm text-[var(--error)]">{error}</p> : null}

      {link ? (
        <div className="rounded-lg border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] p-3">
          <p className="text-sm font-medium text-[var(--text-strong)]">
            {t("A link for {name}", { name: link.username })}
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {t(
              "It works once and expires in {n} minutes. It is shown here and nowhere else — only a hash of it is stored, so it cannot be shown again. Hand it over now.",
              { n: link.minutes },
            )}
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
              {t("Copy")}
            </button>
            <button
              type="button"
              onClick={() => setLink(null)}
              className="btn-outline !px-3 !py-1 !text-xs"
            >
              {t("Done")}
            </button>
          </div>
        </div>
      ) : null}

      {/* Rows between hairlines, like the meeting list (v4): the person, and what can be done
          about them as icons — a sign-in link, and the rest behind "…". */}
      <ul className="border-t border-[var(--border)]">
        {people.map((p) => (
          <li key={p.id} className="flex items-center gap-3 border-b border-[var(--border)] px-2 py-2.5">
            <Avatar username={p.username} name={p.name} hasImage={p.hasImage} size={32} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[var(--text-strong)]">
                {p.name || p.username}
                {p.id === meId ? (
                  <span className="ml-1 text-xs font-normal text-[var(--text-muted)]">{t("(you)")}</span>
                ) : null}
                {p.isAdmin ? <span className="tag-lime ml-2">{t("admin")}</span> : null}
                {p.disabled ? (
                  <span className="ml-2 text-xs font-normal text-[var(--warning)]">{t("disabled")}</span>
                ) : null}
              </p>
              <p className="truncate text-xs text-[var(--text-muted)]">
                {p.email ?? p.username}
                {p.tailscaleLogin && p.tailscaleLogin !== p.email ? ` · ${p.tailscaleLogin}` : ""}
                {p.hasPassword ? "" : ` · ${t("no password yet")}`}
                {` · ${t(p.meetings === 1 ? "1 meeting" : "{n} meetings", { n: p.meetings })}`}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={() => void issueLink(p)}
                disabled={busy !== null || p.disabled}
                className={ICON_BUTTON}
                title={t("Issue a one-time link so they can set their own password")}
                aria-label={t("Reset link")}
              >
                <KeyIcon className="h-4 w-4" />
              </button>
              <DropMenu label={t("More")} trigger={<DotsIcon className="h-4 w-4" />} className={ICON_BUTTON} width={200}>
                {(close) => (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => void close().then(() => patch(p.id, { isAdmin: !p.isAdmin }))}
                      disabled={busy !== null}
                      className={MENU_ITEM}
                    >
                      {p.isAdmin ? t("Remove admin") : t("Make admin")}
                    </button>
                    <MenuRule />
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => void close().then(() => toggleDisabled(p))}
                      disabled={busy !== null || p.id === meId}
                      title={p.id === meId ? t("You cannot disable your own account") : undefined}
                      className={`${MENU_ITEM} ${p.disabled ? "" : "!text-[var(--error)]"}`}
                    >
                      {p.disabled ? t("Enable") : t("Disable")}
                    </button>
                  </>
                )}
              </DropMenu>
            </div>
          </li>
        ))}
      </ul>

      {/* Disabled, never deleted: an account holds meetings, and deleting one would either
          destroy them or hand them to somebody who was never in the room. */}
      <p className="text-xs text-[var(--text-muted)]">{t("Accounts are disabled, never deleted: they hold meetings.")}</p>
    </div>
  );
}

function AddPerson({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const t = useT();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
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
        body: JSON.stringify({ username, email, name, tailscaleLogin, isAdmin }),
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
    <form onSubmit={submit} className="space-y-3 border-y border-[var(--border)] py-3">
      <div className={PROPS_GRID}>
        <Prop label={t("Username")} fill>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoCapitalize="none"
            autoFocus
            aria-label={t("Username")}
            className="input"
            required
          />
        </Prop>
        <Prop label={t("Email")} fill>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoCapitalize="none"
            placeholder="them@example.com"
            aria-label={t("Email")}
            className="input"
            required
          />
          <p className="mt-1 text-xs text-[var(--text-muted)]">{t("What they sign in with. Nothing is sent to it.")}</p>
        </Prop>
        <Prop label={t("Display name")} fill>
          <input value={name} onChange={(e) => setName(e.target.value)} aria-label={t("Display name")} className="input" />
        </Prop>
        <Prop label={t("Tailnet login")} fill>
          <input
            value={tailscaleLogin}
            onChange={(e) => setTailscaleLogin(e.target.value)}
            placeholder="sam@example.com"
            aria-label={t("Tailnet login")}
            className="input"
          />
          <p className="mt-1 text-xs text-[var(--text-muted)]">{t("Signs them in from inside the tailnet, with no password.")}</p>
        </Prop>
        <div className={PROPS_WIDE}>
          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
            {t("An administrator")}
          </label>
        </div>
      </div>
      {error ? <p className="text-sm text-[var(--error)]">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className="btn-outline">
          {t("Cancel")}
        </button>
        <button type="submit" disabled={busy || !username || !email} className="btn-ink">
          {busy ? t("Adding…") : t("Add")}
        </button>
      </div>
    </form>
  );
}
