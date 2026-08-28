import { describe, it, expect } from "vitest";
import {
  companyPath,
  managerPath,
  companyPathByName,
  UNCLASSIFIED_INDUSTRY_SLUG,
} from "./urls";

/**
 * These builders define the canonical URL shape in one place. The backend's SitemapService
 * builds the same strings independently, so the two must agree - a mismatch would advertise
 * URLs to Google that immediately redirect, costing crawl budget and splitting page signals.
 */
describe("canonical URL builders", () => {
  it("nests a company under its industry", () => {
    expect(companyPath("technology", "red-hat")).toBe("/industries/technology/companies/red-hat");
  });

  it("nests a manager under industry and company", () => {
    expect(managerPath("technology", "red-hat", "jane-doe"))
      .toBe("/industries/technology/companies/red-hat/managers/jane-doe");
  });

  it("falls back to 'other' when the company has no industry yet", () => {
    // industry is nullable - classification runs asynchronously after a company is created,
    // so unclassified companies still need a resolvable canonical URL.
    expect(companyPath(null, "new-co")).toBe("/industries/other/companies/new-co");
    expect(companyPath(undefined, "new-co")).toBe("/industries/other/companies/new-co");
    expect(managerPath(null, "new-co", "sam-lee"))
      .toBe("/industries/other/companies/new-co/managers/sam-lee");
  });

  it("treats a blank or whitespace industry as unclassified", () => {
    expect(companyPath("", "new-co")).toBe("/industries/other/companies/new-co");
    expect(companyPath("   ", "new-co")).toBe("/industries/other/companies/new-co");
  });

  it("uses the same fallback slug the backend sitemap uses", () => {
    expect(UNCLASSIFIED_INDUSTRY_SLUG).toBe("other");
  });

  it("keeps the un-nested lookup URL when only a name is known", () => {
    // The autocomplete yields a name with no slug and no industry; CompanyProfile resolves it
    // and redirects to the canonical path on load.
    expect(companyPathByName("Red Hat")).toBe("/companies/Red%20Hat");
  });

  it("encodes names that would otherwise break the path", () => {
    expect(companyPathByName("A&B / Co")).toBe("/companies/A%26B%20%2F%20Co");
  });
});
