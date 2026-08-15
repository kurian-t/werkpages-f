import { describe, it, expect } from "vitest";
import { cn, companyLogoDomain } from "./utils";

describe("cn function", () => {
  it("should merge classes correctly", () => {
    expect(cn("text-red-500", "bg-blue-500")).toBe("text-red-500 bg-blue-500");
  });

  it("should handle conditional classes", () => {
    const isActive = true;
    expect(cn("base-class", isActive && "active-class")).toBe(
      "base-class active-class",
    );
  });

  it("should handle false and null conditions", () => {
    const isActive = false;
    expect(cn("base-class", isActive && "active-class", null)).toBe(
      "base-class",
    );
  });

  it("should merge tailwind classes properly", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });

  it("should work with object notation", () => {
    expect(cn("base", { conditional: true, "not-included": false })).toBe(
      "base conditional",
    );
  });
});

// ── companyLogoDomain ─────────────────────────────────────────────────────────

describe("companyLogoDomain", () => {
  it("plain company name becomes lowercased domain", () => {
    expect(companyLogoDomain("Apple")).toBe("apple.com");
  });

  it("strips 'Inc' suffix", () => {
    expect(companyLogoDomain("Lemonade Inc")).toBe("lemonade.com");
  });

  it("strips 'Inc.' with period", () => {
    expect(companyLogoDomain("Acme Inc.")).toBe("acme.com");
  });

  it("strips 'Incorporated' suffix", () => {
    expect(companyLogoDomain("Widgets Incorporated")).toBe("widgets.com");
  });

  it("strips 'Corp' suffix", () => {
    expect(companyLogoDomain("Initech Corp")).toBe("initech.com");
  });

  it("strips 'Corporation' suffix", () => {
    expect(companyLogoDomain("Globex Corporation")).toBe("globex.com");
  });

  it("strips 'LLC' suffix", () => {
    expect(companyLogoDomain("Vandelay LLC")).toBe("vandelay.com");
  });

  it("strips 'L.L.C.' suffix", () => {
    expect(companyLogoDomain("Vandelay L.L.C.")).toBe("vandelay.com");
  });

  it("strips 'Ltd' suffix (and subsequent 'Worldwide')", () => {
    expect(companyLogoDomain("Prestige Worldwide Ltd")).toBe("prestige.com");
  });

  it("strips 'Limited' suffix", () => {
    expect(companyLogoDomain("Sterling Cooper Limited")).toBe("sterlingcooper.com");
  });

  it("strips 'Group' suffix", () => {
    expect(companyLogoDomain("Dunder Mifflin Group")).toBe("dundermifflin.com");
  });

  it("strips 'Holdings' suffix (and subsequent 'Company')", () => {
    expect(companyLogoDomain("Bluth Company Holdings")).toBe("bluth.com");
  });

  it("strips 'PLC' suffix", () => {
    expect(companyLogoDomain("Wernham Hogg PLC")).toBe("wernhamhogg.com");
  });

  it("strips 'International' suffix", () => {
    expect(companyLogoDomain("Hooli International")).toBe("hooli.com");
  });

  it("strips 'Companies' suffix", () => {
    expect(companyLogoDomain("Estee Lauder Companies")).toBe("esteelauder.com");
  });

  it("strips layered suffixes ('Companies Inc') in one pass", () => {
    expect(companyLogoDomain("ESTEE LAUDER COMPANIES INC")).toBe("esteelauder.com");
  });

  it("strips 'Company' suffix", () => {
    expect(companyLogoDomain("Bluth Company")).toBe("bluth.com");
  });

  it("strips suffix case-insensitively", () => {
    expect(companyLogoDomain("Pied Piper inc")).toBe("piedpiper.com");
    expect(companyLogoDomain("Pied Piper INC")).toBe("piedpiper.com");
  });

  it("strips suffix separated by comma", () => {
    expect(companyLogoDomain("Initrode, Inc.")).toBe("initrode.com");
  });

  it("removes internal spaces", () => {
    expect(companyLogoDomain("Pied Piper")).toBe("piedpiper.com");
  });

  it("removes non-alphanumeric characters", () => {
    expect(companyLogoDomain("AT&T")).toBe("att.com");
  });

  it("single-word company name", () => {
    expect(companyLogoDomain("Google")).toBe("google.com");
  });

  it("trims leading/trailing whitespace", () => {
    expect(companyLogoDomain("  Netflix  ")).toBe("netflix.com");
  });
});
