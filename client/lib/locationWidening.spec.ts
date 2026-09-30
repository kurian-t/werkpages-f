import { describe, it, expect } from "vitest";
import { hasGeography, mergeWidenedSuggestions, visibleManagerLocation } from "./location";
import type { LocationSuggestion } from "./location";

/**
 * The bug: a field holding a UK location could never be changed to a Canadian one.
 *
 * Reported as "It was hard for kitchener, ontario, canada to show up which was NOT cool", after an
 * earlier report that the field was "sticking to locations in the UK".
 *
 * The search widens past the field's current country only when the narrow search fails. That test
 * was `found.length === 0`, and searching "kitchener" against the UK is NOT empty: it returns a
 * London pub called "Lord Kitchener", matched on its business name. One irrelevant pub therefore
 * counted as success, the widening never ran, and Kitchener, Ontario was unreachable.
 */
const pub: LocationSuggestion = {
  kind: "place", label: "Lord Kitchener", detail: "49 E Barnet Rd",
  country: "United Kingdom", precision: "exact",
};
const kitchenerON: LocationSuggestion = {
  kind: "geo", label: "Kitchener, Ontario, Canada",
  country: "Canada", state: "Ontario", city: "Kitchener", precision: "city",
};

describe("widening past the field's current country", () => {
  it("does not count a business whose NAME matches as having found the place", () => {
    // The whole bug in one assertion. Under the old `length === 0` rule this list stopped the
    // widening; it must not, because nothing in it says where Kitchener is.
    expect(hasGeography([pub])).toBe(false);
  });

  it("counts a geography row as an answer, and stops widening", () => {
    expect(hasGeography([kitchenerON, pub])).toBe(true);
  });

  it("treats an empty list as unanswered", () => {
    expect(hasGeography([])).toBe(false);
  });

  it("puts the widened geography above the narrow country's own results", () => {
    // Merged, not substituted: somebody genuinely after that pub must still be able to pick it.
    const merged = mergeWidenedSuggestions([pub], [kitchenerON]);
    expect(merged.map(s => s.label)).toEqual(["Kitchener, Ontario, Canada", "Lord Kitchener"]);
  });

  it("leaves the list alone when the wider search found no geography either", () => {
    const narrow = [pub];
    expect(mergeWidenedSuggestions(narrow, [{ ...pub, label: "Another Pub" }])).toBe(narrow);
  });
});

/**
 * The reader for a manager's location.
 *
 * <p>It does NOT decide what may be shown - the API does, by withholding sub-country detail for a
 * location nobody confirmed. This briefly re-derived that rule from approvalStatus, which hid the
 * response's own data and, worse, hid a city somebody had explicitly typed onto a search-created
 * profile: editing a location does not stop a row being a ghost. The judgement now lives in one
 * place and this reads what arrived.
 */
describe("reading a manager's location", () => {
  it("states precision from the finest part present", () => {
    expect(visibleManagerLocation({ country: "Canada" }).precision).toBe("country");
    expect(visibleManagerLocation({ country: "Canada", state: "Ontario" }).precision).toBe("state");
    expect(visibleManagerLocation({ country: "Canada", state: "Ontario", city: "Kitchener" }).precision).toBe("city");
    expect(visibleManagerLocation({ country: "Canada", locationName: "45 Cedarhill" }).precision).toBe("exact");
  });

  it("reads whatever the response carried, without second-guessing it", () => {
    // A search-created profile whose city somebody has since corrected. The API sent the city
    // because it is now declared, so it must appear - the old ghost check swallowed exactly this.
    const v = visibleManagerLocation({
      country: "Canada", state: "Ontario", city: "Kitchener", companyLocationId: 382,
    });
    expect(v).toMatchObject({ country: "Canada", state: "Ontario", city: "Kitchener", companyLocationId: 382 });
  });

  it("holds nothing when the response carried nothing", () => {
    // What a withheld location looks like from here: absent fields, not a special case.
    expect(visibleManagerLocation({}).precision).toBeNull();
    expect(visibleManagerLocation({ country: "Canada", state: null, city: null }))
      .toMatchObject({ state: "", city: "", precision: "country" });
  });
});
