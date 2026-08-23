import type { CSSProperties } from "react";
import type { ResumeDesign, TextStyle, LayoutOverride } from "./types";

export type ResumePresentationMode = "pdf" | "web" | "ats";
export type ResumeVisualScope = "shared" | "web" | "pdf";

export type ResumeVisualRole =
  | "name"
  | "contact"
  | "sectionHeading"
  | "entryTitle"
  | "entryOrg"
  | "entryDate"
  | "entryBody"
  | "summary"
  | "skill"
  | "link";

export type WebBreakpoint = "desktop" | "tablet" | "mobile";

export type WebSectionId =
  | "video"
  | "about"
  | "experience"
  | "projects"
  | "education"
  | "skills"
  | "featured"
  | "links";

export type WebElementTarget =
  | "background"
  | "hero"
  | "name"
  | "summary"
  | "contact"
  | "photo"
  | "section"
  | "sectionHeading"
  | "sectionBody"
  | "experience"
  | "projects"
  | "education"
  | "skills"
  | "links"
  | "video";

export type WebLayoutMode = "flow" | "floating";
export type WebAlign = "stretch" | "left" | "center" | "right";
export type WebSpan = 4 | 6 | 8 | 12;

export interface ResumeTextStylePatch {
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  letterSpacing?: number;
  lineHeight?: number;
  textAlign?: "left" | "center" | "right";
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
  backgroundColor?: string;
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
  borderRadius?: number;
}

export interface WebBoxStyle {
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  shadow?: "none" | "soft" | "medium" | "strong" | "glow";
  opacity?: number;
}

export interface WebLayoutPlacement {
  mode?: WebLayoutMode;
  span?: WebSpan;
  widthPct?: number;
  widthPx?: number;
  heightPx?: number;
  align?: WebAlign;
  offsetX?: number;
  offsetY?: number;
  /** Degrees clockwise. Presentation-specific and breakpoint-aware. */
  rotation?: number;
  hidden?: boolean;
}

export interface ResumePresentationState {
  webTextOverrides?: Partial<Record<ResumeVisualRole, ResumeTextStylePatch>>;
  webBoxStyles?: Partial<Record<WebElementTarget, WebBoxStyle>>;
  webInstanceBoxStyles?: Record<string, WebBoxStyle>;
  companyLogoLinks?: {
    /**
     * Cross-presentation relationship. Defaults to true.
     * Only compatible visual identity (currently logo size) crosses formats;
     * x/y position remains presentation-specific.
     */
    syncPdfWeb?: boolean;
    /**
     * Same-type relationship for the Web presentation. Missing IDs are linked.
     * PDF already persists this per-logo on LayoutOverride.linked.
     */
    webUnlinkedEntryIds?: string[];
  };
  /**
   * Cross-format rotation is linked by default. Only explicit Web opt-outs
   * are persisted here.
   */
  rotationLinks?: {
    webUnlinkedKeys?: string[];
  };
  webLayout?: {
    sectionOrder?: WebSectionId[];
    sections?: Partial<
      Record<WebBreakpoint, Partial<Record<WebSectionId, WebLayoutPlacement>>>
    >;
    elements?: Partial<
      Record<WebBreakpoint, Partial<Record<WebElementTarget, WebLayoutPlacement>>>
    >;
    instances?: Partial<
      Record<WebBreakpoint, Record<string, WebLayoutPlacement>>
    >;
  };
}

type ResumeDesignWithPresentation = ResumeDesign & {
  presentation?: ResumePresentationState;
};

const DEFAULT_SECTION_ORDER: WebSectionId[] = [
  "video",
  "about",
  "experience",
  "projects",
  "education",
  "skills",
  "featured",
  "links",
];

const ROLE_TO_DESIGN_KEY: Record<ResumeVisualRole, keyof ResumeDesign> = {
  name: "name",
  contact: "contact",
  sectionHeading: "sectionHeading",
  entryTitle: "entryTitle",
  entryOrg: "entryOrg",
  entryDate: "entryDate",
  entryBody: "entryBullet",
  summary: "summary",
  skill: "skillItem",
  link: "linkItem",
};

const DESIGN_KEY_TO_ROLE: Partial<Record<keyof ResumeDesign, ResumeVisualRole>> = {
  name: "name",
  contact: "contact",
  sectionHeading: "sectionHeading",
  entryTitle: "entryTitle",
  entryOrg: "entryOrg",
  entryDate: "entryDate",
  entryBullet: "entryBody",
  summary: "summary",
  skillItem: "skill",
  linkItem: "link",
};

export function visualRoleForDesignKey(
  key: keyof ResumeDesign | string,
): ResumeVisualRole | null {
  return DESIGN_KEY_TO_ROLE[key as keyof ResumeDesign] ?? null;
}

export function designKeyForVisualRole(
  role: ResumeVisualRole,
): keyof ResumeDesign {
  return ROLE_TO_DESIGN_KEY[role];
}

function presentationState(design: ResumeDesign): ResumePresentationState {
  return (design as ResumeDesignWithPresentation).presentation ?? {};
}

function withPresentation(
  design: ResumeDesign,
  nextPresentation: ResumePresentationState,
): ResumeDesign {
  return {
    ...(design as ResumeDesignWithPresentation),
    presentation: nextPresentation,
  } as ResumeDesign;
}


export type ResumeRotationSyncTarget =
  | {
      syncKey: string;
      pdfBlockId: string;
      web: { kind: "section"; sectionId: WebSectionId };
    }
  | {
      syncKey: string;
      pdfBlockId: string;
      web: { kind: "instance"; instanceId: string };
    };

const ROTATION_SECTION_TO_PDF: Partial<Record<WebSectionId, string>> = {
  experience: "work.heading",
  projects: "projects.heading",
  education: "education.heading",
};

function rotationTargetForWebSection(
  sectionId: WebSectionId,
): ResumeRotationSyncTarget | null {
  const pdfBlockId = ROTATION_SECTION_TO_PDF[sectionId];
  if (!pdfBlockId) return null;

  return {
    syncKey: `section:${sectionId}`,
    pdfBlockId,
    web: { kind: "section", sectionId },
  };
}

function rotationTargetForWebInstance(
  instanceId: string,
): ResumeRotationSyncTarget | null {
  if (instanceId.startsWith("work:")) {
    const id = instanceId.slice("work:".length);
    if (!id) return null;
    return {
      syncKey: `work:${id}`,
      pdfBlockId: `work.${id}`,
      web: { kind: "instance", instanceId },
    };
  }

  if (instanceId.startsWith("project:")) {
    const id = instanceId.slice("project:".length);
    if (!id) return null;
    return {
      syncKey: `project:${id}`,
      pdfBlockId: `projects.${id}`,
      web: { kind: "instance", instanceId },
    };
  }

  if (instanceId.startsWith("education:")) {
    const id = instanceId.slice("education:".length);
    if (!id) return null;
    return {
      syncKey: `education:${id}`,
      pdfBlockId: `edu.${id}`,
      web: { kind: "instance", instanceId },
    };
  }

  return null;
}

export function getWebRotationSyncTarget(options: {
  sectionId?: WebSectionId;
  instanceId?: string;
  sectionRoot?: boolean;
}): ResumeRotationSyncTarget | null {
  if (options.sectionRoot && options.sectionId) {
    return rotationTargetForWebSection(options.sectionId);
  }

  if (options.instanceId) {
    return rotationTargetForWebInstance(options.instanceId);
  }

  return null;
}

export function isWebRotationCrossFormatLinked(
  design: ResumeDesign,
  syncKey: string,
): boolean {
  return !(
    presentationState(design).rotationLinks?.webUnlinkedKeys ?? []
  ).includes(syncKey);
}

function pdfRotationForTarget(
  design: ResumeDesign,
  target: ResumeRotationSyncTarget,
): number {
  const override = design.layoutOverrides?.[target.pdfBlockId] as
    | LayoutOverride
    | undefined;
  return override?.rotation ?? 0;
}

function withPdfRotation(
  design: ResumeDesign,
  target: ResumeRotationSyncTarget,
  rotation: number,
): ResumeDesign {
  const layoutOverrides = { ...(design.layoutOverrides ?? {}) };
  const existing = {
    ...(layoutOverrides[target.pdfBlockId] as LayoutOverride | undefined),
  } as LayoutOverride;

  if (rotation) existing.rotation = rotation;
  else delete existing.rotation;

  if (Object.keys(existing).length) {
    layoutOverrides[target.pdfBlockId] = existing;
  } else {
    delete layoutOverrides[target.pdfBlockId];
  }

  return {
    ...design,
    layoutOverrides,
  };
}

function applyLinkedPdfRotation(
  design: ResumeDesign,
  placement: WebLayoutPlacement,
  target: ResumeRotationSyncTarget | null,
): WebLayoutPlacement {
  if (!target || !isWebRotationCrossFormatLinked(design, target.syncKey)) {
    return placement;
  }

  const rotation = pdfRotationForTarget(design, target);
  return {
    ...placement,
    rotation: rotation || undefined,
  };
}

function rawWebRotationForTarget(
  design: ResumeDesign,
  breakpoint: WebBreakpoint,
  target: ResumeRotationSyncTarget,
): number {
  const layout = presentationState(design).webLayout;

  if (target.web.kind === "section") {
    const desktop =
      layout?.sections?.desktop?.[target.web.sectionId] ?? {};
    if (breakpoint === "desktop") return desktop.rotation ?? 0;

    const explicit =
      layout?.sections?.[breakpoint]?.[target.web.sectionId];
    return explicit?.rotation ?? desktop.rotation ?? 0;
  }

  const desktop =
    layout?.instances?.desktop?.[target.web.instanceId] ?? {};
  if (breakpoint === "desktop") return desktop.rotation ?? 0;

  const explicit =
    layout?.instances?.[breakpoint]?.[target.web.instanceId];
  return explicit?.rotation ?? desktop.rotation ?? 0;
}

function updateRawWebRotation(
  design: ResumeDesign,
  breakpoint: WebBreakpoint,
  target: ResumeRotationSyncTarget,
  rotation: number | undefined,
): ResumeDesign {
  if (target.web.kind === "section") {
    return updateWebSectionPlacement(
      design,
      breakpoint,
      target.web.sectionId,
      { rotation },
    );
  }

  return updateWebInstancePlacement(
    design,
    breakpoint,
    target.web.instanceId,
    { rotation },
  );
}

export function updateWebRotationWithPdfSync(
  design: ResumeDesign,
  breakpoint: WebBreakpoint,
  target: ResumeRotationSyncTarget,
  rotation: number,
): ResumeDesign {
  if (isWebRotationCrossFormatLinked(design, target.syncKey)) {
    return withPdfRotation(design, target, rotation);
  }

  return updateRawWebRotation(
    design,
    breakpoint,
    target,
    rotation || undefined,
  );
}

export function setWebRotationCrossFormatLinked(
  design: ResumeDesign,
  breakpoint: WebBreakpoint,
  target: ResumeRotationSyncTarget,
  linked: boolean,
): ResumeDesign {
  const current = presentationState(design);
  const unlinked = new Set(
    current.rotationLinks?.webUnlinkedKeys ?? [],
  );

  if (!linked) {
    const frozenRotation = pdfRotationForTarget(design, target);
    unlinked.add(target.syncKey);

    let next = withPresentation(design, {
      ...current,
      rotationLinks: {
        ...(current.rotationLinks ?? {}),
        webUnlinkedKeys: [...unlinked],
      },
    });

    (["desktop", "tablet", "mobile"] as WebBreakpoint[]).forEach(bp => {
      next = updateRawWebRotation(
        next,
        bp,
        target,
        frozenRotation || undefined,
      );
    });

    return next;
  }

  const webRotation = rawWebRotationForTarget(
    design,
    breakpoint,
    target,
  );

  unlinked.delete(target.syncKey);

  let next = withPresentation(design, {
    ...current,
    rotationLinks: {
      ...(current.rotationLinks ?? {}),
      webUnlinkedKeys: unlinked.size ? [...unlinked] : undefined,
    },
  });

  next = withPdfRotation(next, target, webRotation);

  (["desktop", "tablet", "mobile"] as WebBreakpoint[]).forEach(bp => {
    next = updateRawWebRotation(next, bp, target, undefined);
  });

  return next;
}

function textStyleForRole(
  design: ResumeDesign,
  role: ResumeVisualRole,
): TextStyle & Record<string, unknown> {
  const key = ROLE_TO_DESIGN_KEY[role];
  const style = design[key] as unknown;
  return (
    style && typeof style === "object"
      ? style
      : {}
  ) as TextStyle & Record<string, unknown>;
}

export function getPdfTextStyle(
  design: ResumeDesign,
  role: ResumeVisualRole,
): ResumeTextStylePatch {
  const style = textStyleForRole(design, role);
  return {
    fontFamily: style.fontFamily as string | undefined,
    fontSize: style.fontSize as number | undefined,
    color: style.color as string | undefined,
    letterSpacing: style.letterSpacing as number | undefined,
    lineHeight: style.lineHeight as number | undefined,
    textAlign: style.textAlign as ResumeTextStylePatch["textAlign"],
    textTransform: style.textTransform as ResumeTextStylePatch["textTransform"],
    backgroundColor: style.backgroundColor as string | undefined,
    marginTop: style.marginTop as number | undefined,
    marginBottom: style.marginBottom as number | undefined,
    marginLeft: style.marginLeft as number | undefined,
    marginRight: style.marginRight as number | undefined,
    paddingTop: style.paddingTop as number | undefined,
    paddingBottom: style.paddingBottom as number | undefined,
    paddingLeft: style.paddingLeft as number | undefined,
    paddingRight: style.paddingRight as number | undefined,
    borderRadius: style.borderRadius as number | undefined,
  };
}

export function getWebTextOverride(
  design: ResumeDesign,
  role: ResumeVisualRole,
): ResumeTextStylePatch {
  return presentationState(design).webTextOverrides?.[role] ?? {};
}

export function hasWebTextOverride(
  design: ResumeDesign,
  role: ResumeVisualRole,
): boolean {
  return Object.keys(getWebTextOverride(design, role)).length > 0;
}

/**
 * Typography is linked between Designed PDF + Web by default.
 * A Web override means that role has intentionally been unlinked.
 */
export function isWebTextLinked(
  design: ResumeDesign,
  role: ResumeVisualRole,
): boolean {
  return !hasWebTextOverride(design, role);
}

export function setWebTextLinked(
  design: ResumeDesign,
  role: ResumeVisualRole,
  linked: boolean,
): ResumeDesign {
  if (linked) return clearWebTextOverride(design, role);

  const current = presentationState(design);
  const overrides = { ...(current.webTextOverrides ?? {}) };
  // Freeze the full current effective style into the Web presentation.
  // Future PDF changes will no longer move this Web role.
  overrides[role] = { ...getEffectiveWebTextStyle(design, role) };

  return withPresentation(design, {
    ...current,
    webTextOverrides: overrides,
  });
}

/**
 * Web editor behavior:
 * - linked -> update the shared base style (PDF + Web)
 * - unlinked -> update only the Web override
 */
export function applyWebEditorTextStylePatch(
  design: ResumeDesign,
  role: ResumeVisualRole,
  patch: ResumeTextStylePatch,
): ResumeDesign {
  return applyResumeTextStylePatch(
    design,
    role,
    isWebTextLinked(design, role) ? "shared" : "web",
    patch,
  );
}

/**
 * PDF editor behavior:
 * - the PDF always updates the base style
 * - if Web is linked, Web follows automatically
 * - if Web is unlinked, its override remains untouched
 */
export function applyPdfEditorTextStylePatch(
  design: ResumeDesign,
  role: ResumeVisualRole,
  patch: ResumeTextStylePatch,
): ResumeDesign {
  const key = ROLE_TO_DESIGN_KEY[role];
  const currentBase = textStyleForRole(design, role);

  return {
    ...design,
    [key]: {
      ...currentBase,
      ...patch,
    },
  } as ResumeDesign;
}

export function getEffectiveWebTextStyle(
  design: ResumeDesign,
  role: ResumeVisualRole,
): ResumeTextStylePatch {
  return {
    ...getPdfTextStyle(design, role),
    ...getWebTextOverride(design, role),
  };
}

function removeKeys<T extends object>(
  value: T,
  keys: Array<keyof ResumeTextStylePatch>,
): T {
  const next = { ...value } as T & Record<string, unknown>;
  keys.forEach(key => delete next[key as string]);
  return next as T;
}

/**
 * Shared means "PDF + Web": update the existing ResumeDesign TextStyle and
 * remove those properties from the Web override so Web follows the base.
 *
 * Web only: update only presentation.webTextOverrides.
 *
 * PDF only: first freeze the current effective Web values into a Web override,
 * then update the base TextStyle. This keeps the Web preview visually unchanged.
 *
 * ATS intentionally ignores all of these visual style values.
 */
export function applyResumeTextStylePatch(
  design: ResumeDesign,
  role: ResumeVisualRole,
  scope: ResumeVisualScope,
  patch: ResumeTextStylePatch,
): ResumeDesign {
  const key = ROLE_TO_DESIGN_KEY[role];
  const currentBase = textStyleForRole(design, role);
  const currentPresentation = presentationState(design);
  const currentOverrides = {
    ...(currentPresentation.webTextOverrides ?? {}),
  };
  const currentRoleOverride = {
    ...(currentOverrides[role] ?? {}),
  };
  const patchKeys = Object.keys(patch) as Array<keyof ResumeTextStylePatch>;

  if (scope === "web") {
    currentOverrides[role] = {
      ...currentRoleOverride,
      ...patch,
    };
    return withPresentation(design, {
      ...currentPresentation,
      webTextOverrides: currentOverrides,
    });
  }

  if (scope === "pdf") {
    const effectiveWeb = getEffectiveWebTextStyle(design, role);
    const frozenWeb = { ...currentRoleOverride };
    patchKeys.forEach(prop => {
      const value = effectiveWeb[prop];
      if (value !== undefined) (frozenWeb as Record<string, unknown>)[prop] = value;
    });
    currentOverrides[role] = frozenWeb;

    return withPresentation(
      {
        ...design,
        [key]: {
          ...currentBase,
          ...patch,
        },
      } as ResumeDesign,
      {
        ...currentPresentation,
        webTextOverrides: currentOverrides,
      },
    );
  }

  const cleanedOverride = removeKeys(currentRoleOverride, patchKeys);
  if (Object.keys(cleanedOverride).length) {
    currentOverrides[role] = cleanedOverride;
  } else {
    delete currentOverrides[role];
  }

  return withPresentation(
    {
      ...design,
      [key]: {
        ...currentBase,
        ...patch,
      },
    } as ResumeDesign,
    {
      ...currentPresentation,
      webTextOverrides: currentOverrides,
    },
  );
}

export function clearWebTextOverride(
  design: ResumeDesign,
  role: ResumeVisualRole,
): ResumeDesign {
  const current = presentationState(design);
  const overrides = { ...(current.webTextOverrides ?? {}) };
  delete overrides[role];
  return withPresentation(design, {
    ...current,
    webTextOverrides: overrides,
  });
}

/**
 * Re-link every Responsive Web text role to the shared Designed PDF/Web
 * typography foundation. Shared templates use this so choosing a template
 * from either presentation produces the same visual starting point while
 * preserving Web-specific geometry, boxes, ordering and breakpoint overrides.
 */
export function relinkAllWebTypographyToShared(
  design: ResumeDesign,
): ResumeDesign {
  const current = presentationState(design);
  return withPresentation(design, {
    ...current,
    webTextOverrides: {},
  });
}

export function getWebBoxStyle(
  design: ResumeDesign,
  target: WebElementTarget,
): WebBoxStyle {
  return presentationState(design).webBoxStyles?.[target] ?? {};
}

export function updateWebBoxStyle(
  design: ResumeDesign,
  target: WebElementTarget,
  patch: Partial<WebBoxStyle>,
): ResumeDesign {
  const current = presentationState(design);
  const styles = { ...(current.webBoxStyles ?? {}) };
  const next = {
    ...(styles[target] ?? {}),
    ...patch,
  };

  Object.keys(next).forEach(key => {
    if ((next as Record<string, unknown>)[key] === undefined) {
      delete (next as Record<string, unknown>)[key];
    }
  });

  if (Object.keys(next).length) styles[target] = next;
  else delete styles[target];

  return withPresentation(design, {
    ...current,
    webBoxStyles: styles,
  });
}


export function getWebInstanceBoxStyle(
  design: ResumeDesign,
  instanceId: string,
): WebBoxStyle {
  return presentationState(design).webInstanceBoxStyles?.[instanceId] ?? {};
}

export function getEffectiveWebBoxStyle(
  design: ResumeDesign,
  target: WebElementTarget,
  instanceId?: string,
): WebBoxStyle {
  return {
    ...getWebBoxStyle(design, target),
    ...(instanceId ? getWebInstanceBoxStyle(design, instanceId) : {}),
  };
}

export function updateWebInstanceBoxStyle(
  design: ResumeDesign,
  instanceId: string,
  patch: Partial<WebBoxStyle>,
): ResumeDesign {
  const current = presentationState(design);
  const styles = { ...(current.webInstanceBoxStyles ?? {}) };
  const next = {
    ...(styles[instanceId] ?? {}),
    ...patch,
  };

  Object.keys(next).forEach(key => {
    if ((next as Record<string, unknown>)[key] === undefined) {
      delete (next as Record<string, unknown>)[key];
    }
  });

  if (Object.keys(next).length) styles[instanceId] = next;
  else delete styles[instanceId];

  return withPresentation(design, {
    ...current,
    webInstanceBoxStyles: styles,
  });
}

export function clearWebInstanceBoxStyle(
  design: ResumeDesign,
  instanceId: string,
): ResumeDesign {
  const current = presentationState(design);
  const styles = { ...(current.webInstanceBoxStyles ?? {}) };
  delete styles[instanceId];

  return withPresentation(design, {
    ...current,
    webInstanceBoxStyles: styles,
  });
}

export function getWebSectionOrder(design: ResumeDesign): WebSectionId[] {
  const saved = presentationState(design).webLayout?.sectionOrder ?? [];
  const valid = saved.filter(
    (value): value is WebSectionId =>
      DEFAULT_SECTION_ORDER.includes(value as WebSectionId),
  );

  const webResume = (design as ResumeDesign & {
    webResume?: { videoIntro?: { placement?: string } };
  }).webResume;
  const videoAfterAbout = webResume?.videoIntro?.placement === "after-about";
  const contextualDefault: WebSectionId[] = videoAfterAbout
    ? ["about", "video", ...DEFAULT_SECTION_ORDER.filter(id => id !== "about" && id !== "video")]
    : DEFAULT_SECTION_ORDER;

  return [
    ...valid,
    ...contextualDefault.filter(value => !valid.includes(value)),
  ];
}

export function moveWebSection(
  design: ResumeDesign,
  section: WebSectionId,
  direction: -1 | 1,
): ResumeDesign {
  const current = presentationState(design);
  const layout = { ...(current.webLayout ?? {}) };
  const order = getWebSectionOrder(design);
  const index = order.indexOf(section);
  if (index < 0) return design;
  const destination = Math.max(0, Math.min(order.length - 1, index + direction));
  if (destination === index) return design;

  const next = [...order];
  next.splice(index, 1);
  next.splice(destination, 0, section);

  return withPresentation(design, {
    ...current,
    webLayout: {
      ...layout,
      sectionOrder: next,
    },
  });
}

export function setWebSectionOrder(
  design: ResumeDesign,
  order: WebSectionId[],
): ResumeDesign {
  const current = presentationState(design);
  const layout = { ...(current.webLayout ?? {}) };
  const valid = order.filter(
    (value, index) =>
      DEFAULT_SECTION_ORDER.includes(value) &&
      order.indexOf(value) === index,
  );

  return withPresentation(design, {
    ...current,
    webLayout: {
      ...layout,
      sectionOrder: [
        ...valid,
        ...DEFAULT_SECTION_ORDER.filter(value => !valid.includes(value)),
      ],
    },
  });
}

function breakpointPlacement<T extends string>(
  design: ResumeDesign,
  breakpoint: WebBreakpoint,
  kind: "sections" | "elements" | "instances",
  key: T,
): WebLayoutPlacement {
  const layout = presentationState(design).webLayout;
  const desktop =
    (layout?.[kind]?.desktop as Partial<Record<T, WebLayoutPlacement>> | undefined)
      ?.[key] ?? {};
  if (breakpoint === "desktop") return desktop;

  const specific =
    (layout?.[kind]?.[breakpoint] as Partial<Record<T, WebLayoutPlacement>> | undefined)
      ?.[key] ?? {};

  return { ...desktop, ...specific };
}

export function getWebSectionPlacement(
  design: ResumeDesign,
  breakpoint: WebBreakpoint,
  section: WebSectionId,
): WebLayoutPlacement {
  const layout = presentationState(design).webLayout;
  const desktop = layout?.sections?.desktop?.[section] ?? {};
  let placement: WebLayoutPlacement;

  if (breakpoint === "desktop") {
    placement = desktop;
  } else {
    const explicit = layout?.sections?.[breakpoint]?.[section];

    if (explicit) {
      placement = { ...desktop, ...explicit };
    } else if (breakpoint === "mobile") {
      // Intelligent inheritance: desktop/tablet can share column decisions, but
      // mobile safely stacks sections unless the user deliberately overrides it.
      placement = {
        ...desktop,
        mode: "flow",
        span: 12,
        widthPct: 100,
        align: "stretch",
        offsetX: 0,
        offsetY: 0,
      };
    } else {
      placement = desktop;
    }
  }

  return applyLinkedPdfRotation(
    design,
    placement,
    rotationTargetForWebSection(section),
  );
}

export function getWebElementPlacement(
  design: ResumeDesign,
  breakpoint: WebBreakpoint,
  target: WebElementTarget,
): WebLayoutPlacement {
  const layout = presentationState(design).webLayout;
  const desktop = layout?.elements?.desktop?.[target] ?? {};
  if (breakpoint === "desktop") return desktop;

  const explicit = layout?.elements?.[breakpoint]?.[target];
  if (explicit) return { ...desktop, ...explicit };

  if (breakpoint === "mobile" && desktop.mode === "floating") {
    return {
      ...desktop,
      mode: "flow",
      offsetX: 0,
      offsetY: 0,
      widthPct: Math.min(100, desktop.widthPct ?? 100),
    };
  }

  return desktop;
}

function updatePlacement<T extends string>(
  design: ResumeDesign,
  breakpoint: WebBreakpoint,
  kind: "sections" | "elements",
  key: T,
  patch: Partial<WebLayoutPlacement>,
): ResumeDesign {
  const current = presentationState(design);
  const layout = { ...(current.webLayout ?? {}) };
  const allBreakpoints = { ...(layout[kind] ?? {}) } as Record<
    WebBreakpoint,
    Record<string, WebLayoutPlacement>
  >;
  const atBreakpoint = { ...(allBreakpoints[breakpoint] ?? {}) };
  const existing = { ...(atBreakpoint[key] ?? {}) };
  const next = { ...existing, ...patch };

  Object.keys(next).forEach(prop => {
    if ((next as Record<string, unknown>)[prop] === undefined) {
      delete (next as Record<string, unknown>)[prop];
    }
  });

  if (Object.keys(next).length) atBreakpoint[key] = next;
  else delete atBreakpoint[key];

  allBreakpoints[breakpoint] = atBreakpoint;

  return withPresentation(design, {
    ...current,
    webLayout: {
      ...layout,
      [kind]: allBreakpoints,
    },
  });
}

export function updateWebSectionPlacement(
  design: ResumeDesign,
  breakpoint: WebBreakpoint,
  section: WebSectionId,
  patch: Partial<WebLayoutPlacement>,
): ResumeDesign {
  return updatePlacement(design, breakpoint, "sections", section, patch);
}

export function updateWebElementPlacement(
  design: ResumeDesign,
  breakpoint: WebBreakpoint,
  target: WebElementTarget,
  patch: Partial<WebLayoutPlacement>,
): ResumeDesign {
  return updatePlacement(design, breakpoint, "elements", target, patch);
}


export function getWebInstancePlacement(
  design: ResumeDesign,
  breakpoint: WebBreakpoint,
  instanceId: string,
): WebLayoutPlacement {
  const layout = presentationState(design).webLayout;
  const desktop = layout?.instances?.desktop?.[instanceId] ?? {};
  let placement: WebLayoutPlacement;

  if (breakpoint === "desktop") {
    placement = desktop;
  } else {
    const explicit = layout?.instances?.[breakpoint]?.[instanceId];

    if (explicit) {
      placement = { ...desktop, ...explicit };
    } else if (breakpoint === "mobile" && desktop.mode === "floating") {
      placement = {
        ...desktop,
        mode: "flow",
        offsetX: 0,
        offsetY: 0,
        widthPct: Math.min(100, desktop.widthPct ?? 100),
      };
    } else {
      placement = desktop;
    }
  }

  return applyLinkedPdfRotation(
    design,
    placement,
    rotationTargetForWebInstance(instanceId),
  );
}

export function updateWebInstancePlacement(
  design: ResumeDesign,
  breakpoint: WebBreakpoint,
  instanceId: string,
  patch: Partial<WebLayoutPlacement>,
): ResumeDesign {
  const current = presentationState(design);
  const layout = { ...(current.webLayout ?? {}) };
  const allBreakpoints = {
    ...(layout.instances ?? {}),
  } as Record<WebBreakpoint, Record<string, WebLayoutPlacement>>;
  const atBreakpoint = { ...(allBreakpoints[breakpoint] ?? {}) };
  const existing = { ...(atBreakpoint[instanceId] ?? {}) };
  const next = { ...existing, ...patch };

  Object.keys(next).forEach(prop => {
    if ((next as Record<string, unknown>)[prop] === undefined) {
      delete (next as Record<string, unknown>)[prop];
    }
  });

  if (Object.keys(next).length) atBreakpoint[instanceId] = next;
  else delete atBreakpoint[instanceId];

  allBreakpoints[breakpoint] = atBreakpoint;

  return withPresentation(design, {
    ...current,
    webLayout: {
      ...layout,
      instances: allBreakpoints,
    },
  });
}

export function clearWebInstancePlacement(
  design: ResumeDesign,
  breakpoint: WebBreakpoint,
  instanceId: string,
): ResumeDesign {
  const current = presentationState(design);
  const layout = { ...(current.webLayout ?? {}) };
  const allBreakpoints = {
    ...(layout.instances ?? {}),
  } as Record<WebBreakpoint, Record<string, WebLayoutPlacement>>;
  const atBreakpoint = { ...(allBreakpoints[breakpoint] ?? {}) };
  delete atBreakpoint[instanceId];
  allBreakpoints[breakpoint] = atBreakpoint;

  return withPresentation(design, {
    ...current,
    webLayout: {
      ...layout,
      instances: allBreakpoints,
    },
  });
}

export function clearWebPlacementOverride(
  design: ResumeDesign,
  breakpoint: WebBreakpoint,
  kind: "sections" | "elements",
  key: string,
): ResumeDesign {
  const current = presentationState(design);
  const layout = { ...(current.webLayout ?? {}) };
  const allBreakpoints = { ...(layout[kind] ?? {}) } as Record<
    string,
    Record<string, WebLayoutPlacement>
  >;
  const atBreakpoint = { ...(allBreakpoints[breakpoint] ?? {}) };
  delete atBreakpoint[key];
  allBreakpoints[breakpoint] = atBreakpoint;

  return withPresentation(design, {
    ...current,
    webLayout: {
      ...layout,
      [kind]: allBreakpoints,
    },
  });
}

export function webPlacementToStyle(
  placement: WebLayoutPlacement,
  options?: { section?: boolean },
): CSSProperties {
  const align = placement.align ?? "stretch";
  const style: CSSProperties = {
    position: placement.mode === "floating" ? "relative" : undefined,
    left: placement.offsetX ? placement.offsetX : undefined,
    top: placement.offsetY ? placement.offsetY : undefined,
    width:
      placement.widthPx != null
        ? Math.max(12, placement.widthPx)
        : placement.widthPct != null
          ? `${Math.max(1, Math.min(100, placement.widthPct))}%`
          : undefined,
    height:
      placement.heightPx != null
        ? Math.max(20, placement.heightPx)
        : undefined,
    justifySelf:
      align === "stretch"
        ? "stretch"
        : align === "left"
          ? "start"
          : align === "right"
            ? "end"
            : "center",
    rotate:
      placement.rotation
        ? `${placement.rotation}deg`
        : undefined,
    transformOrigin: placement.rotation ? "center center" : undefined,
    display: placement.hidden ? "none" : undefined,
    zIndex: placement.mode === "floating" ? 5 : undefined,
  };

  if (options?.section) {
    const span = placement.span ?? 12;
    style.gridColumn = `span ${span}`;
  }

  return style;
}

export function webBoxStyleToCss(style: WebBoxStyle): CSSProperties {
  const shadow =
    style.shadow === "soft"
      ? "0 8px 24px rgba(15,23,42,.08)"
      : style.shadow === "medium"
        ? "0 14px 36px rgba(15,23,42,.13)"
        : style.shadow === "strong"
          ? "0 22px 55px rgba(15,23,42,.20)"
          : style.shadow === "glow"
            ? "0 0 0 3px var(--web-accent-soft), 0 18px 45px rgba(15,23,42,.13)"
            : style.shadow === "none"
              ? "none"
              : undefined;

  return {
    background: style.backgroundColor || undefined,
    borderColor: style.borderColor || undefined,
    borderWidth: style.borderWidth,
    borderStyle: style.borderWidth != null ? "solid" : undefined,
    borderRadius: style.borderRadius,
    boxShadow: shadow,
    opacity:
      style.opacity == null
        ? undefined
        : Math.max(0, Math.min(1, style.opacity)),
  };
}

function normalizePdfFontForWeb(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("Times")) return 'Georgia, "Times New Roman", serif';
  if (value.startsWith("Courier")) return '"Courier New", Courier, monospace';
  if (value.startsWith("Helvetica")) return 'Arial, Helvetica, sans-serif';
  return value;
}

function fontWeightFromPdfFamily(value: string | undefined): CSSProperties["fontWeight"] {
  return value?.includes("Bold") ? 700 : undefined;
}

function fontStyleFromPdfFamily(value: string | undefined): CSSProperties["fontStyle"] {
  return value?.includes("Italic") || value?.includes("Oblique")
    ? "italic"
    : undefined;
}

export function webTextStyleToCss(
  style: ResumeTextStylePatch,
): CSSProperties {
  return {
    fontFamily: normalizePdfFontForWeb(style.fontFamily),
    fontSize: style.fontSize != null ? `${style.fontSize}pt` : undefined,
    fontWeight: fontWeightFromPdfFamily(style.fontFamily),
    fontStyle: fontStyleFromPdfFamily(style.fontFamily),
    color: style.color,
    letterSpacing:
      style.letterSpacing != null ? `${style.letterSpacing}pt` : undefined,
    lineHeight: style.lineHeight,
    textAlign: style.textAlign,
    textTransform: style.textTransform,
    backgroundColor:
      style.backgroundColor && style.backgroundColor !== "transparent"
        ? style.backgroundColor
        : undefined,
    marginTop: style.marginTop,
    marginBottom: style.marginBottom,
    marginLeft: style.marginLeft,
    marginRight: style.marginRight,
    paddingTop: style.paddingTop,
    paddingBottom: style.paddingBottom,
    paddingLeft: style.paddingLeft,
    paddingRight: style.paddingRight,
    borderRadius: style.borderRadius,
  };
}

function cssRule(
  selector: string,
  style: Record<string, string | number | undefined>,
): string {
  const declarations = Object.entries(style)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => {
      const cssKey = key.replace(/[A-Z]/g, char => `-${char.toLowerCase()}`);
      return `${cssKey}:${String(value)}`;
    })
    .join(";");
  return declarations ? `${selector}{${declarations}}` : "";
}

function cssTextStyle(style: ResumeTextStylePatch): Record<string, string | number | undefined> {
  const css = webTextStyleToCss(style);
  return {
    fontFamily: css.fontFamily as string | undefined,
    fontSize: css.fontSize as string | undefined,
    fontWeight: css.fontWeight as number | undefined,
    fontStyle: css.fontStyle as string | undefined,
    color: css.color as string | undefined,
    letterSpacing: css.letterSpacing as string | undefined,
    lineHeight: css.lineHeight as number | undefined,
    textAlign: css.textAlign as string | undefined,
    textTransform: css.textTransform as string | undefined,
    backgroundColor: css.backgroundColor as string | undefined,
    marginTop: typeof css.marginTop === "number" ? `${css.marginTop}pt` : undefined,
    marginBottom: typeof css.marginBottom === "number" ? `${css.marginBottom}pt` : undefined,
    marginLeft: typeof css.marginLeft === "number" ? `${css.marginLeft}pt` : undefined,
    marginRight: typeof css.marginRight === "number" ? `${css.marginRight}pt` : undefined,
    paddingTop: typeof css.paddingTop === "number" ? `${css.paddingTop}pt` : undefined,
    paddingBottom: typeof css.paddingBottom === "number" ? `${css.paddingBottom}pt` : undefined,
    paddingLeft: typeof css.paddingLeft === "number" ? `${css.paddingLeft}pt` : undefined,
    paddingRight: typeof css.paddingRight === "number" ? `${css.paddingRight}pt` : undefined,
    borderRadius: typeof css.borderRadius === "number" ? `${css.borderRadius}pt` : undefined,
  };
}

function cssPlacement(
  placement: WebLayoutPlacement,
  section = false,
): Record<string, string | number | undefined> {
  const span = placement.span ?? 12;
  return {
    gridColumn: section ? `span ${span}` : undefined,
    position: placement.mode === "floating" ? "relative" : undefined,
    left: placement.offsetX ? `${placement.offsetX}px` : undefined,
    top: placement.offsetY ? `${placement.offsetY}px` : undefined,
    width:
      placement.widthPx != null
        ? `${Math.max(12, placement.widthPx)}px`
        : placement.widthPct != null
          ? `${Math.max(1, Math.min(100, placement.widthPct))}%`
          : undefined,
    height:
      placement.heightPx != null
        ? `${Math.max(20, placement.heightPx)}px`
        : undefined,
    justifySelf:
      placement.align === "left"
        ? "start"
        : placement.align === "right"
          ? "end"
          : placement.align === "center"
            ? "center"
            : placement.align === "stretch"
              ? "stretch"
              : undefined,
    rotate:
      placement.rotation
        ? `${placement.rotation}deg`
        : undefined,
    transformOrigin: placement.rotation ? "center center" : undefined,
    display: placement.hidden ? "none" : undefined,
    zIndex: placement.mode === "floating" ? 5 : undefined,
  };
}

function cssBoxStyle(style: WebBoxStyle): Record<string, string | number | undefined> {
  const css = webBoxStyleToCss(style);
  return {
    background: css.background as string | undefined,
    borderColor: css.borderColor as string | undefined,
    borderWidth:
      typeof css.borderWidth === "number" ? `${css.borderWidth}px` : undefined,
    borderStyle: css.borderStyle as string | undefined,
    borderRadius:
      typeof css.borderRadius === "number" ? `${css.borderRadius}px` : undefined,
    boxShadow: css.boxShadow as string | undefined,
    opacity: css.opacity as number | undefined,
  };
}

const WEB_TARGET_SELECTORS: Record<WebElementTarget, string> = {
  background: "body",
  hero: ".hero",
  name: ".hero h1",
  summary: ".hero-summary",
  contact: ".contact",
  photo: ".avatar",
  section: ".section",
  sectionHeading: ".section h2",
  sectionBody: ".section > :not(.section-kicker):not(h2)",
  experience: ".role-card",
  projects: ".project-card",
  education: ".education-card",
  skills: ".skills",
  links: ".links-grid,.featured-grid",
  video: ".video-frame",
};

const WEB_ROLE_SELECTORS: Record<ResumeVisualRole, string> = {
  name: ".hero h1",
  contact: ".contact,.contact a,.contact span",
  sectionHeading: ".section h2",
  entryTitle: ".role-card h3,.education-card h3,.project-card h3",
  entryOrg: ".role-card .meta,.education-card .meta",
  entryDate: ".role-card .meta,.education-card .meta",
  entryBody: ".role-details,.project-body p",
  summary: ".hero-summary,.about-text",
  skill: ".skill,.project-stack span",
  link: ".link-card,.featured-card,.project-actions a",
};

export function buildResumePresentationCss(design: ResumeDesign): string {
  const chunks: string[] = [
    ".content{grid-template-columns:repeat(12,minmax(0,1fr))}",
    ".content>.section{grid-column:span 12;min-width:0}",
  ];

  (Object.keys(WEB_ROLE_SELECTORS) as ResumeVisualRole[]).forEach(role => {
    chunks.push(
      cssRule(
        WEB_ROLE_SELECTORS[role],
        cssTextStyle(getEffectiveWebTextStyle(design, role)),
      ),
    );
  });

  (Object.keys(WEB_TARGET_SELECTORS) as WebElementTarget[]).forEach(target => {
    chunks.push(
      cssRule(
        WEB_TARGET_SELECTORS[target],
        cssBoxStyle(getWebBoxStyle(design, target)),
      ),
    );
  });

  const instanceBoxStyles = presentationState(design).webInstanceBoxStyles ?? {};
  Object.entries(instanceBoxStyles).forEach(([instanceId, style]) => {
    const safeId = instanceId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    chunks.push(
      cssRule(
        `[data-web-style-instance="${safeId}"],[data-web-instance="${safeId}"]`,
        cssBoxStyle(style),
      ),
    );
  });

  const order = getWebSectionOrder(design);
  order.forEach((section, index) => {
    chunks.push(`#${section}{order:${index}}`);
  });

  const breakpoints: Array<{
    breakpoint: WebBreakpoint;
    query?: string;
  }> = [
    { breakpoint: "desktop" },
    { breakpoint: "tablet", query: "@media(max-width:820px)" },
    { breakpoint: "mobile", query: "@media(max-width:520px)" },
  ];

  for (const { breakpoint, query } of breakpoints) {
    const rules: string[] = [];

    order.forEach(section => {
      rules.push(
        cssRule(
          `#${section}`,
          cssPlacement(getWebSectionPlacement(design, breakpoint, section), true),
        ),
      );
    });

    (Object.keys(WEB_TARGET_SELECTORS) as WebElementTarget[]).forEach(target => {
      rules.push(
        cssRule(
          WEB_TARGET_SELECTORS[target],
          cssPlacement(getWebElementPlacement(design, breakpoint, target)),
        ),
      );
    });

    const instanceLayouts =
      presentationState(design).webLayout?.instances?.[breakpoint] ?? {};

    const linkedPdfInstanceIds = Object.keys(design.layoutOverrides ?? {})
      .map(pdfBlockId => {
        const work = pdfBlockId.match(/^work\.([^.]+)$/);
        if (work) return `work:${work[1]}`;

        const project = pdfBlockId.match(/^projects\.([^.]+)$/);
        if (project) return `project:${project[1]}`;

        const education = pdfBlockId.match(/^edu\.([^.]+)$/);
        if (education) return `education:${education[1]}`;

        return null;
      })
      .filter((value): value is string => !!value)
      .filter(instanceId => {
        const target = rotationTargetForWebInstance(instanceId);
        return !!target &&
          isWebRotationCrossFormatLinked(design, target.syncKey);
      });

    const instanceIds = new Set([
      ...Object.keys(instanceLayouts),
      ...linkedPdfInstanceIds,
    ]);

    instanceIds.forEach(instanceId => {
      const safeId = instanceId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      rules.push(
        cssRule(
          `[data-web-instance="${safeId}"]`,
          cssPlacement(
            getWebInstancePlacement(design, breakpoint, instanceId),
          ),
        ),
      );
    });

    const body = rules.filter(Boolean).join("\n");
    if (body) chunks.push(query ? `${query}{${body}}` : body);
  }

  return chunks.filter(Boolean).join("\n");
}



const WEB_COMPANY_LOGO_DEFAULT_SIZE = 30;
const PDF_COMPANY_LOGO_DEFAULT_SIZE = 20;

function companyLogoLinkState(design: ResumeDesign) {
  return presentationState(design).companyLogoLinks ?? {};
}

export function isCompanyLogoCrossFormatLinked(
  design: ResumeDesign,
): boolean {
  return companyLogoLinkState(design).syncPdfWeb !== false;
}

export function setCompanyLogoCrossFormatLinked(
  design: ResumeDesign,
  linked: boolean,
): ResumeDesign {
  const current = presentationState(design);
  const companyLogoLinks = {
    ...(current.companyLogoLinks ?? {}),
    syncPdfWeb: linked ? undefined : false,
  };

  if (companyLogoLinks.syncPdfWeb !== false) {
    delete companyLogoLinks.syncPdfWeb;
  }

  return withPresentation(design, {
    ...current,
    companyLogoLinks,
  });
}

export function isWebCompanyLogoGroupLinked(
  design: ResumeDesign,
  entryId: string,
): boolean {
  return !(
    companyLogoLinkState(design).webUnlinkedEntryIds ?? []
  ).includes(entryId);
}

function setWebLogoInstanceSize(
  design: ResumeDesign,
  breakpoint: WebBreakpoint,
  entryId: string,
  sizePx: number,
): ResumeDesign {
  return updateWebInstancePlacement(
    design,
    breakpoint,
    `work-logo:${entryId}`,
    {
      widthPx: sizePx,
      heightPx: sizePx,
      widthPct: undefined,
    },
  );
}

export function getEffectiveWebCompanyLogoSize(
  design: ResumeDesign,
  breakpoint: WebBreakpoint,
  entryId: string,
  allEntryIds: string[],
): number {
  const own = getWebInstancePlacement(
    design,
    breakpoint,
    `work-logo:${entryId}`,
  );

  if (own.widthPx != null) return own.widthPx;

  if (isWebCompanyLogoGroupLinked(design, entryId)) {
    for (const peerId of allEntryIds) {
      if (peerId === entryId) continue;
      if (!isWebCompanyLogoGroupLinked(design, peerId)) continue;

      const peer = getWebInstancePlacement(
        design,
        breakpoint,
        `work-logo:${peerId}`,
      );
      if (peer.widthPx != null) return peer.widthPx;
    }
  }

  return WEB_COMPANY_LOGO_DEFAULT_SIZE;
}

export function setWebCompanyLogoGroupLinked(
  design: ResumeDesign,
  breakpoint: WebBreakpoint,
  entryId: string,
  allEntryIds: string[],
  linked: boolean,
): ResumeDesign {
  const current = presentationState(design);
  const unlinked = new Set(
    current.companyLogoLinks?.webUnlinkedEntryIds ?? [],
  );

  if (!linked) {
    const effectiveSize = getEffectiveWebCompanyLogoSize(
      design,
      breakpoint,
      entryId,
      allEntryIds,
    );
    unlinked.add(entryId);

    let next = withPresentation(design, {
      ...current,
      companyLogoLinks: {
        ...(current.companyLogoLinks ?? {}),
        webUnlinkedEntryIds: [...unlinked],
      },
    });
    next = setWebLogoInstanceSize(
      next,
      breakpoint,
      entryId,
      effectiveSize,
    );
    return next;
  }

  unlinked.delete(entryId);
  const peerId = allEntryIds.find(
    id =>
      id !== entryId &&
      !unlinked.has(id) &&
      isWebCompanyLogoGroupLinked(design, id),
  );

  let next = withPresentation(design, {
    ...current,
    companyLogoLinks: {
      ...(current.companyLogoLinks ?? {}),
      webUnlinkedEntryIds: unlinked.size ? [...unlinked] : undefined,
    },
  });

  const peerSize = peerId
    ? getEffectiveWebCompanyLogoSize(
        next,
        breakpoint,
        peerId,
        allEntryIds,
      )
    : WEB_COMPANY_LOGO_DEFAULT_SIZE;

  next = setWebLogoInstanceSize(
    next,
    breakpoint,
    entryId,
    peerSize,
  );

  return next;
}

function pdfLogoWidthToWeb(width: number): number {
  return Math.max(
    12,
    Math.round(
      (width / PDF_COMPANY_LOGO_DEFAULT_SIZE) *
      WEB_COMPANY_LOGO_DEFAULT_SIZE,
    ),
  );
}

function webLogoWidthToPdf(widthPx: number): number {
  return Math.max(
    8,
    Math.round(
      (widthPx / WEB_COMPANY_LOGO_DEFAULT_SIZE) *
      PDF_COMPANY_LOGO_DEFAULT_SIZE *
      10,
    ) / 10,
  );
}

function pdfLogoEntryId(key: string): string | null {
  const match = key.match(/^work\.([^.]+)\.logo$/);
  return match?.[1] ?? null;
}

function pdfLogoIsLinked(
  design: ResumeDesign,
  entryId: string,
): boolean {
  const value = design.layoutOverrides?.[`work.${entryId}.logo`] as
    | (LayoutOverride & { linked?: boolean })
    | undefined;
  return value?.linked !== false;
}

function updatePdfCompanyLogoWidth(
  design: ResumeDesign,
  entryId: string,
  allEntryIds: string[],
  width: number,
): ResumeDesign {
  const selectedIsLinked = pdfLogoIsLinked(design, entryId);
  const targets = selectedIsLinked
    ? allEntryIds.filter(id => pdfLogoIsLinked(design, id))
    : [entryId];

  const layoutOverrides = { ...(design.layoutOverrides ?? {}) };

  targets.forEach(id => {
    const key = `work.${id}.logo`;
    const existing = {
      ...(layoutOverrides[key] as
        | (LayoutOverride & { linked?: boolean })
        | undefined),
    };
    layoutOverrides[key] = {
      ...existing,
      width,
    };
  });

  return {
    ...design,
    layoutOverrides,
  };
}

/**
 * Primary Web logo size mutation.
 *
 * Horizontal relationship: "All logos" inside Web.
 * Vertical relationship: "Sync PDF + Web".
 *
 * Position never crosses formats.
 */
export function updateWebCompanyLogoSize(
  design: ResumeDesign,
  breakpoint: WebBreakpoint,
  entryId: string,
  allEntryIds: string[],
  sizePx: number,
): ResumeDesign {
  const cleanSize = Math.max(12, Math.min(160, sizePx));
  const webGroupLinked = isWebCompanyLogoGroupLinked(design, entryId);

  const webTargets = webGroupLinked
    ? allEntryIds.filter(id =>
        isWebCompanyLogoGroupLinked(design, id)
      )
    : [entryId];

  let next = design;
  webTargets.forEach(id => {
    next = setWebLogoInstanceSize(
      next,
      breakpoint,
      id,
      cleanSize,
    );
  });

  if (isCompanyLogoCrossFormatLinked(next)) {
    next = updatePdfCompanyLogoWidth(
      next,
      entryId,
      allEntryIds,
      webLogoWidthToPdf(cleanSize),
    );
  }

  return next;
}

/**
 * Called by the PDF SubDrag logo resize path. The PDF's existing same-type
 * link controls decide whether the selected PDF logo changes all PDF logos.
 * Cross-format sync then enters Web through the matching company, where the
 * Web "All logos" relationship is allowed to propagate it to its peers.
 */
export function syncCompanyLogoSizeFromPdf(
  design: ResumeDesign,
  pdfLogoKey: string,
  pdfWidth: number,
  allEntryIds: string[],
): ResumeDesign {
  if (!isCompanyLogoCrossFormatLinked(design)) return design;

  const entryId = pdfLogoEntryId(pdfLogoKey);
  if (!entryId) return design;

  const webSize = pdfLogoWidthToWeb(pdfWidth);
  const webGroupLinked = isWebCompanyLogoGroupLinked(
    design,
    entryId,
  );
  const webTargets = webGroupLinked
    ? allEntryIds.filter(id =>
        isWebCompanyLogoGroupLinked(design, id)
      )
    : [entryId];

  let next = design;
  (["desktop", "tablet", "mobile"] as WebBreakpoint[]).forEach(
    breakpoint => {
      webTargets.forEach(id => {
        next = setWebLogoInstanceSize(
          next,
          breakpoint,
          id,
          webSize,
        );
      });
    },
  );

  return next;
}

export function syncCompanyLogoSizeFromWebNow(
  design: ResumeDesign,
  breakpoint: WebBreakpoint,
  entryId: string,
  allEntryIds: string[],
): ResumeDesign {
  const sizePx = getEffectiveWebCompanyLogoSize(
    design,
    breakpoint,
    entryId,
    allEntryIds,
  );

  return updatePdfCompanyLogoWidth(
    design,
    entryId,
    allEntryIds,
    webLogoWidthToPdf(sizePx),
  );
}

export function syncCompanyLogoSizeFromPdfNow(
  design: ResumeDesign,
  pdfLogoKey: string,
  allEntryIds: string[],
): ResumeDesign {
  const entryId = pdfLogoEntryId(pdfLogoKey);
  if (!entryId) return design;

  const own = design.layoutOverrides?.[pdfLogoKey] as
    | (LayoutOverride & { linked?: boolean })
    | undefined;

  let width = own?.width;

  if (width == null && pdfLogoIsLinked(design, entryId)) {
    for (const id of allEntryIds) {
      if (id === entryId || !pdfLogoIsLinked(design, id)) continue;
      const peer = design.layoutOverrides?.[`work.${id}.logo`] as
        | LayoutOverride
        | undefined;
      if (peer?.width != null) {
        width = peer.width;
        break;
      }
    }
  }

  return syncCompanyLogoSizeFromPdf(
    design,
    pdfLogoKey,
    width ?? PDF_COMPANY_LOGO_DEFAULT_SIZE,
    allEntryIds,
  );
}

export function clearWebPresentationDecorations(
  design: ResumeDesign,
): ResumeDesign {
  const current = presentationState(design);
  return withPresentation(design, {
    ...current,
    webBoxStyles: {},
    webInstanceBoxStyles: {},
    webLayout: {
      sectionOrder: current.webLayout?.sectionOrder,
      sections: {},
      elements: {},
      instances: {},
    },
  });
}
