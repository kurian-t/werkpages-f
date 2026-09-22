import { useState } from "react";
import { CompanyLogoImg } from "@/components/ManagerCard";
import { CompanyAutocomplete } from "@/components/CompanyAutocomplete";
import { FormSubjectCard } from "@/components/RatingFormParts";

/**
 * Choosing a company, wherever a form asks for one.
 *
 * This shape was hand-rolled on five forms: a card showing the logo and the name with an "Edit
 * details" pencil, swapping in place for a picker with "Done editing" underneath. Five copies of
 * one interaction, and every one of them had to be fixed separately - the logo missing from a
 * pre-filled field, the card unmounting when you backspaced to a single character, picking a
 * suggestion closing the editor before you could look at it. Each was reported as a bug on one
 * form while the identical bug sat in the other four.
 *
 * So the interaction lives here once. A caller supplies the value and is told when it changes;
 * everything about how choosing a company looks and behaves is this component's business.
 *
 * The rules it owns, each of which was a bug at some point:
 *
 *  - the editing state is internal, so no caller can forget to close it or close it too eagerly;
 *  - the card stays mounted for the whole edit regardless of what the value is mid-typing, so the
 *    control never changes shape under the cursor;
 *  - picking a suggestion fills the field and leaves the editor open, because choosing and
 *    finishing are separate decisions;
 *  - the value is committed whether or not "Done editing" is clicked - the button tidies the view,
 *    it is not a save.
 */
export function CompanyField({
  value,
  onChange,
  onCompanyIdChange,
  onSuggestionSelect,
  onSuggestionPicked,
  logoUrl,
  logoUrlFor,
  label = "Company",
  required = true,
  placeholder = "e.g. Acme Corp",
  hint,
  inputClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  onCompanyIdChange?: (id: number | undefined) => void;
  onSuggestionSelect?: (name: string, logoUrl: string | undefined) => void;
  onSuggestionPicked?: (s: { id?: number; name: string; slug?: string; logoUrl?: string }) => void;
  /** A logo already known for this company, e.g. one stored on the manager row. */
  logoUrl?: string;
  /**
   * The company name {@link logoUrl} belongs to.
   *
   * A caller's stored logo is for the company it loaded. Once the reader types a different one the
   * two no longer match, and passing it through put Google's mark next to the word "Facebook".
   * When the value has moved on the logo is resolved from the name instead.
   */
  logoUrlFor?: string;
  label?: string | null;
  required?: boolean;
  placeholder?: string;
  /** Rendered under the field - a length warning, a duplicate-role notice. */
  hint?: React.ReactNode;
  inputClassName?: string;
}) {
  /*
    The label has to name the input, not merely sit above it.

    Without htmlFor/id a screen reader announces an unlabelled text box, and clicking the label
    focuses nothing - the same defect this codebase has had to fix on the account modal and the
    career-role selector. Fixing it here fixes it for every form that asks for a company.
  */
  const fieldId = "company-field";
  const [editing, setEditing] = useState(false);
  /*
    True while the reader is part-way through typing a name into the bare picker.

    Without it, the second keystroke in an empty field pushed the value past the length threshold
    below, the field re-rendered as a card, and because no edit was in progress the card showed its
    *summary* - so the input the person was typing into vanished mid-word and took the caret with
    it. It looked like a company being auto-selected.

    Cleared by picking a suggestion, which is what settles a value.
  */
  const [typing, setTyping] = useState(false);

  const settled = value.trim().length > 1;
  /*
    Presented as a card once there is a company to show, and while an edit is in progress.

    Two guards, each for a bug this caused.

    `editing` keeps the card up for the whole edit: keyed on length alone, backspacing to one
    character dropped below the threshold and unmounted the card mid-edit, taking "Done editing"
    with it.

    `!typing` keeps it *down* while somebody is filling an empty field: the second keystroke would
    otherwise flip a bare input into a summary card and swallow the caret.

    Length decides how a settled, idle field presents. It decides nothing while a person is busy.
  */
  const asCard = editing || (settled && !typing);

  /*
    Whether the supplied logo is still about the company on screen. Without a name to compare
    against, a supplied logo is assumed to be for the initial value and dropped as soon as the
    reader changes it.
  */
  const norm = (v?: string) => (v ?? "").trim().toLowerCase();
  const logoBelongsToValue =
    !!logoUrl && (logoUrlFor ? norm(logoUrlFor) === norm(value) : true);

  const picker = (
    <CompanyAutocomplete
      value={value}
      onChange={(v) => { setTyping(true); onChange(v); }}
      onCompanyIdChange={onCompanyIdChange}
      onSuggestionSelect={(name, logo) => { setTyping(false); onSuggestionSelect?.(name, logo); }}
      onSuggestionPicked={(sug) => { setTyping(false); onSuggestionPicked?.(sug); }}
      placeholder={placeholder}
      id={fieldId}
      name="company"
      className={
        inputClassName ??
        "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562]"
      }
    />
  );

  return (
    /* Named so a test can scope to this field: other cards on the same form - the country picker,
       for one - also render an "Edit details" control. */
    <div data-testid="company-field">
      {label && (
        <label htmlFor={fieldId} className="mb-2 block text-sm font-semibold text-foreground">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      {asCard ? (
        <FormSubjectCard
          layout="inline"
          name={value || "Choose a company"}
          logo={
            <CompanyLogoImg
              /* Keyed on the name so a changed company re-resolves rather than keeping the
                 previous company's mark. */
              key={value}
              company={value}
              logoUrl={logoBelongsToValue ? logoUrl : undefined}
              sizeClass="h-6 w-6 rounded"
              eager
            />
          }
          editing={editing}
          onEditStart={() => setEditing(true)}
          onEditDone={() => { setTyping(false); setEditing(false); }}
          /* Named for its field, like every other collapsible field on these forms. Several can be
             open at once, and controls that all announce themselves as "Edit details" tell a
             screen-reader user nothing about which one they are on. */
          editLabel="Edit company details"
          doneLabel="Done editing company"
        >
          {picker}
        </FormSubjectCard>
      ) : (
        picker
      )}

      {hint}
    </div>
  );
}
