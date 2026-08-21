import type { ResumeData } from "./types";
import { getResumeProjects } from "./resumeProjects";
import {
  createInteractiveAnimationTrack,
  createInteractiveMotionPath,
  createInteractiveObject,
  createInteractiveScene,
  createInteractiveScrollTrack,
  type InteractiveAnimationProperty,
  type InteractiveObjectAppearance,
  type InteractiveResumeContentBinding,
  type InteractiveScene,
  type InteractiveSceneCollection,
  type InteractiveSceneTransitionType,
  type InteractiveSceneObject,
} from "./resumeInteractive";

export type InteractiveTemplateId =
  | "minimal-motion"
  | "career-journey"
  | "terminal"
  | "space-journey";

export interface InteractiveTemplateDefinition {
  id: InteractiveTemplateId;
  name: string;
  description: string;
  mood: string;
  motionLevel: "Subtle" | "Story" | "Dynamic";
  bestFor: string;
  preview:
    | "minimal"
    | "journey"
    | "terminal"
    | "space";
}

export const INTERACTIVE_TEMPLATES: InteractiveTemplateDefinition[] = [
  {
    id: "minimal-motion",
    name: "Minimal Motion",
    description:
      "Clean portfolio scenes with restrained fades, gentle movement and plenty of breathing room.",
    mood: "Polished & calm",
    motionLevel: "Subtle",
    bestFor: "Most professional roles",
    preview: "minimal",
  },
  {
    id: "career-journey",
    name: "Career Journey",
    description:
      "One career chapter at a time, with pinned storytelling, milestones and directional transitions.",
    mood: "Narrative & visual",
    motionLevel: "Story",
    bestFor: "Experienced candidates",
    preview: "journey",
  },
  {
    id: "terminal",
    name: "Terminal",
    description:
      "A dark command-line inspired experience built from the same live resume records.",
    mood: "Technical & focused",
    motionLevel: "Subtle",
    bestFor: "Engineering & technical roles",
    preview: "terminal",
  },
  {
    id: "space-journey",
    name: "Space Journey",
    description:
      "A playful scroll journey with stars, depth, motion paths and glass-like content stations.",
    mood: "Playful & immersive",
    motionLevel: "Dynamic",
    bestFor: "Creative / standout portfolios",
    preview: "space",
  },
];

const TEMPLATE_WIDTH = 1440;
const TEMPLATE_HEIGHT = 900;

function asText(value: unknown): string {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value
        .filter(item => !!item && typeof item === "object")
        .map(item => item as Record<string, unknown>)
    : [];
}

function workBindings(data: ResumeData): InteractiveResumeContentBinding[] {
  return recordArray(data.workEntries).map((entry, index) => ({
    source: "work" as const,
    entryId: asText(entry.id).trim() || `work-${index}`,
    field: "entry",
  }));
}

function educationBindings(
  data: ResumeData,
): InteractiveResumeContentBinding[] {
  return recordArray(data.education).map((entry, index) => ({
    source: "education" as const,
    entryId: asText(entry.id).trim() || `education-${index}`,
    field: "entry",
  }));
}

function projectBindings(
  data: ResumeData,
): InteractiveResumeContentBinding[] {
  return getResumeProjects(data).map((project, index) => ({
    source: "project" as const,
    entryId: project.id || `project-${index}`,
    field: "entry",
  }));
}

function skillBindings(data: ResumeData): InteractiveResumeContentBinding[] {
  const skills = Array.isArray(data.skills) ? data.skills : [];
  return skills.map((_, index) => ({
    source: "skill" as const,
    entryId: String(index),
    field: "value",
  }));
}

function linkBindings(data: ResumeData): InteractiveResumeContentBinding[] {
  const links = Array.isArray(data.extraLinks) ? data.extraLinks : [];
  return links.map((_, index) => ({
    source: "link" as const,
    entryId: String(index),
    field: "entry",
  }));
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function appearance(
  variant: InteractiveObjectAppearance["variant"],
  options?: Omit<InteractiveObjectAppearance, "variant">,
): InteractiveObjectAppearance {
  return {
    variant,
    ...(options ?? {}),
  };
}

const MINIMAL_CARD = appearance("card", {
  textColor: "#241632",
  surfaceColor: "#ffffff",
  accentColor: "#6d28d9",
  borderColor: "#e7def4",
  radius: 18,
});

const MINIMAL_PLAIN = appearance("plain", {
  textColor: "#241632",
  accentColor: "#6d28d9",
  radius: 0,
});

const JOURNEY_CARD = appearance("accent", {
  textColor: "#211134",
  surfaceColor: "#fffafe",
  accentColor: "#7c3aed",
  borderColor: "#c4b5fd",
  radius: 22,
});

const TERMINAL = appearance("terminal", {
  textColor: "#8cff98",
  surfaceColor: "rgba(4,15,8,.94)",
  accentColor: "#44ff77",
  borderColor: "#1e6a36",
  radius: 8,
});

const SPACE_GLASS = appearance("glass", {
  textColor: "#ffffff",
  surfaceColor: "rgba(21,18,55,.58)",
  accentColor: "#b9a7ff",
  borderColor: "rgba(205,194,255,.34)",
  radius: 22,
});

function setZ(
  object: InteractiveSceneObject,
  zIndex: number,
): InteractiveSceneObject {
  return {
    ...object,
    geometry: {
      ...object.geometry,
      zIndex,
    },
  } as InteractiveSceneObject;
}

function place(
  scene: InteractiveScene,
  object: InteractiveSceneObject,
): InteractiveSceneObject {
  const zIndex =
    object.geometry.zIndex ||
    scene.objectOrder.length + 1;
  const next = setZ(object, zIndex);
  scene.objectOrder.push(next.id);
  scene.objects[next.id] = next;
  return next;
}

function textObject(
  scene: InteractiveScene,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options?: {
    name?: string;
    appearance?: InteractiveObjectAppearance;
    rotation?: number;
    opacity?: number;
    parallaxDepth?: number;
    motion?: InteractiveSceneObject["motion"];
  },
): InteractiveSceneObject {
  const base = createInteractiveObject("text", {
    name: options?.name ?? (text.slice(0, 32) || "Text"),
    geometry: {
      x,
      y,
      width,
      height,
      rotation: options?.rotation ?? 0,
      opacity: options?.opacity ?? 1,
    },
  });

  if (base.type !== "text") return base;
  return place(scene, {
    ...base,
    text,
    appearance: options?.appearance,
    parallaxDepth: options?.parallaxDepth,
    motion: options?.motion,
  });
}

function boundObject(
  scene: InteractiveScene,
  binding: InteractiveResumeContentBinding,
  x: number,
  y: number,
  width: number,
  height: number,
  options?: {
    name?: string;
    appearance?: InteractiveObjectAppearance;
    parallaxDepth?: number;
    enter?: "fade-up" | "fade-left" | "fade" | "none";
    scrollY?: [number, number];
    scrollX?: [number, number];
  },
): InteractiveSceneObject {
  const base = createInteractiveObject("resume-content", {
    name: options?.name ?? "Shared resume content",
    geometry: { x, y, width, height },
  });
  if (base.type !== "resume-content") return base;

  const animationTracks = [];
  if (options?.enter && options.enter !== "none") {
    const opacity = createInteractiveAnimationTrack("opacity", "enter");
    opacity.from = 0;
    opacity.to = 1;
    opacity.duration = 0.65;
    opacity.easing = "ease-out";
    animationTracks.push(opacity);

    if (options.enter === "fade-up") {
      const move = createInteractiveAnimationTrack("y", "enter");
      move.from = 34;
      move.to = 0;
      move.duration = 0.72;
      move.easing = "ease-out";
      animationTracks.push(move);
    } else if (options.enter === "fade-left") {
      const move = createInteractiveAnimationTrack("x", "enter");
      move.from = -42;
      move.to = 0;
      move.duration = 0.72;
      move.easing = "ease-out";
      animationTracks.push(move);
    }
  }

  const scrollTracks = [];
  const addScroll = (
    property: InteractiveAnimationProperty,
    range: [number, number],
  ) => {
    const track = createInteractiveScrollTrack(property);
    track.keyframes[0].value = range[0];
    track.keyframes[1].value = range[1];
    track.easing = "ease-in-out";
    scrollTracks.push(track);
  };
  if (options?.scrollX) addScroll("x", options.scrollX);
  if (options?.scrollY) addScroll("y", options.scrollY);

  return place(scene, {
    ...base,
    binding,
    appearance: options?.appearance,
    parallaxDepth: options?.parallaxDepth,
    animationTracks:
      animationTracks.length ? animationTracks : undefined,
    scrollTracks: scrollTracks.length ? scrollTracks : undefined,
  });
}

function shapeObject(
  scene: InteractiveScene,
  shape: "rectangle" | "ellipse" | "line",
  x: number,
  y: number,
  width: number,
  height: number,
  options?: {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    opacity?: number;
    rotation?: number;
    parallaxDepth?: number;
    motion?: InteractiveSceneObject["motion"];
  },
): InteractiveSceneObject {
  const base = createInteractiveObject("shape", {
    name: `${shape} decoration`,
    geometry: {
      x,
      y,
      width,
      height,
      opacity: options?.opacity ?? 1,
      rotation: options?.rotation ?? 0,
    },
  });
  if (base.type !== "shape") return base;

  return place(scene, {
    ...base,
    shape,
    fill: options?.fill,
    stroke: options?.stroke,
    strokeWidth: options?.strokeWidth,
    parallaxDepth: options?.parallaxDepth,
    motion: options?.motion,
  });
}

function sceneCollection(
  scenes: InteractiveScene[],
): InteractiveSceneCollection {
  return {
    sceneOrder: scenes.map(scene => scene.id),
    scenes: Object.fromEntries(
      scenes.map(scene => [scene.id, scene]),
    ),
    activeSceneId: scenes[0]?.id ?? "",
  };
}

function minimalScene(
  name: string,
  transition: InteractiveSceneTransitionType = "fade",
): InteractiveScene {
  const scene = createInteractiveScene(name, {
    width: TEMPLATE_WIDTH,
    height: TEMPLATE_HEIGHT,
    scrollLength: 1050,
    background: {
      type: "gradient",
      color: "#fbfaff",
      secondaryColor: "#f1ecfb",
    },
    transition: {
      type: transition,
      duration: 0.65,
      easing: "ease-in-out",
    },
  });
  scene.ambient.gradientDrift.enabled = true;
  scene.ambient.gradientDrift.speed = 0.35;
  scene.ambient.gradientDrift.intensity = 22;
  return scene;
}

function buildMinimalMotion(data: ResumeData): InteractiveSceneCollection {
  const scenes: InteractiveScene[] = [];

  const intro = minimalScene("Intro");
  shapeObject(intro, "ellipse", 1030, 110, 260, 260, {
    fill: "#ede9fe",
    stroke: "#ddd6fe",
    opacity: 0.82,
    parallaxDepth: -0.45,
    motion: { preset: "float", speed: 0.7, intensity: 20 },
  });
  shapeObject(intro, "ellipse", 1140, 470, 105, 105, {
    fill: "#f5f3ff",
    stroke: "#e9d5ff",
    opacity: 0.9,
    parallaxDepth: 0.45,
    motion: { preset: "bob", speed: 0.65, intensity: 15 },
  });
  textObject(intro, "HELLO — THIS IS MY WORK", 120, 150, 620, 48, {
    appearance: appearance("plain", {
      textColor: "#7c3aed",
      accentColor: "#7c3aed",
    }),
  });
  boundObject(
    intro,
    { source: "personal", field: "fullName" },
    110,
    220,
    760,
    150,
    {
      appearance: MINIMAL_PLAIN,
      name: "Full name",
      enter: "fade-up",
    },
  );
  boundObject(
    intro,
    { source: "personal", field: "summary" },
    110,
    405,
    770,
    210,
    {
      appearance: MINIMAL_CARD,
      name: "Bio",
      enter: "fade-up",
    },
  );
  boundObject(
    intro,
    { source: "personal", field: "location" },
    110,
    650,
    300,
    95,
    {
      appearance: MINIMAL_PLAIN,
      name: "Location",
      enter: "fade",
    },
  );
  scenes.push(intro);

  chunks(workBindings(data), 4).forEach((bindings, page) => {
    const scene = minimalScene(
      page ? `Experience ${page + 1}` : "Experience",
    );
    textObject(scene, "EXPERIENCE", 100, 75, 500, 55, {
      appearance: MINIMAL_PLAIN,
    });
    bindings.forEach((binding, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      boundObject(
        scene,
        binding,
        90 + col * 665,
        165 + row * 340,
        610,
        300,
        {
          appearance: MINIMAL_CARD,
          enter: index % 2 ? "fade-up" : "fade-left",
          name: "Experience",
        },
      );
    });
    scenes.push(scene);
  });

  chunks(projectBindings(data), 4).forEach((bindings, page) => {
    const scene = minimalScene(
      page ? `Projects ${page + 1}` : "Projects",
    );
    textObject(scene, "SELECTED PROJECTS", 100, 75, 600, 55, {
      appearance: MINIMAL_PLAIN,
    });
    bindings.forEach((binding, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      boundObject(
        scene,
        binding,
        90 + col * 665,
        165 + row * 340,
        610,
        300,
        {
          appearance: MINIMAL_CARD,
          enter: "fade-up",
          name: "Project",
        },
      );
    });
    scenes.push(scene);
  });

  const contact = minimalScene("Contact", "none");
  textObject(contact, "LET'S CONNECT", 120, 140, 620, 70, {
    appearance: MINIMAL_PLAIN,
  });
  boundObject(
    contact,
    { source: "personal", field: "fullName" },
    115,
    245,
    700,
    130,
    { appearance: MINIMAL_PLAIN, enter: "fade-up" },
  );
  [
    { source: "personal" as const, field: "email" },
    { source: "personal" as const, field: "website" },
    ...linkBindings(data).slice(0, 3),
  ].forEach((binding, index) => {
    boundObject(
      contact,
      binding,
      120,
      420 + index * 95,
      680,
      76,
      {
        appearance: MINIMAL_CARD,
        enter: "fade-up",
      },
    );
  });
  scenes.push(contact);

  return sceneCollection(scenes);
}

function journeyScene(
  name: string,
  transition: InteractiveSceneTransitionType = "slide-left",
): InteractiveScene {
  const scene = createInteractiveScene(name, {
    width: TEMPLATE_WIDTH,
    height: TEMPLATE_HEIGHT,
    scrollLength: 1500,
    background: {
      type: "gradient",
      color: "#fffafe",
      secondaryColor: "#ede9fe",
    },
    transition: {
      type: transition,
      duration: 0.85,
      easing: "ease-in-out",
    },
  });
  scene.ambient.floatingShapes.enabled = true;
  scene.ambient.floatingShapes.density = 10;
  scene.ambient.floatingShapes.speed = 0.45;
  scene.ambient.floatingShapes.intensity = 20;
  scene.ambient.parallax.enabled = true;
  scene.ambient.parallax.intensity = 24;
  return scene;
}

function buildCareerJourney(data: ResumeData): InteractiveSceneCollection {
  const scenes: InteractiveScene[] = [];
  const intro = journeyScene("Journey begins");
  shapeObject(intro, "line", 110, 620, 1080, 5, {
    stroke: "#c4b5fd",
    strokeWidth: 4,
    opacity: 0.8,
  });
  shapeObject(intro, "ellipse", 100, 575, 90, 90, {
    fill: "#7c3aed",
    stroke: "#6d28d9",
    parallaxDepth: 0.7,
    motion: { preset: "pulse", speed: 0.65, intensity: 16 },
  });
  textObject(intro, "MY CAREER JOURNEY", 110, 130, 700, 64, {
    appearance: MINIMAL_PLAIN,
  });
  boundObject(
    intro,
    { source: "personal", field: "fullName" },
    105,
    225,
    760,
    145,
    {
      appearance: JOURNEY_CARD,
      enter: "fade-left",
    },
  );
  boundObject(
    intro,
    { source: "personal", field: "summary" },
    105,
    410,
    780,
    170,
    {
      appearance: JOURNEY_CARD,
      enter: "fade-up",
    },
  );
  scenes.push(intro);

  workBindings(data).forEach((binding, index) => {
    const scene = journeyScene(`Career chapter ${index + 1}`);
    textObject(
      scene,
      `CHAPTER ${String(index + 1).padStart(2, "0")}`,
      105,
      95,
      420,
      55,
      { appearance: MINIMAL_PLAIN },
    );
    shapeObject(scene, "line", 160, 210, 6, 520, {
      stroke: "#a78bfa",
      strokeWidth: 5,
    });
    shapeObject(scene, "ellipse", 125, 220, 76, 76, {
      fill: "#7c3aed",
      stroke: "#ede9fe",
      strokeWidth: 5,
      parallaxDepth: 0.8,
      motion: { preset: "pulse", speed: 0.7, intensity: 14 },
    });

    boundObject(
      scene,
      binding,
      285,
      210,
      820,
      370,
      {
        appearance: JOURNEY_CARD,
        enter: "fade-left",
        scrollY: [80, -20],
        name: `Career chapter ${index + 1}`,
      },
    );

    const marker = shapeObject(scene, "ellipse", 1110, 570, 64, 64, {
      fill: "#ddd6fe",
      stroke: "#7c3aed",
      strokeWidth: 3,
      parallaxDepth: 1.15,
    });
    marker.motionPath = createInteractiveMotionPath();
    marker.motionPath.autoRotate = false;
    marker.motionPath.points[0].x = -650;
    marker.motionPath.points[0].y = 160;
    marker.motionPath.points[1].x = 100;
    marker.motionPath.points[1].y = -250;
    marker.motionPath.curve = "smooth";
    scenes.push(scene);
  });

  chunks(projectBindings(data), 3).forEach((bindings, page) => {
    const scene = journeyScene(
      page ? `Projects chapter ${page + 1}` : "Projects chapter",
    );
    textObject(scene, "PROJECT MILESTONES", 105, 85, 650, 65, {
      appearance: MINIMAL_PLAIN,
    });
    bindings.forEach((binding, index) => {
      boundObject(
        scene,
        binding,
        150 + index * 405,
        230 + (index % 2) * 70,
        360,
        360,
        {
          appearance: JOURNEY_CARD,
          enter: "fade-up",
          parallaxDepth: index === 1 ? 0.4 : 0.15,
        },
      );
    });
    scenes.push(scene);
  });

  const education = educationBindings(data);
  if (education.length) {
    const scene = journeyScene("Education");
    textObject(scene, "EDUCATION", 105, 90, 500, 60, {
      appearance: MINIMAL_PLAIN,
    });
    education.slice(0, 4).forEach((binding, index) => {
      boundObject(
        scene,
        binding,
        120 + (index % 2) * 650,
        200 + Math.floor(index / 2) * 275,
        580,
        220,
        {
          appearance: JOURNEY_CARD,
          enter: "fade-up",
        },
      );
    });
    scenes.push(scene);
  }

  const contact = journeyScene("What's next?", "none");
  textObject(contact, "WHAT'S NEXT?", 105, 150, 640, 72, {
    appearance: MINIMAL_PLAIN,
  });
  boundObject(
    contact,
    { source: "personal", field: "email" },
    105,
    285,
    680,
    110,
    {
      appearance: JOURNEY_CARD,
      enter: "fade-up",
    },
  );
  linkBindings(data).slice(0, 3).forEach((binding, index) => {
    boundObject(
      contact,
      binding,
      105,
      430 + index * 105,
      680,
      85,
      {
        appearance: JOURNEY_CARD,
        enter: "fade-up",
      },
    );
  });
  scenes.push(contact);

  return sceneCollection(scenes);
}

function terminalScene(
  name: string,
  transition: InteractiveSceneTransitionType = "slide-up",
): InteractiveScene {
  const scene = createInteractiveScene(name, {
    width: TEMPLATE_WIDTH,
    height: TEMPLATE_HEIGHT,
    scrollLength: 1100,
    background: {
      type: "gradient",
      color: "#030805",
      secondaryColor: "#07150b",
    },
    transition: {
      type: transition,
      duration: 0.55,
      easing: "ease-out",
    },
  });
  scene.ambient.particles.enabled = true;
  scene.ambient.particles.density = 12;
  scene.ambient.particles.speed = 0.45;
  scene.ambient.particles.intensity = 18;
  return scene;
}

function terminalChrome(scene: InteractiveScene, title: string): void {
  shapeObject(scene, "rectangle", 65, 55, 1310, 785, {
    fill: "rgba(3,13,6,.78)",
    stroke: "#1e6a36",
    strokeWidth: 2,
  });
  shapeObject(scene, "ellipse", 92, 83, 18, 18, {
    fill: "#ff6b6b",
    stroke: "#ff6b6b",
  });
  shapeObject(scene, "ellipse", 122, 83, 18, 18, {
    fill: "#ffd166",
    stroke: "#ffd166",
  });
  shapeObject(scene, "ellipse", 152, 83, 18, 18, {
    fill: "#44ff77",
    stroke: "#44ff77",
  });
  textObject(scene, title, 210, 75, 850, 42, {
    appearance: TERMINAL,
  });
}

function buildTerminal(data: ResumeData): InteractiveSceneCollection {
  const scenes: InteractiveScene[] = [];

  const intro = terminalScene("whoami");
  terminalChrome(intro, "resume@werkpages:~$ whoami");
  boundObject(
    intro,
    { source: "personal", field: "fullName" },
    125,
    180,
    810,
    125,
    {
      appearance: TERMINAL,
      enter: "fade-left",
      name: "whoami",
    },
  );
  textObject(intro, "$ cat profile.txt", 125, 340, 520, 46, {
    appearance: TERMINAL,
  });
  boundObject(
    intro,
    { source: "personal", field: "summary" },
    125,
    400,
    930,
    200,
    {
      appearance: TERMINAL,
      enter: "fade-up",
    },
  );
  textObject(intro, "scroll ↓", 1120, 720, 150, 40, {
    appearance: TERMINAL,
    motion: { preset: "bob", speed: 0.7, intensity: 12 },
  });
  scenes.push(intro);

  chunks(workBindings(data), 3).forEach((bindings, page) => {
    const scene = terminalScene(
      page ? `experience.log ${page + 1}` : "experience.log",
    );
    terminalChrome(scene, "resume@werkpages:~$ cat experience.log");
    bindings.forEach((binding, index) => {
      boundObject(
        scene,
        binding,
        115,
        165 + index * 215,
        1110,
        185,
        {
          appearance: TERMINAL,
          enter: "fade-left",
          name: "experience.log",
        },
      );
    });
    scenes.push(scene);
  });

  chunks(projectBindings(data), 3).forEach((bindings, page) => {
    const scene = terminalScene(
      page ? `projects/ ${page + 1}` : "projects/",
    );
    terminalChrome(scene, "resume@werkpages:~$ ls -la projects/");
    bindings.forEach((binding, index) => {
      boundObject(
        scene,
        binding,
        115 + index * 405,
        205,
        365,
        410,
        {
          appearance: TERMINAL,
          enter: "fade-up",
          name: "project",
        },
      );
    });
    scenes.push(scene);
  });

  const skills = skillBindings(data);
  if (skills.length) {
    const scene = terminalScene("skills --list");
    terminalChrome(scene, "resume@werkpages:~$ skills --list");
    skills.slice(0, 12).forEach((binding, index) => {
      boundObject(
        scene,
        binding,
        120 + (index % 3) * 390,
        180 + Math.floor(index / 3) * 130,
        330,
        88,
        {
          appearance: TERMINAL,
          enter: "fade",
          name: "skill",
        },
      );
    });
    scenes.push(scene);
  }

  const contact = terminalScene("contact", "none");
  terminalChrome(contact, "resume@werkpages:~$ contact --open");
  boundObject(
    contact,
    { source: "personal", field: "email" },
    120,
    190,
    850,
    110,
    { appearance: TERMINAL, enter: "fade-left" },
  );
  boundObject(
    contact,
    { source: "personal", field: "website" },
    120,
    330,
    850,
    100,
    { appearance: TERMINAL, enter: "fade-left" },
  );
  linkBindings(data).slice(0, 4).forEach((binding, index) => {
    boundObject(
      contact,
      binding,
      120,
      470 + index * 80,
      850,
      62,
      { appearance: TERMINAL, enter: "fade-left" },
    );
  });
  scenes.push(contact);

  return sceneCollection(scenes);
}

function spaceScene(
  name: string,
  transition: InteractiveSceneTransitionType = "zoom",
): InteractiveScene {
  const scene = createInteractiveScene(name, {
    width: TEMPLATE_WIDTH,
    height: TEMPLATE_HEIGHT,
    scrollLength: 1800,
    background: {
      type: "gradient",
      color: "#07051b",
      secondaryColor: "#21104f",
    },
    transition: {
      type: transition,
      duration: 1,
      easing: "ease-in-out",
    },
  });
  scene.ambient.twinkle.enabled = true;
  scene.ambient.twinkle.density = 72;
  scene.ambient.twinkle.speed = 0.75;
  scene.ambient.twinkle.intensity = 72;
  scene.ambient.particles.enabled = true;
  scene.ambient.particles.density = 20;
  scene.ambient.particles.speed = 0.5;
  scene.ambient.particles.intensity = 28;
  scene.ambient.floatingShapes.enabled = true;
  scene.ambient.floatingShapes.density = 12;
  scene.ambient.floatingShapes.speed = 0.35;
  scene.ambient.floatingShapes.intensity = 22;
  scene.ambient.gradientDrift.enabled = true;
  scene.ambient.gradientDrift.speed = 0.45;
  scene.ambient.gradientDrift.intensity = 45;
  scene.ambient.parallax.enabled = true;
  scene.ambient.parallax.intensity = 55;
  return scene;
}

function addOrbitDecoration(scene: InteractiveScene): void {
  shapeObject(scene, "ellipse", 980, 120, 270, 270, {
    fill: "rgba(124,58,237,.12)",
    stroke: "#8b5cf6",
    strokeWidth: 2,
    opacity: 0.78,
    parallaxDepth: -1.1,
    motion: { preset: "spin", speed: 0.35, intensity: 15 },
  });
  shapeObject(scene, "ellipse", 1065, 205, 105, 105, {
    fill: "#7c3aed",
    stroke: "#c4b5fd",
    strokeWidth: 3,
    parallaxDepth: 0.8,
    motion: { preset: "float", speed: 0.6, intensity: 24 },
  });
  shapeObject(scene, "ellipse", 1180, 610, 46, 46, {
    fill: "#ddd6fe",
    stroke: "#ffffff",
    strokeWidth: 2,
    parallaxDepth: 1.6,
    motion: { preset: "bob", speed: 0.55, intensity: 22 },
  });
}

function buildSpaceJourney(data: ResumeData): InteractiveSceneCollection {
  const scenes: InteractiveScene[] = [];
  const intro = spaceScene("Launch");
  addOrbitDecoration(intro);
  textObject(intro, "WELCOME ABOARD", 100, 120, 620, 52, {
    appearance: appearance("plain", {
      textColor: "#c4b5fd",
      accentColor: "#c4b5fd",
    }),
    parallaxDepth: 0.3,
  });
  boundObject(
    intro,
    { source: "personal", field: "fullName" },
    90,
    205,
    780,
    150,
    {
      appearance: SPACE_GLASS,
      enter: "fade-up",
      parallaxDepth: 0.2,
    },
  );
  boundObject(
    intro,
    { source: "personal", field: "summary" },
    90,
    400,
    800,
    210,
    {
      appearance: SPACE_GLASS,
      enter: "fade-up",
      parallaxDepth: 0.1,
    },
  );
  const traveler = shapeObject(intro, "ellipse", 150, 690, 58, 58, {
    fill: "#f5f3ff",
    stroke: "#8b5cf6",
    strokeWidth: 4,
    parallaxDepth: 1.25,
  });
  traveler.motionPath = createInteractiveMotionPath();
  traveler.motionPath.autoRotate = false;
  traveler.motionPath.curve = "smooth";
  traveler.motionPath.points[0].x = 0;
  traveler.motionPath.points[0].y = 0;
  traveler.motionPath.points[1].x = 950;
  traveler.motionPath.points[1].y = -470;
  scenes.push(intro);

  workBindings(data).forEach((binding, index) => {
    const scene = spaceScene(`Orbit ${index + 1}`);
    addOrbitDecoration(scene);
    textObject(
      scene,
      `CAREER ORBIT ${String(index + 1).padStart(2, "0")}`,
      90,
      100,
      600,
      55,
      {
        appearance: appearance("plain", {
          textColor: "#c4b5fd",
          accentColor: "#ffffff",
        }),
        parallaxDepth: -0.2,
      },
    );
    boundObject(
      scene,
      binding,
      160,
      240,
      760,
      370,
      {
        appearance: SPACE_GLASS,
        enter: "fade-up",
        scrollY: [70, -30],
        parallaxDepth: 0.25,
        name: "Career station",
      },
    );

    const shuttle = shapeObject(scene, "ellipse", 1050, 700, 72, 72, {
      fill: "#ffffff",
      stroke: "#a78bfa",
      strokeWidth: 5,
      parallaxDepth: 1.25,
    });
    shuttle.motionPath = createInteractiveMotionPath();
    shuttle.motionPath.autoRotate = false;
    shuttle.motionPath.points[0].x = -70;
    shuttle.motionPath.points[0].y = 0;
    shuttle.motionPath.points.splice(1, 0, {
      id: `${shuttle.id}-mid`,
      progress: 48,
      x: -610,
      y: -430,
    });
    shuttle.motionPath.points[2].x = 120;
    shuttle.motionPath.points[2].y = -500;
    scenes.push(scene);
  });

  chunks(projectBindings(data), 3).forEach((bindings, page) => {
    const scene = spaceScene(
      page ? `Project galaxy ${page + 1}` : "Project galaxy",
    );
    addOrbitDecoration(scene);
    textObject(scene, "PROJECT GALAXY", 90, 95, 600, 58, {
      appearance: appearance("plain", {
        textColor: "#c4b5fd",
      }),
    });
    bindings.forEach((binding, index) => {
      boundObject(
        scene,
        binding,
        100 + index * 420,
        220 + (index === 1 ? 80 : 0),
        380,
        390,
        {
          appearance: SPACE_GLASS,
          enter: "fade-up",
          parallaxDepth: index === 1 ? 0.7 : 0.25,
          name: "Project planet",
        },
      );
    });
    scenes.push(scene);
  });

  const contact = spaceScene("Transmission", "none");
  addOrbitDecoration(contact);
  textObject(contact, "OPEN TRANSMISSION", 95, 140, 640, 65, {
    appearance: appearance("plain", {
      textColor: "#c4b5fd",
    }),
  });
  boundObject(
    contact,
    { source: "personal", field: "email" },
    95,
    255,
    760,
    120,
    {
      appearance: SPACE_GLASS,
      enter: "fade-up",
      parallaxDepth: 0.25,
    },
  );
  boundObject(
    contact,
    { source: "personal", field: "website" },
    95,
    415,
    760,
    110,
    {
      appearance: SPACE_GLASS,
      enter: "fade-up",
      parallaxDepth: 0.4,
    },
  );
  linkBindings(data).slice(0, 3).forEach((binding, index) => {
    boundObject(
      contact,
      binding,
      95,
      565 + index * 88,
      760,
      70,
      {
        appearance: SPACE_GLASS,
        enter: "fade-up",
        parallaxDepth: 0.15 + index * 0.15,
      },
    );
  });
  scenes.push(contact);

  return sceneCollection(scenes);
}

export function getInteractiveTemplateDefinition(
  templateId: string | undefined,
): InteractiveTemplateDefinition | undefined {
  return INTERACTIVE_TEMPLATES.find(
    template => template.id === templateId,
  );
}

export function buildInteractiveTemplate(
  data: ResumeData,
  templateId: InteractiveTemplateId,
): InteractiveSceneCollection {
  if (templateId === "career-journey") {
    return buildCareerJourney(data);
  }
  if (templateId === "terminal") {
    return buildTerminal(data);
  }
  if (templateId === "space-journey") {
    return buildSpaceJourney(data);
  }
  return buildMinimalMotion(data);
}

/**
 * Maps Phase 18's old single template ID to the real Phase 26 template.
 */
export function normalizeInteractiveTemplateId(
  value: string | undefined,
): InteractiveTemplateId | undefined {
  if (value === "career-journey-starter") return "career-journey";
  if (
    value === "minimal-motion" ||
    value === "career-journey" ||
    value === "terminal" ||
    value === "space-journey"
  ) {
    return value;
  }
  return undefined;
}
