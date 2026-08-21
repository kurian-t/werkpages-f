import type { ResumeData, ResumeDesign } from "./types";
import { getResumeProjects } from "./resumeProjects";
import {
  analyzeInteractivePublish,
  formatBytes,
  prepareInteractiveDataForPublish,
  type InteractivePublishReport,
} from "./resumeInteractivePerformance";
import {
  buildStandaloneInteractiveResumeHtml,
} from "./resumeInteractivePublish";
import {
  getInteractivePublishingState,
  getResumeWebExperienceState,
  updateInteractivePublishingState,
  type InteractiveCustomDomainState,
  type InteractivePublishedVersionMetadata,
  type InteractivePublishingState,
  type InteractivePublishSettings,
  type InteractivePublishSnapshotMetadata,
  type InteractivePublishVisibility,
} from "./resumeWebExperience";

export const INTERACTIVE_PUBLISH_RUNTIME_VERSION =
  "interactive-runtime-30.0";

export const INTERACTIVE_PUBLISH_MANIFEST_VERSION = 1;

const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "app",
  "assets",
  "auth",
  "dashboard",
  "help",
  "login",
  "logout",
  "new",
  "preview",
  "publish",
  "resume",
  "resumes",
  "settings",
  "signin",
  "signup",
  "static",
  "support",
  "www",
]);

export interface InteractiveSlugValidation {
  value: string;
  valid: boolean;
  error?: string;
  warning?: string;
}

export interface InteractiveCustomDomainReadiness {
  configured: boolean;
  syntacticallyValid: boolean;
  ready: boolean;
  status: InteractiveCustomDomainState["status"];
  hostname?: string;
  detail: string;
}

export interface InteractiveDraftPublicationStatus {
  status:
    | "never-published"
    | "published-current"
    | "unpublished-changes";
  draftFingerprint: string;
  contentChanged: boolean;
  settingsChanged: boolean;
  latestPublished?: InteractivePublishedVersionMetadata;
}

export interface InteractiveStaticDeploymentManifest {
  format: "werkpages-interactive-static";
  manifestVersion: 1;
  runtimeVersion: string;
  generatedAt: string;
  version: InteractivePublishSnapshotMetadata;
  entrypoint: string;
  immutablePrefix: string;
  canonicalPath: string;
  visibility: InteractivePublishVisibility;
  customDomain?: {
    hostname: string;
    status: InteractiveCustomDomainState["status"];
  };
  files: Array<{
    path: string;
    contentType: string;
    cacheControl: string;
    immutable: boolean;
  }>;
  pointer: {
    path: string;
    cacheControl: string;
    body: {
      versionId: string;
      contentHash: string;
      entrypoint: string;
      publishedAtCandidate: string;
    };
  };
  deploymentOrder: [
    "upload-immutable-version",
    "verify-version",
    "atomically-switch-slug-pointer",
  ];
}

export interface InteractivePublishSnapshot {
  html: string;
  optimizedData: ResumeData;
  report: InteractivePublishReport;
  metadata: InteractivePublishSnapshotMetadata;
  manifest: InteractiveStaticDeploymentManifest;
  optimization: {
    compressedAssetCount: number;
    embeddedCharsBefore: number;
    embeddedCharsAfter: number;
  };
}

export interface InteractiveDeploymentReceipt {
  publicUrl: string;
  publishedAt?: string;
  artifactKey?: string;
  provider?: string;
}

export interface InteractiveDeploymentAdapter {
  publish(
    snapshot: InteractivePublishSnapshot,
  ): Promise<InteractiveDeploymentReceipt>;
}

export class InteractivePublishBlockedError extends Error {
  readonly report?: InteractivePublishReport;

  constructor(
    message: string,
    report?: InteractivePublishReport,
  ) {
    super(message);
    this.name = "InteractivePublishBlockedError";
    this.report = report;
  }
}

function asText(value: unknown): string {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}

function stableValue(value: unknown): unknown {
  if (value == null) return value;

  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    Object.keys(source)
      .sort()
      .forEach(key => {
        const child = source[key];
        if (child !== undefined) {
          result[key] = stableValue(child);
        }
      });

    return result;
  }

  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function fallbackHash(value: string): string {
  let h1 = 0xdeadbeef ^ value.length;
  let h2 = 0x41c6ce57 ^ value.length;

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }

  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  const high = (h2 >>> 0).toString(16).padStart(8, "0");
  const low = (h1 >>> 0).toString(16).padStart(8, "0");
  return `${high}${low}`;
}

async function sha256Hex(value: string): Promise<string> {
  try {
    if (
      typeof globalThis.crypto !== "undefined" &&
      globalThis.crypto.subtle &&
      typeof TextEncoder !== "undefined"
    ) {
      const bytes = new TextEncoder().encode(value);
      const digest = await globalThis.crypto.subtle.digest(
        "SHA-256",
        bytes,
      );

      return [...new Uint8Array(digest)]
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");
    }
  } catch {
    // Fall through to the deterministic non-cryptographic hash.
  }

  return fallbackHash(value);
}

function byteLength(value: string): number {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value).byteLength;
  }
  return value.length * 2;
}

export function normalizeInteractiveSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 63)
    .replace(/-+$/g, "");
}

export function defaultInteractiveSlug(data: ResumeData): string {
  const name = [
    asText(data.firstName).trim(),
    asText(data.lastName).trim(),
  ]
    .filter(Boolean)
    .join(" ");

  return normalizeInteractiveSlug(
    name ? `${name}-resume` : "interactive-resume",
  );
}

export function validateInteractiveSlug(
  value: string,
): InteractiveSlugValidation {
  const normalized = normalizeInteractiveSlug(value);

  if (!normalized) {
    return {
      value: normalized,
      valid: false,
      error: "Choose a public slug.",
    };
  }

  if (normalized.length < 3) {
    return {
      value: normalized,
      valid: false,
      error: "Slug must be at least 3 characters.",
    };
  }

  if (normalized.length > 63) {
    return {
      value: normalized,
      valid: false,
      error: "Slug must be 63 characters or fewer.",
    };
  }

  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(normalized)) {
    return {
      value: normalized,
      valid: false,
      error:
        "Use lowercase letters, numbers and single hyphens only.",
    };
  }

  if (RESERVED_SLUGS.has(normalized)) {
    return {
      value: normalized,
      valid: false,
      error: "That slug is reserved.",
    };
  }

  return {
    value: normalized,
    valid: true,
    warning:
      normalized !== value.trim().toLowerCase()
        ? `Will publish as “${normalized}”.`
        : undefined,
  };
}

export function normalizeCustomDomainHostname(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "");
}

export function assessCustomDomainReadiness(
  domain: InteractiveCustomDomainState | undefined,
): InteractiveCustomDomainReadiness {
  if (!domain?.hostname) {
    return {
      configured: false,
      syntacticallyValid: true,
      ready: false,
      status: "unconfigured",
      detail:
        "Optional. A deployment service can attach a verified custom domain later.",
    };
  }

  const hostname = normalizeCustomDomainHostname(
    domain.hostname,
  );

  const valid =
    hostname.length <= 253 &&
    hostname.includes(".") &&
    !/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) &&
    !hostname.includes(":") &&
    hostname.split(".").every(label =>
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
        label,
      ),
    );

  if (!valid) {
    return {
      configured: true,
      syntacticallyValid: false,
      ready: false,
      status: "error",
      hostname,
      detail:
        "Enter a hostname only, such as resume.example.com — no protocol, port or path.",
    };
  }

  if (domain.status === "active") {
    return {
      configured: true,
      syntacticallyValid: true,
      ready: true,
      status: "active",
      hostname,
      detail: "Custom domain is active.",
    };
  }

  if (domain.status === "verified") {
    return {
      configured: true,
      syntacticallyValid: true,
      ready: false,
      status: "verified",
      hostname,
      detail:
        "DNS is verified. The deployment service still needs to activate routing/TLS.",
    };
  }

  if (domain.status === "error") {
    return {
      configured: true,
      syntacticallyValid: true,
      ready: false,
      status: "error",
      hostname,
      detail:
        domain.errorMessage ||
        "The deployment service reported a domain configuration error.",
    };
  }

  return {
    configured: true,
    syntacticallyValid: true,
    ready: false,
    status: "pending-verification",
    hostname,
    detail:
      "Domain syntax is valid. DNS ownership/TLS verification must be completed by the deployment service.",
  };
}

function interactiveDraftBasis(data: ResumeData): unknown {
  const web = getResumeWebExperienceState(data.design);

  return {
    personal: {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      location: data.location,
      website: data.website,
      summary: data.summary,
    },
    workEntries: data.workEntries,
    projects: getResumeProjects(data),
    education: data.education,
    skills: data.skills,
    extraLinks: data.extraLinks,
    interactive: web.interactive,
  };
}

export function computeInteractiveDraftFingerprint(
  data: ResumeData,
): string {
  return `draft_${fallbackHash(
    stableStringify(interactiveDraftBasis(data)),
  )}`;
}

function resolvedSettings(
  data: ResumeData,
  override?: Partial<InteractivePublishSettings>,
): InteractivePublishSettings {
  const stored = getInteractivePublishingState(
    data.design,
  ).settings;

  const slug =
    override?.slug ??
    stored.slug ??
    defaultInteractiveSlug(data);

  return {
    slug: normalizeInteractiveSlug(
      slug || defaultInteractiveSlug(data),
    ),
    visibility:
      override?.visibility ??
      stored.visibility ??
      "public",
    customDomain:
      override?.customDomain ??
      stored.customDomain,
  };
}

export function getInteractiveDraftPublicationStatus(
  data: ResumeData,
): InteractiveDraftPublicationStatus {
  const publishing = getInteractivePublishingState(
    data.design,
  );
  const latestPublished = publishing.latestPublished;
  const draftFingerprint =
    computeInteractiveDraftFingerprint(data);

  if (!latestPublished) {
    return {
      status: "never-published",
      draftFingerprint,
      contentChanged: true,
      settingsChanged: false,
    };
  }

  const settings = resolvedSettings(data);
  const contentChanged =
    latestPublished.draftFingerprint !== draftFingerprint;
  const settingsChanged =
    latestPublished.slug !== settings.slug ||
    latestPublished.visibility !== settings.visibility ||
    (latestPublished.customDomainHostname ?? "") !==
      (
        settings.customDomain?.hostname
          ? normalizeCustomDomainHostname(
              settings.customDomain.hostname,
            )
          : ""
      );

  return {
    status:
      contentChanged || settingsChanged
        ? "unpublished-changes"
        : "published-current",
    draftFingerprint,
    contentChanged,
    settingsChanged,
    latestPublished,
  };
}

function applyVisibilityToHtml(
  html: string,
  visibility: InteractivePublishVisibility,
): string {
  if (visibility !== "unlisted") return html;

  const robots =
    '<meta name="robots" content="noindex,nofollow,noarchive">';

  if (/<meta\s+name=["']robots["']/i.test(html)) {
    return html.replace(
      /<meta\s+name=["']robots["'][^>]*>/i,
      robots,
    );
  }

  return html.replace(
    /<\/head>/i,
    `${robots}\n</head>`,
  );
}

function versionIdFor(
  contentHash: string,
  preparedAt: string,
): string {
  const time = Date.parse(preparedAt);
  const stamp = Number.isFinite(time)
    ? Math.max(0, time).toString(36)
    : Date.now().toString(36);

  return `pub_${contentHash.slice(0, 12)}_${stamp}`;
}

function buildManifest(
  metadata: InteractivePublishSnapshotMetadata,
  settings: InteractivePublishSettings,
): InteractiveStaticDeploymentManifest {
  const immutablePrefix =
    `versions/${metadata.versionId}`;
  const entrypoint = `${immutablePrefix}/index.html`;

  return {
    format: "werkpages-interactive-static",
    manifestVersion: 1,
    runtimeVersion: metadata.runtimeVersion,
    generatedAt: metadata.preparedAt,
    version: metadata,
    entrypoint,
    immutablePrefix,
    canonicalPath: `/${metadata.slug}`,
    visibility: metadata.visibility,
    customDomain: settings.customDomain?.hostname
      ? {
          hostname: normalizeCustomDomainHostname(
            settings.customDomain.hostname,
          ),
          status: settings.customDomain.status,
        }
      : undefined,
    files: [
      {
        path: entrypoint,
        contentType: "text/html; charset=utf-8",
        cacheControl:
          "public, max-age=31536000, immutable",
        immutable: true,
      },
      {
        path: `${immutablePrefix}/manifest.json`,
        contentType: "application/json; charset=utf-8",
        cacheControl:
          "public, max-age=31536000, immutable",
        immutable: true,
      },
    ],
    pointer: {
      path: `slugs/${metadata.slug}/current.json`,
      cacheControl:
        "public, max-age=0, must-revalidate",
      body: {
        versionId: metadata.versionId,
        contentHash: metadata.contentHash,
        entrypoint,
        publishedAtCandidate: metadata.preparedAt,
      },
    },
    deploymentOrder: [
      "upload-immutable-version",
      "verify-version",
      "atomically-switch-slug-pointer",
    ],
  };
}

export async function createInteractivePublishSnapshot(
  data: ResumeData,
  settingsOverride?: Partial<InteractivePublishSettings>,
): Promise<InteractivePublishSnapshot> {
  const interactive =
    getResumeWebExperienceState(data.design).interactive;

  if (!interactive) {
    throw new InteractivePublishBlockedError(
      "Create an Interactive Experience before publishing.",
    );
  }

  const settings = resolvedSettings(
    data,
    settingsOverride,
  );
  const slugValidation = validateInteractiveSlug(
    settings.slug,
  );

  if (!slugValidation.valid) {
    throw new InteractivePublishBlockedError(
      slugValidation.error || "Invalid publish slug.",
    );
  }

  const domain = assessCustomDomainReadiness(
    settings.customDomain,
  );
  if (
    domain.configured &&
    !domain.syntacticallyValid
  ) {
    throw new InteractivePublishBlockedError(
      domain.detail,
    );
  }

  const prepared =
    await prepareInteractiveDataForPublish(data);
  const baseHtml =
    buildStandaloneInteractiveResumeHtml(
      prepared.data,
    );
  const html = applyVisibilityToHtml(
    baseHtml,
    settings.visibility,
  );
  const report = analyzeInteractivePublish(
    prepared.data,
    html,
  );

  if (report.readiness === "blocked") {
    throw new InteractivePublishBlockedError(
      report.issues.find(
        issue => issue.severity === "error",
      )?.detail ||
        "Interactive snapshot did not pass publish readiness.",
      report,
    );
  }

  const preparedAt = new Date().toISOString();
  const contentHash = await sha256Hex(html);
  const draftFingerprint =
    computeInteractiveDraftFingerprint(data);
  const metadata: InteractivePublishSnapshotMetadata = {
    versionId: versionIdFor(
      contentHash,
      preparedAt,
    ),
    preparedAt,
    slug: slugValidation.value,
    visibility: settings.visibility,
    draftFingerprint,
    contentHash,
    htmlBytes:
      report.metrics.standaloneHtmlBytes ??
      byteLength(html),
    runtimeVersion:
      INTERACTIVE_PUBLISH_RUNTIME_VERSION,
    interactiveSchemaVersion:
      interactive.version,
    readinessScore: report.score,
    warningCount: report.warningCount,
    customDomainHostname:
      settings.customDomain?.hostname
        ? normalizeCustomDomainHostname(
            settings.customDomain.hostname,
          )
        : undefined,
  };

  return {
    html,
    optimizedData: prepared.data,
    report,
    metadata,
    manifest: buildManifest(
      metadata,
      {
        ...settings,
        slug: slugValidation.value,
      },
    ),
    optimization: {
      compressedAssetCount:
        prepared.compressedAssetCount,
      embeddedCharsBefore:
        prepared.embeddedCharsBefore,
      embeddedCharsAfter:
        prepared.embeddedCharsAfter,
    },
  };
}

export function recordPreparedInteractiveSnapshot(
  design: ResumeDesign,
  metadata: InteractivePublishSnapshotMetadata,
): ResumeDesign {
  return updateInteractivePublishingState(
    design,
    current => ({
      ...current,
      lastPrepared: metadata,
      settings: {
        ...current.settings,
        slug: metadata.slug,
        visibility: metadata.visibility,
      },
    }),
  );
}

export function recordPublishedInteractiveSnapshot(
  design: ResumeDesign,
  metadata: InteractivePublishSnapshotMetadata,
  receipt: InteractiveDeploymentReceipt,
): ResumeDesign {
  const publishedAt =
    receipt.publishedAt || new Date().toISOString();

  const published: InteractivePublishedVersionMetadata = {
    ...metadata,
    publishedAt,
    publicUrl: receipt.publicUrl,
    artifactKey: receipt.artifactKey,
    deploymentProvider: receipt.provider,
  };

  return updateInteractivePublishingState(
    design,
    current => {
      const versions = [
        ...current.publishedVersions.filter(
          version =>
            version.versionId !== published.versionId,
        ),
        published,
      ].slice(-20);

      return {
        ...current,
        lastPrepared: metadata,
        latestPublished: published,
        publishedVersions: versions,
        settings: {
          ...current.settings,
          slug: metadata.slug,
          visibility: metadata.visibility,
        },
      };
    },
  );
}

export async function deployInteractivePublishSnapshot(
  data: ResumeData,
  adapter: InteractiveDeploymentAdapter,
  settingsOverride?: Partial<InteractivePublishSettings>,
): Promise<{
  snapshot: InteractivePublishSnapshot;
  receipt: InteractiveDeploymentReceipt;
  design: ResumeDesign;
}> {
  const snapshot =
    await createInteractivePublishSnapshot(
      data,
      settingsOverride,
    );
  const receipt = await adapter.publish(snapshot);

  if (!receipt.publicUrl?.trim()) {
    throw new Error(
      "Deployment adapter did not return a public URL.",
    );
  }

  return {
    snapshot,
    receipt,
    design: recordPublishedInteractiveSnapshot(
      data.design,
      snapshot.metadata,
      receipt,
    ),
  };
}

export function setInteractivePublishSettings(
  design: ResumeDesign,
  patch: Partial<InteractivePublishSettings>,
): ResumeDesign {
  return updateInteractivePublishingState(
    design,
    current => ({
      ...current,
      settings: {
        ...current.settings,
        ...patch,
        slug:
          patch.slug == null
            ? current.settings.slug
            : normalizeInteractiveSlug(patch.slug),
        customDomain:
          patch.customDomain === undefined
            ? current.settings.customDomain
            : patch.customDomain,
      },
    }),
  );
}

export function recordInteractiveCustomDomainState(
  design: ResumeDesign,
  domain: InteractiveCustomDomainState | undefined,
): ResumeDesign {
  return updateInteractivePublishingState(
    design,
    current => ({
      ...current,
      settings: {
        ...current.settings,
        customDomain: domain?.hostname
          ? {
              ...domain,
              hostname:
                normalizeCustomDomainHostname(
                  domain.hostname,
                ),
            }
          : undefined,
      },
    }),
  );
}

export function setInteractiveCustomDomainHostname(
  design: ResumeDesign,
  hostname: string,
): ResumeDesign {
  const normalized =
    normalizeCustomDomainHostname(hostname);

  return updateInteractivePublishingState(
    design,
    current => ({
      ...current,
      settings: {
        ...current.settings,
        customDomain: normalized
          ? {
              hostname: normalized,
              status: "pending-verification",
            }
          : undefined,
      },
    }),
  );
}

export function buildInteractivePublishManifestJson(
  snapshot: InteractivePublishSnapshot,
): string {
  return JSON.stringify(snapshot.manifest, null, 2);
}

export function buildInteractivePublishPointerJson(
  snapshot: InteractivePublishSnapshot,
): string {
  return JSON.stringify(
    snapshot.manifest.pointer.body,
    null,
    2,
  );
}

function browserDownload(
  contents: string,
  fileName: string,
  type: string,
): void {
  if (
    typeof window === "undefined" ||
    typeof document === "undefined"
  ) {
    return;
  }

  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(
    () => URL.revokeObjectURL(url),
    10_000,
  );
}

export function downloadInteractivePublishSnapshot(
  snapshot: InteractivePublishSnapshot,
): void {
  const base =
    `${snapshot.metadata.slug}-${snapshot.metadata.versionId}`;

  browserDownload(
    snapshot.html,
    `${base}.html`,
    "text/html;charset=utf-8",
  );

  // A short delay prevents browsers that coalesce synchronous synthetic
  // clicks from dropping the second file.
  if (typeof window !== "undefined") {
    window.setTimeout(() => {
      browserDownload(
        buildInteractivePublishManifestJson(snapshot),
        `${base}.manifest.json`,
        "application/json;charset=utf-8",
      );
    }, 120);
  }
}

export function describePublishSnapshot(
  metadata: InteractivePublishSnapshotMetadata,
): string {
  return `${metadata.versionId} · ${formatBytes(
    metadata.htmlBytes,
  )} · score ${metadata.readinessScore}/100`;
}
