import type { ResumeData } from "./types";
import {
  getOrderedInteractiveScenes,
  type InteractiveSceneCollection,
  type InteractiveSceneObject,
} from "./resumeInteractive";
import {
  buildInteractiveVisitorProjection,
} from "./resumeInteractiveRuntime";
import {
  getResumeWebExperienceState,
  updateInteractiveExperience,
} from "./resumeWebExperience";
import {
  compactResumeImageDataUrl,
} from "./resumeImageCompression";

export type InteractivePublishIssueSeverity =
  | "info"
  | "warning"
  | "error";

export type InteractivePublishReadiness =
  | "ready"
  | "review"
  | "blocked";

export interface InteractivePublishIssue {
  id: string;
  severity: InteractivePublishIssueSeverity;
  title: string;
  detail: string;
  sceneId?: string;
  objectId?: string;
}

export interface InteractivePublishMetrics {
  sceneCount: number;
  totalObjects: number;
  maxObjectsPerScene: number;
  animatedObjects: number;
  animationTrackCount: number;
  loopTrackCount: number;
  scrollTrackCount: number;
  motionPathCount: number;
  parallaxObjectCount: number;
  ambientNodeCount: number;
  maxAmbientNodesPerScene: number;
  embeddedImageCount: number;
  embeddedImageBytes: number;
  largestEmbeddedImageBytes: number;
  remoteImageCount: number;
  standaloneHtmlBytes?: number;
}

export interface InteractivePublishReport {
  readiness: InteractivePublishReadiness;
  score: number;
  issues: InteractivePublishIssue[];
  metrics: InteractivePublishMetrics;
  errorCount: number;
  warningCount: number;
  infoCount: number;
}

export interface PreparedInteractivePublishData {
  data: ResumeData;
  compressedAssetCount: number;
  embeddedCharsBefore: number;
  embeddedCharsAfter: number;
}

export const INTERACTIVE_PUBLISH_LIMITS = {
  warningHtmlBytes: 4_000_000,
  hardHtmlBytes: 12_000_000,

  warningEmbeddedImageBytes: 900_000,
  hardEmbeddedImageBytes: 4_000_000,

  warningTotalEmbeddedImageBytes: 3_000_000,
  hardTotalEmbeddedImageBytes: 10_000_000,

  warningObjectsPerScene: 48,
  warningAnimatedObjectsPerScene: 24,
  warningLoopTracksPerScene: 8,
  warningAmbientNodesPerScene: 86,

  warningSceneCount: 18,

  // Export-only compression budget for presentation-owned Interactive images.
  // This is much larger than the autosave budget because standalone HTML is a
  // visitor artifact, not a JSON API payload.
  targetInteractiveImageChars: 220_000,
  totalInteractiveImageCharBudget: 1_100_000,
};

function textBytes(value: string): number {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value).byteLength;
  }

  // UTF-8 upper-ish fallback. The exact number only matters for guardrails.
  return value.length * 2;
}

export function estimateDataUrlBytes(value: string): number {
  const comma = value.indexOf(",");
  if (comma < 0) return textBytes(value);

  const header = value.slice(0, comma);
  const payload = value.slice(comma + 1);

  if (/;base64/i.test(header)) {
    const padding =
      payload.endsWith("==")
        ? 2
        : payload.endsWith("=")
          ? 1
          : 0;
    return Math.max(
      0,
      Math.floor((payload.length * 3) / 4) - padding,
    );
  }

  try {
    return textBytes(decodeURIComponent(payload));
  } catch {
    return textBytes(payload);
  }
}

function isEmbeddedImage(value: string | undefined): value is string {
  return /^data:image\//i.test((value ?? "").trim());
}

function isRemoteImage(value: string | undefined): value is string {
  return /^https?:\/\//i.test((value ?? "").trim());
}

function collectImageSource(
  source: string | undefined,
  embedded: Set<string>,
  remote: Set<string>,
): void {
  const value = (source ?? "").trim();
  if (!value) return;
  if (isEmbeddedImage(value)) embedded.add(value);
  else if (isRemoteImage(value)) remote.add(value);
}

function objectIsAnimated(object: InteractiveSceneObject): boolean {
  return (
    !!object.motion && object.motion.preset !== "none" ||
    !!object.motionPath?.enabled ||
    !!object.parallaxDepth ||
    !!object.scrollTracks?.length ||
    !!object.animationTracks?.length
  );
}

function pushIssue(
  issues: InteractivePublishIssue[],
  issue: InteractivePublishIssue,
): void {
  if (issues.some(current => current.id === issue.id)) return;
  issues.push(issue);
}

export function analyzeInteractivePublish(
  data: ResumeData,
  standaloneHtml?: string,
): InteractivePublishReport {
  const experience = getResumeWebExperienceState(data.design).interactive;
  const issues: InteractivePublishIssue[] = [];

  if (!experience) {
    return {
      readiness: "blocked",
      score: 0,
      issues: [
        {
          id: "interactive-missing",
          severity: "error",
          title: "Interactive experience is missing",
          detail:
            "Create or restore an Interactive Experience before publishing.",
        },
      ],
      metrics: {
        sceneCount: 0,
        totalObjects: 0,
        maxObjectsPerScene: 0,
        animatedObjects: 0,
        animationTrackCount: 0,
        loopTrackCount: 0,
        scrollTrackCount: 0,
        motionPathCount: 0,
        parallaxObjectCount: 0,
        ambientNodeCount: 0,
        maxAmbientNodesPerScene: 0,
        embeddedImageCount: 0,
        embeddedImageBytes: 0,
        largestEmbeddedImageBytes: 0,
        remoteImageCount: 0,
        standaloneHtmlBytes:
          standaloneHtml == null
            ? undefined
            : textBytes(standaloneHtml),
      },
      errorCount: 1,
      warningCount: 0,
      infoCount: 0,
    };
  }

  const scenes = getOrderedInteractiveScenes(experience);
  const projection = buildInteractiveVisitorProjection(data);

  let totalObjects = 0;
  let maxObjectsPerScene = 0;
  let animatedObjects = 0;
  let animationTrackCount = 0;
  let loopTrackCount = 0;
  let scrollTrackCount = 0;
  let motionPathCount = 0;
  let parallaxObjectCount = 0;
  let ambientNodeCount = 0;
  let maxAmbientNodesPerScene = 0;

  const embeddedImages = new Set<string>();
  const remoteImages = new Set<string>();

  scenes.forEach((scene, sceneIndex) => {
    const objects = scene.objectOrder
      .map(objectId => scene.objects[objectId])
      .filter((object): object is InteractiveSceneObject => !!object);

    totalObjects += objects.length;
    maxObjectsPerScene = Math.max(
      maxObjectsPerScene,
      objects.length,
    );

    let sceneAnimated = 0;
    let sceneLoops = 0;

    objects.forEach(object => {
      if (objectIsAnimated(object)) {
        animatedObjects += 1;
        sceneAnimated += 1;
      }

      animationTrackCount += object.animationTracks?.length ?? 0;
      const objectLoops =
        object.animationTracks?.filter(
          track => track.trigger === "loop",
        ).length ?? 0;
      loopTrackCount += objectLoops;
      sceneLoops += objectLoops;

      scrollTrackCount += object.scrollTracks?.length ?? 0;
      if (object.motionPath?.enabled) motionPathCount += 1;
      if (object.parallaxDepth) parallaxObjectCount += 1;

      if (object.type === "image") {
        collectImageSource(object.src, embeddedImages, remoteImages);
      }
    });

    collectImageSource(
      scene.background.imageUrl,
      embeddedImages,
      remoteImages,
    );

    const projected = projection.scenes[sceneIndex];
    const ambientForScene = projected
      ? projected.ambient.twinkle.length +
        projected.ambient.particles.length +
        projected.ambient.floatingShapes.length
      : 0;

    ambientNodeCount += ambientForScene;
    maxAmbientNodesPerScene = Math.max(
      maxAmbientNodesPerScene,
      ambientForScene,
    );

    projected?.objects.forEach(visitorObject => {
      collectImageSource(
        visitorObject.resolved?.imageUrl,
        embeddedImages,
        remoteImages,
      );
    });

    if (
      objects.length >
      INTERACTIVE_PUBLISH_LIMITS.warningObjectsPerScene
    ) {
      pushIssue(issues, {
        id: `objects:${scene.id}`,
        severity: "warning",
        title: `${scene.name} has many objects`,
        detail:
          `${objects.length} objects render in this scene. ` +
          "Consider combining decorative layers or hiding nonessential objects on smaller devices.",
        sceneId: scene.id,
      });
    }

    if (
      sceneAnimated >
      INTERACTIVE_PUBLISH_LIMITS.warningAnimatedObjectsPerScene
    ) {
      pushIssue(issues, {
        id: `animations:${scene.id}`,
        severity: "warning",
        title: `${scene.name} is animation-heavy`,
        detail:
          `${sceneAnimated} objects have motion in this scene. ` +
          "The visitor runtime will automatically simplify effects on lower-powered devices.",
        sceneId: scene.id,
      });
    }

    if (
      sceneLoops >
      INTERACTIVE_PUBLISH_LIMITS.warningLoopTracksPerScene
    ) {
      pushIssue(issues, {
        id: `loops:${scene.id}`,
        severity: "warning",
        title: `${scene.name} has many looping tracks`,
        detail:
          `${sceneLoops} advanced tracks loop continuously. ` +
          "Continuous loops are one of the most expensive animation patterns.",
        sceneId: scene.id,
      });
    }

    if (
      ambientForScene >
      INTERACTIVE_PUBLISH_LIMITS.warningAmbientNodesPerScene
    ) {
      pushIssue(issues, {
        id: `ambient:${scene.id}`,
        severity: "warning",
        title: `${scene.name} has dense ambience`,
        detail:
          `${ambientForScene} ambient particles/shapes are generated. ` +
          "Lower performance tiers will automatically cap the visible amount.",
        sceneId: scene.id,
      });
    }
  });

  if (
    scenes.length >
    INTERACTIVE_PUBLISH_LIMITS.warningSceneCount
  ) {
    pushIssue(issues, {
      id: "scene-count",
      severity: "warning",
      title: "This experience has many scenes",
      detail:
        `${scenes.length} scenes will be included in the standalone page. ` +
        "Consider whether every scene adds meaningful visitor value.",
    });
  }

  const embeddedBytes = [...embeddedImages].map(estimateDataUrlBytes);
  const embeddedImageBytes = embeddedBytes.reduce(
    (total, bytes) => total + bytes,
    0,
  );
  const largestEmbeddedImageBytes = embeddedBytes.length
    ? Math.max(...embeddedBytes)
    : 0;

  if (
    largestEmbeddedImageBytes >=
    INTERACTIVE_PUBLISH_LIMITS.hardEmbeddedImageBytes
  ) {
    pushIssue(issues, {
      id: "embedded-image-hard",
      severity: "error",
      title: "An embedded image is too large to publish safely",
      detail:
        `Largest embedded image is ${formatBytes(largestEmbeddedImageBytes)}. ` +
        "Use a compressed image or an external asset URL.",
    });
  } else if (
    largestEmbeddedImageBytes >=
    INTERACTIVE_PUBLISH_LIMITS.warningEmbeddedImageBytes
  ) {
    pushIssue(issues, {
      id: "embedded-image-warning",
      severity: "warning",
      title: "A large embedded image increases page weight",
      detail:
        `Largest embedded image is ${formatBytes(largestEmbeddedImageBytes)}. ` +
        "Interactive export will try to compact presentation-owned image data URLs.",
    });
  }

  if (
    embeddedImageBytes >=
    INTERACTIVE_PUBLISH_LIMITS.hardTotalEmbeddedImageBytes
  ) {
    pushIssue(issues, {
      id: "embedded-total-hard",
      severity: "error",
      title: "Embedded image payload is too large",
      detail:
        `${formatBytes(embeddedImageBytes)} of embedded images would be shipped inside the HTML. ` +
        "Move large assets to object storage/CDN or compress them first.",
    });
  } else if (
    embeddedImageBytes >=
    INTERACTIVE_PUBLISH_LIMITS.warningTotalEmbeddedImageBytes
  ) {
    pushIssue(issues, {
      id: "embedded-total-warning",
      severity: "warning",
      title: "Embedded images make this page heavy",
      detail:
        `${formatBytes(embeddedImageBytes)} of image bytes are embedded directly in the page.`,
    });
  }

  if (remoteImages.size > 0) {
    pushIssue(issues, {
      id: "remote-images",
      severity: "info",
      title: "Some images require a network connection",
      detail:
        `${remoteImages.size} unique image asset${
          remoteImages.size === 1 ? "" : "s"
        } load from external URLs. The HTML runtime itself is standalone, but those images are not embedded.`,
    });
  }

  const standaloneHtmlBytes =
    standaloneHtml == null
      ? undefined
      : textBytes(standaloneHtml);

  if (
    standaloneHtmlBytes != null &&
    standaloneHtmlBytes >=
      INTERACTIVE_PUBLISH_LIMITS.hardHtmlBytes
  ) {
    pushIssue(issues, {
      id: "html-hard",
      severity: "error",
      title: "Standalone HTML is too large",
      detail:
        `Generated HTML is ${formatBytes(standaloneHtmlBytes)}. ` +
        "Reduce embedded assets before exporting.",
    });
  } else if (
    standaloneHtmlBytes != null &&
    standaloneHtmlBytes >=
      INTERACTIVE_PUBLISH_LIMITS.warningHtmlBytes
  ) {
    pushIssue(issues, {
      id: "html-warning",
      severity: "warning",
      title: "Standalone HTML is large",
      detail:
        `Generated HTML is ${formatBytes(standaloneHtmlBytes)}. ` +
        "It will work, but initial load and sharing may be slower.",
    });
  }

  const errorCount = issues.filter(
    issue => issue.severity === "error",
  ).length;
  const warningCount = issues.filter(
    issue => issue.severity === "warning",
  ).length;
  const infoCount = issues.filter(
    issue => issue.severity === "info",
  ).length;

  const score = Math.max(
    0,
    100 -
      errorCount * 45 -
      warningCount * 9 -
      Math.min(12, infoCount * 2),
  );

  return {
    readiness:
      errorCount > 0
        ? "blocked"
        : warningCount > 0
          ? "review"
          : "ready",
    score,
    issues,
    metrics: {
      sceneCount: scenes.length,
      totalObjects,
      maxObjectsPerScene,
      animatedObjects,
      animationTrackCount,
      loopTrackCount,
      scrollTrackCount,
      motionPathCount,
      parallaxObjectCount,
      ambientNodeCount,
      maxAmbientNodesPerScene,
      embeddedImageCount: embeddedImages.size,
      embeddedImageBytes,
      largestEmbeddedImageBytes,
      remoteImageCount: remoteImages.size,
      standaloneHtmlBytes,
    },
    errorCount,
    warningCount,
    infoCount,
  };
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;
}

function cloneCollection(
  collection: InteractiveSceneCollection,
): InteractiveSceneCollection {
  return JSON.parse(
    JSON.stringify(collection),
  ) as InteractiveSceneCollection;
}

function targetCharsForAssetCount(count: number): number {
  if (count <= 0) {
    return INTERACTIVE_PUBLISH_LIMITS.targetInteractiveImageChars;
  }

  return Math.max(
    70_000,
    Math.min(
      INTERACTIVE_PUBLISH_LIMITS.targetInteractiveImageChars,
      Math.floor(
        INTERACTIVE_PUBLISH_LIMITS.totalInteractiveImageCharBudget /
          count,
      ),
    ),
  );
}

/**
 * Compacts only presentation-owned Interactive image data URLs in an export
 * snapshot. It never mutates the user's saved ResumeData and never rewrites
 * images supplied through shared Work/Project content bindings.
 */
export async function prepareInteractiveDataForPublish(
  data: ResumeData,
): Promise<PreparedInteractivePublishData> {
  const state = getResumeWebExperienceState(data.design);
  const interactive = state.interactive;
  if (!interactive) {
    return {
      data,
      compressedAssetCount: 0,
      embeddedCharsBefore: 0,
      embeddedCharsAfter: 0,
    };
  }

  const collection = cloneCollection(interactive);

  const assets: Array<{
    sceneId: string;
    objectId?: string;
    source: string;
    kind: "object" | "background";
  }> = [];

  getOrderedInteractiveScenes(collection).forEach(scene => {
    if (isEmbeddedImage(scene.background.imageUrl)) {
      assets.push({
        sceneId: scene.id,
        source: scene.background.imageUrl,
        kind: "background",
      });
    }

    scene.objectOrder.forEach(objectId => {
      const object = scene.objects[objectId];
      if (
        object?.type === "image" &&
        isEmbeddedImage(object.src)
      ) {
        assets.push({
          sceneId: scene.id,
          objectId,
          source: object.src,
          kind: "object",
        });
      }
    });
  });

  if (!assets.length) {
    return {
      data,
      compressedAssetCount: 0,
      embeddedCharsBefore: 0,
      embeddedCharsAfter: 0,
    };
  }

  const targetChars = targetCharsForAssetCount(assets.length);
  const replacements = new Map<string, string>();
  let compressedAssetCount = 0;

  await Promise.all(
    assets.map(async asset => {
      if (asset.source.length <= targetChars) return;

      try {
        const compacted = await compactResumeImageDataUrl(
          asset.source,
          "image",
          targetChars,
        );

        if (compacted.src.length < asset.source.length) {
          replacements.set(asset.source, compacted.src);
          compressedAssetCount += 1;
        }
      } catch (error) {
        console.error(
          "Unable to compact Interactive publish asset",
          asset.sceneId,
          asset.objectId,
          error,
        );
      }
    }),
  );

  if (!replacements.size) {
    const chars = assets.reduce(
      (total, asset) => total + asset.source.length,
      0,
    );
    return {
      data,
      compressedAssetCount: 0,
      embeddedCharsBefore: chars,
      embeddedCharsAfter: chars,
    };
  }

  collection.sceneOrder.forEach(sceneId => {
    const scene = collection.scenes[sceneId];
    if (!scene) return;

    const replacementBackground = replacements.get(
      scene.background.imageUrl ?? "",
    );
    if (replacementBackground) {
      scene.background = {
        ...scene.background,
        imageUrl: replacementBackground,
      };
    }

    scene.objectOrder.forEach(objectId => {
      const object = scene.objects[objectId];
      if (object?.type !== "image") return;
      const replacement = replacements.get(object.src);
      if (!replacement) return;

      scene.objects[objectId] = {
        ...object,
        src: replacement,
      };
    });
  });

  const nextDesign = updateInteractiveExperience(
    data.design,
    current => ({
      ...current,
      ...collection,
    }),
  );

  const embeddedCharsBefore = assets.reduce(
    (total, asset) => total + asset.source.length,
    0,
  );
  const embeddedCharsAfter = assets.reduce(
    (total, asset) =>
      total +
      (replacements.get(asset.source) ?? asset.source).length,
    0,
  );

  return {
    data: {
      ...data,
      design: nextDesign,
    },
    compressedAssetCount,
    embeddedCharsBefore,
    embeddedCharsAfter,
  };
}
