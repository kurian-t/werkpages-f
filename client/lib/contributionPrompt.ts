/**
 * Attributing a contribution to the prompt that asked for it.
 *
 * <h2>Why a marker rather than a property</h2>
 *
 * <p>The prompt and the contribution it produces happen on different pages: the card on a manager
 * profile sends somebody to the company rating form, and the card on a company profile sends them
 * to the add-manager form. Nothing is carried between them, so "was this rating prompted" cannot
 * be answered at the moment it is submitted.
 *
 * <p>So clicking the prompt leaves a marker, and the next successful contribution consumes it.
 * Consuming is the point: exactly one contribution may claim a prompt, or a single click would
 * attribute every rating somebody wrote afterwards.
 *
 * <h2>What it is not</h2>
 *
 * <p>It holds a direction and a timestamp. No identity, no company, no manager, nothing about what
 * was written. It lives in sessionStorage, so it dies with the tab like the rest of the analytics
 * state, and it expires on its own so a prompt clicked this morning cannot be credited with an
 * unrelated rating this afternoon.
 */

const KEY = "ph_prompt_follow";

/**
 * How long a prompt may still be credited for what follows it.
 *
 * <p>One hour. Long enough to survive signing in, which the second contribution often requires,
 * and short enough that an abandoned tab reopened later attributes nothing.
 */
const WINDOW_MS = 60 * 60 * 1000;

export type PromptDirection = "manager_to_company" | "company_to_manager";

/** Somebody accepted a prompt. Remembered until a contribution claims it, or it expires. */
export function markPromptFollowed(direction: PromptDirection): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ direction, at: Date.now() }));
  } catch {
    // Storage unavailable. Attribution is lost; the contribution still counts, which is the part
    // that matters.
  }
}

/**
 * Properties for a contribution event, claiming the prompt if one is outstanding.
 *
 * <p>Returns an empty object when there is none, so call sites can spread it unconditionally and
 * an unprompted contribution carries no prompt properties at all rather than `from_prompt: false`
 * on every event in the product.
 */
export function consumePromptFollow(): Record<string, unknown> {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return {};
    sessionStorage.removeItem(KEY);          // claimed, once, whatever happens next
    const parsed = JSON.parse(raw) as { direction?: PromptDirection; at?: number };
    if (!parsed?.direction || typeof parsed.at !== "number") return {};
    if (Date.now() - parsed.at > WINDOW_MS) return {};
    return { from_prompt: true, prompt_direction: parsed.direction };
  } catch {
    return {};
  }
}
