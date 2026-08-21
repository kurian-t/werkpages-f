import type { ResumeDesign } from "./types";
import {
  getDesignObjects,
  withDesignObjects,
  type ImageDesignKind,
  type ImageDesignObject,
  type ResumeDesignObject,
} from "./resumeDesignObjects";

/**
 * Embedded image budget used by the resume editor.
 *
 * The resume endpoint saves JSON, so a data URL counts directly toward the HTTP
 * request body. Keeping all embedded images under roughly 55k characters leaves
 * room for the actual resume data under common ~100KB JSON body limits.
 *
 * This is deliberately a compatibility/safety layer. A future object-storage
 * upload can replace data URLs with normal URLs without changing ImageDesignObject.
 */
export const RESUME_IMAGE_TOTAL_CHAR_BUDGET = 55_000;
export const RESUME_IMAGE_MAX_CHAR_BUDGET = 55_000;
export const RESUME_IMAGE_MIN_CHAR_BUDGET = 8_000;

export function resumeImageTargetChars(
  imageCount: number,
  kind: ImageDesignKind = "image",
): number {
  const count = Math.max(1, imageCount);
  const shared = Math.floor(RESUME_IMAGE_TOTAL_CHAR_BUDGET / count);
  const perKindMax = kind === "photo" ? 32_000 : RESUME_IMAGE_MAX_CHAR_BUDGET;
  return Math.max(
    RESUME_IMAGE_MIN_CHAR_BUDGET,
    Math.min(perKindMax, shared),
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read image"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

function loadBrowserImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new globalThis.Image();
    image.onerror = () => reject(new Error("Unable to decode image"));
    image.onload = () => resolve(image);
    image.src = src;
  });
}

function encodeCanvas(canvas: HTMLCanvasElement, quality: number): string {
  // WebP gives us alpha support plus substantially smaller payloads than PNG.
  // Browsers that cannot encode WebP fall back to PNG from toDataURL; the
  // dimension-reduction loop below still guarantees a bounded result.
  return canvas.toDataURL("image/webp", quality);
}

export interface PreparedResumeImage {
  src: string;
  width: number;
  height: number;
}

export async function compactResumeImageDataUrl(
  raw: string,
  kind: ImageDesignKind,
  targetChars: number,
): Promise<PreparedResumeImage> {
  const image = await loadBrowserImage(raw);
  const intrinsicWidth = Math.max(1, image.naturalWidth || image.width || 1);
  const intrinsicHeight = Math.max(1, image.naturalHeight || image.height || 1);

  // Profile photos never need print-sized source dimensions. Decorative images
  // get a larger cap so logos/graphics still look crisp in the exported PDF.
  const maxEdge = kind === "photo" ? 700 : 1100;
  let scale = Math.min(1, maxEdge / Math.max(intrinsicWidth, intrinsicHeight));
  let best = raw;

  // If the source is already comfortably within budget, keep it exactly as-is.
  // This is especially useful for tiny SVGs and already-optimized WebP files.
  if (raw.length <= targetChars) {
    return { src: raw, width: intrinsicWidth, height: intrinsicHeight };
  }

  const qualities = [0.9, 0.82, 0.74, 0.66, 0.58, 0.5];

  for (let dimensionPass = 0; dimensionPass < 7; dimensionPass += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(intrinsicWidth * scale));
    canvas.height = Math.max(1, Math.round(intrinsicHeight * scale));

    const context = canvas.getContext("2d", { alpha: true });
    if (!context) {
      return { src: best, width: intrinsicWidth, height: intrinsicHeight };
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    for (const quality of qualities) {
      const candidate = encodeCanvas(canvas, quality);
      if (candidate.length < best.length) best = candidate;
      if (candidate.length <= targetChars) {
        return { src: candidate, width: intrinsicWidth, height: intrinsicHeight };
      }
    }

    // Quality reduction alone was not enough; shrink dimensions and try again.
    scale *= 0.78;
  }

  return { src: best, width: intrinsicWidth, height: intrinsicHeight };
}

export async function prepareResumeImageFile(
  file: File,
  kind: ImageDesignKind,
  targetChars: number,
): Promise<PreparedResumeImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file");
  }

  const raw = await fileToDataUrl(file);
  return compactResumeImageDataUrl(raw, kind, targetChars);
}

/**
 * Safety net for legacy resumes/current browser state created before image
 * budgeting existed. New uploads are already compacted in ResumeCanvas, but
 * autosave calls this as well so one old multi-megabyte data URL can never turn
 * into another HTTP 413.
 */
export async function compactResumeDesignImages(
  design: ResumeDesign,
): Promise<ResumeDesign> {
  const objects = getDesignObjects(design);
  const images = objects.filter(
    (object): object is ImageDesignObject =>
      object.type === "image" && object.src.startsWith("data:image/"),
  );

  if (images.length === 0) return design;

  const targetById = new Map<string, number>();
  for (const image of images) {
    targetById.set(
      image.id,
      resumeImageTargetChars(images.length, image.imageKind ?? "image"),
    );
  }

  const compactedById = new Map<string, ImageDesignObject>();

  await Promise.all(images.map(async image => {
    const target = targetById.get(image.id) ?? RESUME_IMAGE_MAX_CHAR_BUDGET;
    if (image.src.length <= target) return;

    try {
      const compacted = await compactResumeImageDataUrl(
        image.src,
        image.imageKind ?? "image",
        target,
      );
      compactedById.set(image.id, {
        ...image,
        src: compacted.src,
        intrinsicWidth: image.intrinsicWidth ?? compacted.width,
        intrinsicHeight: image.intrinsicHeight ?? compacted.height,
      });
    } catch (error) {
      // Do not destroy the user's image if a browser codec fails. The caller's
      // payload-size guard will stop the save and surface a useful message.
      console.error("Unable to compact resume image", image.id, error);
    }
  }));

  if (compactedById.size === 0) return design;

  const nextObjects: ResumeDesignObject[] = objects.map(object =>
    compactedById.get(object.id) ?? object
  );

  return withDesignObjects(design, nextObjects);
}
