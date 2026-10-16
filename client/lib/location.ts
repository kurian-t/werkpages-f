import axios from "axios";
import API_BASE from "@/lib/api";

/**
 * One location, as the form holds it and the API receives it.
 *
 * <p>The UI is a single field; the storage is normalized. Those are deliberately different shapes —
 * nobody filling in a form should have to understand our country/state/city hierarchy, and nothing
 * downstream should have to parse a display string to find out which city something was in.
 */
export interface LocationValue {
  country: string;
  state: string;
  city: string;
  precision: "country" | "state" | "city" | "exact" | null;
  /** Set only at exact precision, and only for a building already in our database. */
  companyLocationId: number | null;
  /**
   * A building picked from the search corpus, which has no id yet.
   *
   * <p>The corpus is map data in S3, not our database. A place only becomes a row when somebody
   * actually chooses it, so this is carried through the form and sent on submit; the server
   * promotes it and stores the resulting id. Exactly one of this and `companyLocationId` is set.
   */
  corpusPlace: CorpusPlace | null;
  /** How the chosen place reads on one line. Display only — never sent, never parsed. */
  label: string;
  /**
   * Where this answer came from, which decides how much the product may claim about it.
   *
   * <p>`corpus` means the person chose a normalized place we hold, so the structured fields are
   * corroborated. `manual` means they typed it: a real answer, and the ONLY answer available when
   * the corpus lacks their workplace or cannot be reached, but one nothing has confirmed. `null`
   * is a value from before the distinction existed.
   */
  source?: "corpus" | "manual" | null;
  /**
   * What the person actually wrote, kept verbatim for a manual entry.
   *
   * <p>Not parsed into country/state/city. Guessing structure out of free text is exactly what
   * turns "Waterlooo" into a confirmed city, and a manual answer is worth more read back as it was
   * given than tidied into something it never said.
   */
  text?: string;
}

/** A building as the corpus describes it, opaque to the client beyond display. */
export interface CorpusPlace {
  sourcePlaceId: string;
  name: string;
  brandName?: string | null;
  street?: string | null;
  city?: string | null;
  stateCode?: string | null;
  countryCode?: string | null;
  postalCode?: string | null;
}

export const EMPTY_LOCATION: LocationValue = {
  country: "", state: "", city: "", precision: null,
  companyLocationId: null, corpusPlace: null, label: "",
  source: null, text: "",
};

/**
 * A location somebody typed, which the corpus did not supply.
 *
 * <p>Location is mandatory; choosing a suggestion is not. A workplace missing from the corpus, or
 * a corpus that cannot be reached, must never be the reason somebody cannot say where they worked.
 *
 * <p>NOTHING IS INFERRED FROM THE TEXT. The string is kept as written and marked unverified. Only
 * structured fields confirmed some other way - the visitor's own country, say - are carried, and
 * they are passed in rather than parsed out. The precision rung therefore describes what was
 * actually corroborated, which for a bare typed answer is nothing at all.
 */
export function fromManualText(
  text: string,
  confirmed?: { country?: string | null; state?: string | null; city?: string | null },
): LocationValue {
  const country = confirmed?.country?.trim() ?? "";
  const state   = confirmed?.state?.trim()   ?? "";
  const city    = confirmed?.city?.trim()    ?? "";
  return {
    country, state, city,
    // Only rungs somebody else vouched for. A typed string confirms none of them.
    precision: city ? "city" : state ? "state" : country ? "country" : null,
    companyLocationId: null,
    corpusPlace: null,
    label: "",
    source: "manual",
    text,
  };
}

/**
 * Whether the question has been answered at all.
 *
 * <p>A manual entry counts: it has no precision rung, because nothing corroborated one, and it is
 * still somebody telling us where they worked. Gating on `precision` alone is what let a form with
 * a typed location be treated as having none.
 */
export function isLocationSet(value: LocationValue | null | undefined): boolean {
  // Absent counts as unanswered. Callers reach this from form state that may not be built yet,
  // and throwing there would turn "no location" into a blank page rather than a prompt.
  if (!value) return false;
  if (value.precision) return true;
  return value.source === "manual" && (value.text ?? "").trim().length > 0;
}

/**
 * One row in the suggestion list.
 *
 * `geo` is a place on the map; `place` is a building belonging to the company in question. Both are
 * normalized values from the server — never something assembled from what somebody typed.
 */
export interface LocationSuggestion {
  kind: "geo" | "place";
  /** Primary line: "Waterloo, Ontario, Canada" or "Walmart Supercentre". */
  label: string;
  /** Secondary line, for a building: "1005 Ottawa St N · Kitchener, ON". */
  detail?: string;
  country: string;
  state?: string;
  city?: string;
  precision: "country" | "state" | "city" | "exact";
  /** Present for a building already in our database. */
  companyLocationId?: number;
  /** Present instead, for a building offered from the search corpus. */
  corpusPlace?: CorpusPlace;
}

/**
 * The same suggestions, with the country already on the form shown first.
 *
 * <p>A SOFT preference, applied after the search rather than inside it. The country used to be
 * sent as a filter, and a filter makes itself permanent: a field holding "London, Ontario" could
 * only ever find Canadian places, so the country could never be changed. Typing "United Kingdom"
 * returned a freight company in Montreal; typing "London, England" returned England, Arkansas.
 *
 * <p>Ranking cannot do that. Everything the corpus knows is still in the list and still
 * selectable - "London" simply offers London, Ontario above London, England for somebody already
 * in Canada, and offers both.
 *
 * <p>Stable, so the server's own ordering - leading-match first, then population - survives
 * within each group. Anything the server ranked highly is still ranked highly among its peers.
 */
export function preferCountry(
  list: LocationSuggestion[],
  country: string | null | undefined,
): LocationSuggestion[] {
  const want = (country ?? "").trim().toLowerCase();
  if (!want) return list;
  const matching = list.filter((s) => (s.country ?? "").trim().toLowerCase() === want);
  if (matching.length === 0 || matching.length === list.length) return list;
  return [...matching, ...list.filter((s) => (s.country ?? "").trim().toLowerCase() !== want)];
}

/** How a stored location reads on one line, coarsest parts last. */
/**
 * Whether somebody has actually stated a location.
 *
 * <p>Precision is the test, not whether the strings happen to be non-empty: it is set only when a
 * person chose a rung, so a partially populated value from some other source cannot pass for an
 * answer. One helper, because every form that requires a location has to ask this the same way.
 */
export function hasDeclaredLocation(value: LocationValue): boolean {
  return value.precision != null;
}

export function formatLocation(value: LocationValue): string {
  // As they wrote it. Re-casing or re-ordering a manual answer presents it as something we
  // normalized, which is precisely the claim a manual entry is not allowed to make.
  if (value.source === "manual" && (value.text ?? "").trim()) return value.text!;
  if (value.precision === "exact" && value.label) return value.label;
  const parts = [value.city, value.state, value.country].filter(p => p && p.trim());
  return parts.join(", ");
}

/** A suggestion, applied. The server re-derives the coarse parts for an exact pick anyway. */
export function fromSuggestion(s: LocationSuggestion): LocationValue {
  return {
    country: s.country ?? "",
    state: s.state ?? "",
    city: s.city ?? "",
    precision: s.precision,
    companyLocationId: s.companyLocationId ?? null,
    corpusPlace: s.corpusPlace ?? null,
    label: s.detail ? `${s.detail}` : s.label,
    // Chosen from the corpus, so the structured fields above are corroborated.
    source: "corpus",
    text: "",
  };
}

/**
 * The keys the API expects.
 *
 * At exact precision only the id is sent: the building already knows where it is, and a coarse
 * value copied from a form that has since drifted would claim a city the address is not in.
 */
export function declaredPayload(value: LocationValue) {
  if (!isLocationSet(value)) return {};
  /*
    A MANUAL ENTRY IS SENT AS ONE, never dressed up as a corpus place.

    The text goes as text, the source says it is unverified, and only coarse fields that were
    independently confirmed travel with it. No corpusPlace, no companyLocationId: the server must
    not be handed something that looks corroborated and promote it into a real location row.
  */
  if (value.source === "manual") {
    return {
      declaredCountry: value.country.trim() || null,
      declaredState: value.state.trim() || null,
      declaredCity: value.city.trim() || null,
      declaredPrecision: value.precision,
      declaredSource: "manual",
      declaredText: value.text ?? "",
    };
  }
  if (value.precision === "exact") {
    // A building already in our database is sent by id. One picked from the corpus has no id yet,
    // so it is sent whole and the server promotes it to a real location on submit — creating rows
    // only for places somebody actually chose, rather than for everything they scrolled past.
    return value.companyLocationId
      ? { declaredPrecision: "exact", companyLocationId: value.companyLocationId,
          declaredSource: "corpus" }
      : { declaredPrecision: "exact", corpusPlace: value.corpusPlace,
          declaredSource: "corpus" };
  }
  return {
    declaredCountry: value.country.trim() || null,
    declaredState: value.state.trim() || null,
    declaredCity: value.city.trim() || null,
    declaredPrecision: value.precision,
    declaredSource: value.source ?? "corpus",
  };
}


/**
 * The visitor's own country and state, as a location the form can show.
 *
 * <p>Used whenever the location field would otherwise be empty — a fresh form, or an older review
 * written before the field existed. Country is always populated (`fetchGeo` falls back to timezone
 * inference), so this always produces at least a country rung.
 *
 * <p><b>It fills the visible field, it does not quietly attach itself at submit.</b> A value the
 * person can see, change and submit unchanged is a declaration; one attached behind their back is
 * an inference about where they worked, drawn from an IP address. Only the first is publishable,
 * and keeping the difference is the whole reason observed and declared are separate types.
 */
export function fromGeo(geo: { country?: string | null; state?: string | null; city?: string | null }): LocationValue {
  const country = geo.country?.trim() ?? "";
  const state   = geo.state?.trim() ?? "";
  const city    = geo.city?.trim() ?? "";
  return {
    country, state, city,
    // Stated, not inferred from which fields happen to be filled: the coarsest rung that actually
    // has a value beneath it.
    precision: city ? "city" : state ? "state" : country ? "country" : null,
    companyLocationId: null,
    corpusPlace: null,
    label: "",
    // Geography we were told, not a place anybody picked and not something typed.
    source: null,
    text: "",
  };
}

/**
 * The visitor's COUNTRY as a starting value, and nothing finer.
 *
 * <p>Deliberately not {@link fromGeo}, which copies the city and region too. Those describe the
 * READER, not the manager, and writing them into a manager's location is how a search that asks
 * for no location ended up publishing the searcher's own city on a profile. A country is a
 * defensible default - coarse, visible in the field, and changeable. A city is not.
 *
 * <p>`source` stays null on purpose. It is what separates geography we were TOLD from a place
 * somebody picked (`corpus`) or typed (`manual`), so an IP-derived default can never be mistaken
 * later for a human declaration.
 */
export function countryFromGeo(geo: { country?: string | null }): LocationValue {
  const country = geo.country?.trim() ?? "";
  return {
    ...EMPTY_LOCATION,
    country,
    precision: country ? "country" : null,
  };
}

/** Whether this location was declared by a person, rather than defaulted from their address. */
export function isDeclaredByPerson(value: LocationValue): boolean {
  return value.source != null;
}

/** The stored value if there is one, the visitor's own geography if there is not. */
export function orUserGeo(value: LocationValue, geo: Parameters<typeof fromGeo>[0]): LocationValue {
  return value.precision ? value : fromGeo(geo);
}

/**
 * Suggestions for a query, within a company and the geography already chosen.
 *
 * <p>The company is always known before this control is used, so this is not maps search: it is
 * "which of *this* company's places did you mean". The current country and state narrow it further,
 * so typing "Waterloo" under Ontario cannot offer Waterloo, Belgium.
 *
 * <p>Failure is silent and returns nothing. A suggestion list that cannot load must never stop
 * somebody filling in a form.
 */
export async function fetchLocationSuggestions(
  query: string,
  ctx: { companyId?: number | null; companyName?: string; country?: string; state?: string },
): Promise<LocationSuggestion[]> {
  try {
    const res = await axios.get(`${API_BASE}/api/company-locations/suggest`, {
      params: {
        q: query,
        companyId: ctx.companyId ?? undefined,
        company: ctx.companyName || undefined,
        country: ctx.country || undefined,
        state: ctx.state || undefined,
      },
    });
    return Array.isArray(res.data) ? res.data : [];
  } catch {
    return [];
  }
}

/**
 * A manager's location, as a value any control can hold.
 *
 * <p><b>What may be shown is decided by the server, not here.</b> The API withholds sub-country
 * detail for a location nobody confirmed - a manager created by a search carries the SEARCHER's
 * geography - so those fields simply are not in the response, and this reads whatever did arrive.
 *
 * <p>It briefly re-derived that rule, suppressing anything below country when
 * {@code approvalStatus === "ghost"}. Two things were wrong with it. Hiding a value the response
 * still carried was not anonymity at all, just a quieter page. And once the edit form could
 * correct a ghost's location, the same rule hid the correction: the row stays a ghost after an
 * edit, so a city somebody had explicitly typed could never appear.
 *
 * <p>So the judgement lives in one place - the projection every read goes through - and this is a
 * plain reader. Precision is stated from what is present.
 *
 * <p>It exists so the profile display and the edit form cannot disagree. They did: the header
 * suppressed the city while the edit form below it seeded the same city into a visible input.
 */
export function visibleManagerLocation(manager: {
  country?: string | null;
  state?: string | null;
  city?: string | null;
  locationName?: string | null;
  companyLocationId?: number | null;
}): LocationValue {
  const country = manager.country?.trim() ?? "";
  const state   = manager.state?.trim()   ?? "";
  const city    = manager.city?.trim()    ?? "";
  const label   = manager.locationName?.trim() ?? "";
  return {
    country, state, city,
    precision: label ? "exact" : city ? "city" : state ? "state" : country ? "country" : null,
    companyLocationId: manager.companyLocationId ?? null,
    corpusPlace: null,
    label,
  };
}


/**
 * Whether a suggestion list actually answers "where is this place".
 *
 * <p><b>This is the test that decides whether to widen the search beyond the current country,
 * and it is deliberately not "is the list empty".</b>
 *
 * <p>It used to be. Searching "kitchener" while the field held a UK location returned a London
 * pub called "Lord Kitchener" - a `place`, matched on its business name - and a non-empty list
 * counted as success, so the search was never widened and Kitchener, Ontario could not be
 * reached at all. The country filter made itself permanent again, this time sprung by a pub.
 *
 * <p>A `geo` row is a place on the map and is always a valid answer on its own. A `place` is a
 * specific building, useful when it is the one meant and noise when it is not. Only the former
 * settles the question.
 */
export function hasGeography(list: LocationSuggestion[]): boolean {
  return list.some(s => s.kind === "geo");
}

/**
 * The narrowed country's results, with geography found in a wider search placed above them.
 *
 * <p>Merged rather than substituted: somebody genuinely looking for that London pub should still
 * find it under the city they were offered. Geography leads because it is the answer most people
 * can give, and because it is the one that was missing.
 */
export function mergeWidenedSuggestions(
  narrow: LocationSuggestion[],
  widened: LocationSuggestion[],
): LocationSuggestion[] {
  const geo = widened.filter(s => s.kind === "geo");
  if (geo.length === 0) return narrow;
  return [...geo, ...narrow];
}
