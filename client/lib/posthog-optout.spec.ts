import { describe, it, expect } from "vitest";
import { optOutDecision } from "./posthog";

/**
 * Opting one browser out of analytics, without identifying anybody.
 *
 * <h2>What this is for</h2>
 *
 * <p>Our own browsing inflates the product's numbers. The two obvious fixes are both wrong here:
 *
 * <ul>
 *   <li>A person property such as {@code $internal_or_test_user} needs {@code identify()}, and this
 *       product deliberately creates no person identity at all - events persist in sessionStorage,
 *       IP capture is off, and every session is anonymous.</li>
 *   <li>A build-time flag would silence the whole production build, not one browser.</li>
 * </ul>
 *
 * <p>So the choice is remembered per browser: visit {@code ?ph_optout=1} once on a machine used for
 * testing and it stops sending, until {@code ?ph_optout=0}. It records a choice, not a person.
 *
 * <h2>Why the decision is a pure function</h2>
 *
 * <p>The failure that matters is silent in both directions: an opt-out that does not stick keeps
 * polluting the data, and one that cannot be undone quietly loses a real visitor forever. Neither
 * shows up in the UI. Testing the rule directly is the only way to see it.
 */
describe("the per-browser analytics opt-out", () => {

  it("opts out when the URL says so", () => {
    expect(optOutDecision("?ph_optout=1", null)).toBe("out");
    expect(optOutDecision("?ph_optout=true", null)).toBe("out");
  });

  it("opts back in when the URL says so, overriding what was remembered", () => {
    // The undo has to work from the opted-out state, which is the only state it is ever used from.
    expect(optOutDecision("?ph_optout=0", "1")).toBe("in");
    expect(optOutDecision("?ph_optout=false", "1")).toBe("in");
  });

  it("keeps a previous opt-out across visits with no parameter", () => {
    /*
      THE POINT OF THE FEATURE. The opt-out has to outlive the tab: analytics state lives in
      sessionStorage, so without this the browser silently resumes capturing the next day and the
      numbers are polluted again by somebody who thought they had opted out.
    */
    expect(optOutDecision("", "1")).toBe("out");
    expect(optOutDecision("?utm_source=x", "1")).toBe("out");
  });

  it("leaves an ordinary visitor alone", () => {
    // No parameter, nothing remembered: capture normally. Anything else would silence real users.
    expect(optOutDecision("", null)).toBeNull();
    expect(optOutDecision("?q=toronto&country=Canada", null)).toBeNull();
  });

  it("ignores a value it does not recognise rather than guessing", () => {
    expect(optOutDecision("?ph_optout=", null)).toBeNull();
    expect(optOutDecision("?ph_optout=yes", null)).toBeNull();
    // ...but a remembered opt-out still stands, because the junk value decided nothing.
    expect(optOutDecision("?ph_optout=yes", "1")).toBe("out");
  });
});
