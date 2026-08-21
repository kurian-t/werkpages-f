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
export type DesignObjectType = "shape" | "image" | "text" | "icon" | "smart";

export type DesignSectionTarget =
  | "work"
  | "projects"
  | "education"
  | "skills"
  | "bio"
  | "links";

export type DesignObjectAttachment =
  | {
      kind: "page";
    }
  | {
      kind: "header";
      padding?: number;
    }
  | {
      kind: "section";
      sectionId: DesignSectionTarget;
      padding?: number;
    };

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

  /**
   * Optional logical design group. Grouping never changes the object's own
   * geometry or layer; it only makes related design objects select/move as a
   * unit in the editor. This keeps persistence flat and backwards-compatible.
   */
  groupId?: string;

  /**
   * Optional visual-link group. Unlike `groupId`, linking does NOT make objects
   * move together. Linked peers keep their own page/x/y/z-order/content, while
   * size + appearance edits are mirrored across compatible peers.
   */
  linkId?: string;
}

export interface ShapeDesignObject extends DesignObjectBase {
  type: "shape";
  shape: "rectangle" | "ellipse" | "line";
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  borderRadius?: number;

  /**
   * Smart backgrounds derive their rendered geometry from resume content.
   *
   * The object's normal x/y/width/height are intentionally retained while it
   * is attached. If the user detaches it later, it returns to its previous
   * free-form geometry instead of destroying that information.
   */
  attachment?: DesignObjectAttachment;
}

export type SmartDesignKind =
  | "sidebar"
  | "header-accent"
  | "timeline"
  | "section-divider";

export type SmartDesignSide = "left" | "right";

/**
 * Resume-aware visual components. These remain decorative: they derive their
 * rendered geometry from the structured resume but never become part of the
 * content/flow model itself.
 */
export interface SmartDesignObject extends DesignObjectBase {
  type: "smart";
  smartKind: SmartDesignKind;

  /** Section target for timeline/divider components. */
  sectionId?: DesignSectionTarget;

  /** Sidebar side. */
  side?: SmartDesignSide;

  /** Primary component colours. */
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  borderRadius?: number;

  /** Timeline marker diameter. */
  dotSize?: number;

  /** Distance from the resume geometry the component follows. */
  offset?: number;

  /**
   * Editor-only resolved timeline marker positions, relative to the resolved
   * component box. Source objects do not persist this value; ResumeCanvas adds
   * it only to its transient rendered copy.
   */
  resolvedPoints?: number[];
}

export type ImageDesignKind = "image" | "photo";
export type ImageMask = "square" | "rounded" | "circle";
export type ImageShadow = "none" | "soft" | "medium" | "strong";

export interface ImageDesignObject extends DesignObjectBase {
  type: "image";
  src: string;
  alt?: string;

  /** Arbitrary decorative image vs. profile-photo convenience defaults. */
  imageKind?: ImageDesignKind;

  /**
   * The frame is the design object's x/y/width/height. `objectFit` and the
   * crop position decide how the underlying bitmap sits inside that frame.
   */
  objectFit?: "contain" | "cover" | "fill";
  cropX?: number; // 0..100, CSS object-position X
  cropY?: number; // 0..100, CSS object-position Y

  mask?: ImageMask;
  borderRadius?: number;
  borderColor?: string;
  borderWidth?: number;
  shadow?: ImageShadow;
  backgroundColor?: string;

  /** Optional source dimensions are useful later for smarter crop tooling. */
  intrinsicWidth?: number;
  intrinsicHeight?: number;
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
  | IconDesignObject
  | SmartDesignObject;

/**
 * ResumeDesign does not need to know about designObjects yet. Keeping the
 * property optional makes the feature backwards-compatible with every
 * existing saved resume. It can move onto ResumeDesign directly later
 * without changing persisted data.
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

/**
 * Grouping and linking are intentionally different:
 * - groupId: movement/selection relationship
 * - linkId:  shared visual design relationship
 *
 * Linked objects preserve local placement and content. For example, two photos
 * may use different source images but keep the same circular frame, size,
 * border and shadow. Two accent rectangles can live on different pages but
 * still share fill/stroke/opacity/size.
 */
export function designObjectsAreLinkCompatible(
  a: ResumeDesignObject,
  b: ResumeDesignObject,
): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "shape" && b.type === "shape") return a.shape === b.shape;
  if (a.type === "smart" && b.type === "smart") return a.smartKind === b.smartKind;
  return true;
}

export function canLinkDesignObjects(objects: ResumeDesignObject[]): boolean {
  if (objects.length < 2) return false;
  const first = objects[0];
  return objects.every(object => designObjectsAreLinkCompatible(first, object));
}

export function linkedDesignObjectPeers(
  design: ResumeDesign,
  objectOrId: ResumeDesignObject | string,
): ResumeDesignObject[] {
  const objects = getDesignObjects(design);
  const object = typeof objectOrId === "string"
    ? objects.find(item => item.id === objectOrId)
    : objectOrId;
  if (!object?.linkId) return object ? [object] : [];
  return objects.filter(item =>
    item.linkId === object.linkId && designObjectsAreLinkCompatible(object, item)
  );
}

const LINKED_BASE_FIELDS = [
  "width",
  "height",
  "rotation",
  "opacity",
] as const;

const LINKED_SHAPE_FIELDS = [
  "fill",
  "stroke",
  "strokeWidth",
  "borderRadius",
] as const;

const LINKED_IMAGE_FIELDS = [
  "objectFit",
  "cropX",
  "cropY",
  "mask",
  "borderRadius",
  "borderColor",
  "borderWidth",
  "shadow",
  "backgroundColor",
] as const;

const LINKED_TEXT_FIELDS = [
  "color",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "textAlign",
] as const;

const LINKED_ICON_FIELDS = [
  "color",
  "strokeWidth",
] as const;

const LINKED_SMART_FIELDS = [
  "fill",
  "stroke",
  "strokeWidth",
  "borderRadius",
  "dotSize",
  "offset",
  "side",
] as const;

function linkedFieldNames(object: ResumeDesignObject): string[] {
  if (object.type === "shape") return [...LINKED_BASE_FIELDS, ...LINKED_SHAPE_FIELDS];
  if (object.type === "image") return [...LINKED_BASE_FIELDS, ...LINKED_IMAGE_FIELDS];
  if (object.type === "text") return [...LINKED_BASE_FIELDS, ...LINKED_TEXT_FIELDS];
  if (object.type === "smart") return [...LINKED_BASE_FIELDS, ...LINKED_SMART_FIELDS];
  return [...LINKED_BASE_FIELDS, ...LINKED_ICON_FIELDS];
}

function copyField(
  target: ResumeDesignObject,
  source: ResumeDesignObject,
  key: string,
): ResumeDesignObject {
  const next = { ...target } as ResumeDesignObject & Record<string, unknown>;
  const sourceRecord = source as ResumeDesignObject & Record<string, unknown>;
  if (sourceRecord[key] === undefined) delete next[key];
  else next[key] = sourceRecord[key];
  return next as ResumeDesignObject;
}

/**
 * Make `target` visually match `source` without changing the things that make
 * it a distinct resume object: id, page, x/y, layer, z-index, source content,
 * attachment target, visibility/lock state, grouping, and name.
 */
export function copyLinkedDesignAppearance(
  source: ResumeDesignObject,
  target: ResumeDesignObject,
): ResumeDesignObject {
  if (!designObjectsAreLinkCompatible(source, target)) return target;
  return linkedFieldNames(source).reduce(
    (next, key) => copyField(next, source, key),
    target,
  );
}

/**
 * Apply one object's edit and mirror only linked visual fields to its peers.
 * Position changes are deliberately local: moving one linked object does not
 * move the others. Grouping remains the mechanism for move-together behavior.
 */
export function applyLinkedDesignObjectChange(
  design: ResumeDesign,
  nextObject: ResumeDesignObject,
): ResumeDesign {
  const existing = getDesignObjects(design);
  const previous = existing.find(item => item.id === nextObject.id);

  if (!previous) return upsertDesignObject(design, nextObject);
  if (!previous.linkId || previous.linkId !== nextObject.linkId) {
    return upsertDesignObject(design, nextObject);
  }

  const fields = linkedFieldNames(nextObject);
  const previousRecord = previous as ResumeDesignObject & Record<string, unknown>;
  const nextRecord = nextObject as ResumeDesignObject & Record<string, unknown>;
  const changed = fields.filter(key => !Object.is(previousRecord[key], nextRecord[key]));

  if (changed.length === 0) return upsertDesignObject(design, nextObject);

  const objects = existing.map(item => {
    if (item.id === nextObject.id) return nextObject;
    if (item.linkId !== nextObject.linkId) return item;
    if (!designObjectsAreLinkCompatible(nextObject, item)) return item;

    return changed.reduce(
      (peer, key) => copyField(peer, nextObject, key),
      item,
    );
  });

  return withDesignObjects(design, objects);
}

/** Remove stale one-member links after unlink/delete/relink operations. */
export function normalizeDesignObjectLinks(
  objects: ResumeDesignObject[],
): ResumeDesignObject[] {
  const counts = new Map<string, number>();
  objects.forEach(object => {
    if (object.linkId) counts.set(object.linkId, (counts.get(object.linkId) ?? 0) + 1);
  });

  return objects.map(object => {
    if (!object.linkId || (counts.get(object.linkId) ?? 0) >= 2) return object;
    const next = { ...object } as ResumeDesignObject;
    delete next.linkId;
    return next;
  });
}

/**
 * Logical section backgrounds may render on more than one physical page.
 * We therefore include section-attached shapes in every page's candidate
 * list and let ResumeCanvas resolve whether that section has a fragment on
 * the specific page.
 */
export function designObjectsForPage(
  design: ResumeDesign,
  page: number,
  layer: DesignObjectLayer,
): ResumeDesignObject[] {
  return getDesignObjects(design)
    .filter(object => {
      if (object.hidden) return false;
      if ((object.layer ?? "background") !== layer) return false;

      if (object.type === "shape" && object.attachment?.kind === "section") {
        return true;
      }

      if (object.type === "shape" && object.attachment?.kind === "header") {
        return page === 0;
      }

      // Resume-aware components are resolved by ResumeCanvas. Timeline and
      // section-divider candidates may appear on any physical page containing
      // their logical section; header accent is page 1 only.
      if (object.type === "smart") {
        // Page-spanning resume components are one persisted design object that
        // resolves independently on every physical resume page. This means a
        // sidebar automatically continues onto page 2/3/etc. as pagination grows.
        if (
          object.smartKind === "sidebar" ||
          object.smartKind === "timeline" ||
          object.smartKind === "section-divider"
        ) {
          return true;
        }
        if (object.smartKind === "header-accent") return page === 0;
      }

      return object.page === page;
    })
    .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
}
