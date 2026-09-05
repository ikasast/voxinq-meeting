import Link from "next/link";
import { type DayCell, WEEKDAYS, type MonthRef, buildGrid, monthLabel } from "@/lib/calendar-month";

// A month over the meeting list.
//
// The list answers "what happened recently"; this answers "what happened on the 18th", which
// is how people ask about meetings they half-remember. Every day is selectable, including empty
// ones — an empty day is not a dead end, it is where a meeting gets booked.

export function MeetingCalendar({
  month,
  counts,
  selected,
  today,
  hrefForMonth,
  hrefForDay,
}: {
  month: MonthRef;
  /** "2026-09-18" -> how many meetings that day. Absent means none. */
  counts: Map<string, number>;
  selected: string | null;
  today: string;
  hrefForMonth: (key: string) => string;
  hrefForDay: (key: string | null) => string;
}) {
  const weeks = buildGrid(month);
  const step = (delta: number) => {
    const d = new Date(month.year, month.month - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const todayMonth = `${today.slice(0, 7)}`;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
      <div className="flex items-center gap-1 px-1 pb-1">
        <Link
          href={hrefForMonth(step(-1))}
          aria-label="Previous month"
          className="rounded px-1.5 py-0.5 text-sm text-[var(--text-muted)] hover:bg-[var(--elevated)] hover:text-[var(--foreground)]"
        >
          ‹
        </Link>
        <span className="text-sm font-medium text-[var(--text-strong)]">{monthLabel(month)}</span>
        <Link
          href={hrefForMonth(step(1))}
          aria-label="Next month"
          className="rounded px-1.5 py-0.5 text-sm text-[var(--text-muted)] hover:bg-[var(--elevated)] hover:text-[var(--foreground)]"
        >
          ›
        </Link>
        {todayMonth !== `${month.year}-${String(month.month).padStart(2, "0")}` ? (
          <Link
            href={hrefForMonth(todayMonth)}
            className="ml-auto rounded px-1.5 py-0.5 text-xs text-[var(--text-muted)] hover:text-[var(--foreground)]"
          >
            Today
          </Link>
        ) : null}
      </div>

      <table className="w-full table-fixed border-collapse">
        <thead>
          <tr>
            {WEEKDAYS.map((d) => (
              <th
                key={d}
                scope="col"
                className="pb-1 text-center text-[10px] font-normal text-[var(--text-muted)]"
              >
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, i) => (
            <tr key={i}>
              {week.map((cell, j) => (
                <td key={j} className="p-0 text-center align-top">
                  <Cell
                    cell={cell}
                    count={cell ? (counts.get(cell.key) ?? 0) : 0}
                    isToday={cell?.key === today}
                    isSelected={cell?.key === selected}
                    hrefForDay={hrefForDay}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({
  cell,
  count,
  isToday,
  isSelected,
  hrefForDay,
}: {
  cell: DayCell;
  count: number;
  isToday: boolean;
  isSelected: boolean;
  hrefForDay: (key: string | null) => string;
}) {
  if (!cell) return <span className="block h-9" aria-hidden />;
  // Selecting the day already selected clears it, so the same cell is both the way in and the
  // way out — no hunting for an × after picking the wrong day.
  const href = hrefForDay(isSelected ? null : cell.key);
  const dots = Math.min(count, 3);
  return (
    <Link
      href={href}
      aria-label={`${cell.key}, ${count} meeting${count === 1 ? "" : "s"}`}
      aria-current={isSelected ? "date" : undefined}
      // Fills its column rather than sitting at a fixed width: on a phone that is a 44px
      // target, and in the narrowest desktop column it shrinks to fit instead of overflowing.
      className={`mx-auto flex h-9 w-full max-w-[2.75rem] flex-col items-center justify-center rounded-md text-xs tabular-nums transition ${
        isSelected
          ? "bg-[var(--accent)] text-[var(--accent-contrast)]"
          : isToday
            ? "border border-[var(--accent)] text-[var(--text-strong)] hover:bg-[var(--elevated)]"
            : count > 0
              ? "font-medium text-[var(--text-strong)] hover:bg-[var(--elevated)]"
              : "text-[var(--text-muted)] hover:bg-[var(--elevated)]"
      }`}
    >
      <span>{cell.day}</span>
      {/* Three at most: past that the row is a smear, and the exact number is one click away. */}
      <span className="flex h-1.5 items-center gap-[2px]" aria-hidden>
        {Array.from({ length: dots }, (_, i) => (
          <span
            key={i}
            className={`block h-1 w-1 rounded-full ${
              isSelected ? "bg-[var(--accent-contrast)]" : "bg-[var(--accent)]"
            }`}
          />
        ))}
      </span>
    </Link>
  );
}
