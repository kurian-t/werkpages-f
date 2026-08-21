import type { ResumeDesign } from "./types";

export type ResumeOutputFormat =
  | "designed-pdf"
  | "ats"
  | "responsive-web"
  | "interactive-web";

export type ResumeBuilderWorkspace =
  | "content"
  | ResumeOutputFormat;

export interface ResumeBuilderEnabledFormats {
  designedPdf: boolean;
  ats: boolean;
  responsiveWeb: boolean;
  interactiveWeb: boolean;
}

export interface ResumeBuilderFormatsState {
  version: 1;
  onboardingComplete: boolean;
  enabled: ResumeBuilderEnabledFormats;
}

type ResumeDesignWithBuilderFormats = ResumeDesign & {
  builderFormats?: Partial<ResumeBuilderFormatsState> & {
    enabled?: Partial<ResumeBuilderEnabledFormats>;
  };
};

export const LEGACY_RESUME_BUILDER_FORMATS: ResumeBuilderFormatsState = {
  version: 1,
  onboardingComplete: true,
  enabled: {
    designedPdf: true,
    ats: true,
    responsiveWeb: true,
    interactiveWeb: true,
  },
};

export const NEW_RESUME_BUILDER_FORMATS: ResumeBuilderFormatsState = {
  version: 1,
  onboardingComplete: false,
  enabled: {
    designedPdf: false,
    ats: false,
    responsiveWeb: false,
    interactiveWeb: false,
  },
};

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * Existing resumes created before builderFormats existed keep the legacy
 * behavior: every output is enabled and no onboarding modal is shown.
 *
 * Brand-new resumes should explicitly write NEW_RESUME_BUILDER_FORMATS to
 * their design so they receive the format chooser.
 */
export function getResumeBuilderFormats(
  design: ResumeDesign,
): ResumeBuilderFormatsState {
  const raw = (design as ResumeDesignWithBuilderFormats).builderFormats;

  if (!raw) return LEGACY_RESUME_BUILDER_FORMATS;

  return {
    version: 1,
    onboardingComplete: boolOr(raw.onboardingComplete, true),
    enabled: {
      designedPdf: boolOr(raw.enabled?.designedPdf, true),
      ats: boolOr(raw.enabled?.ats, true),
      responsiveWeb: boolOr(raw.enabled?.responsiveWeb, true),
      interactiveWeb: boolOr(raw.enabled?.interactiveWeb, true),
    },
  };
}

export function withResumeBuilderFormats(
  design: ResumeDesign,
  state: ResumeBuilderFormatsState,
): ResumeDesign {
  return {
    ...(design as ResumeDesignWithBuilderFormats),
    builderFormats: {
      version: 1,
      onboardingComplete: state.onboardingComplete,
      enabled: { ...state.enabled },
    },
  } as ResumeDesign;
}

export function createNewResumeDesignWithFormatChooser(
  design: ResumeDesign,
): ResumeDesign {
  return withResumeBuilderFormats(
    design,
    NEW_RESUME_BUILDER_FORMATS,
  );
}

export function hasAnyEnabledFormat(
  enabled: ResumeBuilderEnabledFormats,
): boolean {
  return (
    enabled.designedPdf ||
    enabled.ats ||
    enabled.responsiveWeb ||
    enabled.interactiveWeb
  );
}

export function isWorkspaceEnabled(
  workspace: ResumeBuilderWorkspace,
  enabled: ResumeBuilderEnabledFormats,
): boolean {
  switch (workspace) {
    case "content":
      return true;
    case "designed-pdf":
      return enabled.designedPdf;
    case "ats":
      return enabled.ats;
    case "responsive-web":
      return enabled.responsiveWeb;
    case "interactive-web":
      return enabled.interactiveWeb;
  }
}

export function firstEnabledOutputWorkspace(
  enabled: ResumeBuilderEnabledFormats,
): ResumeOutputFormat | null {
  if (enabled.designedPdf) return "designed-pdf";
  if (enabled.ats) return "ats";
  if (enabled.responsiveWeb) return "responsive-web";
  if (enabled.interactiveWeb) return "interactive-web";
  return null;
}

export function firstEnabledWebWorkspace(
  enabled: ResumeBuilderEnabledFormats,
): "responsive-web" | "interactive-web" | null {
  if (enabled.responsiveWeb) return "responsive-web";
  if (enabled.interactiveWeb) return "interactive-web";
  return null;
}
