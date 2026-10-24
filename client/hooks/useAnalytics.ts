import posthog from "@/lib/posthog";

/**
 * Sending an event, which must never be able to break what the reader was doing.
 *
 * <p>Every call site here sits inside a search or a save. A throw from analytics - a blocked
 * script, an exhausted quota, a storage error in private mode - would otherwise propagate into
 * that flow and lose somebody's contribution to report that they made one. Swallowed deliberately,
 * and logged nowhere the reader can see: a missing data point is an acceptable loss, and the
 * contribution is not.
 */
export function useAnalytics() {
  function track(event: string, props?: Record<string, unknown>) {
    try {
      posthog.capture(event, props);
    } catch {
      // Intentionally ignored. See above.
    }

    /*
      A TEST SEAM, inert unless something switched it on.

      Browser tests need to know that the product asked for an event, which is not observable
      otherwise: posthog-js is imported as a module rather than attached to the page, and it sends
      nothing at all without a build-time key. Without this the only way to check that a successful
      save reports once - and that a failed one reports nothing - is to read the code and hope.

      It does NOT prove anything was delivered to PostHog. It proves the application called
      tracking correctly, which is the half that lives in this repository.

      Production never defines the flag, so this is a property lookup that finds nothing.
    */
    try {
      const probe = typeof window !== "undefined"
        ? (window as unknown as { __ANALYTICS_PROBE__?: unknown[] }).__ANALYTICS_PROBE__
        : undefined;
      if (Array.isArray(probe)) probe.push({ event, props });
    } catch {
      // As above: never allowed to affect the contribution.
    }
  }

  return { track };
}
