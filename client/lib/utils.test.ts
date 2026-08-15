import { describe, it, expect } from "vitest";
import { companyLogoDomain, toNameCase, toJobTitleCase, getRelativeTime } from "./utils";

describe("companyLogoDomain", () => {
  // ── Normal company names ─────────────────────────────────────────────────────
  it("converts plain company name to domain", () => {
    expect(companyLogoDomain("Shutterstock")).toBe("shutterstock.com");
  });

  it("strips corporate suffix Inc", () => {
    expect(companyLogoDomain("Acme Inc")).toBe("acme.com");
  });

  it("strips corporate suffix Corp", () => {
    expect(companyLogoDomain("Lemonade Corp")).toBe("lemonade.com");
  });

  it("strips corporate suffix LLC", () => {
    expect(companyLogoDomain("FooCo LLC")).toBe("fooco.com");
  });

  it("strips corporate suffix Ltd", () => {
    expect(companyLogoDomain("Widgets Ltd")).toBe("widgets.com");
  });

  it("handles multi-word names", () => {
    expect(companyLogoDomain("Bank of America")).toBe("bankofamerica.com");
  });

  // ── Company names that ARE domains — the bug that was fixed ──────────────────
  it("returns priceline.com as-is when company name is Priceline.com", () => {
    expect(companyLogoDomain("Priceline.com")).toBe("priceline.com");
  });

  it("returns booking.com as-is when company name is Booking.com", () => {
    expect(companyLogoDomain("Booking.com")).toBe("booking.com");
  });

  it("returns cars.com as-is when company name is Cars.com", () => {
    expect(companyLogoDomain("Cars.com")).toBe("cars.com");
  });

  it("handles domain-shaped names case-insensitively", () => {
    expect(companyLogoDomain("PRICELINE.COM")).toBe("priceline.com");
  });

  it("handles domain with subdomain TLD like .co.uk", () => {
    expect(companyLogoDomain("Compare.co.uk")).toBe("compare.co.uk");
  });

  // ── Edge cases ───────────────────────────────────────────────────────────────
  it("trims leading and trailing whitespace", () => {
    expect(companyLogoDomain("  Google  ")).toBe("google.com");
  });

  it("lowercases the result", () => {
    expect(companyLogoDomain("TESLA")).toBe("tesla.com");
  });

  it("strips spaces from multi-word names without dots", () => {
    expect(companyLogoDomain("JP Morgan")).toBe("jpmorgan.com");
  });
});

describe("toNameCase", () => {
  it("capitalises all-caps name", () => {
    expect(toNameCase("AL VALADO")).toBe("Al Valado");
  });

  it("capitalises all-lowercase name", () => {
    expect(toNameCase("al valado")).toBe("Al Valado");
  });

  it("handles hyphenated names", () => {
    expect(toNameCase("mary-jane watson")).toBe("Mary-Jane Watson");
  });

  it("trims leading and trailing whitespace", () => {
    expect(toNameCase("  alice  ")).toBe("Alice");
  });

  it("handles single-word name", () => {
    expect(toNameCase("alice")).toBe("Alice");
  });

  it("handles mixed-case input", () => {
    expect(toNameCase("jOHN sMITH")).toBe("John Smith");
  });

  it("preserves hyphen between capitalised segments", () => {
    expect(toNameCase("ANNE-MARIE")).toBe("Anne-Marie");
  });

  it("handles three-word name", () => {
    expect(toNameCase("jean pierre dupont")).toBe("Jean Pierre Dupont");
  });

  it("handles already-correct casing", () => {
    expect(toNameCase("Alice Smith")).toBe("Alice Smith");
  });
});

describe("toJobTitleCase", () => {
  // Known abbreviations
  it("uppercases ceo", () => {
    expect(toJobTitleCase("ceo")).toBe("CEO");
  });

  it("uppercases cfo", () => {
    expect(toJobTitleCase("cfo")).toBe("CFO");
  });

  it("uppercases cto", () => {
    expect(toJobTitleCase("cto")).toBe("CTO");
  });

  it("uppercases vp in multi-word title", () => {
    expect(toJobTitleCase("vp engineering")).toBe("VP Engineering");
  });

  it("uppercases svp", () => {
    expect(toJobTitleCase("svp sales")).toBe("SVP Sales");
  });

  it("uppercases evp", () => {
    expect(toJobTitleCase("evp operations")).toBe("EVP Operations");
  });

  it("uppercases hr", () => {
    expect(toJobTitleCase("director of hr")).toBe("Director Of HR");
  });

  it("uppercases it", () => {
    expect(toJobTitleCase("head of it")).toBe("Head Of IT");
  });

  it("uppercases sre", () => {
    expect(toJobTitleCase("sre")).toBe("SRE");
  });

  // Plain title-casing
  it("title-cases chief executive officer", () => {
    expect(toJobTitleCase("chief executive officer")).toBe("Chief Executive Officer");
  });

  it("title-cases multi-word plain title", () => {
    expect(toJobTitleCase("service manager")).toBe("Service Manager");
  });

  it("title-cases director of operations", () => {
    expect(toJobTitleCase("director of operations")).toBe("Director Of Operations");
  });

  // Mixed
  it("handles mixed known and plain words", () => {
    expect(toJobTitleCase("senior vp of hr")).toBe("Senior VP Of HR");
  });

  it("handles already-correct casing", () => {
    expect(toJobTitleCase("Service Manager")).toBe("Service Manager");
  });

  it("handles all-caps non-abbreviation by lowercasing then capitalising", () => {
    expect(toJobTitleCase("DIRECTOR OF OPERATIONS")).toBe("Director Of Operations");
  });

  it("trims surrounding whitespace", () => {
    expect(toJobTitleCase("  ceo  ")).toBe("CEO");
  });

  it("handles uppercase known abbreviation input unchanged", () => {
    expect(toJobTitleCase("CEO")).toBe("CEO");
  });
});

describe("getRelativeTime", () => {
  function msAgo(ms: number): string {
    return new Date(Date.now() - ms).toISOString();
  }

  it("returns Unknown for undefined", () => {
    expect(getRelativeTime(undefined)).toBe("Unknown");
  });

  it("returns Unknown for invalid date string", () => {
    expect(getRelativeTime("not-a-date")).toBe("Unknown");
  });

  it("returns just now for a future date", () => {
    const future = new Date(Date.now() + 10_000).toISOString();
    expect(getRelativeTime(future)).toBe("just now");
  });

  it("returns just now for fewer than 60 seconds ago", () => {
    expect(getRelativeTime(msAgo(30_000))).toBe("just now");
  });

  it("returns 1 minute ago for ~60 seconds", () => {
    expect(getRelativeTime(msAgo(70_000))).toBe("1 minute ago");
  });

  it("returns plural minutes ago", () => {
    expect(getRelativeTime(msAgo(5 * 60_000))).toBe("5 minutes ago");
  });

  it("returns 1 hour ago", () => {
    expect(getRelativeTime(msAgo(90 * 60_000))).toBe("1 hour ago");
  });

  it("returns plural hours ago", () => {
    expect(getRelativeTime(msAgo(5 * 3600_000))).toBe("5 hours ago");
  });

  it("returns 1 day ago", () => {
    expect(getRelativeTime(msAgo(1.5 * 86_400_000))).toBe("1 day ago");
  });

  it("returns plural days ago", () => {
    expect(getRelativeTime(msAgo(5 * 86_400_000))).toBe("5 days ago");
  });

  it("returns 1 week ago", () => {
    expect(getRelativeTime(msAgo(10 * 86_400_000))).toBe("1 week ago");
  });

  it("returns plural weeks ago", () => {
    expect(getRelativeTime(msAgo(21 * 86_400_000))).toBe("3 weeks ago");
  });

  it("returns 1 month ago", () => {
    expect(getRelativeTime(msAgo(35 * 86_400_000))).toBe("1 month ago");
  });

  it("returns plural months ago", () => {
    expect(getRelativeTime(msAgo(180 * 86_400_000))).toBe("6 months ago");
  });

  it("returns 1 year ago", () => {
    expect(getRelativeTime(msAgo(400 * 86_400_000))).toBe("1 year ago");
  });

  it("returns plural years ago", () => {
    expect(getRelativeTime(msAgo(730 * 86_400_000))).toBe("2 years ago");
  });
});
