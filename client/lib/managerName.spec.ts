import { describe, it, expect } from "vitest";
import { validateManagerName } from "./managerName";

describe("validateManagerName", () => {
  it("accepts ordinary names", () => {
    // Not "John Smith" - that is a placeholder pair, and rejecting it is the point.
    expect(validateManagerName("John", "Anderson")).toBeNull();
  });

  /**
   * The regression this file exists for.
   *
   * Two copies of this rule had diverged: the company profile page rejected both of these as
   * "Name should only contain letters" while /find accepted them, because its character class had
   * lost whitespace and the hyphen. Someone searching for their own manager on a company page was
   * told their manager's name was invalid.
   */
  it.each([
    ["Mary Jane", "Watson"],
    ["Anne-Marie", "Descotes"],
    ["Jean", "Le Blanc"],
    ["Mary", "Smith-Jones"],
  ])("accepts %s %s - spaces and hyphens are part of real names", (first, last) => {
    expect(validateManagerName(first, last)).toBeNull();
  });

  it.each([
    ["Ferré", "Ibáñez"],
    ["Søren", "Kierkegaard"],
    ["Zoë", "Müller"],
    ["O'Brien", "D'Angelo"],
  ])("accepts %s %s - names are not ASCII", (first, last) => {
    expect(validateManagerName(first, last)).toBeNull();
  });

  it("rejects digits and symbols", () => {
    expect(validateManagerName("John3", "Smith")).toBe("Name should only contain letters");
    expect(validateManagerName("John", "Sm!th")).toBe("Name should only contain letters");
  });

  it("rejects junk words in either position", () => {
    expect(validateManagerName("test", "Smith")).toMatch(/real person/);
    expect(validateManagerName("John", "asdf")).toMatch(/real person/);
  });

  it("rejects placeholder pairs that are fine as separate words", () => {
    // "John" alone is a name and "Doe" alone is a surname; together they are a placeholder.
    expect(validateManagerName("John", "Doe")).toMatch(/real person/);
    expect(validateManagerName("John", "Anderson")).toBeNull();
  });

  it("ignores surrounding whitespace", () => {
    expect(validateManagerName("  John  ", "  Anderson  ")).toBeNull();
  });
});
