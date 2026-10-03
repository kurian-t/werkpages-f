/**
 * The vocabulary a moderator picks from when taking down somebody's contribution, and which of
 * those choices costs them anything.
 *
 * Defined once because the BACKEND acts on these keys. "junk" debits 20 confidence points from
 * an account that can neither see the score nor appeal it, and the other three debit nothing.
 * Two copies of that list drifting apart means one moderation surface penalising people the
 * other would not, with nothing on either screen to show it had happened.
 *
 * Labels deliberately live with each control rather than here: what is being removed differs
 * between surfaces (a rating somebody wrote, a manager somebody submitted) and the sentence has
 * to say which. The keys and the consequence do not differ, so only those are shared.
 *
 * Mirrors AdminService.REVIEW_DELETE_REASONS and AdminService.MANAGER_REJECT_CATEGORIES.
 */
export const MODERATION_REASON_KEYS = ["junk", "duplicate", "correction", "other"] as const;

export type ModerationReason = (typeof MODERATION_REASON_KEYS)[number];

/**
 * The only choice that debits the contributor.
 *
 * A duplicate, or an administrative correction, is not the contributor's fault. Penalising those
 * selects against the people who contribute most, because they are the ones who accumulate
 * duplicates.
 */
export const PENALISING_REASON: ModerationReason = "junk";

export function penalises(reason: string): boolean {
  return reason === PENALISING_REASON;
}
