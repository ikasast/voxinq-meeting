// A row of a settings-like page (v4): what it is on the left, its value or its control on the
// right, a hairline between rows and no box around any of it. Settings, the account page.

export function FieldRow({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-x-6 gap-y-1.5 border-b border-[var(--border)] py-4 last:border-b-0 sm:grid-cols-[11rem_minmax(0,1fr)]">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="pt-2 text-sm text-[var(--text-secondary)]">
          {label}
        </label>
      ) : (
        <p className="pt-2 text-sm text-[var(--text-secondary)]">{label}</p>
      )}
      <div className="min-w-0">
        {children}
        {hint ? <div className="mt-1.5 space-y-1 text-xs text-[var(--text-muted)]">{hint}</div> : null}
      </div>
    </div>
  );
}
