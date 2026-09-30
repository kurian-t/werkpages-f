import { describe, it, expect } from "vitest";
import { step1Errors, isStep1Valid } from "./addManagerValidation";

const complete = {
  firstName: "Jordan", lastName: "Smith", title: "Engineering Manager", companyName: "Acme Corp",
};

describe("leaving step 1 of Add Manager", () => {
  it("REGRESSION: a country is never required, because no control can set one", () => {
    /*
      The bug that lost a real submission, and the reason this file exists.

      The country <select> was replaced by the shared location control, leaving formData.country
      set from one source: /api/geo, a Cloudflare header. The gate still demanded it. For any
      visitor that header does not reach - a stripping proxy, a VPN, a privacy browser - Next was
      permanently disabled and the form asked for a country through a control that no longer
      existed. Worse, the submit path guards on the same value and returns SILENTLY, so a complete
      form did nothing with no error shown.

      There is no country in Step1Fields at all, which is the strongest form this assertion can
      take: the rule cannot regress by reading a country, because it has none to read.
    */
    expect(isStep1Valid(complete)).toBe(true);
    expect(step1Errors(complete)).toEqual([]);
    expect(Object.keys(complete)).not.toContain("country");
  });

  it("REGRESSION: a location is never required either", () => {
    // Required + startable-only-from a picker that itself needs a country was the second way the
    // same form became unsubmittable. Starting EMPTY is what protects anonymity; refusing the
    // submission adds nothing to that and loses the contribution.
    expect(isStep1Valid(complete)).toBe(true);
  });

  it("still requires the things the form actually asks for", () => {
    expect(step1Errors({ ...complete, firstName: "  " })).toContain("First name is required");
    expect(step1Errors({ ...complete, lastName:  ""   })).toContain("Last name is required");
    // Published names, so they are checked properly rather than merely for emptiness.
    expect(step1Errors({ ...complete, firstName: "J"  })).toContain("First name must be at least 2 characters");
    expect(step1Errors({ ...complete, lastName: "Sm1th" })).toContain("Last name cannot contain numbers");
    expect(step1Errors({ ...complete, title:     ""   })).toContain("Title is required");
    expect(step1Errors({ ...complete, companyName: "" })).toContain("Company is required");
  });

  it("tells a too-short company from a missing one", () => {
    // Different problems deserve different sentences: "required" is wrong when they typed an "A".
    expect(step1Errors({ ...complete, companyName: "A" }))
      .toContain("Company must be at least 2 characters");
    expect(step1Errors({ ...complete, companyName: "A" }))
      .not.toContain("Company is required");
  });

  it("accepts a blank LinkedIn URL and rejects a malformed one", () => {
    expect(isStep1Valid({ ...complete, linkedinUrl: "" })).toBe(true);
    expect(isStep1Valid({ ...complete, linkedinUrl: "not a url" })).toBe(false);
  });

  it("reports every problem at once, not one at a time", () => {
    // A form that reveals its objections one reload at a time is a form people abandon.
    expect(step1Errors({ firstName: "", lastName: "", title: "", companyName: "" })).toHaveLength(4);
  });
});
