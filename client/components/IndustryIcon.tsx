// Generated from the industry_svg_icons set. One 24x24 glyph per taxonomy slug.
//
// Used on the manager and company profiles, where the industry sits inline with text.
// The Industries tab uses a separate lucide-based set — see IndustryTileIcon.tsx.
//
// Inlined rather than served from /public as <img> so the glyph inherits currentColor —
// these sit inside links and muted text that change colour on hover, which an <img> cannot
// follow. Root attributes (stroke, width, linecaps) live on the wrapper below, so each entry
// here is just the shapes.

import type { JSX } from "react";

const GLYPHS: Record<string, JSX.Element> = {
  "aerospace-and-defense": (
    <>
      <path d="M12 3l2.2 5.1 5.3 1.1-4 3.6.9 5.2L12 15.3 7.6 18l.9-5.2-4-3.6 5.3-1.1L12 3z"/>
      <path d="M12 15.3v5.2"/>
    </>
  ),
  "agriculture": (
    <>
      <path d="M12 21V9"/>
      <path d="M12 12c-3.8 0-6-2.1-6-5.5 3.8 0 6 2.1 6 5.5z"/>
      <path d="M12 16c3.8 0 6-2.1 6-5.5-3.8 0-6 2.1-6 5.5z"/>
      <path d="M8 21h8"/>
    </>
  ),
  "automotive": (
    <>
      <path d="M5 16h14"/>
      <path d="M6.5 16l1-5h9l1 5"/>
      <path d="M8 11l1.3-3h5.4l1.3 3"/>
      <circle cx="8" cy="17.5" r="1.5"/>
      <circle cx="16" cy="17.5" r="1.5"/>
      <path d="M4.5 13h2M17.5 13h2"/>
    </>
  ),
  "construction": (
    <>
      <path d="M4 15h16"/>
      <path d="M6 15v-1a6 6 0 0 1 12 0v1"/>
      <path d="M9 8.5V6h6v2.5"/>
      <path d="M12 6v6"/>
      <path d="M5 18h14"/>
    </>
  ),
  "education": (
    <>
      <path d="M3 9l9-4 9 4-9 4-9-4z"/>
      <path d="M7 11v4.5c2.5 2 7.5 2 10 0V11"/>
      <path d="M21 9v5"/>
      <path d="M21 14l-1 2"/>
    </>
  ),
  "energy-and-utilities": (
    <>
      <path d="M13 2L5.5 13H11l-1 9L18.5 10H13V2z"/>
    </>
  ),
  "financial-services": (
    <>
      <path d="M4 10h16"/>
      <path d="M5 10l7-5 7 5"/>
      <path d="M6 10v7M10 10v7M14 10v7M18 10v7"/>
      <path d="M4 17h16M3 20h18"/>
    </>
  ),
  "food-and-beverage": (
    <>
      <path d="M7 3v7M4.5 3v5c0 1.4 1.1 2.5 2.5 2.5S9.5 9.4 9.5 8V3"/>
      <path d="M7 10.5V21"/>
      <path d="M15 3v8"/>
      <path d="M15 3c3 1.4 4.5 3.2 4.5 5.2S18 11 15 11"/>
      <path d="M15 11v10"/>
    </>
  ),
  "government-and-public-sector": (
    <>
      <path d="M3 9l9-5 9 5"/>
      <path d="M5 10h14"/>
      <path d="M6 10v7M10 10v7M14 10v7M18 10v7"/>
      <path d="M4 17h16M3 20h18"/>
    </>
  ),
  "healthcare": (
    <>
      <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>
      <path d="M7.5 12h2.2l1.2-2.5 2.1 5 1.1-2.5h2.4"/>
    </>
  ),
  "hospitality-and-tourism": (
    <>
      <path d="M6 20V8h12v12"/>
      <path d="M9 8V5h6v3"/>
      <path d="M9 12h2M13 12h2M9 16h2M13 16h2"/>
      <path d="M4 20h16"/>
    </>
  ),
  "insurance": (
    <>
      <path d="M12 3l7 3v5c0 4.8-2.9 8.2-7 10-4.1-1.8-7-5.2-7-10V6l7-3z"/>
      <path d="M9 12l2 2 4-4"/>
    </>
  ),
  "legal": (
    <>
      <path d="M12 4v16"/>
      <path d="M7 6h10"/>
      <path d="M5 9l-3 6h6L5 9z"/>
      <path d="M19 9l-3 6h6l-3-6z"/>
      <path d="M8 20h8"/>
    </>
  ),
  "manufacturing": (
    <>
      <path d="M3 20V9l5 3V9l5 3V7h8v13H3z"/>
      <path d="M16 10h2M16 14h2"/>
      <path d="M6 16h2M10 16h2"/>
    </>
  ),
  "media-and-entertainment": (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2"/>
      <path d="M3 10h18"/>
      <path d="M7 6l2 4M12 6l2 4M17 6l2 4"/>
      <path d="M10 13l5 2.5-5 2.5v-5z"/>
    </>
  ),
  "nonprofit": (
    <>
      <path d="M12 19s-6-3.6-6-8a3.5 3.5 0 0 1 6-2.4A3.5 3.5 0 0 1 18 11c0 4.4-6 8-6 8z"/>
      <path d="M4 21c2-2 4.2-2.8 8-2.8S18 19 20 21"/>
    </>
  ),
  "other": (
    <>
      <circle cx="7" cy="7" r="2.5"/>
      <rect x="13.5" y="4.5" width="5" height="5" rx="1"/>
      <path d="M7 14l3 5H4l3-5z"/>
      <path d="M16 14l3 3-3 3-3-3 3-3z"/>
    </>
  ),
  "pharmaceuticals-and-biotech": (
    <>
      <path d="M8 3c0 4 8 6 8 10s-3 6-8 8"/>
      <path d="M16 3c0 4-8 6-8 10s3 6 8 8"/>
      <path d="M9 6h6M8 10h8M8 14h8M9 18h6"/>
    </>
  ),
  "professional-services": (
    <>
      <rect x="4" y="7" width="16" height="12" rx="2"/>
      <path d="M9 7V5h6v2"/>
      <path d="M4 12h16"/>
      <path d="M10 12v2h4v-2"/>
    </>
  ),
  "real-estate": (
    <>
      <path d="M4 21V8l8-5 8 5v13"/>
      <path d="M8 21v-6h8v6"/>
      <path d="M8 10h2M14 10h2"/>
      <path d="M3 21h18"/>
    </>
  ),
  "retail": (
    <>
      <path d="M6 8h12l1 12H5L6 8z"/>
      <path d="M9 9V7a3 3 0 0 1 6 0v2"/>
    </>
  ),
  "technology": (
    <>
      <rect x="7" y="7" width="10" height="10" rx="2"/>
      <path d="M9 1v3M12 1v3M15 1v3M9 20v3M12 20v3M15 20v3"/>
      <path d="M1 9h3M1 12h3M1 15h3M20 9h3M20 12h3M20 15h3"/>
      <rect x="10" y="10" width="4" height="4" rx=".5"/>
    </>
  ),
  "telecommunications": (
    <>
      <path d="M12 20V9"/>
      <path d="M9 20h6"/>
      <path d="M10 9l2-4 2 4"/>
      <path d="M7.8 6.5a6 6 0 0 0 0 7"/>
      <path d="M16.2 6.5a6 6 0 0 1 0 7"/>
      <path d="M5 4a9.5 9.5 0 0 0 0 12"/>
      <path d="M19 4a9.5 9.5 0 0 1 0 12"/>
    </>
  ),
  "transportation-and-logistics": (
    <>
      <path d="M3 7h11v10H3V7z"/>
      <path d="M14 11h4l3 3v3h-7v-6z"/>
      <circle cx="7" cy="18" r="2"/>
      <circle cx="17" cy="18" r="2"/>
      <path d="M14 14h7"/>
    </>
  ),
};

// NOTE: "mining-and-metals" and "consumer-services" have no hand-authored SVG in the
// industry_svg_icons set, so they render the "other" glyph here. The Industries tab shows a
// proper emoji for both. Drop matching SVGs into the set and regenerate to close the gap.

/** Canonical fallback for an unclassified or unrecognised industry. */
const FALLBACK = "other";

export function IndustryIcon({
  industrySlug,
  size = 12,
  className,
}: {
  industrySlug?: string | null;
  size?: number;
  className?: string;
}) {
  const glyph = GLYPHS[industrySlug ?? ""] ?? GLYPHS[FALLBACK];
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {glyph}
    </svg>
  );
}

/** Every slug this component can draw — used by the coverage test. */
export const INDUSTRY_ICON_SLUGS = Object.keys(GLYPHS);

/** True when a real glyph exists for this slug (i.e. not falling back to "other"). */
export function hasIndustryIcon(industrySlug?: string | null) {
  return !!industrySlug && industrySlug in GLYPHS;
}
