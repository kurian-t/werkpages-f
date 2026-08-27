import { describe, it, expect } from "vitest";
import { INDUSTRY_ICON_SLUGS, hasIndustryIcon } from "./IndustryIcon";
import { INDUSTRY_TILE_ICON_SLUGS, hasIndustryTileIcon } from "./IndustryTileIcon";

/**
 * The icon map is keyed by IndustryTaxonomy.slug() values produced on the backend. A slug with
 * no entry does not throw — it silently renders the "other" glyph — so a typo or a new industry
 * added to the Java taxonomy would show up as a wrong icon in production rather than a failure.
 * These tests pin the mapping instead.
 *
 * Mirrors IndustryTaxonomy.ALL. Adding an industry there means adding it here and to the map.
 */
const TAXONOMY_SLUGS = [
  "aerospace-and-defense",
  "agriculture",
  "automotive",
  "construction",
  "education",
  "energy-and-utilities",
  "financial-services",
  "food-and-beverage",
  "government-and-public-sector",
  "healthcare",
  "hospitality-and-tourism",
  "insurance",
  "legal",
  "mining-and-metals",
  "consumer-services",
  "manufacturing",
  "media-and-entertainment",
  "nonprofit",
  "other",
  "pharmaceuticals-and-biotech",
  "professional-services",
  "real-estate",
  "retail",
  "technology",
  "telecommunications",
  "transportation-and-logistics",
];

// The SVG set has no glyph for these yet — they intentionally fall back to "other".
const SVG_SET_GAPS = ["mining-and-metals", "consumer-services"];

describe.each([
  ["IndustryIcon (SVG set — manager/company profiles)", INDUSTRY_ICON_SLUGS, hasIndustryIcon, SVG_SET_GAPS],
  ["IndustryTileIcon (emoji set — Industries tab)",     INDUSTRY_TILE_ICON_SLUGS, hasIndustryTileIcon, []],
])("%s coverage", (_label, SLUGS, has, gaps) => {
  it("has an icon for every industry in the taxonomy, except known gaps", () => {
    const missing = TAXONOMY_SLUGS.filter(slug => !has(slug));
    expect(missing).toEqual(gaps);
  });

  it("defines no icons for slugs outside the taxonomy", () => {
    expect(SLUGS.filter(slug => !TAXONOMY_SLUGS.includes(slug))).toEqual([]);
  });

  it("covers the taxonomy minus its known gaps", () => {
    expect(SLUGS).toHaveLength(TAXONOMY_SLUGS.length - gaps.length);
  });

  it("reports unknown and empty slugs as having no icon", () => {
    // These fall back to the "other" glyph at render time rather than throwing.
    expect(has("not-an-industry")).toBe(false);
    expect(has("")).toBe(false);
    expect(has(null)).toBe(false);
    expect(has(undefined)).toBe(false);
  });

  it("includes 'other', which the fallback path depends on", () => {
    expect(has("other")).toBe(true);
  });
});
