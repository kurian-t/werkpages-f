import { describe, it, expect } from "vitest";
import {
  fromSuggestion, declaredPayload, isLocationSet, type LocationSuggestion,
} from "./location";

/**
 * A street address, chosen from the suggestion list.
 *
 * <h2>Why this needs its own coverage</h2>
 *
 * <p>Addresses arrive from a new backend index but travel through the EXISTING suggestion shape:
 * `kind: "place"` with a `corpusPlace` and no `companyLocationId`, exactly like a business the
 * corpus offers. That was a deliberate choice - it means no client change was needed - and it is
 * also what makes the path easy to break silently later, because nothing in the client says the
 * word "address" anywhere.
 *
 * <p>The failure mode is not an error. A row whose `corpusPlace` is dropped on the way to the
 * payload submits as `exact` precision with nothing to resolve, so the form reports success and
 * the address is gone. These assertions are on the payload, which is the last point at which that
 * is still visible.
 */

/** As the server emits it: the address leads the building tier, the street is its own name. */
const ADDRESS: LocationSuggestion = {
  kind: "place",
  label: "55 Gould St",
  detail: "Toronto, ON",
  country: "Canada",
  state: "Ontario",
  city: "Toronto",
  precision: "exact",
  corpusPlace: {
    sourcePlaceId: "0981f7d2-e580-478d-88af-c2dd1d19c771",
    name: "55 Gould St",
    street: undefined as unknown as string,
    city: "Toronto",
    stateCode: "ON",
    countryCode: "CA",
  },
};

/** A business at the same address, which the list offers alongside it. */
const BUSINESS: LocationSuggestion = {
  kind: "place",
  label: "X University Community Theatre",
  detail: "55 Gould St · Toronto, ON",
  country: "Canada",
  state: "Ontario",
  city: "Toronto",
  precision: "exact",
  corpusPlace: {
    sourcePlaceId: "0fbe8da1-152e-4520-b799-aeab5bddf0ed",
    name: "X University Community Theatre",
    street: "55 Gould St",
    city: "Toronto",
    stateCode: "ON",
    countryCode: "CA",
  },
};

describe("an address chosen from the suggestion list", () => {
  it("1. is a complete, selectable answer", () => {
    const value = fromSuggestion(ADDRESS);
    expect(isLocationSet(value)).toBe(true);
    expect(value.precision).toBe("exact");
    expect(value.source).toBe("corpus");
    // The address itself is what the field shows, not the city it is in.
    expect(value.label).toBe("Toronto, ON");
  });

  it("2. travels to the server whole, so it can be promoted on submit", () => {
    const payload = declaredPayload(fromSuggestion(ADDRESS));
    expect(payload.declaredPrecision).toBe("exact");
    expect(payload.declaredSource).toBe("corpus");
    /*
      The two fields the server's promotion depends on. CorpusPlace.fromBody returns null without
      a name and a sourcePlaceId, and a null there means the submission is stored as coarse
      geography with no complaint to anybody.
    */
    expect(payload.corpusPlace?.sourcePlaceId).toBe("0981f7d2-e580-478d-88af-c2dd1d19c771");
    expect(payload.corpusPlace?.name).toBe("55 Gould St");
    expect(payload.corpusPlace?.stateCode).toBe("ON");
    expect(payload.companyLocationId).toBeUndefined();
  });

  it("3. sends no coarse geography of its own", () => {
    /*
      THE PRIVACY-RELEVANT HALF.

      An exact pick sends the place and nothing else. The coarse country/state/city on the form -
      which, before prepopulation was removed, could have come from an IP guess rather than from
      the person - must not ride along beside it. The building already knows where it is, and the
      server re-derives the coarse parts from the place it promotes.
    */
    const payload = declaredPayload(fromSuggestion(ADDRESS));
    expect(payload.declaredCountry).toBeUndefined();
    expect(payload.declaredState).toBeUndefined();
    expect(payload.declaredCity).toBeUndefined();
  });

  it("4. is a different answer from a business at the same address", () => {
    /*
      Both are offered, and picking one must not store the other. They are distinct corpus
      entities, so the ids differ even though the street, city and region are identical - which is
      the whole reason the id is what gets stored rather than the address text.
    */
    const address = declaredPayload(fromSuggestion(ADDRESS));
    const business = declaredPayload(fromSuggestion(BUSINESS));
    expect(address.corpusPlace?.sourcePlaceId)
      .not.toBe(business.corpusPlace?.sourcePlaceId);
    expect(business.corpusPlace?.name).toBe("X University Community Theatre");
  });
});
