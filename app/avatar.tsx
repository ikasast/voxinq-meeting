// Somebody's face, or their initials when they have not set one.
//
// Circular, because it is the shape people read as "a person" without a label — which is the
// whole job here: on the queue screen it has to say whose work this is at a glance, beside rows
// that deliberately say nothing else about it.

export function Avatar({
  username,
  name,
  hasImage,
  size = 24,
  title,
}: {
  username: string;
  name?: string | null;
  hasImage?: boolean;
  size?: number;
  title?: string;
}) {
  const label = name?.trim() || username;
  const shared = "shrink-0 rounded-full object-cover";
  if (hasImage) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={`/api/users/${encodeURIComponent(username)}/avatar`}
        alt=""
        aria-hidden
        title={title ?? label}
        width={size}
        height={size}
        className={`${shared} border border-[var(--border)]`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      title={title ?? label}
      aria-hidden
      className={`${shared} inline-flex items-center justify-center border border-[var(--border)] bg-[var(--elevated)] font-medium uppercase text-[var(--text-secondary)]`}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.42)) }}
    >
      {initials(label)}
    </span>
  );
}

/**
 * One or two characters.
 *
 * An account made from a tailnet identity is named after it, so the label is often an email
 * address — and splitting the whole of one gives the initials of the domain. Everything from
 * the @ is dropped first. Japanese names have no spaces, so there the first character has to do
 * the work on its own.
 */
function initials(label: string): string {
  const local = label.split("@")[0] || label;
  const parts = local.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] ?? "") + (parts[1][0] ?? "");
  const one = parts[0] ?? local;
  return one.slice(0, /^[\x20-\x7e]+$/.test(one) ? 2 : 1);
}
