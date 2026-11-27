import { describe, expect, it } from "vitest";
import { stablePseudonym } from "./pseudonym";

/**
 * REPORTED, 2026-11-26: a company page showed "Anonymous employee" beside ratings signed with
 * ordinary handles, so a reader could tell which opinion was written by somebody who had deleted
 * their account. This helper is what the card falls back to instead of that label.
 */
describe("stablePseudonym", () => {
  const HANDLE = /^[A-Z][a-z]+[A-Z][a-z]+[1-9][0-9]$/;

  it("looks like a handle somebody chose", () => {
    expect(stablePseudonym("rat-3")).toMatch(HANDLE);
    expect(stablePseudonym("6f1b5d64-1c1a-4a7f-9c9e-2b7a3f5d8e10")).toMatch(HANDLE);
  });

  it("gives the same row the same name every time", () => {
    // The whole point of deriving it from the id. A fresh random name per render would sign one
    // opinion differently on every page load, which is more obviously invented than the label it
    // replaces.
    const first = stablePseudonym("rat-3");
    for (let i = 0; i < 50; i++) expect(stablePseudonym("rat-3")).toBe(first);
  });

  it("does not give every row the same name", () => {
    // Not a uniqueness claim: two cards sharing a handle is legitimate. What would be a defect is
    // a hash that ignores its input, which is what an unseeded or collapsing index produces.
    const names = new Set(Array.from({ length: 500 }, (_, i) => stablePseudonym(`id-${i}`)));
    expect(names.size).toBeGreaterThan(100);
  });

  it("separates ids that differ by one character", () => {
    // Without dividing before the second lookup, neighbouring ids shared an animal and differed
    // only in adjective, so a list of sequential rows read as variations on one name.
    const a = stablePseudonym("rat-1");
    const b = stablePseudonym("rat-2");
    const c = stablePseudonym("rat-3");
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it("never contains the word anonymous", () => {
    for (let i = 0; i < 300; i++) {
      expect(stablePseudonym(`id-${i}`).toLowerCase()).not.toContain("anon");
    }
  });

  it("still produces a name for an empty id", () => {
    // The card reaches here with whatever the payload holds. Returning "" would leave the slot
    // blank, which is its own tell among cards that all carry a name.
    expect(stablePseudonym("")).toMatch(HANDLE);
  });
});
