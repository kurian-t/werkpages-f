/**
 * Category averages, read safely and ranked once.
 *
 * <h2>Why this is a module and not three copies of two lines</h2>
 *
 * <p>Three surfaces ask the same question of the same field - a company profile, an industry
 * profile and a career timeline - and each had its own copy. The copies disagreed, which is how
 * both of the bugs below shipped:
 *
 * <p><b>A crash on a payload without the field.</b> {@code CompanyProfile} called
 * {@code Object.entries(data.categoryAverages)} with no guard, so a response that omitted the key
 * threw {@code Cannot convert undefined or null to object} and the whole page rendered an error
 * boundary instead. {@code IndustryProfile} had written {@code ?? {}} and was fine. Same field,
 * same question, one guarded and one not.
 *
 * <p>The API does send the field on every path today - both the populated and the empty-company
 * payloads put an object there - so this was latent rather than live. It is still wrong to rely
 * on: the value arrives from the network through an unchecked {@code as CompanyData} cast, so the
 * type is an assertion about a JSON body, not a guarantee about it. One omitted key is the
 * difference between a page and an error screen, and the field is contribution-gated, which puts
 * it exactly where a future change is most likely to start withholding it.
 *
 * <p><b>A category named best and worst at once.</b> Taking {@code slice(0, 3)} and
 * {@code slice(-3)} from a list of six or fewer returns overlapping rows, so a category appeared
 * under Strongest and Weakest simultaneously. That was found and fixed twice, separately, in two
 * files - which is the clearest possible sign the rule belonged in one place.
 *
 * <p>Both now have a single home, and the ranking rule is stated once where it can be read.
 */

/**
 * What the wire can actually hand over.
 *
 * <p>Nullable deliberately. Callers hold data deserialised from an API response, and narrowing
 * that to a required object is a claim nothing checks. Accepting the honest type here means no
 * call site needs its own guard, and none can forget one.
 */
export type CategoryAverages = Record<string, number> | null | undefined;

/** One category and its average, as the ranking helpers hand them back. */
export interface CategoryAverage {
  label: string;
  value: number;
}

/**
 * The usable category averages, with anything that is not a real number dropped.
 *
 * <p>Nulls and non-numerics are filtered rather than coerced: a category nobody has rated is
 * absent information, and {@code Number(null)} turning it into a flattering 0.0 would print a
 * score no reviewer gave. {@code NaN} is excluded for the same reason it is excluded from the
 * ranking - it sorts unpredictably and renders as "NaN".
 */
export function categoryAverageEntries(averages: CategoryAverages): CategoryAverage[] {
  if (averages == null) return [];
  return Object.entries(averages)
    .filter(([, value]) => typeof value === "number" && !Number.isNaN(value))
    .map(([label, value]) => ({ label, value: value as number }));
}

/**
 * The strongest and weakest categories, taken from ONE sorted list.
 *
 * <p>Split rather than sliced from both ends. With six or fewer categories {@code slice(0, 3)} and
 * {@code slice(-3)} overlap, and a category then appears as a strength and a weakness at the same
 * time - which reads as a bug in the data to anybody looking at it. The cut is clamped so the
 * strongest three are never re-offered as the weakest.
 *
 * <p>{@code weakest} is worst-first, because a list of weaknesses that opens with the least bad
 * one buries what the reader is looking for.
 */
export function rankCategoryAverages(averages: CategoryAverages): {
  /** Every usable category, best first. */
  ranked: CategoryAverage[];
  /** Up to three, best first. */
  strongest: CategoryAverage[];
  /** Up to three, worst first, and never overlapping {@code strongest}. */
  weakest: CategoryAverage[];
} {
  const ranked = categoryAverageEntries(averages).sort((a, b) => b.value - a.value);
  const cut = Math.max(3, ranked.length - 3);
  return {
    ranked,
    strongest: ranked.slice(0, 3),
    weakest: ranked.slice(cut).reverse(),
  };
}
