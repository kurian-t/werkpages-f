import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import posthog from "@/lib/posthog";

// Tracks page views on every route change
export function PostHogRouteTracker() {
  const location = useLocation();

  useEffect(() => {
    posthog.capture("$pageview", { $current_url: window.location.href });
  }, [location.pathname]);

  return null;
}
