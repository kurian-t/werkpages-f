import type { ResumeDesign } from "./types";
import {
  getWebSectionOrder,
  type WebSectionId,
} from "./resumePresentation";
import {
  getResumeWebSettings,
  type ResumeWebHeroLayout,
  type ResumeWebTheme,
} from "./resumeWeb";
import {
  createInitialInteractiveSceneCollection,
  normalizeInteractiveSceneCollection,
  type InteractiveSceneCollection,
} from "./resumeInteractive";

export type WebExperienceMode = "responsive" | "interactive";
export type InteractiveExperienceStartMethod =
  | "responsive"
  | "template"
  | "blank";

export interface ResponsiveImportSeed {
  sectionOrder: WebSectionId[];
  theme: ResumeWebTheme;
  heroLayout: ResumeWebHeroLayout;
}

export interface InteractiveExperienceState
  extends InteractiveSceneCollection {
  version: 7;
  initialized: true;
  startMethod: InteractiveExperienceStartMethod;
  templateId?: string;
  responsiveSeed?: ResponsiveImportSeed;
}

export interface ResumeWebExperienceState {
  activeMode: WebExperienceMode;
  interactive?: InteractiveExperienceState;
}

type ResumeDesignWithWebExperience = ResumeDesign & {
  webExperience?: Partial<ResumeWebExperienceState> & {
    interactive?: Omit<
      Partial<InteractiveExperienceState>,
      "version"
    > & {
      version?: number;
    };
  };
};

export const DEFAULT_WEB_EXPERIENCE_STATE: ResumeWebExperienceState = {
  activeMode: "responsive",
};

export function getResumeWebExperienceState(
  design: ResumeDesign,
): ResumeWebExperienceState {
  const raw = (design as ResumeDesignWithWebExperience).webExperience;
  const mode: WebExperienceMode =
    raw?.activeMode === "interactive" ? "interactive" : "responsive";

  const interactive =
    raw?.interactive?.initialized === true
      ? (() => {
          const startMethod: InteractiveExperienceStartMethod =
            raw.interactive!.startMethod === "template" ||
            raw.interactive!.startMethod === "blank"
              ? raw.interactive!.startMethod
              : "responsive";

          const templateId =
            typeof raw.interactive!.templateId === "string"
              ? raw.interactive!.templateId
              : undefined;

          const responsiveSeed = raw.interactive!.responsiveSeed;

          const sceneCollection =
            normalizeInteractiveSceneCollection(
              raw.interactive,
              {
                startMethod,
                responsiveSeed,
                templateId,
              },
            );

          return {
            version: 7 as const,
            initialized: true as const,
            startMethod,
            templateId,
            responsiveSeed,
            ...sceneCollection,
          };
        })()
      : undefined;

  return {
    activeMode: mode,
    interactive,
  };
}

export function getActiveWebExperienceMode(
  design: ResumeDesign,
): WebExperienceMode {
  return getResumeWebExperienceState(design).activeMode;
}

export function hasInteractiveExperience(
  design: ResumeDesign,
): boolean {
  return !!getResumeWebExperienceState(design).interactive;
}

export function setActiveWebExperienceMode(
  design: ResumeDesign,
  activeMode: WebExperienceMode,
): ResumeDesign {
  const current = getResumeWebExperienceState(design);

  return {
    ...(design as ResumeDesignWithWebExperience),
    webExperience: {
      ...current,
      activeMode,
    },
  } as ResumeDesign;
}

export function initializeInteractiveExperience(
  design: ResumeDesign,
  startMethod: InteractiveExperienceStartMethod,
  options?: {
    templateId?: string;
    sceneCollection?: InteractiveSceneCollection;
  },
): ResumeDesign {
  const current = getResumeWebExperienceState(design);

  // Initialization is deliberately non-destructive. Once Interactive exists,
  // switching modes never rebuilds or overwrites it.
  if (current.interactive) {
    return setActiveWebExperienceMode(design, "interactive");
  }

  const settings = getResumeWebSettings(design);
  const responsiveSeed: ResponsiveImportSeed | undefined =
    startMethod === "responsive"
      ? {
          sectionOrder: getWebSectionOrder(design),
          theme: settings.theme,
          heroLayout: settings.heroLayout,
        }
      : undefined;

  const templateId =
    startMethod === "template"
      ? options?.templateId ?? "minimal-motion"
      : undefined;

  const sceneCollection =
    options?.sceneCollection ??
    createInitialInteractiveSceneCollection(
      startMethod,
      {
        responsiveSeed,
        templateId,
      },
    );

  const interactive: InteractiveExperienceState = {
    version: 7,
    initialized: true,
    startMethod,
    templateId,
    responsiveSeed,
    ...sceneCollection,
  };

  return {
    ...(design as ResumeDesignWithWebExperience),
    webExperience: {
      ...current,
      activeMode: "interactive",
      interactive,
    },
  } as ResumeDesign;
}

export function updateInteractiveExperience(
  design: ResumeDesign,
  updater: (
    current: InteractiveExperienceState,
  ) => InteractiveExperienceState,
): ResumeDesign {
  const current = getResumeWebExperienceState(design);
  if (!current.interactive) return design;

  const nextInteractive = updater(current.interactive);

  return {
    ...(design as ResumeDesignWithWebExperience),
    webExperience: {
      ...current,
      activeMode: "interactive",
      interactive: nextInteractive,
    },
  } as ResumeDesign;
}

/**
 * Returning to Responsive is always a mode switch. Scene state remains stored
 * in full and is restored when the user switches back to Interactive.
 */
export function returnToResponsiveWeb(
  design: ResumeDesign,
): ResumeDesign {
  return setActiveWebExperienceMode(design, "responsive");
}
