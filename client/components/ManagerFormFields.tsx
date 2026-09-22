import React, { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { CompanyField } from "@/components/CompanyField";
import { CollapsibleField, FormTextInput } from "@/components/FormFields";
export { CollapsibleField, FormTextInput } from "@/components/FormFields";
import { LocationField } from "@/components/LocationField";
import { RoleAutocomplete } from "@/components/RoleAutocomplete";
import { LocationValue, formatLocation } from "@/lib/location";

/**
 * The fields that describe a manager, wherever they are asked for.
 *
 * <p>Adding a manager, writing a review about one and editing that review are the same act with
 * different starting values, so they are one form. They were three, written independently, and
 * they drifted exactly as far as you would expect: the add form got role suggestions and a
 * location picker, the review form kept a bare text box and no location at all, and a fix applied
 * to one had to be remembered for the other. Every field lives here now, and each caller supplies
 * only what genuinely differs.
 *
 * <p><b>The one real difference is the name.</b> When adding, the person is supplying it. When
 * rating, they are rating a specific person who already exists, and changing who that is from
 * inside a review is not an edit — it is a different review.
 */

// ── Shared date vocabulary ────────────────────────────────────────────────────

export const MONTHS = [
  { value: "01", label: "Jan" }, { value: "02", label: "Feb" },
  { value: "03", label: "Mar" }, { value: "04", label: "Apr" },
  { value: "05", label: "May" }, { value: "06", label: "Jun" },
  { value: "07", label: "Jul" }, { value: "08", label: "Aug" },
  { value: "09", label: "Sep" }, { value: "10", label: "Oct" },
  { value: "11", label: "Nov" }, { value: "12", label: "Dec" },
];

export const CURRENT_YEAR  = new Date().getFullYear();
export const CURRENT_MONTH = new Date().getMonth() + 1;
export const YEARS = Array.from({ length: 47 }, (_, i) => String(CURRENT_YEAR - i));

export interface MonthYear { month: string; year: string }
export const EMPTY_MONTH_YEAR: MonthYear = { month: "", year: "" };

export const isFilled = (v: MonthYear) => v.month !== "" && v.year !== "";
/** Comparable integer, so two part-dates can be ordered without building a Date. */
export const monthYearValue = (v: MonthYear) =>
  isFilled(v) ? parseInt(v.year) * 100 + parseInt(v.month) : null;
export const toYearMonth = (v: MonthYear) => (isFilled(v) ? `${v.year}-${v.month}` : null);


// ── Which fields are open ─────────────────────────────────────────────────────

/** Every field the shared block can open, so one caller holds one piece of state. */
export type ManagerField = "name" | "title" | "company" | "location";

export interface ManagerDetailsValue {
  firstName: string;
  lastName: string;
  title: string;
  company: string;
  status: "active" | "retired";
  location: LocationValue;
}

// ── The block itself ──────────────────────────────────────────────────────────

export function ManagerIdentityFields({
  value,
  onChange,
  /** Locked when the subject already exists: rating a manager cannot change who they are. */
  lockName,
  open,
  onOpen,
  onClose,
  companyId,
  companyName,
  companyLogoUrl,
  onCompanyIdChange,
  onCompanySuggestionSelect,
  showStatus = true,
  idPrefix = "manager",
  titleError,
  companyHint,
}: {
  value: ManagerDetailsValue;
  onChange: (next: Partial<ManagerDetailsValue>) => void;
  lockName: boolean;
  open: ManagerField | null;
  onOpen: (field: ManagerField) => void;
  onClose: () => void;
  companyId?: number | null;
  companyName?: string;
  companyLogoUrl?: string;
  onCompanyIdChange?: (id: number | undefined) => void;
  onCompanySuggestionSelect?: (name: string, logoUrl: string | undefined) => void;
  /** Retired / active. The review form has no use for it — a reviewer is not restating the
   *  manager's employment status, they are describing a period they already dated. */
  showStatus?: boolean;
  idPrefix?: string;
  titleError?: React.ReactNode;
  companyHint?: React.ReactNode;
}) {
  const fullName = `${value.firstName} ${value.lastName}`.trim();
  /*
    A locking caller has one string, not two - a manager profile stores "Satya Nadella", and a
    review is about that person rather than about a first and last name somebody typed. Split on
    the first space so the two boxes line up with the two the add form asks for; a name with no
    space is a first name, which is what was stored.
  */
  const nameCut = fullName.indexOf(" ");
  const lockedFirstName = nameCut === -1 ? fullName : fullName.slice(0, nameCut);
  const lockedLastName  = nameCut === -1 ? "" : fullName.slice(nameCut + 1);

  return (
    <div className="space-y-5">
      {/*
        One line when locked, two inputs when not. A reviewer sees who they are rating; somebody
        adding a manager is the one supplying the name, so for them it behaves like every other
        field on the form.
      */}
      {lockName ? (
        /*
          The two name boxes, inside the one card, with the lock on the card.

          Same shape as the add form - First and Last, side by side - so the first screen of a
          review reads like the first screen of an add. The difference is that a reviewer is
          rating somebody who already exists, so the values are stated rather than asked for.

          The lock sits on the card, in the slot every other field puts its "Edit details" control
          in: it answers the same question that control answers, and a field that simply lacks the
          control everything around it has reads as an oversight rather than as a decision.
        */
        <div>
          <label className="mb-2 block text-sm font-semibold text-foreground">Manager</label>
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
            <div className="flex items-center gap-3">
              {/*
                The shared input, in read-only mode - not a lookalike. A hand-rolled copy is how
                two fields asking the same question end up with different type sizes and different
                borders, which is what makes one form read as several.
              */}
              <div className="grid min-w-0 flex-1 gap-4 sm:grid-cols-2">
                <FormTextInput
                  id={`${idPrefix}-first-name`}
                  name="firstName"
                  value={lockedFirstName}
                  onChange={() => {}}
                  ariaLabel="First Name"
                  readOnly
                />
                <FormTextInput
                  id={`${idPrefix}-last-name`}
                  name="lastName"
                  value={lockedLastName}
                  onChange={() => {}}
                  ariaLabel="Last Name"
                  readOnly
                />
              </div>
              {/*
                The padlock emoji, as the anonymity card on this same form already uses. One lock
                on the site, not a drawn one here and a typed one there.
              */}
              <span
                data-testid={`${idPrefix}-name-locked`}
                className="flex flex-shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground"
                title="The manager cannot be changed from inside a opinion"
              >
                <span aria-hidden="true">🔒</span>
                Locked
              </span>
            </div>
          </div>
        </div>
      ) : (
        <CollapsibleField
          id={`${idPrefix}-first-name`}
          label="Name"
          required
          display={fullName}
          editing={open === "name"}
          onEditStart={() => onOpen("name")}
          onEditDone={onClose}
          onRestore={previous => {
            // The line is "First Last", so the first space separates them. A name with no space
            // restores as a first name, which is what was typed.
            const cut = previous.indexOf(" ");
            onChange(cut === -1
              ? { firstName: previous, lastName: "" }
              : { firstName: previous.slice(0, cut), lastName: previous.slice(cut + 1) });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormTextInput
              id={`${idPrefix}-first-name`}
              name="firstName"
              value={value.firstName}
              onChange={v => onChange({ firstName: v })}
              placeholder="e.g., Satya"
              ariaLabel="First Name"
              maxLength={50}
            />
            <FormTextInput
              id={`${idPrefix}-last-name`}
              name="lastName"
              value={value.lastName}
              onChange={v => onChange({ lastName: v })}
              placeholder="e.g., Nadella"
              ariaLabel="Last Name"
              maxLength={50}
            />
          </div>
        </CollapsibleField>
      )}

      <CollapsibleField
        id={`${idPrefix}-title`}
        label="Title"
        required
        display={value.title}
        editing={open === "title"}
        onEditStart={() => onOpen("title")}
        onEditDone={onClose}
        onRestore={previous => onChange({ title: previous })}
        error={titleError}
      >
        {/*
          Suggesting spellings other people already used is what stops "Sr. Mgr" and "Snr Manager"
          being invented in the first place. The review form used a bare text box and therefore
          invented them; free text still goes through either way.
        */}
        <RoleAutocomplete
          name="title"
          id={`${idPrefix}-title`}
          value={value.title}
          onChange={val => onChange({ title: val })}
          placeholder="e.g., Engineering Manager"
          maxLength={100}
          className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562]"
        />
      </CollapsibleField>

      {/*
        CompanyField and LocationField are NOT wrapped in CollapsibleField: they already are
        collapsible fields, each with its own pencil, its own Done and - in the company's case -
        its logo on the collapsed line. Wrapping them nested the pattern inside itself and threw
        the logo away. The shell exists for the fields that did not have one.
      */}
      <div>
        <label htmlFor="company-field" className="mb-2 block text-sm font-semibold text-foreground">
          Company *
        </label>
        <CompanyField
          label={null}
          value={value.company}
          onChange={val => {
            onChange({ company: val });
            // Deliberately NOT clearing an exact workplace here: this fires on every keystroke, so
            // typing a company name after choosing a building would silently discard the choice.
            // The invariant is enforced where it cannot be raced - DeclaredLocationResolver rejects
            // a location belonging to a different company.
          }}
          logoUrl={companyLogoUrl}
          logoUrlFor={companyName}
          onCompanyIdChange={onCompanyIdChange}
          onSuggestionSelect={onCompanySuggestionSelect}
          hint={companyHint}
        />
      </div>

      <LocationField
        value={value.location}
        onChange={next => onChange({ location: next })}
        companyId={companyId}
        companyName={companyName ?? value.company}
        editing={open === "location"}
        onEditStart={() => onOpen("location")}
        onEditDone={onClose}
        id={`${idPrefix}-location`}
      />

      {showStatus && (
        <div>
          <label className="mb-3 block text-sm font-semibold text-foreground">Manager Status *</label>
          <div className="space-y-2">
            {([
              { key: "active",  title: "Currently Active",                    blurb: "Manager is actively leading" },
              { key: "retired", title: "Retired / No longer in this role",    blurb: "Manager has stepped down or left" },
            ] as const).map(option => (
              <label
                key={option.key}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                  value.status === option.key
                    ? "border-[#2e0562] bg-[#2e0562]/5"
                    : "border-border hover:bg-accent/5"
                }`}
              >
                <input
                  type="radio"
                  name="status"
                  value={option.key}
                  checked={value.status === option.key}
                  onChange={() => onChange({ status: option.key })}
                  className="h-4 w-4"
                />
                <div>
                  <p className="font-medium text-foreground">{option.title}</p>
                  <p className="text-xs text-muted-foreground">{option.blurb}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── The timeline ──────────────────────────────────────────────────────────────

function MonthYearSelects({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: MonthYear;
  onChange: (v: MonthYear) => void;
  disabled?: boolean;
}) {
  const cls =
    "rounded border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562] disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className="flex items-center gap-2">
      <select
        disabled={disabled}
        value={value.month}
        onChange={e => onChange({ ...value, month: e.target.value })}
        className={cls}
        aria-label={`${label} month`}
        autoComplete="off"
      >
        <option value="">Month</option>
        {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
      </select>
      <select
        disabled={disabled}
        value={value.year}
        onChange={e => {
          const y = e.target.value;
          // A month later than today cannot survive selecting the current year. Clearing it is
          // kinder than an error about a date the form itself allowed to be assembled.
          const clearedMonth =
            (!y || y === String(CURRENT_YEAR)) && parseInt(value.month) > CURRENT_MONTH
              ? ""
              : value.month;
          onChange({ month: clearedMonth, year: y });
        }}
        className={cls}
        aria-label={`${label} year`}
        autoComplete="off"
      >
        <option value="">Year</option>
        {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  );
}

/**
 * When the person worked with this manager.
 *
 * <p>Identical on both forms and written twice, with different labels, different disabled rules and
 * different error wording — so the same mistake produced a different message depending on which
 * page you were on.
 */
export function WorkTimelineFields({
  from,
  until,
  current,
  onFromChange,
  onUntilChange,
  onCurrentChange,
  /** Hidden when the manager is retired: "still working with them" contradicts that outright. */
  allowCurrent = true,
  disableCurrentReason,
  heading,
  subheading,
  problem,
}: {
  from: MonthYear;
  until: MonthYear;
  current: boolean;
  onFromChange: (v: MonthYear) => void;
  onUntilChange: (v: MonthYear) => void;
  onCurrentChange: (v: boolean) => void;
  allowCurrent?: boolean;
  disableCurrentReason?: string | null;
  heading?: string;
  subheading?: string;
  /** A caller-specific complaint - an overlap with another of their own reviews, say. */
  problem?: React.ReactNode;
}) {
  const noFrom = !from.month && !from.year;
  const currentDisabled = noFrom || !!disableCurrentReason;

  const ownProblem = (() => {
    const fromVal = monthYearValue(from);
    const untilVal = monthYearValue(until);
    if (fromVal != null && untilVal != null && fromVal > untilVal) {
      return "Your 'From' date cannot be later than your 'To' date.";
    }
    if (isFilled(from) && !current && !isFilled(until)) {
      return "Add a 'To' date or check 'Current' to mark this as ongoing.";
    }
    return null;
  })();

  return (
    <div className="space-y-8">
      {heading && (
        <div>
          <h2 className="text-[22px] font-semibold text-foreground">{heading}</h2>
          {subheading && <p className="mt-1 text-sm text-muted-foreground">{subheading}</p>}
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-medium text-foreground">From *</p>
          <MonthYearSelects
            label="From"
            value={from}
            onChange={v => {
              onFromChange(v);
              // Clearing the start clears everything that depended on it, rather than leaving an
              // end date hanging off a period with no beginning.
              if (!v.month && !v.year) { onUntilChange(EMPTY_MONTH_YEAR); onCurrentChange(false); }
            }}
          />
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-foreground">To{!current ? " *" : ""}</p>
          <div className="flex flex-wrap items-center gap-3">
            {!current && (
              <MonthYearSelects
                label="Until"
                value={until}
                onChange={onUntilChange}
                disabled={noFrom}
              />
            )}
            {allowCurrent && (
              <label
                className={`flex cursor-pointer items-center gap-2 text-sm text-foreground ${
                  currentDisabled ? "cursor-not-allowed opacity-40" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={current}
                  disabled={currentDisabled}
                  onChange={e => {
                    if (currentDisabled) return;
                    onCurrentChange(e.target.checked);
                    if (e.target.checked) onUntilChange(EMPTY_MONTH_YEAR);
                  }}
                  className="h-4 w-4"
                />
                Current
              </label>
            )}
          </div>
        </div>
      </div>

      {/*
        A caller's complaint is announced, not merely printed. The bespoke controls this replaced
        wrapped their errors in role="alert", and losing that would mean a screen-reader user
        submitting a form that had already told everybody else what was wrong.
      */}
      {problem
        ? <div role="alert">{problem}</div>
        : (ownProblem && <p className="text-xs text-amber-700" role="status">{ownProblem}</p>)}
    </div>
  );
}

// ── The rule list, shared so both forms explain a rejection the same way ──────

export type RuleState = "met" | "pending" | "violated";
export interface Rule { label: string; state: RuleState }

export function RuleList({ rules }: { rules: Rule[] }) {
  return (
    <ul className="mt-2 space-y-1">
      {rules.map(rule => (
        <li
          key={rule.label}
          className={`flex items-center gap-2 text-xs ${
            rule.state === "met"      ? "text-accent" :
            rule.state === "violated" ? "text-destructive" :
                                        "text-muted-foreground"
          }`}
        >
          {rule.state === "met"      ? <Check size={12} className="shrink-0" /> :
           rule.state === "violated" ? <X     size={12} className="shrink-0" /> :
                                       <span className="inline-block h-3 w-3 shrink-0 rounded-full border border-current" />}
          {rule.label}
        </li>
      ))}
    </ul>
  );
}
