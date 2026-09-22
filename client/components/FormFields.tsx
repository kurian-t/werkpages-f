import React, { useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { FormSubjectCard } from "@/components/RatingFormParts";

/**
 * The field primitives every contribution form uses.
 *
 * <p>Form-agnostic on purpose. These started inside the manager form, which meant the interview and
 * workplace forms went on writing their own text boxes with their own behaviour — so the same
 * question looked and worked differently depending on which page you were on, and a bug found in
 * one field had to be found again in the others.
 *
 * <p>There is one text input and one collapse-with-a-pencil shell. Callers supply the label, the
 * example and the length. Nothing else.
 */

/**
 * The text input every field on these forms uses.
 *
 * <p>One implementation, so a bug found in one field is fixed in all of them. Three call sites used
 * to repeat the same forty characters of Tailwind and the same handler shape, which is how the
 * title and last-name fields ended up with behaviour nobody had deliberately given them.
 *
 * <p>Callers supply what genuinely differs — the name, the example, the length — and nothing else.
 */
export function FormTextInput({
  id,
  name,
  value,
  onChange,
  placeholder,
  ariaLabel,
  maxLength = 100,
  invalid = false,
  readOnly = false,
}: {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** When the visible label sits elsewhere, as it does inside a two-column name row. */
  ariaLabel?: string;
  maxLength?: number;
  invalid?: boolean;
  /**
   * Shown, not editable — for a value the form states rather than asks about, such as the manager
   * a review is of.
   *
   * <p>Same size and weight class as an editable one, set in the muted colour and semibold: a
   * value the form is stating, not an empty box waiting to be filled. The padlock beside it is
   * what says why - the colour alone would only look disabled.
   */
  readOnly?: boolean;
}) {
  return (
    <input
      type="text"
      id={id}
      name={name}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      aria-readonly={readOnly || undefined}
      readOnly={readOnly}
      tabIndex={readOnly ? -1 : undefined}
      maxLength={maxLength}
      autoComplete="off"
      className={`w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none ${
        readOnly ? "text-muted-foreground" : "text-foreground"
      } ${
        /*
          pointer-events-none as well as readOnly: a read-only input still takes focus on a click
          and shows a caret, so it looked editable right up until you typed and nothing happened.
          There is nothing to put a cursor into here - the value is stated, not asked for.
        */
        readOnly ? "pointer-events-none cursor-default font-semibold" : "focus:ring-2 focus:ring-[#2e0562]"
      } ${invalid ? "border-red-500" : "border-border"}`}
    />
  );
}

// ── The collapse-with-a-pencil shell ──────────────────────────────────────────

/**
 * A field that shows its answer and opens on a pencil.
 *
 * <p>Three states, and which one applies is decided by the data rather than by the caller:
 *
 * <ul>
 *   <li><b>Locked</b> — a read-only line with no control at all. Only the name, and only when
 *       reviewing.</li>
 *   <li><b>Has a value</b>, a read-only line with a pencil; <em>Done</em> collapses it back.</li>
 *   <li><b>Empty</b> — an ordinary input. There is nothing to collapse, and hiding an empty
 *       required field behind a pencil is how a form ends up with a step somebody cannot
 *       complete.</li>
 * </ul>
 */
export function CollapsibleField({
  id,
  label,
  required = false,
  display,
  value,
  locked = false,
  editing,
  onEditStart,
  onEditDone,
  onRestore,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  /** The answer as one line, for the collapsed summary. Empty means nothing to collapse. */
  display: string;
  /**
   * What Cancel puts back, when that is not the same as what is shown.
   *
   * <p>A select shows "2-4 weeks" and holds "2_4_weeks"; restoring the label would write a value
   * the option list does not contain. Text fields leave this out — for them the two are the same.
   */
  value?: string;
  locked?: boolean;
  editing: boolean;
  onEditStart: () => void;
  onEditDone: () => void;
  /** Puts back what the field held when it was opened. Omit where nothing can be restored. */
  onRestore?: (previous: string) => void;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  /** The live control, rendered only while the field is open. */
  children: React.ReactNode;
}) {
  const hasValue = display.trim().length > 0;

  /*
    A field that opened because it was empty stays open until Done, even once it has a value.

    Deriving `open` from `hasValue` alone looks right and is wrong the moment somebody types: the
    first character makes the field non-empty, which collapses it, which takes the focus and the
    rest of the word with it. CompanyField hit exactly this - "typing does not turn the field into
    a card mid-word" is a regression test that exists because of it - and generalising the pattern
    generalised the bug until this flag was added.
  */
  const [autoOpen, setAutoOpen] = useState(!hasValue);
  /*
    Whether the person is actually in this field.

    It decides what a value arriving means. Typing into an empty field must keep it open - that is
    the caret-losing bug this flag exists for. But a value arriving while the field is NOT focused
    came from somewhere else: an edit form loading its answers a moment after it rendered. Those
    should collapse to their summary like any other answered field, and without this they stayed
    open as bare inputs, so opening an experience to fix one line showed every field unfolded.
  */
  const hasFocus = useRef(false);
  useEffect(() => {
    if (!hasValue) { setAutoOpen(true); return; }
    if (!hasFocus.current) setAutoOpen(false);
  }, [hasValue]);

  const open = !locked && (editing || autoOpen);

  /*
    What the field held when it was opened, so Cancel can put it back.

    Without this there was no way to tell "I want this empty" from "I changed my mind": clearing a
    field and clicking away looked as though the old value had restored itself. Done keeps whatever
    is on screen, including nothing. Cancel undoes the edit.
  */
  const restorable = value ?? display;
  const snapshot = useRef<string | null>(null);
  useEffect(() => { if (open && snapshot.current === null) snapshot.current = restorable; }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => { snapshot.current = null; setAutoOpen(false); onEditDone(); };
  const cancel = () => {
    const previous = snapshot.current ?? "";
    snapshot.current = null;
    setAutoOpen(false);
    onRestore?.(previous);
    onEditDone();
  };

  return (
    <div
      onFocusCapture={() => { hasFocus.current = true; }}
      onBlurCapture={() => { hasFocus.current = false; }}
    >
      <label htmlFor={id} className="mb-2 block text-sm font-semibold text-foreground">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {/*
        The same card the company field uses, not a lookalike. Two implementations of "collapsed
        summary with an Edit control" on one form is how the company field and the review's role
        card ended up looking like different products while asking the same kind of question.
      */}
      <FormSubjectCard
        layout="inline"
        name={display}
        nameTestId={`${id}-value`}
        editing={open}
        onEditStart={locked ? undefined : onEditStart}
        /*
          No Done while the field is still empty: there is nothing to collapse back to, and a
          control that would show a blank summary is worse than no control.

          This is a prop, NOT a second branch. An earlier version rendered an empty field as a bare
          input and a filled one inside the card, which meant the first keystroke swapped one tree
          for another - React unmounted the input, mounted a new one, and the caret vanished
          mid-word. One tree, always; only the props change.
        */
        onEditDone={locked || !hasValue ? undefined : close}
        // Only offered when the caller can actually put a value back, and only when the field has
        // in fact been changed - a Cancel that would do nothing is noise.
        onEditCancel={locked || !onRestore || snapshot.current === null || snapshot.current === restorable
          ? undefined : cancel}
        editLabel={`Edit ${label.toLowerCase()} details`}
        doneLabel={`Done editing ${label.toLowerCase()}`}
        cancelLabel={`Cancel editing ${label.toLowerCase()}`}
        action={locked ? (
          /*
            Says why there is no pencil. A row that simply lacks the control everything around it
            has reads as an oversight; a lock says it is deliberate - you are rating a specific
            person, and which person that is is not something a review gets to change.
          */
          <span
            data-testid={`${id}-locked`}
            className="mt-0.5 flex flex-shrink-0 items-center gap-1 text-xs text-muted-foreground"
            title="The manager cannot be changed from inside a opinion"
          >
            <Lock size={12} aria-hidden="true" />
            Locked
          </span>
        ) : undefined}
      >
        {children}
      </FormSubjectCard>
      {error}
      {hint}
    </div>
  );
}

