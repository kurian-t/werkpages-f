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

export type InteractivePublishVisibility = "public" | "unlisted";

export type InteractiveCustomDomainStatus =
  | "unconfigured"
  | "pending-verification"
  | "verified"
  | "active"
  | "error";

export interface InteractiveCustomDomainState {
  hostname: string;
  status: InteractiveCustomDomainStatus;
  lastCheckedAt?: string;
  errorMessage?: string;
  verificationRecord?: {
    type: "CNAME" | "TXT";
    name: string;
    value: string;
  };
}

export interface InteractivePublishSettings {
  slug: string;
  visibility: InteractivePublishVisibility;
  customDomain?: InteractiveCustomDomainState;
}

export interface InteractivePublishSnapshotMetadata {
  versionId: string;
  preparedAt: string;
  slug: string;
  visibility: InteractivePublishVisibility;
  draftFingerprint: string;
  contentHash: string;
  htmlBytes: number;
  runtimeVersion: string;
  interactiveSchemaVersion: number;
  readinessScore: number;
  warningCount: number;
  customDomainHostname?: string;
}

export interface InteractivePublishedVersionMetadata
  extends InteractivePublishSnapshotMetadata {
  publishedAt: string;
  publicUrl: string;
  artifactKey?: string;
  deploymentProvider?: string;
}

export interface InteractivePublishingState {
  version: 1;
  settings: InteractivePublishSettings;
  lastPrepared?: InteractivePublishSnapshotMetadata;
  latestPublished?: InteractivePublishedVersionMetadata;
  publishedVersions: InteractivePublishedVersionMetadata[];
}

export interface InteractiveExperienceState
  extends InteractiveSceneCollection {
  version: 8;
  initialized: true;
  startMethod: InteractiveExperienceStartMethod;
  templateId?: string;
  responsiveSeed?: ResponsiveImportSeed;
}

export interface ResumeWebExperienceState {
  activeMode: WebExperienceMode;
  interactive?: InteractiveExperienceState;
  publishing?: InteractivePublishingState;
}

type ResumeDesignWithWebExperience = ResumeDesign & {
  webExperience?: Partial<ResumeWebExperienceState> & {
    interactive?: Omit<
      Partial<InteractiveExperienceState>,
      "version"
    > & {
      version?: number;
    };
    publishing?: Omit<
      Partial<InteractivePublishingState>,
      "version"
    > & {
      version?: number;
    };
  };
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePublishVisibility(
  value: unknown,
): InteractivePublishVisibility {
  return value === "unlisted" ? "unlisted" : "public";
}

function normalizeDomainStatus(
  value: unknown,
): InteractiveCustomDomainStatus {
  return value === "pending-verification" ||
    value === "verified" ||
    value === "active" ||
    value === "error"
    ? value
    : "unconfigured";
}

function normalizeCustomDomain(
  value: unknown,
): InteractiveCustomDomainState | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Partial<InteractiveCustomDomainState>;
  const hostname = cleanText(source.hostname).toLowerCase();
  if (!hostname) return undefined;

  const verificationRecord =
    source.verificationRecord &&
    typeof source.verificationRecord === "object"
      ? {
          type:
            source.verificationRecord.type === "TXT"
              ? ("TXT" as const)
              : ("CNAME" as const),
          name: cleanText(source.verificationRecord.name),
          value: cleanText(source.verificationRecord.value),
        }
      : undefined;

  return {
    hostname,
    status: normalizeDomainStatus(source.status),
    lastCheckedAt: cleanText(source.lastCheckedAt) || undefined,
    errorMessage: cleanText(source.errorMessage) || undefined,
    verificationRecord:
      verificationRecord?.name && verificationRecord.value
        ? verificationRecord
        : undefined,
  };
}

function normalizePreparedSnapshot(
  value: unknown,
): InteractivePublishSnapshotMetadata | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Partial<InteractivePublishSnapshotMetadata>;

  const versionId = cleanText(source.versionId);
  const preparedAt = cleanText(source.preparedAt);
  const slug = cleanText(source.slug);
  const draftFingerprint = cleanText(source.draftFingerprint);
  const contentHash = cleanText(source.contentHash);

  if (
    !versionId ||
    !preparedAt ||
    !slug ||
    !draftFingerprint ||
    !contentHash
  ) {
    return undefined;
  }

  return {
    versionId,
    preparedAt,
    slug,
    visibility: normalizePublishVisibility(source.visibility),
    draftFingerprint,
    contentHash,
    htmlBytes:
      Number.isFinite(Number(source.htmlBytes))
        ? Math.max(0, Number(source.htmlBytes))
        : 0,
    runtimeVersion: cleanText(source.runtimeVersion) || "interactive-runtime",
    interactiveSchemaVersion:
      Number.isFinite(Number(source.interactiveSchemaVersion))
        ? Math.max(1, Number(source.interactiveSchemaVersion))
        : 8,
    readinessScore:
      Number.isFinite(Number(source.readinessScore))
        ? Math.max(0, Math.min(100, Number(source.readinessScore)))
        : 0,
    warningCount:
      Number.isFinite(Number(source.warningCount))
        ? Math.max(0, Number(source.warningCount))
        : 0,
    customDomainHostname:
      cleanText(source.customDomainHostname).toLowerCase() ||
      undefined,
  };
}

function normalizePublishedVersion(
  value: unknown,
): InteractivePublishedVersionMetadata | undefined {
  const base = normalizePreparedSnapshot(value);
  if (!base || !value || typeof value !== "object") return undefined;
  const source = value as Partial<InteractivePublishedVersionMetadata>;

  const publishedAt = cleanText(source.publishedAt);
  const publicUrl = cleanText(source.publicUrl);
  if (!publishedAt || !publicUrl) return undefined;

  return {
    ...base,
    publishedAt,
    publicUrl,
    artifactKey: cleanText(source.artifactKey) || undefined,
    deploymentProvider:
      cleanText(source.deploymentProvider) || undefined,
  };
}

function normalizePublishingState(
  value: unknown,
): InteractivePublishingState | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Partial<InteractivePublishingState>;

  const publishedVersions = Array.isArray(source.publishedVersions)
    ? source.publishedVersions
        .map(normalizePublishedVersion)
        .filter(
          (
            version,
          ): version is InteractivePublishedVersionMetadata =>
            !!version,
        )
        .slice(-20)
    : [];

  const latestPublished =
    normalizePublishedVersion(source.latestPublished) ??
    publishedVersions[publishedVersions.length - 1];

  return {
    version: 1,
    settings: {
      slug: cleanText(source.settings?.slug).toLowerCase(),
      visibility: normalizePublishVisibility(
        source.settings?.visibility,
      ),
      customDomain: normalizeCustomDomain(
        source.settings?.customDomain,
      ),
    },
    lastPrepared: normalizePreparedSnapshot(
      source.lastPrepared,
    ),
    latestPublished,
    publishedVersions,
  };
}

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
            version: 8 as const,
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
    publishing: normalizePublishingState(raw?.publishing),
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
    version: 8,
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

export function getInteractivePublishingState(
  design: ResumeDesign,
): InteractivePublishingState {
  return (
    getResumeWebExperienceState(design).publishing ?? {
      version: 1,
      settings: {
        slug: "",
        visibility: "public",
      },
      publishedVersions: [],
    }
  );
}

export function updateInteractivePublishingState(
  design: ResumeDesign,
  updater: (
    current: InteractivePublishingState,
  ) => InteractivePublishingState,
): ResumeDesign {
  const current = getResumeWebExperienceState(design);
  const publishing = updater(
    current.publishing ?? {
      version: 1,
      settings: {
        slug: "",
        visibility: "public",
      },
      publishedVersions: [],
    },
  );

  return {
    ...(design as ResumeDesignWithWebExperience),
    webExperience: {
      ...current,
      publishing: {
        ...publishing,
        version: 1,
      },
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
