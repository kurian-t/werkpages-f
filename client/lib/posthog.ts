import posthog from "posthog-js";

const key  = import.meta.env.VITE_POSTHOG_KEY  as string | undefined;
const host = import.meta.env.VITE_POSTHOG_HOST as string | undefined;

if (key && host) {
  posthog.init(key, {
    api_host: host,

    // Route tracking is handled manually in PostHogProvider
    capture_pageview: false,

    session_recording: {
      maskAllInputs: true,
      maskInputOptions: { password: true, email: true },
      maskTextSelector: "[data-ph-mask]",
    },

    // sessionStorage: persists within a tab but cleared when the tab closes.
    // No cross-session tracking - each new browser session is anonymous.
    persistence: "sessionStorage",

    // Don't capture IP address
    ip: false,

    respect_dnt: false,
  });
}

export default posthog;
