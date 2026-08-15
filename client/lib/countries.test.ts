import { describe, it, expect } from "vitest";
import { COUNTRIES, getCountryFlag } from "./countries";

describe("COUNTRIES constant", () => {
  it("contains at least one entry", () => {
    expect(COUNTRIES.length).toBeGreaterThan(0);
  });

  it("contains Canada", () => {
    expect(COUNTRIES.some(c => c.value === "Canada")).toBe(true);
  });

  it("contains United States", () => {
    expect(COUNTRIES.some(c => c.value === "United States")).toBe(true);
  });

  it("contains Other as the last entry", () => {
    expect(COUNTRIES[COUNTRIES.length - 1].value).toBe("Other");
  });

  it("every entry has a value and flag", () => {
    for (const c of COUNTRIES) {
      expect(c.value).toBeTruthy();
      expect(c.flag).toBeTruthy();
    }
  });
});

describe("getCountryFlag", () => {
  it("returns Canadian flag for Canada", () => {
    expect(getCountryFlag("Canada")).toBe("🇨🇦");
  });

  it("returns US flag for United States", () => {
    expect(getCountryFlag("United States")).toBe("🇺🇸");
  });

  it("returns UK flag for United Kingdom", () => {
    expect(getCountryFlag("United Kingdom")).toBe("🇬🇧");
  });

  it("returns Australian flag for Australia", () => {
    expect(getCountryFlag("Australia")).toBe("🇦🇺");
  });

  it("returns German flag for Germany", () => {
    expect(getCountryFlag("Germany")).toBe("🇩🇪");
  });

  it("returns Indian flag for India", () => {
    expect(getCountryFlag("India")).toBe("🇮🇳");
  });

  it("returns Japanese flag for Japan", () => {
    expect(getCountryFlag("Japan")).toBe("🇯🇵");
  });

  it("returns globe emoji for Other", () => {
    expect(getCountryFlag("Other")).toBe("🌍");
  });

  it("returns globe emoji for unknown country", () => {
    expect(getCountryFlag("Atlantis")).toBe("🌍");
  });

  it("returns empty string for null", () => {
    expect(getCountryFlag(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(getCountryFlag(undefined)).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(getCountryFlag("")).toBe("");
  });

  it("is case-sensitive (lowercase does not match)", () => {
    expect(getCountryFlag("canada")).toBe("🌍");
  });

  it("returns French flag for France", () => {
    expect(getCountryFlag("France")).toBe("🇫🇷");
  });

  it("returns Brazilian flag for Brazil", () => {
    expect(getCountryFlag("Brazil")).toBe("🇧🇷");
  });

  it("returns South Korean flag for South Korea", () => {
    expect(getCountryFlag("South Korea")).toBe("🇰🇷");
  });

  it("returns Singapore flag for Singapore", () => {
    expect(getCountryFlag("Singapore")).toBe("🇸🇬");
  });

  it("returns South African flag for South Africa", () => {
    expect(getCountryFlag("South Africa")).toBe("🇿🇦");
  });
});
