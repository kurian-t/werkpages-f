import { describe, it, expect } from "vitest";
import {
  EMPTY_LOCATION, fromManualText, declaredPayload, isLocationSet, formatLocation,
  type LocationValue,
} from "./location";

/**
 * Entering a location the corpus cannot offer.
 *
 * <h2>The decision this encodes</h2>
 *
 * <p>Location is MANDATORY. Choosing an autocomplete suggestion is NOT. Somebody whose workplace
 * is missing from the corpus, or who is filling the form while the corpus is unreachable, must
 * still be able to say where they worked and carry on. Suggestions are an aid to answering the
 * question, never the only way to answer it.
 *
 * <h2>Why this does not contradict "typed text is search input"</h2>
 *
 * <p>The original design forbade INVENTING normalized geography from arbitrary text - turning
 * "Waterlooo" into a confirmed city with coordinates and a corpus identity. That remains
 * forbidden. What is stored for a manual entry is the text as typed, marked unverified, plus only
 * those structured fields that were independently confirmed. The product never pretends a manual
 * answer was corroborated.
 *
 * <p>The design also assumed the field arrived PREPOPULATED with the visitor's inferred
 * geography, so "keep the last valid selection" always had something to keep. Prepopulation was
 * later removed on privacy grounds - an IP guess should not be published as fact about a real
 * manager - which left the rule with nothing to fall back on. These tests cover the gap that
 * opened between those two decisions.
 */

const CORPUS_PICK: LocationValue = {
  country: "Canada", state: "Ontario", city: "Waterloo", precision: "exact",
  companyLocationId: null,
  corpusPlace: {
    sourcePlaceId: "p-qnx", name: "QNX", street: "200 King St S",
    city: "Waterloo", stateCode: "ON", countryCode: "CA",
  },
  label: "200 King St S · Waterloo, ON",
  source: "corpus",
  text: "",
};

describe("a location the corpus did not supply", () => {
  it("1. a suggestion the person actually chose stays structured and verified", () => {
    expect(isLocationSet(CORPUS_PICK)).toBe(true);
    const payload = declaredPayload(CORPUS_PICK);
    expect(payload.declaredPrecision).toBe("exact");
    expect(payload.corpusPlace).toBeTruthy();
    // A corroborated place is not marked manual, because it was not.
    expect(payload.declaredSource).toBe("corpus");
  });

  it("2. a place the corpus does not hold is still a usable answer", () => {
    const typed = fromManualText("Gorsebrook Mill, Antigonish, Nova Scotia, Canada");

    expect(isLocationSet(typed)).toBe(true);
    const payload = declaredPayload(typed);
    expect(payload.declaredSource).toBe("manual");
    // The words they wrote, kept exactly.
    expect(payload.declaredText).toBe("Gorsebrook Mill, Antigonish, Nova Scotia, Canada");
    // AND NOTHING INVENTED. No corpus identity, no city conjured out of the string.
    expect(payload.corpusPlace ?? null).toBeNull();
    expect(payload.companyLocationId ?? null).toBeNull();
  });

  it("3. what somebody typed is preserved when the corpus could not answer at all", () => {
    /*
      The outage case. fetchLocationSuggestions fails silently and returns nothing, which is
      indistinguishable here from "the corpus has no such place" - and must be, because the person
      filling the form cannot tell those apart either and should not have to.
    */
    const typed = fromManualText("Canada");
    expect(isLocationSet(typed)).toBe(true);
    expect(declaredPayload(typed).declaredSource).toBe("manual");
  });

  it("4. being only as specific as you actually know is valid", () => {
    // Every rung is a legitimate final answer; the ladder is about precision, not completeness.
    for (const text of ["Canada", "Ontario, Canada", "Waterloo, Ontario, Canada"]) {
      const v = fromManualText(text);
      expect(isLocationSet(v), text).toBe(true);
      expect(declaredPayload(v).declaredText, text).toBe(text);
    }
  });

  it("5. no location at all is still refused", () => {
    expect(isLocationSet(EMPTY_LOCATION)).toBe(false);
    expect(isLocationSet(fromManualText("   "))).toBe(false);
    expect(declaredPayload(EMPTY_LOCATION)).toEqual({});
  });

  it("6. a manual entry reads back as the person wrote it", () => {
    // Round trip: what is shown on the collapsed control is what they typed, not a tidied,
    // re-parsed or re-cased version of it.
    const typed = fromManualText("waterloo ontario");
    expect(formatLocation(typed)).toBe("waterloo ontario");
  });

  it("structured fields confirmed independently survive alongside a manual entry", () => {
    // The country is known from the visitor's own geography, which is corroboration the typed
    // text did not need to supply. Keeping it is not inventing it.
    const typed = fromManualText("Gorsebrook Mill", { country: "Canada" });
    expect(typed.country).toBe("Canada");
    expect(declaredPayload(typed).declaredCountry).toBe("Canada");
    expect(declaredPayload(typed).declaredSource).toBe("manual");
    // Still nothing conjured for the parts nobody confirmed.
    expect(declaredPayload(typed).declaredCity ?? null).toBeNull();
  });
});
