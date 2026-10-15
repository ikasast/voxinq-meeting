"use client";

// An on/off switch: a track with a knob that slides, for settings that take effect as they are
// flipped. A checkbox reads as "tick to agree"; this reads as "this is on".

export function Switch({
  on,
  label,
  disabled,
  onChange,
}: {
  on: boolean;
  /** What it switches, for a screen reader: the switch itself says only on or off. */
  label: string;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none ${
        on
          ? "border-transparent bg-[var(--accent-solid)]"
          : "border-[var(--border-strong)] bg-[color-mix(in_srgb,var(--text-muted)_22%,transparent)]"
      }`}
    >
      <span
        aria-hidden
        className={`inline-block h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-transform duration-200 motion-reduce:transition-none ${
          on ? "translate-x-[21px]" : "translate-x-[2px]"
        }`}
      />
    </button>
  );
}
