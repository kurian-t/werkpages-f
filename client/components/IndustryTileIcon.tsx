/**
 * Emoji per industry, for the Industries tab tiles and the industry page hero.
 *
 * Deliberately separate from IndustryIcon.tsx, which draws the hand-authored SVG set used
 * inline beside text on manager and company profiles. Two sets, two contexts: do not
 * collapse them without checking both surfaces.
 *
 * Keyed by IndustryTaxonomy.slug() from the backend. A slug with no entry falls back to
 * "other" silently rather than erroring, so a test pins full coverage.
 */
const EMOJI: Record<string, string> = {
  "aerospace-and-defense":        "✈️",
  "agriculture":                  "🌾",
  "automotive":                   "🚗",
  "construction":                 "🏗️",
  "education":                    "🎓",
  "energy-and-utilities":         "⚡",
  "financial-services":           "🏦",
  "food-and-beverage":            "🍴",
  "government-and-public-sector": "🏛️",
  "healthcare":                   "🏥",
  "hospitality-and-tourism":      "🧳",
  "insurance":                    "🛡️",
  "legal":                        "⚖️",
  "manufacturing":                "🏭",
  "media-and-entertainment":      "🎬",
  "nonprofit":                    "🤝",
  "other":                        "◼",
  "pharmaceuticals-and-biotech":  "🧬",
  "professional-services":        "💼",
  "real-estate":                  "🏢",
  "retail":                       "🛍️",
  "technology":                   "💻",
  "telecommunications":           "📡",
  "transportation-and-logistics": "🚚",
};

/** Canonical fallback for an unclassified or unrecognised industry. */
const FALLBACK = "other";

export function IndustryTileIcon({
  industrySlug,
  size = 20,
  className,
}: {
  industrySlug?: string | null;
  size?: number;
  className?: string;
}) {
  const emoji = EMOJI[industrySlug ?? ""] ?? EMOJI[FALLBACK];
  return (
    // Emoji render as text, so size drives font-size rather than width/height. leading-none
    // keeps the glyph vertically centred in the tile's fixed-size rounded square.
    <span
      role="img"
      aria-hidden="true"
      className={`leading-none ${className ?? ""}`}
      style={{ fontSize: `${size}px` }}
    >
      {emoji}
    </span>
  );
}

/** Every slug this component can draw — used by the coverage test. */
export const INDUSTRY_TILE_ICON_SLUGS = Object.keys(EMOJI);

/** True when a real glyph exists for this slug (i.e. not falling back to "other"). */
export function hasIndustryTileIcon(industrySlug?: string | null) {
  return !!industrySlug && industrySlug in EMOJI;
}
