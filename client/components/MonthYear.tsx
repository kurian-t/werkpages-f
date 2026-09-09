import { useEffect, useState } from "react";

/**
 * A month and a year as two selects, reported as "YYYY-MM".
 *
 * Month precision on purpose: nobody remembers the day they started a job, and asking for one
 * invites invention.
 *
 * There were two copies of this, in RateCompany and ProveIt, and both had the same bug. They
 * derived both dropdowns from the combined value and emitted `y && m ? y-m : ""`, so a value like
 * "pick the month, haven't picked the year yet" was unrepresentable: choosing a month first
 * emitted "", the parent stored nothing, and the select snapped straight back to "Month". You
 * could only fill it in by choosing the year first, which nothing on screen told you.
 *
 * The fix is for the component to own the half-made choice. The parent still only ever sees a
 * complete "YYYY-MM" or "", so validation upstream is unchanged.
 */

const MONTHS = ["01","02","03","04","05","06","07","08","09","10","11","12"];
const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const SELECT_CLASS =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground " +
  "focus:outline-none focus:ring-2 focus:ring-[#2e0562]";

export interface MonthYearProps {
  /** "YYYY-MM", or "" when nothing complete has been chosen yet. */
  value: string;
  onChange: (value: string) => void;
  years: string[];
  /** Distinguishes the two selects for screen readers, e.g. "Start" / "End". */
  label: string;
}

export function MonthYear({ value, onChange, years, label }: MonthYearProps) {
  const [year, setYear]   = useState(() => (value ? value.split("-")[0] : ""));
  const [month, setMonth] = useState(() => (value ? value.split("-")[1] : ""));

  // Follow the parent when it sets a complete value from elsewhere, such as a form pre-filled
  // from an existing answer. A cleared value clears both selects.
  useEffect(() => {
    if (!value) { setYear(""); setMonth(""); return; }
    const [y, m] = value.split("-");
    setYear(y ?? "");
    setMonth(m ?? "");
  }, [value]);

  const emit = (y: string, m: string) => {
    setYear(y);
    setMonth(m);
    // Still only a complete pair or nothing, so callers keep the contract they had. The half is
    // held here rather than discarded.
    onChange(y && m ? `${y}-${m}` : "");
  };

  return (
    <span className="flex items-center gap-2">
      <select
        aria-label={`${label} month`}
        value={month}
        onChange={(e) => emit(year, e.target.value)}
        className={SELECT_CLASS}
      >
        <option value="">Month</option>
        {MONTHS.map((m, i) => <option key={m} value={m}>{MONTH_LABELS[i]}</option>)}
      </select>
      <select
        aria-label={`${label} year`}
        value={year}
        onChange={(e) => emit(e.target.value, month)}
        className={SELECT_CLASS}
      >
        <option value="">Year</option>
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
    </span>
  );
}

/** The last 45 years, newest first. Long enough to cover a whole career. */
export function recentYears(count = 45): string[] {
  const current = new Date().getFullYear();
  return Array.from({ length: count }, (_, i) => String(current - i));
}
