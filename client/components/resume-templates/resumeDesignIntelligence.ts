import type { ResumeData, ResumeDesign } from "./types";
import {
  getDesignObjects,
  withDesignObjects,
  type ImageDesignObject,
  type ResumeDesignObject,
  type ShapeDesignObject,
} from "./resumeDesignObjects";

export type DesignInsightSeverity = "warning" | "suggestion";
export type DesignFixId =
  | "raise-small-type"
  | "restore-name-hierarchy"
  | "improve-text-contrast"
  | "make-circles-round"
  | "standardize-photo-frames"
  | "move-large-foreground-shapes-behind"
  | "link-repeated-accents"
  | "simplify-font-system"
  | "tighten-dense-resume";

export interface DesignInsight {
  id: string;
  title: string;
  detail: string;
  severity: DesignInsightSeverity;
  fixId?: DesignFixId;
  fixLabel?: string;
  safe?: boolean;
}

export interface DesignIntelligenceReport {
  insights: DesignInsight[];
  safeFixCount: number;
  warningCount: number;
  suggestionCount: number;
  headline: string;
}

type RGB = { r: number; g: number; b: number };

const TEXT_STYLE_KEYS = [
  "name",
  "contact",
  "sectionHeading",
  "entryTitle",
  "entryOrg",
  "entryDate",
  "summary",
  "entryBullet",
  "skillItem",
] as const;

const MIN_FONT_SIZE: Record<string, number> = {
  name: 18,
  contact: 8.5,
  sectionHeading: 9,
  entryTitle: 9,
  entryOrg: 8.5,
  entryDate: 8,
  summary: 9,
  entryBullet: 9,
  skillItem: 8.5,
};

function asDesignRecord(design: ResumeDesign): Record<string, any> {
  return design as unknown as Record<string, any>;
}

function styleFor(design: ResumeDesign, key: string): Record<string, any> | undefined {
  const value = asDesignRecord(design)[key];
  return value && typeof value === "object" ? value : undefined;
}

function stripHtml(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function pageGeometry(design: ResumeDesign): { width: number; height: number } {
  return asDesignRecord(design).pageSize === "A4"
    ? { width: 595, height: 842 }
    : { width: 612, height: 792 };
}

function parseCssColor(value: unknown): RGB | null {
  if (typeof value !== "string") return null;
  const color = value.trim().toLowerCase();

  if (color === "white") return { r: 255, g: 255, b: 255 };
  if (color === "black") return { r: 0, g: 0, b: 0 };
  if (color === "transparent") return null;

  const shortHex = color.match(/^#([0-9a-f]{3})$/i);
  if (shortHex) {
    const [r, g, b] = shortHex[1].split("").map(ch => parseInt(ch + ch, 16));
    return { r, g, b };
  }

  const hex = color.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const raw = hex[1];
    return {
      r: parseInt(raw.slice(0, 2), 16),
      g: parseInt(raw.slice(2, 4), 16),
      b: parseInt(raw.slice(4, 6), 16),
    };
  }

  const rgb = color.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (rgb) {
    return {
      r: Math.max(0, Math.min(255, Number(rgb[1]))),
      g: Math.max(0, Math.min(255, Number(rgb[2]))),
      b: Math.max(0, Math.min(255, Number(rgb[3]))),
    };
  }

  return null;
}

function linearize(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(rgb: RGB): number {
  return 0.2126 * linearize(rgb.r) + 0.7152 * linearize(rgb.g) + 0.0722 * linearize(rgb.b);
}

function contrastRatio(a: RGB, b: RGB): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

function preferredReadableText(background: RGB): string {
  const dark = { r: 17, g: 24, b: 39 };
  const light = { r: 255, g: 255, b: 255 };
  return contrastRatio(background, dark) >= contrastRatio(background, light)
    ? "#111827"
    : "#ffffff";
}

function fontBase(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const lower = value.toLowerCase();
  if (lower.includes("times")) return "Times";
  if (lower.includes("helvetica") || lower.includes("arial")) return "Helvetica";
  if (lower.includes("courier")) return "Courier";
  return value.split(",")[0].trim().replace(/['"]/g, "") || null;
}

function fontVariant(base: "Helvetica" | "Times" | "Courier", current: unknown): string {
  const text = typeof current === "string" ? current.toLowerCase() : "";
  const bold = text.includes("bold");
  const italic = text.includes("italic") || text.includes("oblique");

  if (base === "Helvetica") {
    if (bold && italic) return "Helvetica-BoldOblique";
    if (bold) return "Helvetica-Bold";
    if (italic) return "Helvetica-Oblique";
    return "Helvetica";
  }

  if (base === "Times") {
    if (bold && italic) return "Times-BoldItalic";
    if (bold) return "Times-Bold";
    if (italic) return "Times-Italic";
    return "Times-Roman";
  }

  if (bold && italic) return "Courier-BoldOblique";
  if (bold) return "Courier-Bold";
  if (italic) return "Courier-Oblique";
  return "Courier";
}

function photoObjects(design: ResumeDesign): ImageDesignObject[] {
  return getDesignObjects(design).filter(
    (object): object is ImageDesignObject =>
      object.type === "image" && (object.imageKind ?? "image") === "photo"
  );
}

function circleObjects(design: ResumeDesign): ShapeDesignObject[] {
  return getDesignObjects(design).filter(
    (object): object is ShapeDesignObject =>
      object.type === "shape" &&
      object.shape === "ellipse" &&
      (object.name?.toLowerCase().includes("circle") ?? true)
  );
}

function largeForegroundShapes(design: ResumeDesign): ShapeDesignObject[] {
  const page = pageGeometry(design);
  const pageArea = page.width * page.height;
  return getDesignObjects(design).filter(
    (object): object is ShapeDesignObject =>
      object.type === "shape" &&
      !object.attachment &&
      (object.layer ?? "background") === "foreground" &&
      object.shape !== "line" &&
      object.width * object.height > pageArea * 0.16 &&
      (object.opacity ?? 1) > 0.2
  );
}

function repeatedAccentCandidates(design: ResumeDesign): ShapeDesignObject[] {
  return getDesignObjects(design).filter(
    (object): object is ShapeDesignObject =>
      object.type === "shape" &&
      !object.attachment &&
      !object.hidden &&
      !object.linkId &&
      (object.shape === "rectangle" || object.shape === "line")
  );
}

function sameAccentSignature(a: ShapeDesignObject, b: ShapeDesignObject): boolean {
  if (a.shape !== b.shape) return false;
  if ((a.layer ?? "background") !== (b.layer ?? "background")) return false;
  if ((a.fill ?? "") !== (b.fill ?? "")) return false;
  if ((a.stroke ?? "") !== (b.stroke ?? "")) return false;
  if (Math.abs(a.width - b.width) > 2) return false;
  if (Math.abs(a.height - b.height) > 2) return false;
  return a.page !== b.page;
}

function repeatedAccentGroup(design: ResumeDesign): ShapeDesignObject[] {
  const objects = repeatedAccentCandidates(design);
  for (let i = 0; i < objects.length; i += 1) {
    const group = objects.filter(candidate =>
      candidate.id === objects[i].id || sameAccentSignature(objects[i], candidate)
    );
    if (group.length >= 2) return group;
  }
  return [];
}

function photoStyleSignature(photo: ImageDesignObject): string {
  return [
    photo.mask ?? "square",
    photo.borderRadius ?? "",
    photo.borderColor ?? "",
    photo.borderWidth ?? 0,
    photo.shadow ?? "none",
    photo.objectFit ?? "cover",
  ].join("|");
}

function denseResume(data: ResumeData): boolean {
  const workText = (data.workEntries ?? []).map(entry => stripHtml(entry.body)).join(" ");
  const summary = data.summary ?? "";
  const skills = (data.skills ?? []).join(" ");
  const education = (data.education ?? []).map(entry =>
    [entry.school, entry.degree, entry.field].filter(Boolean).join(" ")
  ).join(" ");

  const contentChars = `${summary} ${workText} ${skills} ${education}`.trim().length;
  return contentChars > 4200 || (data.workEntries?.length ?? 0) >= 6;
}

function hasLooseDenseSpacing(data: ResumeData): boolean {
  const d = asDesignRecord(data.design);
  if (!denseResume(data)) return false;
  return (
    Number(d.entrySpacing ?? 0) > 12 ||
    Number(d.pageMarginTop ?? 0) > 48 ||
    Number(d.pageMarginBottom ?? 0) > 48
  );
}

export function analyzeResumeDesign(data: ResumeData): DesignIntelligenceReport {
  const design = data.design;
  const insights: DesignInsight[] = [];
  const d = asDesignRecord(design);

  const undersized = TEXT_STYLE_KEYS.filter(key => {
    const style = styleFor(design, key);
    const size = Number(style?.fontSize);
    return Number.isFinite(size) && size < MIN_FONT_SIZE[key];
  });

  if (undersized.length > 0) {
    insights.push({
      id: "small-type",
      title: "Some text is getting too small",
      detail: `${undersized.length} text style${undersized.length === 1 ? "" : "s"} fall below the editor's readability floor.`,
      severity: "warning",
      fixId: "raise-small-type",
      fixLabel: "Raise small type",
      safe: true,
    });
  }

  const nameSize = Number(styleFor(design, "name")?.fontSize ?? 0);
  const sectionSize = Number(styleFor(design, "sectionHeading")?.fontSize ?? 0);
  if (nameSize > 0 && sectionSize > 0 && nameSize < sectionSize + 5) {
    insights.push({
      id: "name-hierarchy",
      title: "Your name could lead the hierarchy more clearly",
      detail: "The name is too close in size to section headings, so the page has less visual hierarchy.",
      severity: "suggestion",
      fixId: "restore-name-hierarchy",
      fixLabel: "Strengthen name",
      safe: true,
    });
  }

  const background = parseCssColor(d.pageBackground ?? "#ffffff");
  if (background) {
    const lowContrastKeys = TEXT_STYLE_KEYS.filter(key => {
      const color = parseCssColor(styleFor(design, key)?.color);
      if (!color) return false;
      const size = Number(styleFor(design, key)?.fontSize ?? 10);
      const threshold = size >= 18 ? 3 : 4.5;
      return contrastRatio(background, color) < threshold;
    });

    if (lowContrastKeys.length > 0) {
      insights.push({
        id: "contrast",
        title: "Text contrast is weak in a few places",
        detail: `${lowContrastKeys.length} text style${lowContrastKeys.length === 1 ? "" : "s"} may be difficult to read against the page background.`,
        severity: "warning",
        fixId: "improve-text-contrast",
        fixLabel: "Improve contrast",
        safe: true,
      });
    }
  }

  const circles = circleObjects(design).filter(object => Math.abs(object.width - object.height) > 2);
  if (circles.length > 0) {
    insights.push({
      id: "circles",
      title: "Circle shapes have become oval",
      detail: `${circles.length} circle${circles.length === 1 ? "" : "s"} no longer have equal width and height.`,
      severity: "suggestion",
      fixId: "make-circles-round",
      fixLabel: "Make circular",
      safe: true,
    });
  }

  const photos = photoObjects(design);
  const photoSignatures = new Set(photos.map(photoStyleSignature));
  if (photos.length >= 2 && photoSignatures.size > 1) {
    insights.push({
      id: "photo-frames",
      title: "Photo treatments are inconsistent",
      detail: "Multiple photos use different masks, borders, shadows, or fit settings.",
      severity: "suggestion",
      fixId: "standardize-photo-frames",
      fixLabel: "Match photo frames",
      safe: false,
    });
  }

  const largeForeground = largeForegroundShapes(design);
  if (largeForeground.length > 0) {
    insights.push({
      id: "large-foreground",
      title: "A large shape is sitting above resume content",
      detail: `${largeForeground.length} large foreground shape${largeForeground.length === 1 ? "" : "s"} could cover selectable resume text.`,
      severity: "warning",
      fixId: "move-large-foreground-shapes-behind",
      fixLabel: "Move behind content",
      safe: false,
    });
  }

  const repeatGroup = repeatedAccentGroup(design);
  if (repeatGroup.length >= 2) {
    insights.push({
      id: "repeat-accents",
      title: "Repeated accents can stay synchronized",
      detail: `${repeatGroup.length} matching shapes on different pages look like the same design element but are not linked.`,
      severity: "suggestion",
      fixId: "link-repeated-accents",
      fixLabel: "Link matching accents",
      safe: false,
    });
  }

  const fontFamilies = new Set(
    TEXT_STYLE_KEYS
      .map(key => fontBase(styleFor(design, key)?.fontFamily))
      .filter(Boolean)
  );
  if (fontFamilies.size > 2) {
    insights.push({
      id: "font-system",
      title: "The typography system is getting busy",
      detail: `${fontFamilies.size} font families are used across core resume text. One or two families usually produce a cleaner hierarchy.`,
      severity: "suggestion",
      fixId: "simplify-font-system",
      fixLabel: "Simplify fonts",
      safe: false,
    });
  }

  if (hasLooseDenseSpacing(data)) {
    insights.push({
      id: "dense-spacing",
      title: "Dense content is using generous spacing",
      detail: "This resume has a lot of content, but its entry spacing or vertical page margins are still relatively large.",
      severity: "suggestion",
      fixId: "tighten-dense-resume",
      fixLabel: "Tighten spacing",
      safe: false,
    });
  }

  const safeFixCount = insights.filter(insight => insight.safe && insight.fixId).length;
  const warningCount = insights.filter(insight => insight.severity === "warning").length;
  const suggestionCount = insights.filter(insight => insight.severity === "suggestion").length;

  return {
    insights,
    safeFixCount,
    warningCount,
    suggestionCount,
    headline:
      insights.length === 0
        ? "No obvious design issues detected"
        : warningCount > 0
          ? `${warningCount} design issue${warningCount === 1 ? "" : "s"} worth fixing`
          : `${suggestionCount} polish suggestion${suggestionCount === 1 ? "" : "s"}`,
  };
}

function updateTextStyles(
  design: ResumeDesign,
  updater: (key: string, style: Record<string, any>) => Record<string, any>,
): ResumeDesign {
  const d = asDesignRecord(design);
  const next: Record<string, any> = { ...d };
  for (const key of TEXT_STYLE_KEYS) {
    const current = styleFor(design, key);
    if (!current) continue;
    next[key] = updater(key, current);
  }
  return next as ResumeDesign;
}

function mapObjects(
  design: ResumeDesign,
  mapper: (object: ResumeDesignObject) => ResumeDesignObject,
): ResumeDesign {
  return withDesignObjects(design, getDesignObjects(design).map(mapper));
}

function uniqueLinkId(): string {
  return `design-link-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function applyResumeDesignFix(
  design: ResumeDesign,
  fixId: DesignFixId,
): ResumeDesign {
  switch (fixId) {
    case "raise-small-type":
      return updateTextStyles(design, (key, style) => {
        const size = Number(style.fontSize);
        const minimum = MIN_FONT_SIZE[key];
        if (!Number.isFinite(size) || size >= minimum) return style;
        return { ...style, fontSize: minimum };
      });

    case "restore-name-hierarchy": {
      const d = asDesignRecord(design);
      const name = styleFor(design, "name");
      const section = styleFor(design, "sectionHeading");
      if (!name || !section) return design;
      const sectionSize = Number(section.fontSize ?? 11);
      const target = Math.max(22, sectionSize + 7);
      return {
        ...d,
        name: { ...name, fontSize: Math.max(Number(name.fontSize ?? 0), target) },
      } as ResumeDesign;
    }

    case "improve-text-contrast": {
      const d = asDesignRecord(design);
      const background = parseCssColor(d.pageBackground ?? "#ffffff");
      if (!background) return design;
      const replacement = preferredReadableText(background);
      return updateTextStyles(design, (_key, style) => {
        const color = parseCssColor(style.color);
        if (!color) return style;
        const size = Number(style.fontSize ?? 10);
        const threshold = size >= 18 ? 3 : 4.5;
        return contrastRatio(background, color) < threshold
          ? { ...style, color: replacement }
          : style;
      });
    }

    case "make-circles-round":
      return mapObjects(design, object => {
        if (object.type !== "shape" || object.shape !== "ellipse") return object;
        if (!(object.name?.toLowerCase().includes("circle") ?? true)) return object;
        if (Math.abs(object.width - object.height) <= 2) return object;

        const cx = object.x + object.width / 2;
        const cy = object.y + object.height / 2;
        const size = Math.min(object.width, object.height);
        return {
          ...object,
          x: cx - size / 2,
          y: cy - size / 2,
          width: size,
          height: size,
        };
      });

    case "standardize-photo-frames": {
      const photos = photoObjects(design);
      const source = photos[0];
      if (!source) return design;
      return mapObjects(design, object => {
        if (object.type !== "image" || (object.imageKind ?? "image") !== "photo") return object;
        return {
          ...object,
          mask: source.mask,
          borderRadius: source.borderRadius,
          borderColor: source.borderColor,
          borderWidth: source.borderWidth,
          shadow: source.shadow,
          objectFit: source.objectFit,
        };
      });
    }

    case "move-large-foreground-shapes-behind": {
      const largeIds = new Set(largeForegroundShapes(design).map(object => object.id));
      if (largeIds.size === 0) return design;
      return mapObjects(design, object =>
        largeIds.has(object.id)
          ? { ...object, layer: "background" }
          : object
      );
    }

    case "link-repeated-accents": {
      const group = repeatedAccentGroup(design);
      if (group.length < 2) return design;
      const ids = new Set(group.map(object => object.id));
      const linkId = uniqueLinkId();
      return mapObjects(design, object =>
        ids.has(object.id)
          ? { ...object, linkId }
          : object
      );
    }

    case "simplify-font-system": {
      const headingBase = fontBase(styleFor(design, "name")?.fontFamily);
      const base: "Helvetica" | "Times" | "Courier" =
        headingBase === "Times" ? "Times" :
        headingBase === "Courier" ? "Courier" :
        "Helvetica";

      return updateTextStyles(design, (_key, style) => ({
        ...style,
        fontFamily: fontVariant(base, style.fontFamily),
      }));
    }

    case "tighten-dense-resume": {
      const d = asDesignRecord(design);
      return {
        ...d,
        entrySpacing: Math.min(Number(d.entrySpacing ?? 10), 9),
        pageMarginTop: Math.min(Number(d.pageMarginTop ?? 42), 42),
        pageMarginBottom: Math.min(Number(d.pageMarginBottom ?? 42), 42),
      } as ResumeDesign;
    }

    default:
      return design;
  }
}

export function applySafeResumeDesignPolish(data: ResumeData): ResumeDesign {
  const report = analyzeResumeDesign(data);
  let next = data.design;

  for (const insight of report.insights) {
    if (!insight.safe || !insight.fixId) continue;
    next = applyResumeDesignFix(next, insight.fixId);
  }

  return next;
}
