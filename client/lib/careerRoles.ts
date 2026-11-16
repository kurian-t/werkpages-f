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
