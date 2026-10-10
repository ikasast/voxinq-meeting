"use client";

import { useState } from "react";
import { diffText } from "@/lib/text-diff";
import { useT } from "../locale-provider";
import { CheckIcon, SearchIcon, SpellCheckIcon } from "../icons";

/** A line as the panel names it: who said it (with two or more speakers) and when. */
export type FixLine = { id: string; who: string | null; at: string };

/** One change on offer: a line as it is, and as it would be. */
type Candidate = { id: string; before: string; after: string };

/** Where the changes on offer came from — they are written back by different routes. */
type Source = { kind: "find"; find: string; replace: string; caseSensitive: boolean } | { kind: "glossary" };

// Fixing how something is written, in one place (v4). It was two: Find & replace beside the
// heading, which changed every line it matched once the preview was accepted, and "Suggest
// fixes" behind "…", whose proposals appeared under the lines one by one. Both were the same
// job — a word the recogniser got wrong — reached from two places and reviewed in two ways.
//
// Now either way of finding them ends in one list: each line as it would read, what goes
// struck through and what comes in marked, ticked to begin with. Untick what should stay and
// fix the rest at once. Nothing is written until then.
//
// The lines found by a term are written by the replace route, which plans the change again
// against the rows it holds; the glossary's are edits of whole lines, as typed ones are.
export function SpellingFix({
  meetingId,
  lines,
  glossary,
  hasCorrectionTerms,
  onReplaced,
  editLine,
}: {
  meetingId: string;
  lines: FixLine[];
  /** Whether the Corrections extension is on: the glossary's way in is shown only then. */
  glossary: boolean;
  /** Whether there are any terms to look for — see lib/correction-terms.ts. */
  hasCorrectionTerms: boolean;
  /** Lines the replace route rewrote, as it wrote them. */
  onReplaced: (applied: Map<string, string>) => void;
  /** One line's new wording, through the ordinary edit; false when it was refused. */
  editLine: (id: string, text: string) => Promise<boolean>;
}) {
  const t = useT();
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [busy, setBusy] = useState<"find" | "glossary" | "fix" | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [found, setFound] = useState<Candidate[]>([]);
  const [left, setLeft] = useState<Set<string>>(new Set());
  const [more, setMore] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const meta = new Map(lines.map((l) => [l.id, l]));
  const picked = found.filter((c) => !left.has(c.id));

  const show = (from: Source, list: Candidate[], extra: { more?: number; skipped?: number } = {}) => {
    setSource(from);
    setFound(list);
    setLeft(new Set());
    setMore(extra.more ?? 0);
    setSkipped(extra.skipped ?? 0);
  };
  const clear = () => {
    setSource(null);
    setFound([]);
    setMore(0);
    setSkipped(0);
  };

  const lookFor = async () => {
    if (!find) return;
    setBusy("find");
    setMsg(null);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/replace`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ find, replace, caseSensitive, dryRun: true }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = (await res.json()) as {
        totalMatches: number;
        changeCount: number;
        changes: Candidate[];
        skipped: unknown[];
      };
      show({ kind: "find", find, replace, caseSensitive }, d.changes, {
        more: d.changeCount - d.changes.length,
        skipped: d.skipped.length,
      });
      if (d.totalMatches === 0) setMsg(t("No matches."));
    } catch (e) {
      clear();
      setError(t("Preview failed: {error}", { error: (e as Error).message }));
    } finally {
      setBusy(null);
    }
  };

  // Asks the LLM which lines misheard a term from the glossary. It only proposes.
  const askGlossary = async () => {
    setBusy("glossary");
    setMsg(null);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/suggest-corrections`, { method: "POST" });
      const d = (await res.json().catch(() => null)) as {
        suggestions?: { transcriptId: string; before: string; after: string }[];
        checked?: number;
        error?: string;
      } | null;
      if (!res.ok) throw new Error(d?.error ?? `HTTP ${res.status}`);
      const list = (d?.suggestions ?? []).map((s) => ({ id: s.transcriptId, before: s.before, after: s.after }));
      show({ kind: "glossary" }, list);
      if (list.length === 0) {
        setMsg(t("No misheard glossary terms found across {checked} utterances.", { checked: d?.checked ?? 0 }));
      }
    } catch (e) {
      clear();
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const fix = async () => {
    if (!source || picked.length === 0) return;
    setBusy("fix");
    setError(null);
    try {
      let fixed = 0;
      if (source.kind === "find") {
        const res = await fetch(`/api/meetings/${meetingId}/replace`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...source, kind: undefined, ids: picked.map((c) => c.id) }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = (await res.json()) as { applied: { id: string; after: string }[] };
        onReplaced(new Map(d.applied.map((c) => [c.id, c.after])));
        fixed = d.applied.length;
      } else {
        // One at a time: each is an ordinary edit, which puts its line back if it is refused.
        for (const c of picked) {
          if (!(await editLine(c.id, c.after))) break;
          fixed++;
        }
      }
      clear();
      setMsg(t(fixed === 1 ? "Fixed 1 line." : "Fixed {n} lines.", { n: fixed }));
    } catch (e) {
      setError(t("Replace failed: {error}", { error: (e as Error).message }));
    } finally {
      setBusy(null);
    }
  };

  const toggle = (id: string) =>
    setLeft((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const edited = () => {
    if (source?.kind === "find") clear();
    setMsg(null);
  };

  return (
    <div>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void lookFor();
        }}
      >
        <input
          className="input min-w-0 flex-1 basis-32"
          value={find}
          onChange={(e) => {
            setFind(e.target.value);
            edited();
          }}
          placeholder={t("e.g. Voxing")}
          aria-label={t("Find")}
          disabled={busy !== null}
        />
        <span aria-hidden className="text-[var(--text-muted)]">→</span>
        <input
          className="input min-w-0 flex-1 basis-32"
          value={replace}
          onChange={(e) => {
            setReplace(e.target.value);
            edited();
          }}
          placeholder={t("e.g. Voxinq")}
          aria-label={t("Replace with")}
          disabled={busy !== null}
        />
        <button type="submit" className="btn-outline" disabled={busy !== null || !find}>
          <SearchIcon className="h-3.5 w-3.5" />
          {busy === "find" ? t("Checking…") : t("Find")}
        </button>
      </form>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <label className="flex items-center gap-1.5 text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(e) => {
              setCaseSensitive(e.target.checked);
              edited();
            }}
            disabled={busy !== null}
          />
          {t("Match case")}
        </label>
        {glossary ? (
          hasCorrectionTerms ? (
            <button
              type="button"
              className="btn-outline !py-1 text-xs"
              onClick={() => void askGlossary()}
              disabled={busy !== null}
              title={t("Check the transcript for glossary terms that were misheard, and propose fixes to apply line by line")}
            >
              <SpellCheckIcon className="h-3.5 w-3.5" />
              {busy === "glossary" ? t("Checking…") : t("Suggest from the glossary")}
            </button>
          ) : (
            <span className="text-[var(--text-muted)]">
              {t("Needs some terms to look for. Add them under Settings → Transcription, or on the series this meeting belongs to.")}
            </span>
          )
        ) : null}
      </div>

      {found.length > 0 ? (
        <div className="mt-3">
          <ul className="border-t border-[var(--border)]">
            {found.map((c) => {
              const line = meta.get(c.id);
              return (
                <li key={c.id} className="border-b border-[var(--border)]">
                  <label className="flex cursor-pointer items-start gap-2.5 py-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={!left.has(c.id)}
                      onChange={() => toggle(c.id)}
                      disabled={busy !== null}
                    />
                    <span className="min-w-0 flex-1">
                      {line ? (
                        <span className="block text-xs tabular-nums text-[var(--text-muted)]">
                          {line.at}
                          {line.who ? ` ${line.who}` : ""}
                        </span>
                      ) : null}
                      <span className="whitespace-pre-wrap text-[var(--foreground)]">
                        {diffText(c.before, c.after).map((p, i) =>
                          p.kind === "same" ? (
                            <span key={i}>{p.text}</span>
                          ) : p.kind === "del" ? (
                            <del key={i} className="text-[var(--error)] decoration-[var(--error)]">
                              {p.text}
                            </del>
                          ) : (
                            <ins key={i} className="font-medium text-[var(--success)] no-underline">
                              {p.text}
                            </ins>
                          ),
                        )}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="min-w-0 flex-1 text-xs text-[var(--text-muted)]">
              {t("{picked} of {n} selected", { picked: picked.length, n: found.length })}
              {more > 0 ? ` · ${t("Only the first {shown} are shown; fix them, then look again.", { shown: found.length })}` : ""}
              {skipped > 0
                ? ` · ${t("{n} skipped — a replacement cannot empty an utterance (delete it instead) or exceed the length limit.", { n: skipped })}`
                : ""}
            </p>
            <button type="button" className="btn-ink" onClick={() => void fix()} disabled={busy !== null || picked.length === 0}>
              <CheckIcon className="h-3.5 w-3.5" />
              {busy === "fix" ? t("Fixing…") : t("Fix {n}", { n: picked.length })}
            </button>
          </div>
        </div>
      ) : null}

      {msg ? <p className="mt-2 text-xs text-[var(--text-secondary)]">{msg}</p> : null}
      {error ? (
        <p role="alert" className="mt-2 text-xs text-[var(--error)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
