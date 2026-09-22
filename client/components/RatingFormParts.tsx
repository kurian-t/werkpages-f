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
  onEditCancel,
  editLabel,
  doneLabel,
  cancelLabel,
  action,
  nameTestId,
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
  /** Restores what the field held when it was opened. Omitted where there is nothing to restore. */
  onEditCancel?: () => void;
  /**
   * Accessible names for the two controls.
   *
   * <p>A form has several of these cards open at once, and buttons that all announce themselves as
   * "Edit details" tell a screen-reader user nothing about which field they are on - and give a
   * test no way to name one. The visible text stays as written, so the accessible name still
   * contains what is on the control.
   */
  editLabel?: string;
  doneLabel?: string;
  cancelLabel?: string;
  /** Shown where the edit control would be, for a card that cannot be edited at all. */
  action?: React.ReactNode;
  /** Scopes a test to the value itself rather than the card around it. */
  nameTestId?: string;
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
              <span data-testid={nameTestId} className="truncate text-sm font-semibold text-foreground">{name}</span>
            </div>
          ) : (
          <div className="min-w-0">
            <p data-testid={nameTestId} className="text-base font-semibold text-foreground">{name}</p>
            {detail && <p className="text-sm text-muted-foreground">{detail}</p>}
            {logo && <div className="mt-2 flex items-center gap-2">{logo}</div>}
          </div>
          )}
          {onEditStart ? (
            <button
              type="button"
              onClick={onEditStart}
              aria-label={editLabel}
              className="mt-0.5 flex flex-shrink-0 items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <Edit2 size={12} aria-hidden="true" />
              Edit details
            </button>
          ) : action}
        </div>
      ) : (
        <div className="space-y-3">
          {children}
          {onEditDone && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onEditDone}
                aria-label={doneLabel}
                className="text-xs text-primary hover:underline"
              >
                Done editing
              </button>
              {/*
                Cancel puts back what was there when the field was opened.

                Without it, clearing a field and clicking away looked like the old value had been
                restored on its own - the company field did exactly that, and there was no way to
                tell "I want this empty" from "I changed my mind". Done keeps what is on screen,
                including nothing; Cancel undoes the edit.
              */}
              {onEditCancel && (
                <button
                  type="button"
                  onClick={onEditCancel}
                  aria-label={cancelLabel}
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  Cancel
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


/**
 * The first-hand-experience attestation, asked before any rating is stored.
 *
 * <p>Every rating form asks it, because every rating form publishes somebody's account of a real
 * place or person. The manager form had it and the workplace and interview forms did not, so the
 * same claim was made under three different standards — and the two without it published ratings
 * nobody had confirmed they were entitled to make.
 *
 * <p>Each form supplies its own sentence: what was worked at, rated, or interviewed with is not
 * interchangeable, and a generic wording would be a promise about nothing in particular.
 */
export function AttestationCard({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** The claim being confirmed, in this form's own words. */
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border p-5">
      <label className="flex cursor-pointer items-start gap-3 text-sm text-foreground">
        <input
          type="checkbox"
          name="attestation"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 flex-shrink-0"
        />
        <span>{children}</span>
      </label>
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
