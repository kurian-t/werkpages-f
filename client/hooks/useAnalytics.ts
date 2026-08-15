import posthog from "@/lib/posthog";

export function useAnalytics() {
  function track(event: string, props?: Record<string, unknown>) {
    posthog.capture(event, props);
  }

  return { track };
}
