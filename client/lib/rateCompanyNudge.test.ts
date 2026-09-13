import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isNudgeSuppressed, suppressNudge } from "./rateCompanyNudge";

/**
 * Whether the "rate this company too" prompt should appear.
 *
 * The module is small and the whole of it is a judgement about when to stop asking somebody a
 * question they have already answered. Getting that wrong in either direction is bad in a way
 * people notice: asked again and again after declining, or never asked at all.
 *
 * The storage guards matter as much as the logic. Every read and write happens on a page somebody
 * is reading, and private windows and blocked site data throw on access - a prompt is never worth
 * breaking a page over, so both directions have to survive a storage that refuses.
 */

const KEY = (id: string | number) => `wp_company_rate_nudge:${id}`;
const DAY = 24 * 60 * 60 * 1000;

/*
  A localStorage of our own.

  These tests run in vitest's default node environment, which has no DOM and so no storage. A
  hand-rolled stub keeps it that way - switching the suite to jsdom for one file would change how
  every other lib test runs, and pulling jsdom in for it would be a dependency for four assertions.
*/
function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", makeStorage());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("whether the prompt has been suppressed", () => {
  it("is not suppressed for a company nobody has answered about", () => {
    expect(isNudgeSuppressed("acme")).toBe(false);
  });

  it("is suppressed once for that company", () => {
    suppressNudge("acme");

    expect(isNudgeSuppressed("acme")).toBe(true);
  });

  it("is suppressed per company, not globally", () => {
    /*
      Declining to rate one employer says nothing about another. Keyed globally, a single "maybe
      later" would silently end the prompt everywhere - and it is the kind of bug nothing surfaces,
      because the symptom is a thing that stops happening.
    */
    suppressNudge("acme");

    expect(isNudgeSuppressed("acme")).toBe(true);
    expect(isNudgeSuppressed("initech")).toBe(false);
  });

  it("accepts a numeric id and a slug as the same kind of key", () => {
    suppressNudge(42);

    expect(isNudgeSuppressed(42)).toBe(true);
    expect(isNudgeSuppressed("42")).toBe(true);
  });
});

describe("how long a dismissal lasts", () => {
  it("still holds a day short of the window", () => {
    vi.useFakeTimers();
    suppressNudge("acme");

    vi.setSystemTime(Date.now() + 29 * DAY);

    expect(isNudgeSuppressed("acme")).toBe(true);
  });

  it("lapses once the window is past", () => {
    /*
      Deliberately not permanent. Somebody who said "maybe later" a month ago may well mean later,
      and a suppression that never expires turns a soft decline into a permanent opt-out nobody
      asked for.
    */
    vi.useFakeTimers();
    suppressNudge("acme");

    vi.setSystemTime(Date.now() + 31 * DAY);

    expect(isNudgeSuppressed("acme")).toBe(false);
  });
});

describe("when the stored value cannot be trusted", () => {
  it("a value that is not a number does not suppress", () => {
    // Written by an older build, or edited by hand. Number("later") is NaN, and every comparison
    // against NaN is false - so an unguarded version suppresses forever by accident.
    localStorage.setItem(KEY("acme"), "later");

    expect(isNudgeSuppressed("acme")).toBe(false);
  });

  it("an empty value does not suppress", () => {
    localStorage.setItem(KEY("acme"), "");

    expect(isNudgeSuppressed("acme")).toBe(false);
  });

  it("an already-past timestamp does not suppress", () => {
    localStorage.setItem(KEY("acme"), String(Date.now() - DAY));

    expect(isNudgeSuppressed("acme")).toBe(false);
  });
});

describe("when storage itself refuses", () => {
  /*
    Private windows, a full quota, a browser set to block site data. Both calls run while somebody
    is reading their own review, so the only acceptable failure is the prompt behaving as though it
    had never been suppressed.
  */

  function withBrokenStorage(fn: () => void) {
    // Throwing on every access, the way a browser with site data blocked does - the throw is on
    // the property itself, not on the call, which is what makes it easy to miss in a try/catch
    // placed one level too deep.
    vi.stubGlobal("localStorage", {
      get getItem() { throw new Error("storage disabled"); },
      get setItem() { throw new Error("storage disabled"); },
    });
    fn();
  }

  it("reading reports not-suppressed rather than throwing", () => {
    withBrokenStorage(() => {
      expect(() => isNudgeSuppressed("acme")).not.toThrow();
      expect(isNudgeSuppressed("acme")).toBe(false);
    });
  });

  it("writing fails quietly rather than throwing", () => {
    // The cost is the prompt reappearing next visit, which is a far better failure than an
    // exception thrown from a toast callback on a page somebody is reading.
    withBrokenStorage(() => {
      expect(() => suppressNudge("acme")).not.toThrow();
    });
  });
});
