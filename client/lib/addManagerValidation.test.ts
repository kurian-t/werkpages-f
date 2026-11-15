import { describe, it, expect } from "vitest";
import { isSearchStepValid, isStep1Valid, searchStepErrors, step1Errors } from "./addManagerValidation";
import { EMPTY_LOCATION } from "./location";

/**
 * The two screens that open a contribution, and the rule that separates them.
 *
 * The legacy screen collects a whole manager because the next thing it does is create one. The
 * search screen collects what a SEARCH needs, because the next thing it does is look - and asking
 * for an employer and a job title before showing anybody is asking two questions to improve an
 * ordering, then refusing to search without the answers.
 *
 * These are arithmetic, not interaction: the browser cannot easily produce "a visitor whose
 * country header never arrives", and that exact condition shipped a bug that silently lost
 * submissions. A function can be asked in a millisecond.
 */

const NAME = { firstName: "Priya", lastName: "Raghunathan" };

describe("the search screen asks for a name and nothing else", () => {
  it("accepts a name on its own", () => {
    expect(isSearchStepValid(NAME)).toBe(true);
    expect(searchStepErrors(NAME)).toEqual([]);
  });

  it("does not ask for a title, a company or a location", () => {
    // The whole point of the screen. Each of these is required by the other rule, and demanding
    // any of them here would put a question before the search that the search does not need.
    const complaints = searchStepErrors(NAME).join(" ").toLowerCase();
    expect(complaints).not.toContain("title");
    expect(complaints).not.toContain("company");
    expect(complaints).not.toContain("location");
  });

  it("never asks for a country, because a country only ranks", () => {
    // It is optional on the server too: it breaks ties between candidates and never filters one
    // out, so somebody who does not know it - or whose manager has moved - must not be stopped.
    expect(searchStepErrors(NAME).join(" ").toLowerCase()).not.toContain("country");
  });

  it("still holds the name to the published standard", () => {
    // These names go on public profiles, and this screen is where they are typed. A single letter
    // or a digit is as wrong here as on the other screen.
    expect(isSearchStepValid({ firstName: "A", lastName: "Raghunathan" })).toBe(false);
    expect(isSearchStepValid({ firstName: "Priya", lastName: "R2" })).toBe(false);
    expect(isSearchStepValid({ firstName: "", lastName: "" })).toBe(false);
  });
});

describe("the legacy screen still collects a whole manager", () => {
  it("is not relaxed by the search rule existing", () => {
    // The guard that matters: the two rules are separate functions precisely so that making the
    // search screen lighter cannot quietly make the add screen lighter too. Production still
    // serves the legacy journey.
    const errors = step1Errors({ ...NAME, title: "", companyName: "", location: EMPTY_LOCATION });
    const joined = errors.join(" ").toLowerCase();
    expect(joined).toContain("title");
    expect(joined).toContain("company");
    expect(joined).toContain("location");
    expect(isStep1Valid({ ...NAME, title: "", companyName: "", location: EMPTY_LOCATION })).toBe(false);
  });
});
