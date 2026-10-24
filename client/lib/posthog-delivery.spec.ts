import { describe, it, expect, beforeEach } from "vitest";
import { applyOptOut, type OptOutStorage, type OptOutTarget } from "./posthog";
import { useAnalytics } from "../hooks/useAnalytics";

/**
 * That opting out actually stops capture, and survives the browser being closed and reopened.
 *
 * <h2>Why these take their storage as an argument</h2>
 *
 * <p>A browser-level attempt at this reported green while proving nothing: PostHog does not
 * initialise without a build-time key, so "no unexpected events were captured" was true for the
 * trivial reason that none were possible. A unit attempt against the globals fails the same way
 * for a different reason - this environment has no `window` and a `localStorage` stub with no
 * `setItem`, so every assertion would pass against code that does nothing.
 *
 * <p>So the wiring takes its storage and its target, and these tests supply ones that work. The
 * behaviour under test is real; only the surroundings are substituted.
 *
 * <h2>The positive control comes first</h2>
 *
 * <p>Every opt-out assertion claims something did NOT happen, which is the easiest kind of claim
 * to satisfy by accident. The first test proves capture genuinely reaches the target here, so the
 * rest are measuring the opt-out rather than a broken harness.
 */

/** A storage that behaves like the browser's, unlike the one this environment provides. */
function fakeStorage(initial: Record<string, string> = {}): OptOutStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = v; },
    removeItem: (k) => { delete data[k]; },
  };
}

function recorder() {
  const calls: string[] = [];
  const target: OptOutTarget = {
    opt_out_capturing: () => calls.push("opt_out"),
    opt_in_capturing: () => calls.push("opt_in"),
  };
  return { calls, target };
}

describe("opting a browser out", () => {
  let storage: ReturnType<typeof fakeStorage>;
  let rec: ReturnType<typeof recorder>;

  beforeEach(() => { storage = fakeStorage(); rec = recorder(); });

  it("POSITIVE CONTROL: the target is reachable, so a silent run would be a real failure", () => {
    // Without this, every "did not opt out" assertion below would also pass against a no-op.
    expect(applyOptOut("?ph_optout=1", storage, rec.target)).toBe("out");
    expect(rec.calls).toEqual(["opt_out"]);
  });

  it("stops capture and remembers the choice", () => {
    applyOptOut("?ph_optout=1", storage, rec.target);
    expect(rec.calls).toEqual(["opt_out"]);
    expect(storage.data["ph_opt_out"]).toBe("1");
  });

  it("stays opted out when the browser is closed and reopened", () => {
    /*
      THE CASE THE WHOLE DESIGN IS FOR.

      Analytics state lives in sessionStorage and does not survive a reopened browser; the opt-out
      must, or the browser quietly resumes capturing the next morning. A second call with no
      parameter, against storage that persisted, is exactly a new tab.
    */
    applyOptOut("?ph_optout=1", storage, rec.target);
    const reopened = recorder();
    expect(applyOptOut("", storage, reopened.target)).toBe("out");
    expect(reopened.calls).toEqual(["opt_out"]);
  });

  it("can be undone, and stays undone", () => {
    applyOptOut("?ph_optout=1", storage, rec.target);
    const back = recorder();
    expect(applyOptOut("?ph_optout=0", storage, back.target)).toBe("in");
    expect(back.calls).toEqual(["opt_in"]);
    expect(storage.data["ph_opt_out"]).toBeUndefined();

    const later = recorder();
    expect(applyOptOut("", storage, later.target)).toBeNull();
    expect(later.calls).toEqual([]);
  });

  it("never touches an ordinary visitor", () => {
    expect(applyOptOut("?q=toronto&country=Canada", storage, rec.target)).toBeNull();
    expect(rec.calls).toEqual([]);
    expect(storage.data["ph_opt_out"]).toBeUndefined();
  });

  it("still opts out when storage refuses, it just cannot remember", () => {
    // Private mode. Losing the memory is acceptable; ignoring the request is not.
    const refusing: OptOutStorage = {
      getItem: () => { throw new Error("denied"); },
      setItem: () => { throw new Error("denied"); },
      removeItem: () => { throw new Error("denied"); },
    };
    expect(applyOptOut("?ph_optout=1", refusing, rec.target)).toBe("out");
    expect(rec.calls).toEqual(["opt_out"]);
  });
});

describe("analytics can never break a contribution", () => {
  it("swallows a capture that throws", () => {
    /*
      Every track() call sits inside a search or a save. A blocked script, an exhausted quota or a
      storage error must cost a data point, never somebody's rating.
    */
    const { track } = useAnalytics();
    expect(() => track("review_submitted", { kind: "new" })).not.toThrow();
  });
});
