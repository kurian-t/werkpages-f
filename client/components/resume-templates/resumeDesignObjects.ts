import type { ResumeDesign } from "./types";

/**
 * Page-local visual objects that decorate a resume without becoming part of
 * the structured resume content or the normal flow/pagination engine.
 *
 * `page` is ZERO-BASED to match ResumeCanvas' internal page indexes.
 * Coordinates and dimensions use the same unscaled canvas units as the rest
 * of ResumeCanvas (the page is scaled only by the outer page transform).
 */

export type DesignObjectLayer = "background" | "foreground";
export type DesignObjectType = "shape" | "image" | "text" | "icon";

export interface DesignObjectBase {
  id: string;
  type: DesignObjectType;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;

  rotation?: number;
  opacity?: number;
  zIndex?: number;
  layer?: DesignObjectLayer;

  locked?: boolean;
  hidden?: boolean;
  name?: string;
}

export interface ShapeDesignObject extends DesignObjectBase {
  type: "shape";
  shape: "rectangle" | "ellipse" | "line";
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  borderRadius?: number;
}

export interface ImageDesignObject extends DesignObjectBase {
  type: "image";
  src: string;
  alt?: string;
  objectFit?: "contain" | "cover" | "fill";
  borderRadius?: number;
}

export interface TextDesignObject extends DesignObjectBase {
  type: "text";
  text: string;
  color?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number | string;
  fontStyle?: "normal" | "italic";
  textAlign?: "left" | "center" | "right";
}

export interface IconDesignObject extends DesignObjectBase {
  type: "icon";
  icon: string;
  color?: string;
  strokeWidth?: number;
}

export type ResumeDesignObject =
  | ShapeDesignObject
  | ImageDesignObject
  | TextDesignObject
  | IconDesignObject;

/**
 * ResumeDesign does not need to know about designObjects yet. Keeping the
 * property optional makes Phase 1 backwards-compatible with every existing
 * saved resume. When types.ts is next touched, this property can move onto
 * ResumeDesign directly without changing persisted data.
 */
export type ResumeDesignWithObjects = ResumeDesign & {
  designObjects?: ResumeDesignObject[];
};

export function getDesignObjects(design: ResumeDesign): ResumeDesignObject[] {
  const objects = (design as ResumeDesignWithObjects).designObjects;
  return Array.isArray(objects) ? objects : [];
}

export function withDesignObjects(
  design: ResumeDesign,
  designObjects: ResumeDesignObject[],
): ResumeDesign {
  return {
    ...(design as ResumeDesignWithObjects),
    designObjects,
  } as ResumeDesign;
}

export function upsertDesignObject(
  design: ResumeDesign,
  object: ResumeDesignObject,
): ResumeDesign {
  const existing = getDesignObjects(design);
  const index = existing.findIndex(item => item.id === object.id);
  const next = index === -1
    ? [...existing, object]
    : existing.map(item => item.id === object.id ? object : item);
  return withDesignObjects(design, next);
}

export function removeDesignObject(
  design: ResumeDesign,
  objectId: string,
): ResumeDesign {
  return withDesignObjects(
    design,
    getDesignObjects(design).filter(item => item.id !== objectId),
  );
}

export function designObjectsForPage(
  design: ResumeDesign,
  page: number,
  layer: DesignObjectLayer,
): ResumeDesignObject[] {
  return getDesignObjects(design)
    .filter(object =>
      !object.hidden &&
      object.page === page &&
      (object.layer ?? "background") === layer
    )
    .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
}
