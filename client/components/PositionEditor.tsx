import { useState } from "react";
import { Pencil, Trash2, Check, AlertTriangle } from "lucide-react";
import { CollapsibleField, FormTextInput, RequiredMark } from "@/components/FormFields";
import { CompanyField } from "@/components/CompanyField";
import { LocationField } from "@/components/LocationField";
import { MonthYear, recentYears } from "@/components/MonthYear";
import { isLocationSet, formatLocation } from "@/lib/location";
import {
  PositionDraft, Employment, STATUS_CHOICES, ContributorStatus,
  describedIntent, changedFields, positionProblem, isRemovable,
} from "@/lib/careerEditor";

/**
 * One position in the career editor: a compact line that opens into its fields.
 *
 * <p><b>Every field here is a shared one.</b> The title uses the same collapse-with-a-pencil shell
 * as the add-manager form, the company uses CompanyField, the location uses LocationField and the
 * dates use MonthYear. A field asked the same way on two pages has to behave the same way on both,
 * and the only way to guarantee that is for there to be one of it.
 */
export function PositionEditor({
  draft,
  original,
  open,
  onOpen,
  onClose,
  onChange,
  onRemove,
  index,
}: {
  draft: PositionDraft;
  /** What is recorded today, absent for a position being added. */
  original: Employment | undefined;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onChange: (next: PositionDraft) => void;
  /**
   * Removes this position from the submission.
   *
   * <p>Only ever passed for an addition nobody has submitted yet. An accepted employment is not
   * deletable through the public form: it has ratings and claims attached, and removing it is a
   * moderation decision, not a form control. Saying a role ended is what this form offers instead.
   */
  onRemove?: () => void;
  index: number;
}) {
  const [locationOpen, setLocationOpen] = useState(false);
  const [titleOpen, setTitleOpen] = useState(false);

  const set = (patch: Partial<PositionDraft>) => onChange({ ...draft, ...patch });
  // What the card SAYS it is doing; the wire intent can differ for the manager-record
  // position, which is sent as an addition because there is no row to name yet.
  const intent = describedIntent(draft, original);
  const changes = changedFields(draft, original);
  const problem = positionProblem(draft, original);
  const isNew = isRemovable(draft);

  const period = (() => {
    if (!draft.startDate && !draft.endDate) return "Dates not stated";
    const from = draft.startDate || "unknown";
    const to = draft.status === "ongoing" ? "now" : (draft.endDate || "unknown");
    return `${from} to ${to}`;
  })();

  if (!open) {
    return (
      <div
        data-testid={`position-card-${index}`}
        data-intent={intent}
        data-changed={changes.length > 0 ? "yes" : "no"}
        className={`rounded-lg border p-3 transition-colors ${
          changes.length > 0 ? "border-primary bg-primary/5" : "border-border"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {draft.title || "Untitled position"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {draft.company || "No company"} · {period}
              {draft.datesInferred && (
                <span className="ml-1 italic">(dates estimated)</span>
              )}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {STATUS_CHOICES.find(c => c.value === draft.status)?.label}
              {isLocationSet(draft.location) ? ` · ${formatLocation(draft.location)}` : ""}
            </p>
            {changes.length > 0 && (
              <p className="mt-1 text-xs font-medium text-primary">
                {isNew ? "New position" : `${changes.length} change${changes.length === 1 ? "" : "s"}`}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onOpen}
              aria-label={`Edit ${draft.title || "position"}`}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent/10 hover:text-foreground"
            >
              <Pencil size={13} aria-hidden="true" /> Edit
            </button>
            {onRemove && (
              <button
                type="button"
                onClick={onRemove}
                aria-label={`Remove ${draft.title || "position"}`}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 size={13} aria-hidden="true" /> Remove
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid={`position-editor-${index}`}
      data-intent={intent}
      className="rounded-lg border border-primary bg-background p-4"
    >
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">
          {isNew ? "New position" : "Edit this position"}
        </p>
        <div className="flex items-center gap-1">
        {/*
          REMOVE IS AVAILABLE WHILE THE POSITION IS OPEN, not only once it collapses.

          Done editing is disabled until the position is valid, so an addition somebody started and
          thought better of could neither be completed nor collapsed - and Remove only existed on
          the collapsed card. That left a half-filled position wedged open with no way out of it
          except abandoning the whole submission.
        */}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={isNew ? "Remove this new position" : "Remove this position"}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 size={13} aria-hidden="true" /> Remove
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          disabled={Boolean(problem)}
          /* Named apart from the "Done editing title" that belongs to a field INSIDE this card.
             Two controls reading simply "Done editing" is ambiguous to a screen reader and to
             anybody automating the form. */
          aria-label={isNew ? "Done editing new position" : "Done editing this position"}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-40"
        >
          <Check size={13} aria-hidden="true" /> Done editing
        </button>
        </div>
      </div>

      <div className="space-y-4">
        <CollapsibleField
          id={`position-title-${index}`}
          label="Title"
          required
          display={draft.title}
          editing={titleOpen}
          onEditStart={() => setTitleOpen(true)}
          onEditDone={() => setTitleOpen(false)}
        >
          <FormTextInput
            /* The id CollapsibleField's <label htmlFor> names. A different one here leaves the
               label pointing at nothing, so the field has no accessible name at all. */
            id={`position-title-${index}`}
            value={draft.title}
            onChange={v => set({ title: v })}
            placeholder="e.g. Engineering Manager"
            maxLength={100}
            invalid={!draft.title.trim()}
          />
        </CollapsibleField>

        {/*
          The company, through the shared field, which collapses itself.

          It renders its own answered-value row with its own pencil, so this does NOT wrap it in a
          second collapse: that is the one-field-one-implementation rule, and breaking it here
          produced a card with two layers of chrome where the inner one stayed shut.

          Changing the employer does not edit this employment, it replaces it, because the employer
          is what ratings are attributed through. The notice below says so in the card, before
          anybody commits.
        */}
        <CompanyField
          value={draft.company}
          onChange={v => set({ company: v, companyId: undefined })}
          onCompanyIdChange={id => set({ companyId: id })}
          onSuggestionPicked={sug => set({ company: sug.name, companyId: sug.id })}
          required
        />

        {intent === "supersede" && (
          <div
            data-testid={`supersede-notice-${index}`}
            className="flex gap-2 rounded-lg border border-border bg-accent/5 p-3"
          >
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="text-xs text-muted-foreground">
              Changing the employer replaces this position rather than editing it, because ratings
              are attributed through the employer. The existing position stays in the history and
              nothing is applied until a moderator approves it.
              {original && original.claimCount > 0 && (
                <>
                  {" "}
                  <span className="font-semibold text-foreground">
                    {original.claimCount} {original.claimCount === 1 ? "person's" : "people's"} rating
                    {original.claimCount === 1 ? "" : "s"} would move with it.
                  </span>
                </>
              )}
            </p>
          </div>
        )}

        {/*
          ONE label, from the field itself.

          The old form put its own "Location" label above this control, which renders its own, so
          the question appeared twice. The control owns the label.
        */}
        <LocationField
          value={draft.location}
          onChange={next => set({ location: next })}
          companyId={draft.companyId ?? original?.companyId ?? null}
          companyName={draft.company}
          editing={locationOpen}
          onEditStart={() => setLocationOpen(true)}
          onEditDone={() => setLocationOpen(false)}
          id={`position-location-${index}`}
        />

        <fieldset>
          <legend className="mb-2 block text-sm font-semibold text-foreground">
            Employment status <RequiredMark />
          </legend>
          <div className="space-y-2">
            {STATUS_CHOICES.map(choice => (
              <label
                key={choice.value}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                  draft.status === choice.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-accent/5"
                }`}
              >
                <input
                  type="radio"
                  name={`position-status-${index}`}
                  value={choice.value}
                  checked={draft.status === choice.value}
                  onChange={() => set({
                    status: choice.value as ContributorStatus,
                    // A role still held has no end date. Clearing it here keeps the form from
                    // holding a contradiction the server would have to refuse.
                    endDate: choice.value === "ongoing" ? "" : draft.endDate,
                  })}
                  className="h-4 w-4"
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">{choice.label}</span>
                  <span className="block text-xs text-muted-foreground">{choice.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <p className="mb-2 block text-sm font-semibold text-foreground">
            Dates <span className="text-xs font-normal text-muted-foreground">(optional)</span>
          </p>
          {/*
            Left empty when nobody knows, and stored that way. The employment model has somewhere
            to say the period is unknown, so there is no reason to substitute today's date and
            every reason not to: a guessed start date is indistinguishable from a stated one once
            it is in the database.
          */}
          {/*
            LABELLED ON SCREEN, not only to a screen reader.

            MonthYear takes a `label` and uses it as the aria-label on its two selects, so visually
            these were two identical Month/Year pairs stacked on top of each other with nothing
            saying which one was the start. Anybody sighted had to guess, and guessing wrong puts a
            start date in the end field - which the validator then rejects for reasons that look
            arbitrary.
          */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="w-12 shrink-0 text-sm font-medium text-muted-foreground"
                    aria-hidden="true">From</span>
              <MonthYear
                label="From"
                value={draft.startDate}
                onChange={v => set({ startDate: v })}
                years={recentYears()}
              />
            </div>
            {draft.status !== "ongoing" && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="w-12 shrink-0 text-sm font-medium text-muted-foreground"
                      aria-hidden="true">To</span>
                <MonthYear
                  label="To"
                  value={draft.endDate}
                  onChange={v => set({ endDate: v })}
                  years={recentYears()}
                />
              </div>
            )}
            {draft.datesInferred && (
              /*
                WHERE THESE DATES CAME FROM.

                They were not recorded against this employment: they are the span of the ratings,
                each of which asked when that person worked with this manager. That makes them a
                bound rather than a fact, and an unlabelled guess in a date field is indistinguishable
                from something somebody stated - so it says which it is, and asks to be corrected.
              */
              <p data-testid="dates-inferred-note" className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Estimated from ratings.</span>{" "}
                Nobody has recorded these dates, so they are worked out from when people said they
                worked with this manager. Please correct them if you know better.
              </p>
            )}
          </div>
        </div>

        {problem && (
          <p data-testid={`position-problem-${index}`} className="text-xs font-medium text-destructive">
            {problem}
          </p>
        )}
      </div>
    </div>
  );
}
