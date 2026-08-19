import type { ResumeDesign, TextStyle } from "./types";

// ── Base text style — every field required so the PDF renderer never hits undefined ──

function text(overrides: Partial<TextStyle> & { fontFamily: TextStyle["fontFamily"]; fontSize: number; color: string }): TextStyle {
  return {
    backgroundColor: "transparent",
    letterSpacing: 0,
    lineHeight: 1.3,
    textTransform: "none",
    textAlign: "left",
    marginTop: 0,
    marginBottom: 0,
    marginLeft: 0,
    marginRight: 0,
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    paddingRight: 0,
    borderRadius: 0,
    borderBottomWidth: 0,
    borderBottomColor: "transparent",
    ...overrides,
  };
}

const DEFAULT_SECTION_ORDER = ["work", "education", "skills", "bio", "links"];

// ── Starting point: Classic ────────────────────────────────────────────────────
// Single column, Helvetica, black text, ruled section headers. ATS-safe.

export const CLASSIC: ResumeDesign = {
  pageSize: "LETTER",
  pageMarginTop: 40,
  pageMarginBottom: 40,
  pageMarginLeft: 50,
  pageMarginRight: 50,
  pageBackground: "#ffffff",

  layout: "single",
  sidebarWidth: 33,
  sidebarBackground: "#1e1b4b",
  columnGap: 0,
  sidebarSections: ["skills", "links"],

  name: text({ fontFamily: "Helvetica-Bold", fontSize: 22, color: "#111111", letterSpacing: -0.5, marginBottom: 3 }),
  contact: { ...text({ fontFamily: "Helvetica", fontSize: 9, color: "#555555", marginBottom: 2 }), separator: " · " },

  sectionHeading: text({ fontFamily: "Helvetica-Bold", fontSize: 10, color: "#111111", textTransform: "uppercase", letterSpacing: 1.2, marginTop: 14, marginBottom: 4 }),
  sectionRuleShow: true,
  sectionRuleColor: "#cccccc",
  sectionRuleThickness: 1,
  sectionRuleMarginTop: 2,
  sectionRuleMarginBottom: 6,

  entryTitle: text({ fontFamily: "Helvetica-Bold", fontSize: 10, color: "#111111" }),
  entryOrg: text({ fontFamily: "Helvetica", fontSize: 9, color: "#555555", marginBottom: 3 }),
  entryDate: { ...text({ fontFamily: "Helvetica", fontSize: 9, color: "#888888" }), position: "right" },
  entryBullet: text({ fontFamily: "Helvetica", fontSize: 9.5, color: "#333333", lineHeight: 1.3, marginLeft: 8 }),
  bulletMarkerChar: "•",
  bulletMarkerColor: "#555555",
  bulletMarkerWidth: 10,
  entrySpacing: 10,

  summary: text({ fontFamily: "Helvetica", fontSize: 10, color: "#333333", lineHeight: 1.5 }),

  skillDisplay: "tags",
  skillItem: text({ fontFamily: "Helvetica", fontSize: 8.5, color: "#333333", backgroundColor: "#f3f4f6", paddingTop: 2, paddingBottom: 2, paddingLeft: 6, paddingRight: 6, borderRadius: 3, marginTop: 2, marginRight: 4 }),
  skillGridColumns: 3,

  linkItem: text({ fontFamily: "Helvetica", fontSize: 9, color: "#2e0562", marginBottom: 2 }),

  showCompanyLogos: true,
  sectionOrder: DEFAULT_SECTION_ORDER,
  hiddenSections: [],
};

// ── Starting point: Editorial ──────────────────────────────────────────────────
// Single column, Times-Roman (serif), generous margins, no section rules.
// Refined and academic — great for senior roles.

export const EDITORIAL: ResumeDesign = {
  pageSize: "LETTER",
  pageMarginTop: 58,
  pageMarginBottom: 58,
  pageMarginLeft: 72,
  pageMarginRight: 72,
  pageBackground: "#fafaf8",

  layout: "single",
  sidebarWidth: 33,
  sidebarBackground: "#1e1b4b",
  columnGap: 0,
  sidebarSections: ["skills", "links"],

  name: text({ fontFamily: "Times-Bold", fontSize: 26, color: "#111111", marginBottom: 5 }),
  contact: { ...text({ fontFamily: "Times-Roman", fontSize: 9, color: "#666666", letterSpacing: 0.3, marginBottom: 2 }), separator: "  —  " },

  sectionHeading: text({ fontFamily: "Times-Bold", fontSize: 11, color: "#111111", textTransform: "uppercase", letterSpacing: 2, marginTop: 20, marginBottom: 6 }),
  sectionRuleShow: false,
  sectionRuleColor: "#cccccc",
  sectionRuleThickness: 1,
  sectionRuleMarginTop: 2,
  sectionRuleMarginBottom: 0,

  entryTitle: text({ fontFamily: "Times-Bold", fontSize: 10.5, color: "#111111" }),
  entryOrg: text({ fontFamily: "Times-Italic", fontSize: 9.5, color: "#555555", marginBottom: 4 }),
  entryDate: { ...text({ fontFamily: "Times-Roman", fontSize: 9, color: "#888888" }), position: "right" },
  entryBullet: text({ fontFamily: "Times-Roman", fontSize: 10, color: "#333333", lineHeight: 1.5, marginLeft: 12 }),
  bulletMarkerChar: "—",
  bulletMarkerColor: "#aaaaaa",
  bulletMarkerWidth: 16,
  entrySpacing: 12,

  summary: text({ fontFamily: "Times-Roman", fontSize: 10.5, color: "#333333", lineHeight: 1.7 }),

  skillDisplay: "inline",
  skillItem: text({ fontFamily: "Times-Roman", fontSize: 10, color: "#444444" }),
  skillGridColumns: 3,

  linkItem: text({ fontFamily: "Times-Roman", fontSize: 9.5, color: "#333333", marginBottom: 3 }),

  showCompanyLogos: true,
  sectionOrder: ["bio", "work", "education", "skills", "links"],
  hiddenSections: [],
};

// ── Starting point: Sidebar ────────────────────────────────────────────────────
// Sidebar-left layout, dark sidebar, purple accent. Bold and modern.

export const SIDEBAR: ResumeDesign = {
  pageSize: "LETTER",
  pageMarginTop: 36,
  pageMarginBottom: 36,
  pageMarginLeft: 22,
  pageMarginRight: 28,
  pageBackground: "#ffffff",

  layout: "sidebar-left",
  sidebarWidth: 33,
  sidebarBackground: "#1e1b4b",
  columnGap: 0,
  sidebarSections: ["skills", "links"],

  name: text({ fontFamily: "Helvetica-Bold", fontSize: 18, color: "#ffffff", lineHeight: 1.25, marginBottom: 8 }),
  contact: { ...text({ fontFamily: "Helvetica", fontSize: 8.5, color: "#c4b5fd", lineHeight: 1.7, marginBottom: 0 }), separator: "\n" },

  sectionHeading: text({ fontFamily: "Helvetica-Bold", fontSize: 8.5, color: "#a78bfa", textTransform: "uppercase", letterSpacing: 1.5, marginTop: 18, marginBottom: 6 }),
  sectionRuleShow: true,
  sectionRuleColor: "#3730a3",
  sectionRuleThickness: 1,
  sectionRuleMarginTop: 3,
  sectionRuleMarginBottom: 8,

  entryTitle: text({ fontFamily: "Helvetica-Bold", fontSize: 10, color: "#111111" }),
  entryOrg: text({ fontFamily: "Helvetica", fontSize: 9, color: "#555555", marginBottom: 3 }),
  entryDate: { ...text({ fontFamily: "Helvetica", fontSize: 8.5, color: "#888888" }), position: "right" },
  entryBullet: text({ fontFamily: "Helvetica", fontSize: 9.5, color: "#333333", lineHeight: 1.3, marginLeft: 8 }),
  bulletMarkerChar: "•",
  bulletMarkerColor: "#6d5091",
  bulletMarkerWidth: 10,
  entrySpacing: 10,

  summary: text({ fontFamily: "Helvetica", fontSize: 9.5, color: "#d1d5db", lineHeight: 1.6 }),

  skillDisplay: "tags",
  skillItem: text({ fontFamily: "Helvetica", fontSize: 8.5, color: "#e9d5ff", backgroundColor: "#312e81", paddingTop: 2, paddingBottom: 2, paddingLeft: 6, paddingRight: 6, borderRadius: 3, marginTop: 3, marginRight: 4 }),
  skillGridColumns: 2,

  linkItem: text({ fontFamily: "Helvetica", fontSize: 8.5, color: "#c4b5fd", marginBottom: 4 }),

  showCompanyLogos: true,
  sectionOrder: DEFAULT_SECTION_ORDER,
  hiddenSections: [],
};

// ── Starting point: Minimal ────────────────────────────────────────────────────
// Label layout — narrow uppercase label column, wide content column.
// Extreme whitespace, no rules, elegant contrast.

export const MINIMAL: ResumeDesign = {
  pageSize: "LETTER",
  pageMarginTop: 52,
  pageMarginBottom: 52,
  pageMarginLeft: 60,
  pageMarginRight: 60,
  pageBackground: "#ffffff",

  layout: "label",
  sidebarWidth: 100,             // label column width in points (not %)
  sidebarBackground: "transparent",
  columnGap: 20,
  sidebarSections: [],

  name: text({ fontFamily: "Helvetica", fontSize: 28, color: "#111111", letterSpacing: -1, marginBottom: 5 }),
  contact: { ...text({ fontFamily: "Helvetica", fontSize: 9, color: "#777777", marginBottom: 28 }), separator: "   " },

  sectionHeading: text({ fontFamily: "Helvetica-Bold", fontSize: 8, color: "#999999", textTransform: "uppercase", letterSpacing: 1.2 }),
  sectionRuleShow: false,
  sectionRuleColor: "transparent",
  sectionRuleThickness: 0,
  sectionRuleMarginTop: 0,
  sectionRuleMarginBottom: 0,

  entryTitle: text({ fontFamily: "Helvetica-Bold", fontSize: 10, color: "#111111" }),
  entryOrg: text({ fontFamily: "Helvetica", fontSize: 9, color: "#777777", marginBottom: 4 }),
  entryDate: { ...text({ fontFamily: "Helvetica", fontSize: 9, color: "#777777" }), position: "below" },
  entryBullet: text({ fontFamily: "Helvetica", fontSize: 9.5, color: "#444444", lineHeight: 1.5, marginLeft: 10 }),
  bulletMarkerChar: "–",
  bulletMarkerColor: "#aaaaaa",
  bulletMarkerWidth: 12,
  entrySpacing: 12,

  summary: text({ fontFamily: "Helvetica", fontSize: 10, color: "#333333", lineHeight: 1.7 }),

  skillDisplay: "inline",
  skillItem: text({ fontFamily: "Helvetica", fontSize: 9.5, color: "#444444" }),
  skillGridColumns: 3,

  linkItem: text({ fontFamily: "Helvetica", fontSize: 9.5, color: "#555555", marginBottom: 3 }),

  showCompanyLogos: true,
  sectionOrder: DEFAULT_SECTION_ORDER,
  hiddenSections: [],
};

// ── All starting points ────────────────────────────────────────────────────────

export const STARTING_POINTS: { id: string; label: string; desc: string; design: ResumeDesign }[] = [
  { id: "classic",   label: "Classic",   desc: "Single column · Helvetica · ATS-safe",       design: CLASSIC   },
  { id: "editorial", label: "Editorial", desc: "Single column · Serif · Generous margins",     design: EDITORIAL },
  { id: "sidebar",   label: "Sidebar",   desc: "Dark sidebar · Accent colour · Modern",        design: SIDEBAR   },
  { id: "minimal",   label: "Minimal",   desc: "Label column · Wide margins · Whitespace",     design: MINIMAL   },
];

// ── Default design for brand-new resumes ──────────────────────────────────────

export const DEFAULT_DESIGN: ResumeDesign = CLASSIC;
