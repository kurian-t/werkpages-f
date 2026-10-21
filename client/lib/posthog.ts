import posthog from "posthog-js";

const key  = import.meta.env.VITE_POSTHOG_KEY  as string | undefined;
const host = import.meta.env.VITE_POSTHOG_HOST as string | undefined;

/**
 * Where this browser's opt-out is remembered.
 *
 * <p>Deliberately NOT the same store as the analytics state. Events persist in sessionStorage so
 * that each tab is anonymous and nothing follows anybody between visits; an opt-out has to outlive
 * the tab or it is useless, because the browser would start capturing again the next morning.
 */
const OPT_OUT_KEY = "ph_opt_out";

/** Opting a browser out, and back in, without identifying anybody. */
export const OPT_OUT_URL = "?ph_optout=1";
export const OPT_IN_URL  = "?ph_optout=0";

/**
 * What a visit should do about capturing, from the URL and what this browser already decided.
 *
 * <p>Pure, and exported, so the decision is unit-testable without a browser. The URL wins when it
 * says anything, and silence means keep whatever was chosen before.
 *
 * @param search the query string, including the leading "?"
 * @param stored the remembered flag, or null
 */
export function optOutDecision(search: string, stored: string | null): "out" | "in" | null {
  const asked = new URLSearchParams(search).get("ph_optout");
  if (asked === "1" || asked === "true")  return "out";
  if (asked === "0" || asked === "false") return "in";
  return stored === "1" ? "out" : null;
}

function remembered(): string | null {
  try { return window.localStorage.getItem(OPT_OUT_KEY); } catch { return null; }
}

function remember(value: "out" | "in"): void {
  try {
    if (value === "out") window.localStorage.setItem(OPT_OUT_KEY, "1");
    else window.localStorage.removeItem(OPT_OUT_KEY);
  } catch {
    /*
      Private mode, or storage disabled. The opt-out still applies to THIS tab through the call
      below; it just will not be remembered. Failing the whole analytics setup over it would be a
      worse outcome than an opt-out that has to be re-applied.
    */
  }
}

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

    /*
      THE OPT-OUT OUTLIVES THE TAB, even though the analytics state does not.

      PostHog stores the opt-out flag using `persistence` unless told otherwise, which here is
      sessionStorage - so opting out would be forgotten the moment the tab closed and the browser
      would quietly start capturing again. This is the one piece of state that has to survive, and
      it holds no identity: it records a choice, not a person.
    */
    opt_out_capturing_persistence_type: "localStorage",

    // Don't capture IP address
    ip: false,

    respect_dnt: false,
  });

  /*
    A PER-BROWSER OPT-OUT, applied before anything is captured.

    Visit ?ph_optout=1 once on a browser used for testing and it stops sending events, on that
    browser only, until ?ph_optout=0. Nobody is identified and no other visitor's tracking changes,
    which is what a person property or a build-time flag would each have got wrong: the first needs
    an identity this product deliberately does not create, and the second would silence the whole
    production build rather than one browser.

    Runs at module load, which is before PostHogProvider's first $pageview effect.
  */
  if (typeof window !== "undefined") {
    const decision = optOutDecision(window.location.search, remembered());
    if (decision === "out") {
      remember("out");
      posthog.opt_out_capturing();
    } else if (decision === "in") {
      remember("in");
      posthog.opt_in_capturing();
    }
  }
}

export default posthog;
