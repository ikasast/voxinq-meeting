// A row of a settings-like page (v4): what it is on the left, its value or its control on the
// right, a hairline between rows and no box around any of it. Settings, the account page.

export function FieldRow({
  label,
  htmlFor,
  hint,
  tag,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: React.ReactNode;
  /** Under the label: which extension the setting is for (app/settings/extension-chip.tsx). */
  tag?: React.ReactNode;
  children: React.ReactNode;
}) {
  // With a tag the pair carries the top padding, so the two sit on one line on a phone.
  const cls = `${tag ? "" : "pt-2 "}text-sm text-[var(--text-secondary)]`;
  const name = htmlFor ? (
    <label htmlFor={htmlFor} className={cls}>
      {label}
    </label>
  ) : (
    <p className={cls}>{label}</p>
  );
  return (
    <div className="grid gap-x-6 gap-y-1.5 border-b border-[var(--border)] py-4 last:border-b-0 sm:grid-cols-[11rem_minmax(0,1fr)]">
      {tag ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-2 sm:flex-col sm:items-start">
          {name}
          {tag}
        </div>
      ) : (
        name
      )}
      <div className="min-w-0">
        {children}
        {hint ? <div className="mt-1.5 space-y-1 text-xs text-[var(--text-muted)]">{hint}</div> : null}
      </div>
    </div>
  );
}
