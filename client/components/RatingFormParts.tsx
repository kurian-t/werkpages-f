import React from "react";
import { Edit2 } from "lucide-react";
import { RatingInput } from "@/components/RatingInput";

/**
 * The pieces every rating form opens with.
 *
 * The manager review had all of this and the two newer forms had none of it: a title and a line
 * saying what is being asked, a card naming the thing being rated, a panel setting out the rules,
 * and rating rows laid out label-left / stars-right. Rebuilding them per form is how three forms
 * asking the same kind of question ended up looking like three products, so they live here and
 * each form supplies only its own words.
 */

/**
 * Who the submission will appear as.
 *
 * Sits at the top of the form rather than on a step of its own: it is the first thing somebody
 * wants settled before they start answering, and asking it last meant the name arrived after the
 * work was already done.
 */
export function AnonymityCard({
  what,
  name,
  onRegenerate,
}: {
  /** "review", "rating", "experience" - each form names its own thing. */
  what: string;
  name: string;
  onRegenerate: () => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/20 px-4 py-4">
      <p className="text-sm font-semibold text-foreground">🔒 Posting Anonymously</p>
      <div>
        <p className="mb-1 text-xs text-muted-foreground">Your {what} will appear as:</p>
        <div className="flex items-center gap-3">
          <p className="font-medium text-foreground">{name}</p>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); onRegenerate(); }}
            className="text-xs text-primary hover:underline"
          >
            Regenerate
          </button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        This name is randomly generated and cannot be linked back to you.
      </p>
    </div>
  );
}

/** Title and the one line under it. */
export function FormIntro({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div>
      <h2 className="text-[22px] font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{blurb}</p>
    </div>
  );
}

/**
 * What is being rated, named before anything is asked about it.
 *
 * A form that opens straight into ten star rows leaves the reader carrying the subject in their
 * head; the manager form has always shown it, and the other two were asking people to remember
 * which company they had clicked through from.
 */
export function FormSubjectCard({
  name,
  detail,
  logo,
  editing = false,
  onEditStart,
  onEditDone,
  children,
  layout = "stacked",
}: {
  name: string;
  detail?: string;
  /** Logo or avatar, rendered by the caller so each form keeps its own image component. */
  logo?: React.ReactNode;
  /** True while the fields are showing instead of the summary. */
  editing?: boolean;
  /** Omitted where nothing here can change. */
  onEditStart?: () => void;
  onEditDone?: () => void;
  /** The fields, shown in place of the summary while editing. */
  children?: React.ReactNode;
  /**
   * "inline" puts the logo and the name on one row, for a card sitting in a form field's slot
   * rather than spanning the form. "stacked" is the manager review's own full-width shape.
   */
  layout?: "stacked" | "inline";
}) {
  return (
    <div className={`rounded-lg border border-border bg-muted/20 ${
      layout === "inline" ? "px-3 py-2" : "px-4 py-4"
    }`}>
      {/*
        Edits happen in place: the summary is replaced by the fields, and "Done editing" puts it
        back. Not a field revealed underneath the summary - that leaves the old value sitting above
        the new one, and the manager review has never done it that way.
      */}
      {!editing ? (
        <div className="flex items-center justify-between gap-3">
          {layout === "inline" ? (
            /* Logo then name on one row, the way a company reads everywhere else on the site. */
            <div className="flex min-w-0 items-center gap-2">
              {logo}
              <span className="truncate text-sm font-semibold text-foreground">{name}</span>
            </div>
          ) : (
          <div className="min-w-0">
            <p className="text-base font-semibold text-foreground">{name}</p>
            {detail && <p className="text-sm text-muted-foreground">{detail}</p>}
            {logo && <div className="mt-2 flex items-center gap-2">{logo}</div>}
          </div>
          )}
          {onEditStart && (
            <button
              type="button"
              onClick={onEditStart}
              className="mt-0.5 flex flex-shrink-0 items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <Edit2 size={12} aria-hidden="true" />
              Edit details
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {children}
          {onEditDone && (
            <button
              type="button"
              onClick={onEditDone}
              className="text-xs text-primary hover:underline"
            >
              Done editing
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The rules, stated before somebody spends five minutes and finds out.
 *
 * Deliberately quiet - muted panel, small type. It is there to be read once by whoever wonders
 * what happens to what they write, not to compete with the thing being asked.
 */
export function AboutPanel({
  title,
  summary,
  points,
}: {
  title: string;
  summary: string;
  points: string[];
}) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/20 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      <p className="text-xs leading-relaxed text-muted-foreground">{summary}</p>
      <ul className="space-y-1">
        {points.map((item) => (
          <li key={item} className="flex items-start gap-2 text-xs text-muted-foreground">
            <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-muted-foreground/50" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * One rating: its name on the left, its stars on the right, a rule beneath.
 *
 * Not label-above-stars. With ten of them stacked, the manager form's row keeps every set of stars
 * in the same column so the eye runs straight down them, and the dividers say where one question
 * ends. The other two forms stacked label over stars and read as ten separate blocks.
 */
export function RatingRow({
  label,
  hint,
  value,
  onChange,
  required = true,
}: {
  label: string;
  hint?: string;
  value: number | null;
  onChange: (value: number) => void;
  required?: boolean;
}) {
  return (
    <div className="border-b border-border pb-4 last:border-b-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <label className="block text-sm font-semibold text-foreground">{label}</label>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className="flex flex-shrink-0 items-center gap-3">
          <RatingInput value={value} onChange={onChange} ariaLabelPrefix={label} />
          {required && value == null && (
            <span className="text-xs font-medium text-destructive">Required</span>
          )}
        </div>
      </div>
    </div>
  );
}
