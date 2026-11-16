import { describe, it, expect } from "vitest";
import { companyKey, roleKey, sameCompany, sameRole } from "./careerRoles";

describe("roleKey", () => {
  it("treats two roles at one employer as different stages", () => {
    /*
      THE DEFECT THIS EXISTS FOR. Keyed on the company alone these are one stage, which is how an
      admin removing the junior role of a promoted manager deleted the senior role's ratings too.
    */
    expect(roleKey("Visa", "Software Engineer"))
      .not.toBe(roleKey("Visa", "Director Software Engineering"));
  });

  it("treats one role at two employers as different stages", () => {
    expect(roleKey("Visa", "Director")).not.toBe(roleKey("Netflix", "Director"));
  });

  it("ignores the whitespace differences the chart ignores", () => {
    // Companies group whitespace-insensitively: "100 kellogg" and "100kellogg" are one employer.
    expect(roleKey("100 Kellogg", "VP")).toBe(roleKey("100kellogg", "vp"));
    // Titles collapse runs of space but keep the word separation.
    expect(roleKey("Visa", "Software  Engineer")).toBe(roleKey("visa", " Software Engineer "));
  });

  it("does not collapse titles whose words differ", () => {
    expect(roleKey("Visa", "SoftwareEngineer")).not.toBe(roleKey("Visa", "Software Engineer"));
  });

  it("handles a missing company or title without throwing", () => {
    expect(roleKey(null, undefined)).toBe(roleKey("", ""));
  });
});

describe("sameRole", () => {
  it("is true only for the same pair", () => {
    expect(sameRole({ company: "Visa", role: "CEO" }, { company: "visa", role: "ceo" })).toBe(true);
    expect(sameRole({ company: "Visa", role: "CEO" }, { company: "Visa", role: "CTO" })).toBe(false);
  });
});

describe("the key is safe to put in the DOM", () => {
  /*
    It is used as a data-testid and as a <select> option value. A NUL separator - the obvious first
    choice - is replaced inside an HTML attribute, so the handle silently stops matching.
  */
  it("contains no control characters", () => {
    // eslint-disable-next-line no-control-regex
    expect(roleKey("Visa", "Software Engineer")).not.toMatch(/[\u0000-\u001f]/);
  });

  it("cannot be made to collide by moving the separator into a name", () => {
    expect(roleKey("a:b", "c")).not.toBe(roleKey("a", "b:c"));
  });
});

describe("companyKey and sameCompany", () => {
  /*
    Merging two roles is only meaningful inside ONE employer: two jobs at two companies are not one
    employment however alike the titles, and the server refuses such a merge rather than quietly
    downgrading it to a rating move. The dialog asks this question to decide whether to offer the
    control at all, so it has to answer it the way the server does.
  */
  it("ignores the title entirely", () => {
    expect(sameCompany({ company: "Visa" }, { company: "Visa" })).toBe(true);
  });

  it("normalises whitespace the same way roleKey's company half does", () => {
    expect(companyKey("100 Kellogg")).toBe(companyKey("100kellogg"));
    expect(companyKey("  VISA  ")).toBe(companyKey("visa"));
  });

  it("does not treat two different employers as one", () => {
    expect(sameCompany({ company: "Visa" }, { company: "Shopify" })).toBe(false);
  });

  it("treats a missing company as empty rather than throwing", () => {
    expect(companyKey(null)).toBe("");
    expect(companyKey(undefined)).toBe("");
    expect(sameCompany({}, { company: "" })).toBe(true);
  });

  it("agrees with roleKey on the employer, so the two cannot disagree", () => {
    // roleKey is length-prefixed on the company, so its prefix is companyKey's own length.
    expect(roleKey("100 Kellogg", "Director").startsWith(
      `${companyKey("100 Kellogg").length}:${companyKey("100 Kellogg")}:`)).toBe(true);
  });
});
