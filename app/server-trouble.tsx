"use client";

import { useEffect, useState } from "react";
import { appVersionFrom } from "@/lib/app-version";

// What a page says when the server answered but could not draw it (error.tsx, global-error.tsx):
// the database is down, or something else broke. It used to be Next.js's own one line of English
// with a digest.
//
// Self-contained on purpose, strings included. When the root layout is what failed — and with the
// database down it is, since it asks who you are — there is no locale provider, no stylesheet and
// no theme around this, so it cannot borrow any of them. The language is the page's own `lang`
// where the layout got that far, and the browser's otherwise.
//
// Recording does not have to wait for the fix: the offline page (public/offline.html) records in
// the browser, and what it keeps is sent from the banner once the app is back. Not offered in the
// Android app, whose own screen records on the phone (MainActivity sends a page that fails this
// way there).

const STRINGS = {
  en: {
    title: "Something went wrong in Voxinq",
    db: "The database cannot be reached. Let whoever runs the server know. Until it is fixed, you can still record in this browser.",
    dbInApp: "The database cannot be reached. Let whoever runs the server know.",
    other: "Something went wrong on the server.",
    reload: "Reload",
    record: "● Record in this browser",
  },
  ja: {
    title: "Voxinq でエラーが起きています",
    db: "データベースに接続できません。サーバーの管理者に連絡してください。直るまでのあいだも、このブラウザで録音しておけます。",
    dbInApp: "データベースに接続できません。サーバーの管理者に連絡してください。",
    other: "サーバーで問題が起きています。",
    reload: "もう一度読み込む",
    record: "● このブラウザで録音する",
  },
} as const;

export function ServerTrouble({ digest }: { digest?: string }) {
  const [lang, setLang] = useState<"en" | "ja">("en");
  const [dbDown, setDbDown] = useState(false);
  const [inApp, setInApp] = useState(false);

  useEffect(() => {
    const said = document.documentElement.lang || navigator.language || "";
    // Read once the page is in the browser: the server render has neither to go on.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLang(said.toLowerCase().startsWith("ja") ? "ja" : "en");
    setInApp(appVersionFrom(navigator.userAgent) !== null);
    let cancelled = false;
    // It waits out its own checks of the database and the minutes model, a few seconds each.
    fetch("/api/health", { cache: "no-store", signal: AbortSignal.timeout(10_000) })
      .then((r) => r.json())
      .then((d: { db?: { ok: boolean } }) => {
        if (!cancelled) setDbDown(d.db?.ok === false);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const s = STRINGS[lang];
  return (
    <div className="vx-trouble" lang={lang}>
      <style>{CSS}</style>
      <h1>{s.title}</h1>
      <p>{dbDown ? (inApp ? s.dbInApp : s.db) : s.other}</p>
      <div className="vx-row">
        <button type="button" onClick={() => location.reload()}>
          {s.reload}
        </button>
        {inApp ? null : (
          <a href="/offline.html" className="vx-record">
            {s.record}
          </a>
        )}
      </div>
      {digest ? <p className="vx-digest">{digest}</p> : null}
    </div>
  );
}

// The app's colours where its stylesheet is there (error.tsx); its own, light and dark, where it
// is not (global-error.tsx).
const CSS = `
.vx-trouble { --vx-paper:#fff; --vx-fg:#1f2937; --vx-muted:#6b7280; --vx-border:#dfe5ee;
  max-width: 34rem; margin: 0 auto; padding: 56px 20px; color: var(--foreground, var(--vx-fg));
  font-family: system-ui, -apple-system, "Segoe UI", "Hiragino Sans", "Yu Gothic UI", sans-serif; }
@media (prefers-color-scheme: dark) { .vx-trouble { --vx-paper:#111a2b; --vx-fg:#e5e7eb; --vx-muted:#9ca3af; --vx-border:#1f2a3d; } }
.vx-trouble h1 { font-size: 1.4rem; margin: 0 0 8px; }
.vx-trouble p { line-height: 1.6; color: var(--text-secondary, var(--vx-muted)); margin: 0 0 18px; }
.vx-row { display: flex; gap: 8px; flex-wrap: wrap; }
.vx-row button, .vx-row a { font: inherit; font-size: .95rem; border-radius: 10px; padding: 8px 14px; cursor: pointer;
  border: 1px solid var(--border-strong, var(--vx-border)); background: var(--surface, var(--vx-paper));
  color: var(--foreground, var(--vx-fg)); text-decoration: none; }
.vx-row a.vx-record { background: #ef4444; border-color: #ef4444; color: #fff; font-weight: 600; }
.vx-trouble .vx-digest { margin-top: 28px; font-family: ui-monospace, Consolas, monospace; font-size: .75rem; }
`;
