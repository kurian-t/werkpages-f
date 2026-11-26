/**
 * Identifying one employment role on the career trajectory.
 *
 * A stage on the chart is a (company, title) PAIR, not a company. A manager promoted inside one
 * employer has two stages there, and every piece of code that identified a stage by its company
 * alone got the wrong one or all of them:
 *
 *   - the admin controls found the career_history row behind a tile by matching the company name
 *     and breaking ties on the start month, so Edit rewrote the other stretch of a promoted
 *     manager's history, or the control vanished because nothing could be resolved;
 *   - the delete and move-ratings dialog offered only roles at OTHER companies as destinations,
 *     which excluded the one destination an admin actually needs;
 *   - an unrated role at a company that already had a rated role was dropped from the timeline
 *     entirely, because "this company is already covered" was the test.
 *
 * The backend groups on this same key, normalised the same way: whitespace removed from the
 * company, collapsed to one space in the title, both lower-cased. It has to be the same, or what
 * an admin is shown and what a request acts on are two different sets of ratings.
 *
 * See ManagerRepository.REVIEW_ROLE_MATCH and ReviewRepository.SEGMENTS_SQL.
 */
export function roleKey(
  company: string | null | undefined,
  title: string | null | undefined,
): string {
  const c = (company ?? "").trim().toLowerCase().replace(/\s+/g, "");
  const t = (title ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  /*
    Length-prefixed, not delimited.

    The key is also used as a data-testid and as a <select> option value, so it has to survive the
    DOM: a control character such as NUL is replaced in an attribute and the handle stops matching.
    A plain separator would instead let two different roles collide if a name happened to contain
    it. Prefixing the company's length makes the encoding injective with no reserved character.
  */
  return `${c.length}:${c}:${t}`;
}

/**
 * The employer alone, normalised the same way.
 *
 * Merging two roles is only meaningful inside ONE employer - two jobs at two companies are not one
 * employment however alike the titles - so the control that offers a merge needs to ask that
 * question without reaching for the title. Normalised identically to roleKey's company half, so
 * the answer here and the answer the backend gives cannot differ.
 */
export function companyKey(company: string | null | undefined): string {
  return (company ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

/** Whether two stages sit at the same employer, whatever their titles. */
export function sameCompany(
  a: { company?: string | null },
  b: { company?: string | null },
): boolean {
  return companyKey(a.company) === companyKey(b.company);
}

/** Whether two stages are the same role. Two roles at one employer are not the same stage. */
export function sameRole(
  a: { company?: string | null; role?: string | null },
  b: { company?: string | null; role?: string | null },
): boolean {
  return roleKey(a.company, a.role) === roleKey(b.company, b.role);
}

/** One stage on the trajectory, as much of it as ordering and "is this their job now" need. */
export interface CareerStage {
  startDate?: string | null;
  endDate?: string | null;
  isCurrent?: boolean;
  /** FALSE when nobody has said when this employment ran. From career_history.period_known. */
  periodKnown?: boolean | null;
  /** 'ongoing' | 'ended' | 'unknown' | 'disputed', from career_history.employment_status. */
  employmentStatus?: string | null;
}

/**
 * Whether a stage is the job the person holds NOW.
 *
 * <p>The test used to be `endDate == null` alone, so a row with NO dates at all - start absent,
 * end absent, period_known false - was presented as the person's current role. A missing end date
 * means "still there" only when there is a period at all; on an undated row it means nobody said
 * anything, which is not the same claim.
 *
 * <p>Where the record states the answer it is believed, because employment_status is the
 * resolution of that exact question and is not an inference from a gap in the dates.
 */
export function isOngoingRole(stage: CareerStage): boolean {
  if (stage.employmentStatus === "ongoing") return true;
  if (stage.employmentStatus === "ended")   return false;
  // No period at all says nothing either way, so it does not say "current".
  if (!stage.startDate && !stage.endDate) return false;
  return stage.endDate == null;
}

/**
 * Orders the trajectory OLDEST FIRST.
 *
 * <p><b>A job with no dates is treated as older than a job that has them.</b> An employment row
 * carries dates when a rating supplied them, so an undated row is one nobody rated - and the
 * merge is where that becomes visible, because it brings an unrated profile's employments onto a
 * rated one. Sending a null start date to the back of an ascending list put that unrated job in
 * the NEWEST position, ahead of the dated job it actually preceded, which is how a merged-in
 * workplace looked like it had landed in the wrong place or replaced the current role.
 *
 * <p>Deliberately an assumption, and the safe direction for one: presenting an undated job as the
 * most recent overstates what is known about somebody's present employer, while presenting it as
 * earlier history does not.
 */
export function compareCareerStages(a: CareerStage, b: CareerStage): number {
  const aUndated = !a.startDate;
  const bUndated = !b.startDate;
  if (aUndated !== bUndated) return aUndated ? -1 : 1;
  if (aUndated && bUndated) return currentLast(a, b);
  if (a.startDate !== b.startDate) return a.startDate! < b.startDate! ? -1 : 1;
  return currentLast(a, b);
}

/**
 * Among stages ordering is otherwise indifferent about, the current one goes last.
 *
 * <p>Compared with `?? false` rather than `!==` on the raw values, so an absent flag and an
 * explicit false are one answer. Reading them as different made the comparator disagree with
 * itself depending on which stage arrived first, and a comparator that is not antisymmetric
 * reshuffles the timeline between renders.
 */
function currentLast(a: CareerStage, b: CareerStage): number {
  const aCurrent = a.isCurrent ?? false;
  const bCurrent = b.isCurrent ?? false;
  if (aCurrent === bCurrent) return 0;
  return aCurrent ? 1 : -1;
}
