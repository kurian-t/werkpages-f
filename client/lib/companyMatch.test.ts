import { describe, it, expect } from "vitest";
import { rankCompanyMatches } from "./companyMatch";

/**
 * Picking a company on the admin companies tab.
 *
 * <h2>The report</h2>
 *
 * "I want to say TD Auto Finance Is part of TD Bank, but i cant because TD Auto Finance does not
 * appear in the drop down." Searching `TD` returned, in this order:
 *
 *   Academy Sports + Outdoors
 *   Academy Sports & Outdoors, Inc.
 *   Aircastle LTD
 *   ALPHA & OMEGA SEMICONDUCTOR Ltd
 *   Amrize Ltd
 *   ARCH CAPITAL GROUP LTD.
 *
 * Every one of them contains the letters "td": Ou-TD-oors, and L-TD. The admin pickers fetched
 * every company, kept `name.toLowerCase().includes(query)`, and took the first six - of a list the
 * server returns in alphabetical order. So the six slots filled with companies beginning with A
 * and the company actually named TD was never reachable, however much more of its name was typed.
 *
 * A substring match is not wrong, it is just the weakest kind, and it was being treated as the
 * only kind. These tests pin the ordering: what the person typed, then what starts with it, then
 * what has a word starting with it, and only then what merely contains it.
 */
const COMPANIES = [
  { id: 1, name: "Academy Sports + Outdoors" },
  { id: 2, name: "Academy Sports & Outdoors, Inc." },
  { id: 3, name: "Aircastle LTD" },
  { id: 4, name: "ALPHA & OMEGA SEMICONDUCTOR Ltd" },
  { id: 5, name: "Amrize Ltd" },
  { id: 6, name: "ARCH CAPITAL GROUP LTD." },
  { id: 7, name: "TD Auto Finance" },
  { id: 8, name: "TD Bank" },
  { id: 9, name: "Toronto-Dominion" },
];

const names = (rows: { name: string }[]) => rows.map(r => r.name);

describe("ranking company matches for the admin pickers", () => {
  it("THE REPORTED BUG: the company actually called TD is reachable", () => {
    const hits = rankCompanyMatches(COMPANIES, "TD", 6);

    expect(names(hits).slice(0, 2)).toEqual(["TD Auto Finance", "TD Bank"]);
    expect(names(hits)).toContain("TD Auto Finance");
  });

  it("ranks a name that starts with the query above one that merely contains it", () => {
    const hits = rankCompanyMatches(COMPANIES, "td", 9);

    expect(names(hits).indexOf("TD Bank"))
      .toBeLessThan(names(hits).indexOf("Aircastle LTD"));
  });

  it("still offers a mid-word match rather than hiding it", () => {
    // "Outdoors" genuinely contains the query, and an admin looking for it must still find it.
    const hits = rankCompanyMatches(COMPANIES, "td", 9);

    expect(names(hits)).toContain("Academy Sports + Outdoors");
  });

  it("puts an exact name first, whatever else starts with it", () => {
    const hits = rankCompanyMatches(COMPANIES, "TD Bank", 6);

    expect(names(hits)[0]).toBe("TD Bank");
  });

  it("matches a word in the middle of a name as a word, not as a fragment", () => {
    const hits = rankCompanyMatches(
      [{ id: 1, name: "Royal Bank of Canada" }, { id: 2, name: "Bankers Trust" }], "bank", 6);

    // "Bankers Trust" starts with it; "Royal Bank of Canada" has a word starting with it. Both
    // rank above a fragment, and the stronger one leads.
    expect(names(hits)).toEqual(["Bankers Trust", "Royal Bank of Canada"]);
  });

  it("is case and whitespace insensitive about what was typed", () => {
    expect(names(rankCompanyMatches(COMPANIES, "  td auto  ", 6))).toEqual(["TD Auto Finance"]);
  });

  it("honours the caller's limit, because the two pickers show different numbers", () => {
    expect(rankCompanyMatches(COMPANIES, "td", 2)).toHaveLength(2);
    expect(rankCompanyMatches(COMPANIES, "td", 8).length).toBeGreaterThan(2);
  });

  it("returns nothing for a query that matches nothing, rather than everything", () => {
    expect(rankCompanyMatches(COMPANIES, "zzzzz", 6)).toEqual([]);
  });

  it("orders alphabetically within a tier, so the list does not jump around", () => {
    const hits = rankCompanyMatches(
      [{ id: 1, name: "TD Zephyr" }, { id: 2, name: "TD Alpha" }], "td", 6);

    expect(names(hits)).toEqual(["TD Alpha", "TD Zephyr"]);
  });
});
