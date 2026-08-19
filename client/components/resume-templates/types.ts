// ── Content types ─────────────────────────────────────────────────────────────

export interface BulletPoint {
  id: string;
  text: string;
}

/** Returns a short random string suitable as a bullet/item ID. */
export function genId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export interface WorkEntry {
  id: string;             // stable — never changes after creation; used as layout override key
  company: string;
  title: string;
  startDate: string | null;   // "YYYY-MM"
  endDate: string | null;     // "YYYY-MM" or null
  current: boolean;
  body?: string;              // HTML from Tiptap rich-text editor (prose + bullets unified)
  bullets?: BulletPoint[];    // legacy — migrated to body on load; no longer written
  managerId?: number;
  logoUrl?: string;
}

export interface EducationEntry {
  id: string;             // stable — never changes after creation
  school: string;
  degree: string;
  field: string;
  startYear: number | null;
  endYear: number | null;
  current: boolean;
}

export interface ExtraLink {
  label: string;
  url: string;
}

// ── Design system ──────────────────────────────────────────────────────────────

// All built-in PDF fonts available without network fetch
export type FontFamily =
  | "Helvetica"
  | "Helvetica-Bold"
  | "Helvetica-Oblique"
  | "Helvetica-BoldOblique"
  | "Times-Roman"
  | "Times-Bold"
  | "Times-Italic"
  | "Times-BoldItalic"
  | "Courier"
  | "Courier-Bold"
  | "Courier-Oblique"
  | "Courier-BoldOblique";

export type LayoutType =
  | "single"         // one column, full width
  | "sidebar-left"   // sidebar on the left
  | "sidebar-right"  // sidebar on the right
  | "two-column"     // two equal columns of sections below the header
  | "label";         // narrow label column + wide content column (Minimal-style)

export type TextTransform = "none" | "uppercase" | "lowercase" | "capitalize";
export type TextAlign    = "left" | "center" | "right";
export type SkillDisplay = "tags" | "list" | "inline" | "grid";
export type DatePosition = "right" | "below";

// Every text element in the document gets the full set of properties.
// The PDF renderer maps these 1-to-1 to @react-pdf/renderer StyleSheet properties.
export interface TextStyle {
  fontFamily: FontFamily;
  fontSize: number;
  color: string;
  backgroundColor: string;
  letterSpacing: number;
  lineHeight: number;
  textTransform: TextTransform;
  textAlign: TextAlign;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  paddingTop: number;
  paddingBottom: number;
  paddingLeft: number;
  paddingRight: number;
  borderRadius: number;
  borderBottomWidth: number;
  borderBottomColor: string;
}

// ── Layout override (canvas drag model) ───────────────────────────────────────

export interface LayoutOverride {
  // Vertical: participates in flow cascade — shifts this block and all subsequent
  // siblings within the same flow region by this many document points.
  flowDisplacementY?: number;
  // Horizontal: visual-only transform, does not cascade to adjacent blocks.
  visualDx?: number;
  // Vertical visual-only offset: used for child sub-element overrides within a section.
  // Does NOT cascade. Keys: "work.<entryId>.title", "work.<entryId>.org", etc.
  visualDy?: number;
  // Width override: triggers text reflow → intrinsic height change → cascade.
  width?: number;
  // Minimum height override: applied as minHeight so content always shows.
  // Stored in document points (unscaled). Feeds into cascade via getBoundingClientRect.
  height?: number;
  // Rotation: visual-only. Reserved for decorative and floating objects.
  rotation?: number;
}

export interface ResumeDesign {
  // ── Page ────────────────────────────────────────────────────────────────────
  pageSize: "LETTER" | "A4";
  pageMarginTop: number;
  pageMarginBottom: number;
  pageMarginLeft: number;
  pageMarginRight: number;
  pageBackground: string;

  // ── Layout ──────────────────────────────────────────────────────────────────
  layout: LayoutType;
  // sidebarWidth is % of page width for sidebar layouts, or label column width in pts for label layout
  sidebarWidth: number;
  sidebarBackground: string;
  columnGap: number;
  // Which sections live in the sidebar (sidebar-left / sidebar-right layouts only)
  sidebarSections: string[];

  // ── Header ──────────────────────────────────────────────────────────────────
  name: TextStyle;
  contact: TextStyle & { separator: string };

  // ── Section headings ────────────────────────────────────────────────────────
  sectionHeading: TextStyle;
  sectionRuleShow: boolean;
  sectionRuleColor: string;
  sectionRuleThickness: number;
  sectionRuleMarginTop: number;
  sectionRuleMarginBottom: number;

  // ── Entry elements ──────────────────────────────────────────────────────────
  entryTitle: TextStyle;
  entryOrg: TextStyle;                          // company name / school name
  entryDate: TextStyle & { position: DatePosition };
  entryBullet: TextStyle;
  bulletMarkerChar: string;
  bulletMarkerColor: string;
  bulletMarkerWidth: number;
  entrySpacing: number;                         // vertical gap between entries in a section

  // ── Summary / Bio ────────────────────────────────────────────────────────────
  summary: TextStyle;

  // ── Skills ──────────────────────────────────────────────────────────────────
  skillDisplay: SkillDisplay;
  skillItem: TextStyle;
  skillGridColumns: number;                     // used when skillDisplay === "grid"

  // ── Links ───────────────────────────────────────────────────────────────────
  linkItem: TextStyle;

  // ── Features ────────────────────────────────────────────────────────────────
  showCompanyLogos: boolean;

  // ── Section management ───────────────────────────────────────────────────────
  sectionOrder: string[];
  hiddenSections: string[];

  // ── Canvas layout overrides ───────────────────────────────────────────────────
  // Keyed by semantic block id using dot notation:
  //   "name", "contact"
  //   "work.heading", "work.<entryId>"   (stable id, not array index)
  //   "edu.heading",  "edu.<entryId>"
  //   "bio.heading",  "bio"
  //   "skills.heading", "skills"
  //   "links.heading",  "links"
  // Two kinds of override:
  //   flowDisplacementY — vertical, cascades to subsequent siblings in same flow region
  //   visualDx          — horizontal, visual-only, no cascade
  // Width overrides cause text reflow → height change → automatic cascade.
  // Height is always intrinsic (never stored for text/semantic blocks).
  layoutOverrides?: Record<string, LayoutOverride>;
}

// ── Full resume data (content + design) ───────────────────────────────────────

export interface ResumeData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  location: string;
  website: string;
  summary: string;
  workEntries: WorkEntry[];
  education: EducationEntry[];
  skills: string[];
  extraLinks: ExtraLink[];
  design: ResumeDesign;
}

// ── Date formatting helpers ────────────────────────────────────────────────────

export function formatDateRange(
  startDate: string | null,
  endDate: string | null,
  current: boolean,
): string {
  const fmt = (d: string) => {
    const [y, m] = d.split("-");
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${months[parseInt(m, 10) - 1]} ${y}`;
  };
  const start = startDate ? fmt(startDate) : "";
  const end   = current ? "Present" : endDate ? fmt(endDate) : "";
  if (start && end) return `${start} – ${end}`;
  if (start) return start;
  return end;
}

export function formatEduYears(
  startYear: number | null,
  endYear: number | null,
  current: boolean,
): string {
  if (!startYear && !endYear) return "";
  const end = current ? "Present" : endYear ? String(endYear) : "";
  if (startYear && end) return `${startYear} – ${end}`;
  if (startYear) return String(startYear);
  return end;
}
