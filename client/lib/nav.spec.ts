import { describe, it, expect } from "vitest";
import { activeNavSection } from "./nav";

describe("activeNavSection", () => {
  it("highlights Managers on a manager page, however deeply nested", () => {
    // The bug this replaces: drilling Companies → a manager highlighted Industries, because the
    // canonical URL starts with /industries and the check was a prefix match.
    expect(activeNavSection("/industries/technology/companies/red-hat/managers/jane-doe"))
      .toBe("managers");
    expect(activeNavSection("/companies/red-hat/managers/jane-doe")).toBe("managers");
    expect(activeNavSection("/manager/42")).toBe("managers");
    expect(activeNavSection("/directory")).toBe("managers");
  });

  it("highlights Companies on a company page, nested or flat", () => {
    expect(activeNavSection("/industries/technology/companies/red-hat")).toBe("companies");
    expect(activeNavSection("/companies/red-hat")).toBe("companies");
    expect(activeNavSection("/companies")).toBe("companies");
  });

  it("highlights Industries only when the industry is the deepest thing addressed", () => {
    expect(activeNavSection("/industries")).toBe("industries");
    expect(activeNavSection("/industries/technology")).toBe("industries");
  });

  it("prefers the deepest entity when a URL names several", () => {
    const url = "/industries/technology/companies/red-hat/managers/jane-doe";
    expect(activeNavSection(url)).toBe("managers");
    expect(activeNavSection("/industries/technology/companies/red-hat")).toBe("companies");
    expect(activeNavSection("/industries/technology")).toBe("industries");
  });

  it("ignores a trailing slash", () => {
    expect(activeNavSection("/companies/")).toBe("companies");
    expect(activeNavSection("/industries/technology/")).toBe("industries");
    expect(activeNavSection("/industries/technology/companies/red-hat/managers/jane-doe/"))
      .toBe("managers");
  });

  it("is case-insensitive, since URLs get shared in odd casings", () => {
    expect(activeNavSection("/Companies/Red-Hat")).toBe("companies");
    expect(activeNavSection("/INDUSTRIES")).toBe("industries");
  });

  it("highlights nothing on pages outside the three sections", () => {
    expect(activeNavSection("/")).toBeNull();
    expect(activeNavSection("/explore")).toBeNull();
    expect(activeNavSection("/add")).toBeNull();
    expect(activeNavSection("/notifications")).toBeNull();
    expect(activeNavSection("")).toBeNull();
  });

  it("does not match a word that merely starts the same way", () => {
    // "/company-culture" is not "/companies", and "/directory-of-things" is its own page.
    expect(activeNavSection("/company-culture")).toBeNull();
    expect(activeNavSection("/industries-report")).toBeNull();
  });
});
