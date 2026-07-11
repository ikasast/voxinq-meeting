"use client";

import Link from "next/link";
import { useState } from "react";

export type TagChip = { name: string; count: number; href: string; active: boolean };

const VISIBLE = 6;

// Tag filter row. With many tags the row would crowd out the list, so only the first
// few (plus any active one) are shown; the rest sit behind a "+N more" toggle.
export function TagFilter({ tags }: { tags: TagChip[] }) {
  const [expanded, setExpanded] = useState(false);

  if (tags.length === 0) return null;

  // Keep the active tag visible even if it would be folded away.
  let visible = tags;
  if (!expanded && tags.length > VISIBLE + 1) {
    const head = tags.slice(0, VISIBLE);
    const active = tags.find((t) => t.active);
    visible = active && !head.includes(active) ? [...head, active] : head;
  }
  const hiddenCount = tags.length - visible.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-[var(--text-muted)]">Tags:</span>
      {visible.map((t) => (
        <Link
          key={t.name}
          href={t.href}
          className={`rounded-full border px-2.5 py-0.5 ${
            t.active
              ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] text-[var(--accent-sub)]"
              : "border-[var(--border-strong)] text-[var(--text-secondary)] hover:border-[var(--accent)]"
          }`}
        >
          {t.name} ({t.count}){t.active ? " ×" : ""}
        </Link>
      ))}
      {hiddenCount > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="rounded-full border border-dashed border-[var(--border-strong)] px-2.5 py-0.5 text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent-sub)]"
        >
          +{hiddenCount} more
        </button>
      ) : null}
      {expanded && tags.length > VISIBLE + 1 ? (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="rounded-full px-2 py-0.5 text-[var(--text-muted)] hover:text-[var(--foreground)]"
        >
          less
        </button>
      ) : null}
    </div>
  );
}
