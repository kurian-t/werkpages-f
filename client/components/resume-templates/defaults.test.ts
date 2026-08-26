import { describe, it, expect } from "vitest";
import { CLASSIC, EDITORIAL, SIDEBAR, MINIMAL, STARTING_POINTS, DEFAULT_DESIGN } from "./defaults";

describe("resume design defaults", () => {
  it("exposes four distinct named designs", () => {
    const designs = [CLASSIC, EDITORIAL, SIDEBAR, MINIMAL];
    designs.forEach(d => expect(d).toBeTruthy());
    // They should not all be the same object
    expect(new Set(designs).size).toBe(4);
  });

  it("DEFAULT_DESIGN is CLASSIC", () => {
    expect(DEFAULT_DESIGN).toBe(CLASSIC);
  });

  it("STARTING_POINTS lists each design with id/label/desc/design", () => {
    expect(STARTING_POINTS.length).toBeGreaterThanOrEqual(4);
    for (const sp of STARTING_POINTS) {
      expect(typeof sp.id).toBe("string");
      expect(sp.id.length).toBeGreaterThan(0);
      expect(typeof sp.label).toBe("string");
      expect(typeof sp.desc).toBe("string");
      expect(sp.design).toBeTruthy();
    }
    // ids are unique
    expect(new Set(STARTING_POINTS.map(s => s.id)).size).toBe(STARTING_POINTS.length);
  });
});
