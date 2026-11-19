import { LocationValue, EMPTY_LOCATION, declaredPayload, isLocationSet, formatLocation } from "@/lib/location";
import { toJobTitleCase } from "@/lib/utils";

/**
 * The career history editor's model.
 *
 * <p><b>The one decision this file exists to enforce:</b> correcting an existing position and
 * recording a new one are different acts, and which one is happening is derived from the data
 * rather than chosen by whoever wrote the screen.
 *
 * <ul>
 *   <li>A draft with no {@code roleId} is an ADDITION. A distinct employment, which never ends
 *       another one. Somebody genuinely holding two jobs at once is recorded that way, and
 *       somebody who changed jobs says so by ending the old position in the same session.</li>
 *   <li>A draft whose {@code companyId} has moved is a SUPERSESSION. The employer is what ratings
 *       are attributed through, so changing it replaces the employment rather than editing it. The
 *       person did not change jobs; the record named the wrong company.</li>
 *   <li>Anything else is a CORRECTION. Same employment, fixed values, and every rating and claim
 *       hanging off it stays exactly where it is.</li>
 * </ul>
 */

/** What the server says about an employment that already exists. */
export interface Employment {
  /**
   * career_history.id, or null for the position the MANAGER RECORD asserts with no employment row
   * behind it yet.
   *
   * <p>Most managers carry a title and company on their own row and have no career_history row at
   * all. That position is displayed on the profile, so the editor shows it as the first card; it is
   * written down on submit and corrected from then on like any other.
   */
  id: number | null;
  /** True for that manager-record position. The server materialises it when the change arrives. */
  fromManagerRecord?: boolean;
  title: string;
  company: string;
  companyId: number | null;
  companyDomain?: string | null;
  companyLogoUrl?: string | null;
  /** Year and month, or null when nobody has said. Never a fabricated day. */
  startDate: string | null;
  endDate: string | null;
  /**
   * These dates came from the RATINGS, not from the employment record.
   *
   * <p>Every rating asks when the person worked with the manager, so for an employment nobody has
   * dated the span of those answers is the only evidence there is. It is a bound rather than a
   * fact - the role began no later than the earliest overlap - so the form says where it came from
   * and invites a correction instead of presenting it as recorded.
   */
  startDateInferred?: boolean;
  endDateInferred?: boolean;
  periodKnown: boolean;
  employmentStatus: EmploymentStatus;
  state: string;
  isCurrent: boolean;
  /** Contributors with a resolved claim here. Shown when a company correction would move them. */
  claimCount: number;
  declaredCountry: string | null;
  declaredState: string | null;
  declaredCity: string | null;
  declaredPrecision: LocationValue["precision"];
  companyLocationId: number | null;
  declaredSource: LocationValue["source"];
  declaredText: string | null;
}

/**
 * What a contributor may say about whether a role is still held.
 *
 * <p>`disputed` is absent on purpose. It is a moderation outcome, reached when accounts contradict
 * each other, and never something one person may assert about somebody else's job. The server and
 * the database both refuse it.
 */
export type EmploymentStatus = "ongoing" | "ended" | "unknown" | "disputed";

/**
 * What a contributor may say: they are in this role, or they are not.
 *
 * <p>`unknown` is deliberately NOT offered. "I'm not sure" produced a role with no stated end and
 * no stated dates, which every surface then had to guess about - and the guesses disagreed, landing
 * older roles above newer ones because somebody did not know a date. The question is answerable by
 * anyone with reason to edit the profile, so it is asked as a binary.
 *
 * <p>`unknown` and `disputed` still exist in the DATABASE: `unknown` is the column default and the
 * state of every row written before this, and `disputed` is a moderation outcome. Rows holding them
 * are read and displayed; they are simply never what a contributor asserts.
 */
export type ContributorStatus = "ongoing" | "ended";

export const STATUS_CHOICES: { value: ContributorStatus; label: string; hint: string }[] = [
  { value: "ongoing", label: "Currently in this role", hint: "They still hold this position" },
  /*
    "No longer in this role", NOT "Retired / No longer in this role".

    Leaving a position and retiring from work are different facts, and the combined wording made
    every departure look like the end of a career. Somebody who moved to a different company was
    recorded as retired.
  */
  { value: "ended",   label: "No longer in this role", hint: "They have left this position" },
];

/** One position as the form holds it while somebody edits. */
export interface PositionDraft {
  /** A stable key for React, which is not the employment id because an addition has none. */
  key: string;
  /**
   * Somebody added this position in this session, so it can be taken back out.
   *
   * <p>Not the same question as "has no roleId": the manager-record position has no id either and
   * must NOT be removable, because it is the profile's existing current role rather than a draft.
   */
  addedByUser?: boolean;
  /** This position came from the manager record; the server writes the row on submit. */
  fromManagerRecord?: boolean;
  /** At least one date shown here was inferred from ratings rather than recorded. */
  datesInferred?: boolean;
  /** career_history.id, or null for a position being added. The ONLY way an existing one is named. */
  roleId: number | null;
  title: string;
  company: string;
  companyId: number | undefined;
  location: LocationValue;
  status: ContributorStatus;
  startDate: string;
  endDate: string;
  /** True once this draft has been removed from an unsaved addition. */
  removed?: boolean;
}

export type Intent = "correct" | "add" | "supersede";

export const CHANGE_FIELDS = {
  title: "title",
  company: "company",
  location: "location",
  startDate: "start_date",
  endDate: "end_date",
  periodKnown: "period_known",
  employmentStatus: "employment_status",
} as const;

let keySeq = 0;
export function nextKey(prefix = "pos"): string {
  keySeq += 1;
  return `${prefix}-${keySeq}`;
}

/**
 * An existing employment's status as one of the two a contributor may choose.
 *
 * <p>A row holding `unknown` or `disputed` has to be shown as something, and the honest answer is
 * whatever the profile already treats it as: current if nothing says it ended, previous otherwise.
 * This is also the baseline a change is measured against, so merely opening a card on an old
 * `unknown` row does not register as a change nobody made.
 */
export function contributorStatusOf(e: Employment): ContributorStatus {
  if (e.employmentStatus === "ongoing") return "ongoing";
  if (e.employmentStatus === "ended") return "ended";
  return e.isCurrent ? "ongoing" : "ended";
}

/** The location an existing employment already carries, as the shared control holds it. */
export function locationOf(e: Employment): LocationValue {
  if (!e.declaredPrecision && !e.declaredText && !e.companyLocationId) return EMPTY_LOCATION;
  return {
    country: e.declaredCountry ?? "",
    state: e.declaredState ?? "",
    city: e.declaredCity ?? "",
    precision: e.declaredPrecision,
    companyLocationId: e.companyLocationId,
    corpusPlace: null,
    label: "",
    source: e.declaredSource ?? null,
    text: e.declaredText ?? undefined,
  };
}

/** A draft that starts as an exact copy of what is recorded, so an untouched field proposes nothing. */
export function draftOf(e: Employment): PositionDraft {
  return {
    key: e.id !== null ? `role-${e.id}` : "manager-record",
    roleId: e.id,
    fromManagerRecord: e.fromManagerRecord === true,
    title: e.title ?? "",
    company: e.company ?? "",
    companyId: e.companyId ?? undefined,
    location: locationOf(e),
    status: contributorStatusOf(e),
    startDate: e.startDate ?? "",
    endDate: e.endDate ?? "",
    datesInferred: e.startDateInferred === true || e.endDateInferred === true,
  };
}

export function emptyDraft(): PositionDraft {
  return {
    key: nextKey("new"),
    addedByUser: true,
    roleId: null,
    title: "",
    company: "",
    companyId: undefined,
    location: EMPTY_LOCATION,
    status: "ongoing",
    startDate: "",
    endDate: "",
  };
}

export function isAddition(d: PositionDraft): boolean {
  return d.roleId === null;
}

/**
 * Whether this position can be taken out of the submission.
 *
 * <p>Only one somebody added in this session. An employment already on the profile is not
 * deletable here at all, and neither is the manager record's own position: removing that would be
 * asking to delete the role the profile is displaying, which is a moderation decision.
 */
export function isRemovable(d: PositionDraft): boolean {
  return d.addedByUser === true;
}

/**
 * How a position is looked up among what is recorded.
 *
 * <p>A plain numeric id cannot address the manager-record position, which has none - and a map
 * keyed by id would hand back `undefined` for it, so leaving that card alone would read as a
 * change to every field on it. One key space covers both.
 */
export function employmentKey(e: Employment): string {
  return e.id !== null ? `id:${e.id}` : "manager-record";
}

export function originalKeyOf(d: PositionDraft): string | null {
  if (d.roleId !== null) return `id:${d.roleId}`;
  return d.fromManagerRecord ? "manager-record" : null;
}

/** What is recorded, keyed so every draft can find its own. */
export function originalsOf(list: Employment[]): Map<string, Employment> {
  const m = new Map<string, Employment>();
  list.forEach(e => m.set(employmentKey(e), e));
  return m;
}

function originalFor(d: PositionDraft, originals: Map<string, Employment>): Employment | undefined {
  const key = originalKeyOf(d);
  return key === null ? undefined : originals.get(key);
}

/**
 * Which act this draft represents.
 *
 * <p>A company that has moved makes it a supersession even when other fields moved too, because
 * the employer is the part that decides where ratings sit. The rest of the changes ride along on
 * the replacement.
 */
/**
 * How the change reads to the person making it, which is not always the wire intent.
 *
 * <p>The manager-record position is SENT as an addition, because the client has no employment row
 * to name and the server materialises one. But somebody fixing a typo in the title their profile
 * already displays is correcting it, and a review summary that announced "Add Engineering Manager"
 * would describe an act they did not perform.
 */
export function describedIntent(d: PositionDraft, original: Employment | undefined): Intent {
  if (d.fromManagerRecord && original) {
    const companyMoved = d.companyId !== undefined
      ? d.companyId !== (original.companyId ?? undefined)
      : norm(d.company) !== norm(original.company);
    return companyMoved ? "supersede" : "correct";
  }
  return intentOf(d, original);
}

export function intentOf(d: PositionDraft, original: Employment | undefined): Intent {
  // The manager-record position is sent as an addition, because that is all the client can
  // honestly say: there is no employment row to name. The server materialises the row from the
  // manager record and applies the change to it as a correction.
  if (d.roleId === null || !original) return "add";
  const companyMoved = d.companyId !== undefined
    ? d.companyId !== (original.companyId ?? undefined)
    : norm(d.company) !== norm(original.company);
  return companyMoved ? "supersede" : "correct";
}

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function sameLocation(a: LocationValue, b: LocationValue): boolean {
  if (!isLocationSet(a) && !isLocationSet(b)) return true;
  return norm(a.country) === norm(b.country)
    && norm(a.state) === norm(b.state)
    && norm(a.city) === norm(b.city)
    && (a.precision ?? null) === (b.precision ?? null)
    && (a.companyLocationId ?? null) === (b.companyLocationId ?? null)
    && norm(a.text) === norm(b.text);
}

/**
 * Exactly which fields this draft proposes to change.
 *
 * <p>This list is the whole reason an untouched field is safe. Without it, a null end date on the
 * wire is ambiguous between "leave the end date alone" and "this role has no end date after all",
 * and those are opposite instructions: the second would erase a date nobody questioned.
 *
 * <p>An ADDITION proposes everything it has a value for, because there is nothing to compare it
 * against.
 */
export function changedFields(d: PositionDraft, original: Employment | undefined): string[] {
  const fields: string[] = [];
  // The manager-record position HAS an original to compare against even though it has no id, so
  // leaving it untouched proposes nothing - otherwise simply opening the editor would look like a
  // change to every profile's current role.
  if (!original || (d.roleId === null && !d.fromManagerRecord)) {
    if (d.title.trim()) fields.push(CHANGE_FIELDS.title);
    if (d.company.trim() || d.companyId !== undefined) fields.push(CHANGE_FIELDS.company);
    if (isLocationSet(d.location)) fields.push(CHANGE_FIELDS.location);
    if (d.startDate) fields.push(CHANGE_FIELDS.startDate);
    if (d.endDate) fields.push(CHANGE_FIELDS.endDate);
    fields.push(CHANGE_FIELDS.employmentStatus);
    if (d.startDate) fields.push(CHANGE_FIELDS.periodKnown);
    return fields;
  }
  if (norm(d.title) !== norm(original.title)) fields.push(CHANGE_FIELDS.title);

  const companyMoved = d.companyId !== undefined
    ? d.companyId !== (original.companyId ?? undefined)
    : norm(d.company) !== norm(original.company);
  if (companyMoved) fields.push(CHANGE_FIELDS.company);

  if (!sameLocation(d.location, locationOf(original))) fields.push(CHANGE_FIELDS.location);

  if ((d.startDate || "") !== (original.startDate || "")) {
    fields.push(CHANGE_FIELDS.startDate);
    fields.push(CHANGE_FIELDS.periodKnown);
  }
  if ((d.endDate || "") !== (original.endDate || "")) fields.push(CHANGE_FIELDS.endDate);

  // Measured against the DERIVED baseline, so an old `unknown` row that nobody touched proposes
  // nothing. Flipping the control still proposes the real change.
  if (d.status !== contributorStatusOf(original)) fields.push(CHANGE_FIELDS.employmentStatus);

  return fields;
}

export function hasChanges(d: PositionDraft, original: Employment | undefined): boolean {
  return changedFields(d, original).length > 0;
}

/** Why the form will not submit this position yet, or null when it is fine. */
export function positionProblem(d: PositionDraft, original?: Employment): string | null {
  if (!d.title.trim()) return "A title is needed";
  if (!d.company.trim() && d.companyId === undefined) return "A company is needed";
  if (d.startDate && d.endDate && d.endDate < d.startDate) {
    return "The end date is before the start date";
  }
  if (d.status === "ongoing" && d.endDate) {
    return "A role that is still held cannot have an end date";
  }
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  if (d.startDate && d.startDate > thisMonth) return "The start date is in the future";
  if (d.endDate && d.endDate > thisMonth) return "The end date is in the future";
  /*
    A LOCATION IS MANDATORY, FOR ANY POSITION THIS SUBMISSION ACTUALLY PROPOSES.

    Adding a role with no location was accepted, and the submit button enabled, which is wrong:
    adding or rating a manager demands a location everywhere else in the product and this form
    may not be the one exception.

    GATED ON THE POSITION BEING PROPOSED, which is the part that matters. V109 gave employments
    their own location and deliberately backfilled nothing, so roles recorded before it have none.
    Demanding one from every row on screen would mean somebody correcting a title could not submit
    until they invented a location for a job they know nothing about - and an invented location is
    worse than an absent one, because it reads as something a person stated.

    So: a position nobody is changing is not this submission's business, and is left alone.
  */
  if (!isLocationSet(d.location) && hasChanges(d, original)) return "A location is needed";
  return null;
}

/** One line of the Review Changes summary. */
export interface ChangeLine {
  kind: Intent | "name";
  heading: string;
  details: string[];
  /** How many contributors' claims a supersession would carry across. */
  claimsAffected?: number;
}

const FIELD_LABELS: Record<string, string> = {
  [CHANGE_FIELDS.title]: "Title",
  [CHANGE_FIELDS.company]: "Company",
  [CHANGE_FIELDS.location]: "Location",
  [CHANGE_FIELDS.startDate]: "Start date",
  [CHANGE_FIELDS.endDate]: "End date",
  [CHANGE_FIELDS.employmentStatus]: "Employment status",
};

function shown(value: string | null | undefined, fallback = "not stated"): string {
  return value && value.trim() ? value : fallback;
}

function statusLabel(s: EmploymentStatus | ContributorStatus): string {
  const choice = STATUS_CHOICES.find(c => c.value === s);
  if (choice) return choice.label;
  // A stored `unknown` or `disputed` is not a contributor's answer, so it is described rather than
  // dressed up as one of the two.
  return s === "disputed" ? "Disputed" : "Not stated";
}

/**
 * The change set in words, for the Review Changes step.
 *
 * <p>Built from the same {@link changedFields} the submission is built from, so what somebody
 * reads before submitting is exactly what gets sent. Two separate derivations would eventually
 * disagree, and the one on screen is the one people trust.
 */
export function summarize(
  name: string,
  originalName: string,
  drafts: PositionDraft[],
  originals: Map<string, Employment>,
): ChangeLine[] {
  const lines: ChangeLine[] = [];

  if (name.trim() && name.trim() !== originalName.trim()) {
    lines.push({
      kind: "name",
      heading: "Correct the manager's name",
      details: [`${originalName} to ${name.trim()}`],
    });
  }

  for (const d of drafts) {
    if (d.removed) continue;
    const original = originalFor(d, originals);
    const fields = changedFields(d, original);
    if (fields.length === 0) continue;
    const intent = describedIntent(d, original);

    if (intent === "add") {
      lines.push({
        kind: "add",
        heading: `Add ${shown(d.title, "a position")} at ${shown(d.company, "a company")}`,
        details: [
          statusLabel(d.status),
          d.startDate || d.endDate
            ? `${shown(d.startDate)} to ${d.status === "ongoing" ? "now" : shown(d.endDate)}`
            : "Dates not stated",
          isLocationSet(d.location) ? formatLocation(d.location) : "Location not stated",
        ],
      });
      continue;
    }

    if (intent === "supersede") {
      lines.push({
        kind: "supersede",
        heading: `Change the employer on ${shown(original?.title, "this position")}`,
        details: [
          `${shown(original?.company)} to ${shown(d.company)}`,
          "This replaces the position rather than editing it, because ratings are attributed "
            + "through the employer.",
          ...fields
            .filter(f => f !== CHANGE_FIELDS.company && FIELD_LABELS[f])
            .map(f => `${FIELD_LABELS[f]} also updated`),
        ],
        claimsAffected: original?.claimCount ?? 0,
      });
      continue;
    }

    lines.push({
      kind: "correct",
      heading: `Correct ${shown(original?.title, "this position")} at ${shown(original?.company)}`,
      details: fields.filter(f => FIELD_LABELS[f]).map(f => {
        switch (f) {
          case CHANGE_FIELDS.title:
            return `Title: ${shown(original?.title)} to ${shown(d.title)}`;
          case CHANGE_FIELDS.location:
            return `Location: ${original && isLocationSet(locationOf(original))
              ? formatLocation(locationOf(original)) : "not stated"} to ${
              isLocationSet(d.location) ? formatLocation(d.location) : "not stated"}`;
          case CHANGE_FIELDS.startDate:
            return `Start date: ${shown(original?.startDate)} to ${shown(d.startDate)}`;
          case CHANGE_FIELDS.endDate:
            return `End date: ${shown(original?.endDate)} to ${shown(d.endDate)}`;
          case CHANGE_FIELDS.employmentStatus:
            return `Status: ${statusLabel(original?.employmentStatus ?? "unknown")} to ${statusLabel(d.status)}`;
          default:
            return FIELD_LABELS[f];
        }
      }),
    });
  }

  return lines;
}

/**
 * The request body, built from the same comparison the summary was built from.
 *
 * <p>A position whose fields all match what is recorded is left out entirely rather than sent as an
 * empty change, which is what keeps "I opened three cards and only edited one" to a one-position
 * contribution.
 */
export function buildSubmission(
  name: string,
  originalName: string,
  explanation: string,
  drafts: PositionDraft[],
  originals: Map<string, Employment>,
): Record<string, unknown> {
  const positions: Record<string, unknown>[] = [];

  drafts.forEach((d, index) => {
    if (d.removed) return;
    const original = originalFor(d, originals);
    const fields = changedFields(d, original);
    if (fields.length === 0) return;

    const intent = intentOf(d, original);
    const body: Record<string, unknown> = {
      intent,
      // An addition names no employment; a correction or supersession names exactly one, by id.
      roleId: intent === "add" ? null : d.roleId,
      ...(d.fromManagerRecord ? { fromManagerRecord: true } : {}),
      changedFields: fields,
      /*
        NORMALISED, exactly as the form this replaced did.

        The old edit form ran every title through toJobTitleCase on save, and the admin editor
        still does. Sending the raw string would have quietly ended that: "ceo" would appear as
        "ceo" on the profile and in the directory, and "vp engineering" as "vp engineering". Five
        tests existed for this behaviour, which is a fair sign somebody cared about it.
      */
      title: d.title.trim() ? toJobTitleCase(d.title.trim()) : null,
      company: d.company.trim() || null,
      companyId: d.companyId ?? null,
      startDate: d.startDate || null,
      endDate: d.status === "ongoing" ? null : (d.endDate || null),
      periodKnown: Boolean(d.startDate),
      employmentStatus: d.status,
      position: index,
    };
    if (fields.includes(CHANGE_FIELDS.location)) {
      Object.assign(body, declaredPayload(d.location));
      if (d.location.corpusPlace) body.corpusPlace = d.location.corpusPlace;
    }
    positions.push(body);
  });

  const changedName = name.trim() && name.trim() !== originalName.trim() ? name.trim() : null;

  return { name: changedName, explanation: explanation.trim(), positions };
}

/**
 * Whether there is anything at all to submit.
 *
 * <p>A name-only correction counts, and has to: it touches no employment, so a check that only
 * looked at positions would refuse a legitimate submission.
 */
export function hasAnythingToSubmit(
  name: string,
  originalName: string,
  drafts: PositionDraft[],
  originals: Map<string, Employment>,
): boolean {
  if (name.trim() && name.trim() !== originalName.trim()) return true;
  return drafts.some(d => !d.removed && changedFields(d, originalFor(d, originals)).length > 0);
}

/** Current positions first, then previous ones most recent first, which is the order shown. */
export function orderEmployments(list: Employment[]): Employment[] {
  return [...list].sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    /*
      AN UNKNOWN DATE SORTS LAST, not first.

      This substituted "9999-99" for a missing end date, which sorts as the latest possible one -
      so "they left, date unknown" was placed above a role that ended last year, presenting an
      absence of information as the most recent thing that happened. The server now uses NULLS LAST
      for the same reason; the two orderings have to agree or the list reshuffles on reload.
    */
    const aKnown = a.endDate !== null, bKnown = b.endDate !== null;
    if (aKnown !== bKnown) return aKnown ? -1 : 1;
    if (aKnown && bKnown && a.endDate !== b.endDate) {
      return b.endDate!.localeCompare(a.endDate!);
    }
    const aStart = a.startDate !== null, bStart = b.startDate !== null;
    if (aStart !== bStart) return aStart ? -1 : 1;
    const byStart = (b.startDate ?? "").localeCompare(a.startDate ?? "");
    if (byStart !== 0) return byStart;
    /*
      A TIEBREAKER, matching the server's `id DESC`.

      Two undated roles compared equal on every field, so their order came out of whatever order
      they arrived in - the same list could sort two ways, and re-sorting on the client could
      reshuffle what the server had already ordered. The manager-record position has no id and
      sorts last among ties, which is where an entry with no employment row belongs.
    */
    return (b.id ?? -1) - (a.id ?? -1);
  });
}
