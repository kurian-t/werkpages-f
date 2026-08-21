import { DEFAULT_DESIGN } from "./defaults";
import type { ResumeDesign, TextStyle } from "./types";
import {
  getDesignObjects,
  type ResumeDesignObject,
  type ResumeDesignWithObjects,
  type SmartDesignObject,
} from "./resumeDesignObjects";

export type ResumeTemplateId =
  | "classic"
  | "modern"
  | "sidebar"
  | "editorial"
  | "minimal"
  | "timeline";

export type ResumeTemplateCategory = "Professional" | "Modern" | "Creative";

export interface ResumeTemplatePreview {
  accent: string;
  paper: string;
  layout: "single" | "sidebar-left" | "sidebar-right";
  sidebarColor?: string;
  headerAccent?: boolean;
  timeline?: boolean;
  serif?: boolean;
  compact?: boolean;
}

export interface ResumeTemplateDefinition {
  id: ResumeTemplateId;
  name: string;
  description: string;
  category: ResumeTemplateCategory;
  preview: ResumeTemplatePreview;
  designPatch: Partial<ResumeDesign>;
  buildObjects?: () => ResumeDesignObject[];
}

export const RESUME_TEMPLATE_VERSION = 1;

function style(base: TextStyle, patch: Partial<TextStyle>): TextStyle {
  return { ...base, ...patch };
}

function smart(
  templateId: ResumeTemplateId,
  role: string,
  patch: Omit<SmartDesignObject, "id" | "type" | "page" | "x" | "y" | "width" | "height" | "templateId" | "templateRole"> &
    Partial<Pick<SmartDesignObject, "page" | "x" | "y" | "width" | "height">>,
): SmartDesignObject {
  return {
    id: `template-${templateId}-${role}`,
    type: "smart",
    page: patch.page ?? 0,
    x: patch.x ?? 0,
    y: patch.y ?? 0,
    width: patch.width ?? 120,
    height: patch.height ?? 8,
    layer: "background",
    zIndex: 1,
    opacity: 1,
    templateId,
    templateRole: role,
    ...patch,
  };
}

const classicPatch: Partial<ResumeDesign> = {
  layout: "single",
  pageBackground: "#ffffff",
  pageMarginTop: 44,
  pageMarginBottom: 44,
  pageMarginLeft: 48,
  pageMarginRight: 48,
  columnGap: 18,
  sidebarSections: [],
  hiddenSections: [],
  skillDisplay: "inline",
  showCompanyLogos: false,
  sectionRuleShow: true,
  sectionRuleColor: "#1f2937",
  sectionRuleThickness: 1,
  sectionRuleMarginTop: 3,
  sectionRuleMarginBottom: 8,
  name: style(DEFAULT_DESIGN.name, {
    fontFamily: "Times-Bold",
    fontSize: 25,
    color: "#111827",
    letterSpacing: 0.2,
  }),
  contact: style(DEFAULT_DESIGN.contact, {
    fontFamily: "Times-Roman",
    color: "#374151",
  }),
  sectionHeading: style(DEFAULT_DESIGN.sectionHeading, {
    fontFamily: "Times-Bold",
    color: "#111827",
    letterSpacing: 0.8,
  }),
  entryTitle: style(DEFAULT_DESIGN.entryTitle, {
    fontFamily: "Times-Bold",
    color: "#111827",
  }),
  entryOrg: style(DEFAULT_DESIGN.entryOrg, {
    fontFamily: "Times-Roman",
    color: "#374151",
  }),
  entryDate: style(DEFAULT_DESIGN.entryDate, {
    fontFamily: "Times-Roman",
    color: "#4b5563",
  }),
  summary: style(DEFAULT_DESIGN.summary, {
    fontFamily: "Times-Roman",
    color: "#1f2937",
    lineHeight: 1.42,
  }),
  entryBullet: style(DEFAULT_DESIGN.entryBullet, {
    fontFamily: "Times-Roman",
    color: "#1f2937",
    lineHeight: 1.38,
  }),
};

const modernAccent = "#5b21b6";
const modernPatch: Partial<ResumeDesign> = {
  layout: "single",
  pageBackground: "#ffffff",
  pageMarginTop: 40,
  pageMarginBottom: 42,
  pageMarginLeft: 46,
  pageMarginRight: 46,
  columnGap: 18,
  sidebarSections: [],
  hiddenSections: [],
  skillDisplay: "tags",
  showCompanyLogos: true,
  sectionRuleShow: false,
  name: style(DEFAULT_DESIGN.name, {
    fontFamily: "Helvetica-Bold",
    fontSize: 27,
    color: "#171717",
    letterSpacing: -0.2,
  }),
  contact: style(DEFAULT_DESIGN.contact, {
    fontFamily: "Helvetica",
    color: "#52525b",
  }),
  sectionHeading: style(DEFAULT_DESIGN.sectionHeading, {
    fontFamily: "Helvetica-Bold",
    color: modernAccent,
    letterSpacing: 1.1,
  }),
  entryTitle: style(DEFAULT_DESIGN.entryTitle, {
    fontFamily: "Helvetica-Bold",
    color: "#18181b",
  }),
  entryOrg: style(DEFAULT_DESIGN.entryOrg, {
    fontFamily: "Helvetica",
    color: "#52525b",
  }),
  entryDate: style(DEFAULT_DESIGN.entryDate, {
    fontFamily: "Helvetica",
    color: "#71717a",
  }),
  summary: style(DEFAULT_DESIGN.summary, {
    fontFamily: "Helvetica",
    color: "#27272a",
    lineHeight: 1.4,
  }),
  entryBullet: style(DEFAULT_DESIGN.entryBullet, {
    fontFamily: "Helvetica",
    color: "#27272a",
    lineHeight: 1.4,
  }),
};

const sidebarAccent = "#ede9fe";
const sidebarInk = "#312e81";
const sidebarPatch: Partial<ResumeDesign> = {
  layout: "sidebar-left",
  sidebarWidth: 31,
  sidebarBackground: sidebarAccent,
  sidebarSections: ["skills", "bio", "links"],
  hiddenSections: [],
  pageBackground: "#ffffff",
  pageMarginTop: 38,
  pageMarginBottom: 40,
  pageMarginLeft: 28,
  pageMarginRight: 42,
  columnGap: 22,
  skillDisplay: "list",
  showCompanyLogos: false,
  sectionRuleShow: false,
  name: style(DEFAULT_DESIGN.name, {
    fontFamily: "Helvetica-Bold",
    fontSize: 27,
    color: "#171717",
  }),
  contact: style(DEFAULT_DESIGN.contact, {
    fontFamily: "Helvetica",
    color: "#4b5563",
  }),
  sectionHeading: style(DEFAULT_DESIGN.sectionHeading, {
    fontFamily: "Helvetica-Bold",
    color: sidebarInk,
    letterSpacing: 0.9,
  }),
  entryTitle: style(DEFAULT_DESIGN.entryTitle, {
    fontFamily: "Helvetica-Bold",
    color: "#111827",
  }),
  entryOrg: style(DEFAULT_DESIGN.entryOrg, {
    fontFamily: "Helvetica",
    color: "#4b5563",
  }),
  entryDate: style(DEFAULT_DESIGN.entryDate, {
    fontFamily: "Helvetica",
    color: "#6b7280",
  }),
  summary: style(DEFAULT_DESIGN.summary, {
    fontFamily: "Helvetica",
    color: "#1f2937",
    lineHeight: 1.38,
  }),
  entryBullet: style(DEFAULT_DESIGN.entryBullet, {
    fontFamily: "Helvetica",
    color: "#1f2937",
    lineHeight: 1.38,
  }),
};

const editorialAccent = "#7c2d12";
const editorialPatch: Partial<ResumeDesign> = {
  layout: "single",
  pageBackground: "#fffdf9",
  pageMarginTop: 50,
  pageMarginBottom: 50,
  pageMarginLeft: 54,
  pageMarginRight: 54,
  columnGap: 20,
  sidebarSections: [],
  hiddenSections: [],
  skillDisplay: "inline",
  showCompanyLogos: false,
  sectionRuleShow: true,
  sectionRuleColor: "#d6d3d1",
  sectionRuleThickness: 1,
  sectionRuleMarginTop: 5,
  sectionRuleMarginBottom: 10,
  name: style(DEFAULT_DESIGN.name, {
    fontFamily: "Times-Bold",
    fontSize: 30,
    color: "#292524",
    letterSpacing: -0.2,
  }),
  contact: style(DEFAULT_DESIGN.contact, {
    fontFamily: "Helvetica",
    color: "#78716c",
    letterSpacing: 0.25,
  }),
  sectionHeading: style(DEFAULT_DESIGN.sectionHeading, {
    fontFamily: "Helvetica-Bold",
    color: editorialAccent,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  }),
  entryTitle: style(DEFAULT_DESIGN.entryTitle, {
    fontFamily: "Times-Bold",
    color: "#292524",
  }),
  entryOrg: style(DEFAULT_DESIGN.entryOrg, {
    fontFamily: "Times-Italic",
    color: "#57534e",
  }),
  entryDate: style(DEFAULT_DESIGN.entryDate, {
    fontFamily: "Helvetica",
    color: "#78716c",
  }),
  summary: style(DEFAULT_DESIGN.summary, {
    fontFamily: "Times-Roman",
    color: "#44403c",
    lineHeight: 1.5,
  }),
  entryBullet: style(DEFAULT_DESIGN.entryBullet, {
    fontFamily: "Times-Roman",
    color: "#44403c",
    lineHeight: 1.45,
  }),
};

const minimalPatch: Partial<ResumeDesign> = {
  layout: "single",
  pageBackground: "#ffffff",
  pageMarginTop: 48,
  pageMarginBottom: 48,
  pageMarginLeft: 56,
  pageMarginRight: 56,
  columnGap: 16,
  sidebarSections: [],
  hiddenSections: [],
  skillDisplay: "inline",
  showCompanyLogos: false,
  sectionRuleShow: false,
  name: style(DEFAULT_DESIGN.name, {
    fontFamily: "Helvetica",
    fontSize: 26,
    color: "#18181b",
    letterSpacing: 0.1,
  }),
  contact: style(DEFAULT_DESIGN.contact, {
    fontFamily: "Helvetica",
    color: "#71717a",
  }),
  sectionHeading: style(DEFAULT_DESIGN.sectionHeading, {
    fontFamily: "Helvetica-Bold",
    color: "#3f3f46",
    letterSpacing: 1.2,
  }),
  entryTitle: style(DEFAULT_DESIGN.entryTitle, {
    fontFamily: "Helvetica-Bold",
    color: "#27272a",
  }),
  entryOrg: style(DEFAULT_DESIGN.entryOrg, {
    fontFamily: "Helvetica",
    color: "#52525b",
  }),
  entryDate: style(DEFAULT_DESIGN.entryDate, {
    fontFamily: "Helvetica",
    color: "#a1a1aa",
  }),
  summary: style(DEFAULT_DESIGN.summary, {
    fontFamily: "Helvetica",
    color: "#3f3f46",
    lineHeight: 1.44,
  }),
  entryBullet: style(DEFAULT_DESIGN.entryBullet, {
    fontFamily: "Helvetica",
    color: "#3f3f46",
    lineHeight: 1.42,
  }),
};

const timelineAccent = "#0f766e";
const timelinePatch: Partial<ResumeDesign> = {
  layout: "single",
  pageBackground: "#ffffff",
  pageMarginTop: 42,
  pageMarginBottom: 44,
  pageMarginLeft: 62,
  pageMarginRight: 46,
  columnGap: 18,
  sidebarSections: [],
  hiddenSections: [],
  skillDisplay: "tags",
  showCompanyLogos: false,
  sectionRuleShow: false,
  name: style(DEFAULT_DESIGN.name, {
    fontFamily: "Helvetica-Bold",
    fontSize: 27,
    color: "#134e4a",
  }),
  contact: style(DEFAULT_DESIGN.contact, {
    fontFamily: "Helvetica",
    color: "#64748b",
  }),
  sectionHeading: style(DEFAULT_DESIGN.sectionHeading, {
    fontFamily: "Helvetica-Bold",
    color: timelineAccent,
    letterSpacing: 1.0,
  }),
  entryTitle: style(DEFAULT_DESIGN.entryTitle, {
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
  }),
  entryOrg: style(DEFAULT_DESIGN.entryOrg, {
    fontFamily: "Helvetica",
    color: "#475569",
  }),
  entryDate: style(DEFAULT_DESIGN.entryDate, {
    fontFamily: "Helvetica",
    color: "#64748b",
  }),
  summary: style(DEFAULT_DESIGN.summary, {
    fontFamily: "Helvetica",
    color: "#334155",
    lineHeight: 1.4,
  }),
  entryBullet: style(DEFAULT_DESIGN.entryBullet, {
    fontFamily: "Helvetica",
    color: "#334155",
    lineHeight: 1.4,
  }),
};

export const RESUME_TEMPLATES: ResumeTemplateDefinition[] = [
  {
    id: "classic",
    name: "Classic",
    description: "Traditional, restrained and ATS-friendly with serif typography.",
    category: "Professional",
    preview: { accent: "#1f2937", paper: "#ffffff", layout: "single", serif: true },
    designPatch: classicPatch,
  },
  {
    id: "modern",
    name: "Modern",
    description: "Clean sans-serif typography with a strong accent system.",
    category: "Modern",
    preview: { accent: modernAccent, paper: "#ffffff", layout: "single", headerAccent: true },
    designPatch: modernPatch,
    buildObjects: () => [
      smart("modern", "header-accent", {
        smartKind: "header-accent",
        width: 120,
        height: 4,
        fill: modernAccent,
        stroke: modernAccent,
        offset: 7,
      }),
      smart("modern", "work-divider", {
        smartKind: "section-divider",
        sectionId: "work",
        width: 120,
        height: 2,
        stroke: "#ddd6fe",
        strokeWidth: 2,
        offset: 5,
      }),
      smart("modern", "education-divider", {
        smartKind: "section-divider",
        sectionId: "education",
        width: 120,
        height: 2,
        stroke: "#ddd6fe",
        strokeWidth: 2,
        offset: 5,
      }),
    ],
  },
  {
    id: "sidebar",
    name: "Sidebar",
    description: "Structured left rail for skills, summary and links with a modern main column.",
    category: "Modern",
    preview: {
      accent: sidebarInk,
      paper: "#ffffff",
      layout: "sidebar-left",
      sidebarColor: sidebarAccent,
    },
    designPatch: sidebarPatch,
    buildObjects: () => [
      smart("sidebar", "page-sidebar", {
        smartKind: "sidebar",
        side: "left",
        width: 180,
        height: 792,
        fill: sidebarAccent,
        borderRadius: 0,
      }),
    ],
  },
  {
    id: "editorial",
    name: "Editorial",
    description: "Warm paper, serif body copy and publication-inspired hierarchy.",
    category: "Creative",
    preview: {
      accent: editorialAccent,
      paper: "#fffdf9",
      layout: "single",
      serif: true,
      compact: false,
    },
    designPatch: editorialPatch,
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Whitespace-first layout with quiet typography and almost no decoration.",
    category: "Professional",
    preview: { accent: "#52525b", paper: "#ffffff", layout: "single", compact: true },
    designPatch: minimalPatch,
  },
  {
    id: "timeline",
    name: "Timeline",
    description: "Resume-aware experience and education timelines that follow entries across pages.",
    category: "Creative",
    preview: {
      accent: timelineAccent,
      paper: "#ffffff",
      layout: "single",
      timeline: true,
      headerAccent: true,
    },
    designPatch: timelinePatch,
    buildObjects: () => [
      smart("timeline", "header-accent", {
        smartKind: "header-accent",
        width: 120,
        height: 3,
        fill: timelineAccent,
        stroke: timelineAccent,
        offset: 7,
      }),
      smart("timeline", "work-timeline", {
        smartKind: "timeline",
        sectionId: "work",
        width: 12,
        height: 80,
        fill: timelineAccent,
        stroke: timelineAccent,
        strokeWidth: 2,
        dotSize: 8,
        offset: 16,
      }),
      smart("timeline", "education-timeline", {
        smartKind: "timeline",
        sectionId: "education",
        width: 12,
        height: 80,
        fill: "#99f6e4",
        stroke: timelineAccent,
        strokeWidth: 2,
        dotSize: 8,
        offset: 16,
      }),
    ],
  },
];

export function getResumeTemplate(id: string | undefined | null): ResumeTemplateDefinition | undefined {
  return RESUME_TEMPLATES.find(template => template.id === id);
}

export function getAppliedResumeTemplateId(design: ResumeDesign): ResumeTemplateId | undefined {
  const id = (design as ResumeDesignWithObjects).templateId;
  return RESUME_TEMPLATES.some(template => template.id === id)
    ? id as ResumeTemplateId
    : undefined;
}

export function applyResumeTemplate(
  currentDesign: ResumeDesign,
  templateId: ResumeTemplateId,
): ResumeDesign {
  const template = getResumeTemplate(templateId);
  if (!template) return currentDesign;

  const preservedObjects = getDesignObjects(currentDesign).filter(object => !object.templateId);
  const templateObjects = template.buildObjects?.() ?? [];

  const next: ResumeDesignWithObjects = {
    ...(currentDesign as ResumeDesignWithObjects),
    ...template.designPatch,
    layoutOverrides: undefined,
    designObjects: [...preservedObjects, ...templateObjects],
    templateId: template.id,
    templateVersion: RESUME_TEMPLATE_VERSION,
  };

  return next as ResumeDesign;
}

export function detachResumeTemplate(design: ResumeDesign): ResumeDesign {
  const current = design as ResumeDesignWithObjects;
  const designObjects = getDesignObjects(design).map(object => {
    if (!object.templateId && !object.templateRole) return object;
    const next = { ...object };
    delete next.templateId;
    delete next.templateRole;
    return next;
  });

  const next: ResumeDesignWithObjects = {
    ...current,
    designObjects,
  };
  delete next.templateId;
  delete next.templateVersion;
  return next as ResumeDesign;
}
