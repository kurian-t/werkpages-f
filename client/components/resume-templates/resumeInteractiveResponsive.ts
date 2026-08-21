import {
  INTERACTIVE_BREAKPOINT_VIEWPORTS,
  getInteractiveObjectGeometry,
  getInteractiveSceneLayout,
  updateInteractiveObject,
  updateInteractiveScene,
  withInteractiveObjectGeometryForBreakpoint,
  type InteractiveBreakpoint,
  type InteractiveObjectGeometry,
  type InteractiveResponsiveSceneOverride,
  type InteractiveSceneCollection,
  type InteractiveSceneObject,
} from "./resumeInteractive";

type EditableBreakpoint = Exclude<InteractiveBreakpoint, "desktop">;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function updateInteractiveSceneBreakpointLayout(
  collection: InteractiveSceneCollection,
  sceneId: string,
  breakpoint: InteractiveBreakpoint,
  patch: Partial<InteractiveResponsiveSceneOverride>,
): InteractiveSceneCollection {
  const scene = collection.scenes[sceneId];
  if (!scene) return collection;

  if (breakpoint === "desktop") {
    return updateInteractiveScene(collection, sceneId, {
      width: patch.width ?? scene.width,
      height: patch.height ?? scene.height,
      scrollLength: patch.scrollLength ?? scene.scrollLength,
    });
  }

  return updateInteractiveScene(collection, sceneId, {
    responsive: {
      ...(scene.responsive ?? {}),
      [breakpoint]: {
        ...(scene.responsive?.[breakpoint] ?? {}),
        ...patch,
      },
    },
  });
}

export function updateInteractiveObjectBreakpointGeometry(
  collection: InteractiveSceneCollection,
  sceneId: string,
  objectId: string,
  breakpoint: InteractiveBreakpoint,
  geometry: InteractiveObjectGeometry,
): InteractiveSceneCollection {
  return updateInteractiveObject(
    collection,
    sceneId,
    objectId,
    object =>
      withInteractiveObjectGeometryForBreakpoint(
        object,
        breakpoint,
        geometry,
      ),
  );
}

export function clearInteractiveSceneBreakpointLayout(
  collection: InteractiveSceneCollection,
  sceneId: string,
  breakpoint: EditableBreakpoint,
): InteractiveSceneCollection {
  const scene = collection.scenes[sceneId];
  if (!scene) return collection;

  const responsive = {
    ...(scene.responsive ?? {}),
  };
  delete responsive[breakpoint];

  let next: InteractiveSceneCollection = updateInteractiveScene(
    collection,
    sceneId,
    {
      responsive:
        responsive.tablet || responsive.mobile
          ? responsive
          : {},
    },
  );

  const currentScene = next.scenes[sceneId];
  if (!currentScene) return next;

  const objects = { ...currentScene.objects };
  currentScene.objectOrder.forEach(objectId => {
    const object = objects[objectId];
    if (!object?.responsive?.[breakpoint]) return;

    const objectResponsive = {
      ...(object.responsive ?? {}),
    };
    delete objectResponsive[breakpoint];

    objects[objectId] = {
      ...object,
      responsive:
        objectResponsive.tablet || objectResponsive.mobile
          ? objectResponsive
          : undefined,
    } as InteractiveSceneObject;
  });

  return {
    ...next,
    scenes: {
      ...next.scenes,
      [sceneId]: {
        ...currentScene,
        responsive:
          responsive.tablet || responsive.mobile
            ? responsive
            : undefined,
        objects,
      },
    },
  };
}

function mobileObjectGeometry(
  object: InteractiveSceneObject,
  sceneWidth: number,
  targetWidth: number,
  cursorY: number,
): {
  geometry: InteractiveObjectGeometry;
  nextCursorY: number;
} {
  const base = getInteractiveObjectGeometry(object, "desktop");
  const margin = 24;
  const usable = Math.max(240, targetWidth - margin * 2);
  const decorative = object.type === "shape";

  if (decorative) {
    const scale = targetWidth / Math.max(1, sceneWidth);
    return {
      geometry: {
        ...base,
        x: base.x * scale,
        y: base.y * scale,
        width: Math.max(10, base.width * scale),
        height: Math.max(10, base.height * scale),
      },
      nextCursorY: cursorY,
    };
  }

  const width = usable;
  const aspectHeight =
    base.width > 0
      ? base.height * (width / base.width)
      : base.height;

  const minHeight =
    object.type === "resume-content" ? 86 : object.type === "text" ? 64 : 100;
  const maxHeight =
    object.type === "image" ? 320 : object.type === "resume-content" ? 300 : 180;

  const height = clamp(aspectHeight, minHeight, maxHeight);

  return {
    geometry: {
      ...base,
      x: margin,
      y: cursorY,
      width,
      height,
      rotation: 0,
    },
    nextCursorY: cursorY + height + 22,
  };
}

/**
 * Creates a useful editable starting layout from Desktop.
 *
 * Tablet preserves the composition proportionally. Mobile intentionally
 * reflows content objects into a single readable column while decorative
 * shapes keep proportional art direction. It is only a starting point —
 * everything remains directly draggable/resizable afterward.
 */
export function seedInteractiveSceneBreakpointLayout(
  collection: InteractiveSceneCollection,
  sceneId: string,
  breakpoint: EditableBreakpoint,
): InteractiveSceneCollection {
  const scene = collection.scenes[sceneId];
  if (!scene) return collection;

  const target = INTERACTIVE_BREAKPOINT_VIEWPORTS[breakpoint];
  const desktop = getInteractiveSceneLayout(scene, "desktop");
  let next = collection;

  if (breakpoint === "tablet") {
    const scale = target.width / Math.max(1, desktop.width);
    const targetHeight = Math.max(
      target.height,
      Math.round(desktop.height * scale),
    );

    next = updateInteractiveSceneBreakpointLayout(
      next,
      sceneId,
      breakpoint,
      {
        width: target.width,
        height: targetHeight,
        scrollLength: Math.max(
          700,
          Math.round(desktop.scrollLength * Math.max(0.72, scale)),
        ),
      },
    );

    scene.objectOrder.forEach(objectId => {
      const object = scene.objects[objectId];
      if (!object) return;
      const base = getInteractiveObjectGeometry(object, "desktop");
      const geometry: InteractiveObjectGeometry = {
        ...base,
        x: base.x * scale,
        y: base.y * scale,
        width: Math.max(12, base.width * scale),
        height: Math.max(12, base.height * scale),
      };
      next = updateInteractiveObjectBreakpointGeometry(
        next,
        sceneId,
        objectId,
        breakpoint,
        geometry,
      );
    });

    return next;
  }

  const contentIds = scene.objectOrder
    .filter(objectId => scene.objects[objectId]?.type !== "shape")
    .sort((a, b) => {
      const ga = scene.objects[a]?.geometry;
      const gb = scene.objects[b]?.geometry;
      if (!ga || !gb) return 0;
      return ga.y === gb.y ? ga.x - gb.x : ga.y - gb.y;
    });

  const contentSet = new Set(contentIds);
  let cursorY = 64;

  contentIds.forEach(objectId => {
    const object = scene.objects[objectId];
    if (!object) return;
    const result = mobileObjectGeometry(
      object,
      desktop.width,
      target.width,
      cursorY,
    );
    cursorY = result.nextCursorY;

    next = updateInteractiveObjectBreakpointGeometry(
      next,
      sceneId,
      objectId,
      breakpoint,
      result.geometry,
    );
  });

  scene.objectOrder.forEach(objectId => {
    if (contentSet.has(objectId)) return;
    const object = scene.objects[objectId];
    if (!object) return;

    const result = mobileObjectGeometry(
      object,
      desktop.width,
      target.width,
      cursorY,
    );

    next = updateInteractiveObjectBreakpointGeometry(
      next,
      sceneId,
      objectId,
      breakpoint,
      result.geometry,
    );
  });

  const targetHeight = Math.max(target.height, Math.ceil(cursorY + 60));

  return updateInteractiveSceneBreakpointLayout(
    next,
    sceneId,
    breakpoint,
    {
      width: target.width,
      height: targetHeight,
      scrollLength: Math.max(
        targetHeight,
        Math.round(desktop.scrollLength * 0.9),
      ),
    },
  );
}
