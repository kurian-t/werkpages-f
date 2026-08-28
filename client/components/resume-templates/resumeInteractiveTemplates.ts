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
  | "space-journey"
  | "underwater"
  | "sky-balloon"
  | "desktop-workspace"
  | "creative-office"
  | "executive"
  | "editorial"
  | "split-screen"
  | "swiss-grid"
  | "career-timeline"
  | "case-study"
  | "command-center"
  | "blueprint"
  | "magazine"
  | "bold-typography"
  | "aurora"
  | "pitch-deck"
  | "city-lights"
  | "scrapbook"
  | "retro-arcade"
  | "newspaper"
  | "botanical-greenhouse"
  | "library-stacks"
  | "museum-gallery"
  | "mountain-expedition"
  | "desert-roadtrip"
  | "train-journey"
  | "airport-departures"
  | "recording-studio"
  | "cinema-credits"
  | "comic-book"
  | "science-lab"
  | "detective-board"
  | "atlas-explorer"
  | "airmail"
  | "construction-site"
  | "coffee-shop"
  | "zen-garden"
  | "chess-strategy"
  | "neon-subway"
  | "weather-station";

export type InteractiveTemplateCategory =
  | "Professional"
  | "Story"
  | "Tech"
  | "Creative"
  | "Immersive"
  | "Presentation";

export interface InteractiveTemplateDefinition {
  id: InteractiveTemplateId;
  name: string;
  description: string;
  mood: string;
  category: InteractiveTemplateCategory;
  motionLevel: "Subtle" | "Story" | "Dynamic";
  bestFor: string;
  tags: string[];
  preview:
    | "minimal"
    | "journey"
    | "terminal"
    | "space"
    | "underwater"
    | "balloon"
    | "desktop"
    | "office"
    | "executive"
    | "editorial"
    | "split"
    | "swiss"
    | "timeline"
    | "case-study"
    | "command"
    | "blueprint"
    | "magazine"
    | "bold"
    | "aurora"
    | "deck"
    | "city"
    | "scrapbook"
    | "arcade"
    | "newspaper"
    | "greenhouse"
    | "library"
    | "museum"
    | "mountain"
    | "desert"
    | "train"
    | "airport"
    | "studio"
    | "cinema"
    | "comic"
    | "lab"
    | "detective"
    | "atlas"
    | "airmail"
    | "construction"
    | "coffee"
    | "zen"
    | "chess"
    | "subway"
    | "weather";
}

export const INTERACTIVE_TEMPLATES: InteractiveTemplateDefinition[] = [
  {
    id: "minimal-motion",
    name: "Minimal Motion",
    description: "Clean portfolio scenes with restrained fades, gentle movement and plenty of breathing room.",
    mood: "Polished & calm",
    category: "Professional",
    motionLevel: "Subtle",
    bestFor: "Most professional roles",
    tags: ["minimal", "clean", "professional"],
    preview: "minimal",
  },
  {
    id: "career-journey",
    name: "Career Journey",
    description: "One career chapter at a time, with pinned storytelling, milestones and directional transitions.",
    mood: "Narrative & visual",
    category: "Story",
    motionLevel: "Story",
    bestFor: "Experienced candidates",
    tags: ["career", "story", "chapters"],
    preview: "journey",
  },
  {
    id: "terminal",
    name: "Terminal",
    description: "A dark command-line inspired experience built from the same live resume records.",
    mood: "Technical & focused",
    category: "Tech",
    motionLevel: "Subtle",
    bestFor: "Engineering & technical roles",
    tags: ["terminal", "developer", "code"],
    preview: "terminal",
  },
  {
    id: "space-journey",
    name: "Space Journey",
    description: "A playful scroll journey with stars, depth, motion paths and glass-like content stations.",
    mood: "Playful & immersive",
    category: "Immersive",
    motionLevel: "Dynamic",
    bestFor: "Creative / standout portfolios",
    tags: ["space", "immersive", "parallax"],
    preview: "space",
  },
  {
    id: "underwater",
    name: "Underwater",
    description: "Dive through deep-ocean scenes where resume cards float like glass panels among bubbles and currents.",
    mood: "Calm & cinematic",
    category: "Immersive",
    motionLevel: "Dynamic",
    bestFor: "Creative, design & standout portfolios",
    tags: ["ocean", "underwater", "blue", "immersive"],
    preview: "underwater",
  },
  {
    id: "sky-balloon",
    name: "Sky Balloon",
    description: "A bright journey through clouds with a hot-air balloon carrying visitors from chapter to chapter.",
    mood: "Optimistic & airy",
    category: "Immersive",
    motionLevel: "Story",
    bestFor: "Friendly personal brands & storytellers",
    tags: ["balloon", "sky", "clouds", "journey"],
    preview: "balloon",
  },
  {
    id: "desktop-workspace",
    name: "Desktop Workspace",
    description: "Your resume becomes a polished computer desktop with floating windows, folders and app-like panels.",
    mood: "Clever & productive",
    category: "Tech",
    motionLevel: "Story",
    bestFor: "Product, engineering & digital roles",
    tags: ["desktop", "computer", "windows", "productivity"],
    preview: "desktop",
  },
  {
    id: "creative-office",
    name: "Creative Office",
    description: "A warm studio-office scene with desk cards, sticky-note details and a wall of career work.",
    mood: "Human & inviting",
    category: "Creative",
    motionLevel: "Subtle",
    bestFor: "Design, marketing & collaborative roles",
    tags: ["office", "studio", "warm", "creative"],
    preview: "office",
  },
  {
    id: "executive",
    name: "Executive",
    description: "A refined leadership presentation with deep navy, warm gold and measured transitions.",
    mood: "Confident & premium",
    category: "Professional",
    motionLevel: "Subtle",
    bestFor: "Leadership, strategy & senior roles",
    tags: ["executive", "leadership", "premium"],
    preview: "executive",
  },
  {
    id: "editorial",
    name: "Editorial",
    description: "Magazine-inspired columns, oversized section labels and elegant page-like scene changes.",
    mood: "Elegant & articulate",
    category: "Professional",
    motionLevel: "Subtle",
    bestFor: "Communications, consulting & design",
    tags: ["editorial", "magazine", "columns"],
    preview: "editorial",
  },
  {
    id: "split-screen",
    name: "Split Screen",
    description: "Bold two-sided compositions alternate resume content and color as each scene advances.",
    mood: "Modern & directional",
    category: "Professional",
    motionLevel: "Story",
    bestFor: "Product, marketing & modern portfolios",
    tags: ["split", "two-column", "modern"],
    preview: "split",
  },
  {
    id: "swiss-grid",
    name: "Swiss Grid",
    description: "A crisp modular system with strict alignment, graphic red accents and restrained motion.",
    mood: "Structured & graphic",
    category: "Professional",
    motionLevel: "Subtle",
    bestFor: "Architecture, design & analytical roles",
    tags: ["swiss", "grid", "structured"],
    preview: "swiss",
  },
  {
    id: "career-timeline",
    name: "Career Timeline",
    description: "A horizontal visual timeline turns each role into a milestone visitors move through in sequence.",
    mood: "Clear & chronological",
    category: "Story",
    motionLevel: "Story",
    bestFor: "Long or progressive career histories",
    tags: ["timeline", "career", "milestones"],
    preview: "timeline",
  },
  {
    id: "case-study",
    name: "Case Study",
    description: "Project-first storytelling frames your work like polished case studies with numbered chapters.",
    mood: "Strategic & evidence-led",
    category: "Story",
    motionLevel: "Story",
    bestFor: "Product, UX, consulting & portfolio roles",
    tags: ["case study", "projects", "portfolio"],
    preview: "case-study",
  },
  {
    id: "command-center",
    name: "Command Center",
    description: "A futuristic operations dashboard with radar-like elements, status cards and live-console energy.",
    mood: "Technical & cinematic",
    category: "Tech",
    motionLevel: "Dynamic",
    bestFor: "Engineering, data, security & platform roles",
    tags: ["dashboard", "radar", "systems", "tech"],
    preview: "command",
  },
  {
    id: "blueprint",
    name: "Blueprint",
    description: "An architectural blueprint aesthetic maps experience and projects onto a precise technical canvas.",
    mood: "Precise & inventive",
    category: "Tech",
    motionLevel: "Subtle",
    bestFor: "Engineering, architecture & technical design",
    tags: ["blueprint", "technical", "grid"],
    preview: "blueprint",
  },
  {
    id: "magazine",
    name: "Magazine",
    description: "A glossy feature-story layout mixes bold mastheads, offset cards and editorial pacing.",
    mood: "Stylish & expressive",
    category: "Creative",
    motionLevel: "Story",
    bestFor: "Creative direction, media & personal brands",
    tags: ["magazine", "feature", "editorial"],
    preview: "magazine",
  },
  {
    id: "bold-typography",
    name: "Bold Typography",
    description: "Huge type becomes the visual system, with content layered into oversized statements and kinetic blocks.",
    mood: "Loud & confident",
    category: "Creative",
    motionLevel: "Dynamic",
    bestFor: "Design, branding & standout creative work",
    tags: ["typography", "bold", "kinetic"],
    preview: "bold",
  },
  {
    id: "aurora",
    name: "Aurora",
    description: "Soft luminous bands drift across a dark sky while glass resume cards hover in layered depth.",
    mood: "Dreamy & modern",
    category: "Immersive",
    motionLevel: "Dynamic",
    bestFor: "Creative tech & premium portfolios",
    tags: ["aurora", "gradient", "glass", "night"],
    preview: "aurora",
  },
  {
    id: "pitch-deck",
    name: "Pitch Deck",
    description: "A clean presentation-style resume where every scene lands like a polished slide in a personal deck.",
    mood: "Direct & persuasive",
    category: "Presentation",
    motionLevel: "Story",
    bestFor: "Leadership, founders, sales & consulting",
    tags: ["deck", "slides", "presentation"],
    preview: "deck",
  },
  {
    id: "city-lights",
    name: "City Lights",
    description: "A night skyline frames your career as illuminated towers, windows and glowing content panels.",
    mood: "Urban & cinematic",
    category: "Immersive",
    motionLevel: "Dynamic",
    bestFor: "Modern professional & creative portfolios",
    tags: ["city", "night", "skyline", "lights"],
    preview: "city",
  },
  {
    id: "scrapbook",
    name: "Scrapbook",
    description: "Layered paper, tape-like accents and tilted cards create a personal visual journal of your work.",
    mood: "Personal & handmade",
    category: "Creative",
    motionLevel: "Story",
    bestFor: "Artists, creators, education & community work",
    tags: ["scrapbook", "collage", "personal"],
    preview: "scrapbook",
  },
  {
    id: "retro-arcade",
    name: "Retro Arcade",
    description: "Neon panels and game-like chapter screens turn your resume into a playful career quest.",
    mood: "Playful & energetic",
    category: "Creative",
    motionLevel: "Dynamic",
    bestFor: "Game, entertainment & bold tech portfolios",
    tags: ["arcade", "retro", "neon", "game"],
    preview: "arcade",
  },
  {
    id: "newspaper",
    name: "Newspaper",
    description: "Classic mastheads, rules and multi-column stories make your career read like the front page.",
    mood: "Distinctive & editorial",
    category: "Creative",
    motionLevel: "Subtle",
    bestFor: "Writing, media, policy & communications",
    tags: ["newspaper", "print", "columns"],
    preview: "newspaper",
  },

  {
    id: "botanical-greenhouse",
    name: "Botanical Greenhouse",
    description: "A sunlit glasshouse where leafy frames, greenhouse panes and growing vines turn your career into a living portfolio.",
    mood: "Fresh & organic",
    category: "Creative",
    motionLevel: "Story",
    bestFor: "Sustainability, wellness, design & people-centered brands",
    tags: ["greenhouse", "botanical", "plants", "garden"],
    preview: "greenhouse",
  },
  {
    id: "library-stacks",
    name: "Library Stacks",
    description: "Warm shelves, book-spine dividers and reading-card layouts present your experience like a carefully curated personal archive.",
    mood: "Thoughtful & scholarly",
    category: "Professional",
    motionLevel: "Subtle",
    bestFor: "Research, education, writing, policy & knowledge work",
    tags: ["library", "books", "archive", "academic"],
    preview: "library",
  },
  {
    id: "museum-gallery",
    name: "Museum Gallery",
    description: "White-wall gallery scenes frame each role and project like an exhibition, with placards, pedestals and generous negative space.",
    mood: "Curated & refined",
    category: "Creative",
    motionLevel: "Subtle",
    bestFor: "Art, architecture, design, curation & premium portfolios",
    tags: ["museum", "gallery", "exhibition", "minimal"],
    preview: "museum",
  },
  {
    id: "mountain-expedition",
    name: "Mountain Expedition",
    description: "A layered mountain ascent turns career chapters into camps, summits and trail markers that rise as visitors scroll.",
    mood: "Adventurous & determined",
    category: "Story",
    motionLevel: "Dynamic",
    bestFor: "Leadership, growth stories, outdoors & ambitious career narratives",
    tags: ["mountain", "expedition", "trail", "summit"],
    preview: "mountain",
  },
  {
    id: "desert-roadtrip",
    name: "Desert Road Trip",
    description: "Sunset desert scenes, a winding road and roadside career stops create a warm, cinematic journey through your work.",
    mood: "Cinematic & free",
    category: "Story",
    motionLevel: "Dynamic",
    bestFor: "Creators, storytellers, travel, hospitality & personal brands",
    tags: ["desert", "roadtrip", "sunset", "journey"],
    preview: "desert",
  },
  {
    id: "train-journey",
    name: "Train Journey",
    description: "Carriage windows, route lines and station stops move visitors through your career like a polished rail journey.",
    mood: "Classic & directional",
    category: "Story",
    motionLevel: "Story",
    bestFor: "Progressive careers, operations, logistics & long-form storytelling",
    tags: ["train", "rail", "stations", "journey"],
    preview: "train",
  },
  {
    id: "airport-departures",
    name: "Airport Departures",
    description: "Departure-board typography, gate cards and runway markings turn experience into destinations, routes and next-step momentum.",
    mood: "Global & energetic",
    category: "Presentation",
    motionLevel: "Story",
    bestFor: "International, consulting, travel, sales & globally minded roles",
    tags: ["airport", "departures", "travel", "global"],
    preview: "airport",
  },
  {
    id: "recording-studio",
    name: "Recording Studio",
    description: "A dark studio desk with equalizer bars, track lanes and glowing meters makes your work feel like a carefully mixed production.",
    mood: "Creative & rhythmic",
    category: "Creative",
    motionLevel: "Dynamic",
    bestFor: "Music, media, production, creators & energetic tech portfolios",
    tags: ["studio", "audio", "music", "equalizer"],
    preview: "studio",
  },
  {
    id: "cinema-credits",
    name: "Cinema Credits",
    description: "Your career plays like a film: widescreen frames, title cards, scene credits and dramatic project spotlights.",
    mood: "Dramatic & cinematic",
    category: "Presentation",
    motionLevel: "Story",
    bestFor: "Film, media, creative direction, production & memorable portfolios",
    tags: ["cinema", "film", "credits", "widescreen"],
    preview: "cinema",
  },
  {
    id: "comic-book",
    name: "Comic Book",
    description: "Bold panels, caption boxes and speech-bubble shapes turn each career chapter into an energetic illustrated page.",
    mood: "Playful & bold",
    category: "Creative",
    motionLevel: "Dynamic",
    bestFor: "Illustration, games, entertainment, education & personality-forward resumes",
    tags: ["comic", "panels", "illustration", "playful"],
    preview: "comic",
  },
  {
    id: "science-lab",
    name: "Science Lab",
    description: "Clinical panels, specimen circles, measurement marks and experiment cards give your resume a crisp research-lab identity.",
    mood: "Curious & precise",
    category: "Tech",
    motionLevel: "Story",
    bestFor: "Science, biotech, healthcare research, data & engineering",
    tags: ["lab", "science", "research", "experiment"],
    preview: "lab",
  },
  {
    id: "detective-board",
    name: "Detective Board",
    description: "Pinned notes, red connection lines and evidence-card layouts make your projects feel like clues in a career case file.",
    mood: "Investigative & clever",
    category: "Creative",
    motionLevel: "Story",
    bestFor: "Research, security, journalism, strategy & unconventional portfolios",
    tags: ["detective", "case board", "evidence", "investigation"],
    preview: "detective",
  },
  {
    id: "atlas-explorer",
    name: "Atlas Explorer",
    description: "Map-grid lines, compass marks and expedition cards turn your resume into a professional atlas of places, projects and progress.",
    mood: "Exploratory & worldly",
    category: "Story",
    motionLevel: "Story",
    bestFor: "Travel, international work, field research, NGOs & broad career journeys",
    tags: ["atlas", "map", "explorer", "compass"],
    preview: "atlas",
  },
  {
    id: "airmail",
    name: "Airmail",
    description: "Postcards, envelope edges, stamps and blue-red airmail stripes create a charming correspondence-inspired resume journey.",
    mood: "Personal & nostalgic",
    category: "Creative",
    motionLevel: "Subtle",
    bestFor: "Communications, travel, community, writing & personal brands",
    tags: ["airmail", "postcard", "mail", "letter"],
    preview: "airmail",
  },
  {
    id: "construction-site",
    name: "Construction Site",
    description: "Scaffold lines, safety stripes and structural cards build your experience into an industrial, progress-driven scene.",
    mood: "Strong & practical",
    category: "Tech",
    motionLevel: "Story",
    bestFor: "Engineering, construction, operations, manufacturing & project delivery",
    tags: ["construction", "industrial", "scaffold", "build"],
    preview: "construction",
  },
  {
    id: "coffee-shop",
    name: "Coffee Shop",
    description: "A cozy café counter, menu-board headings and warm card surfaces create an approachable, conversational portfolio.",
    mood: "Warm & personable",
    category: "Creative",
    motionLevel: "Subtle",
    bestFor: "Hospitality, community, customer experience, marketing & friendly brands",
    tags: ["coffee", "cafe", "warm", "menu"],
    preview: "coffee",
  },
  {
    id: "zen-garden",
    name: "Zen Garden",
    description: "Minimal stone forms, raked-line patterns and quiet asymmetry create an unusually calm, spacious interactive resume.",
    mood: "Calm & intentional",
    category: "Professional",
    motionLevel: "Subtle",
    bestFor: "Leadership, wellness, design, consulting & minimalist personal brands",
    tags: ["zen", "garden", "minimal", "calm"],
    preview: "zen",
  },
  {
    id: "chess-strategy",
    name: "Chess Strategy",
    description: "A sophisticated board motif frames roles as strategic moves, projects as positions and skills as pieces in play.",
    mood: "Strategic & sharp",
    category: "Professional",
    motionLevel: "Story",
    bestFor: "Strategy, finance, consulting, leadership & analytical roles",
    tags: ["chess", "strategy", "board", "leadership"],
    preview: "chess",
  },
  {
    id: "neon-subway",
    name: "Neon Subway",
    description: "A dark station map, glowing route lines and platform-sign cards make your career feel like a fast urban transit system.",
    mood: "Urban & electric",
    category: "Immersive",
    motionLevel: "Dynamic",
    bestFor: "Tech, nightlife, media, urban design & bold modern portfolios",
    tags: ["subway", "metro", "neon", "urban"],
    preview: "subway",
  },
  {
    id: "weather-station",
    name: "Weather Station",
    description: "Forecast cards, sky symbols and changing atmospheric bands turn experience into a bright, data-like career outlook.",
    mood: "Bright & informative",
    category: "Presentation",
    motionLevel: "Story",
    bestFor: "Data, communications, science, product & friendly professional portfolios",
    tags: ["weather", "forecast", "sky", "data"],
    preview: "weather",
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
    rotation?: number;
    enter?: "fade-up" | "fade-left" | "fade" | "none";
    scrollY?: [number, number];
    scrollX?: [number, number];
  },
): InteractiveSceneObject {
  const base = createInteractiveObject("resume-content", {
    name: options?.name ?? "Shared resume content",
    geometry: {
      x,
      y,
      width,
      height,
      rotation: options?.rotation ?? 0,
    },
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
  textObject(intro, "HELLO - THIS IS MY WORK", 120, 150, 620, 48, {
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


type ConceptTemplateId = Exclude<
  InteractiveTemplateId,
  "minimal-motion" | "career-journey" | "terminal" | "space-journey"
>;

type ConceptAmbient =
  | "none"
  | "float"
  | "particles"
  | "gradient"
  | "parallax"
  | "twinkle";

interface ConceptRecipe {
  id: ConceptTemplateId;
  eyebrow: string;
  experienceTitle: string;
  projectTitle: string;
  skillsTitle: string;
  contactTitle: string;
  background: string;
  secondary: string;
  surface: string;
  text: string;
  accent: string;
  border: string;
  variant: InteractiveObjectAppearance["variant"];
  radius: number;
  transition: InteractiveSceneTransitionType;
  scrollLength: number;
  ambient: ConceptAmbient;
  fontFamily?: string;
}

interface ConceptSlot {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}

const CONCEPT_RECIPES: Record<ConceptTemplateId, ConceptRecipe> = {
  underwater: {
    id: "underwater",
    eyebrow: "DIVE LOG",
    experienceTitle: "CAREER DEPTHS",
    projectTitle: "DISCOVERIES",
    skillsTitle: "EQUIPMENT",
    contactTitle: "SURFACE SIGNAL",
    background: "#052b46",
    secondary: "#0a6075",
    surface: "rgba(7,57,79,.72)",
    text: "#ecfeff",
    accent: "#67e8f9",
    border: "rgba(165,243,252,.42)",
    variant: "glass",
    radius: 28,
    transition: "fade",
    scrollLength: 1700,
    ambient: "particles",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  "sky-balloon": {
    id: "sky-balloon",
    eyebrow: "UP & AWAY",
    experienceTitle: "STOPS ALONG THE WAY",
    projectTitle: "PLACES I BUILT",
    skillsTitle: "WHAT I CARRY",
    contactTitle: "NEXT DESTINATION",
    background: "#dff4ff",
    secondary: "#f7fbff",
    surface: "rgba(255,255,255,.86)",
    text: "#15324b",
    accent: "#ef8354",
    border: "#b8dff0",
    variant: "card",
    radius: 30,
    transition: "slide-up",
    scrollLength: 1450,
    ambient: "float",
    fontFamily: "Avenir Next, Inter, system-ui, sans-serif",
  },
  "desktop-workspace": {
    id: "desktop-workspace",
    eyebrow: "MY DESKTOP",
    experienceTitle: "EXPERIENCE.APP",
    projectTitle: "PROJECTS",
    skillsTitle: "TOOLS",
    contactTitle: "CONTACT.EXE",
    background: "#dfe8f4",
    secondary: "#b8c7db",
    surface: "#f8fbff",
    text: "#1e2a3a",
    accent: "#4f46e5",
    border: "#aab9cc",
    variant: "card",
    radius: 14,
    transition: "fade",
    scrollLength: 1200,
    ambient: "none",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  "creative-office": {
    id: "creative-office",
    eyebrow: "STUDIO NOTES",
    experienceTitle: "WORK WALL",
    projectTitle: "PINNED PROJECTS",
    skillsTitle: "DESK DRAWER",
    contactTitle: "DROP BY",
    background: "#f3e7d7",
    secondary: "#e3c7a7",
    surface: "#fffaf2",
    text: "#3d2b1f",
    accent: "#c4623d",
    border: "#d7b48e",
    variant: "card",
    radius: 18,
    transition: "fade",
    scrollLength: 1250,
    ambient: "float",
    fontFamily: "Trebuchet MS, Inter, system-ui, sans-serif",
  },
  executive: {
    id: "executive",
    eyebrow: "LEADERSHIP PROFILE",
    experienceTitle: "LEADERSHIP EXPERIENCE",
    projectTitle: "SELECTED IMPACT",
    skillsTitle: "CORE CAPABILITIES",
    contactTitle: "CONNECT",
    background: "#0f1b2d",
    secondary: "#16243a",
    surface: "#17263d",
    text: "#f7f1e5",
    accent: "#d8b26e",
    border: "#5b4a2f",
    variant: "accent",
    radius: 10,
    transition: "fade",
    scrollLength: 1050,
    ambient: "gradient",
    fontFamily: "Georgia, Times New Roman, serif",
  },
  editorial: {
    id: "editorial",
    eyebrow: "PROFILE / ISSUE 01",
    experienceTitle: "CAREER NOTES",
    projectTitle: "SELECTED WORK",
    skillsTitle: "INDEX",
    contactTitle: "COLOPHON",
    background: "#f8f3ea",
    secondary: "#eee5d8",
    surface: "#fffdf8",
    text: "#1f1b18",
    accent: "#a63b32",
    border: "#c9bfb0",
    variant: "plain",
    radius: 0,
    transition: "slide-left",
    scrollLength: 1150,
    ambient: "none",
    fontFamily: "Georgia, Times New Roman, serif",
  },
  "split-screen": {
    id: "split-screen",
    eyebrow: "TWO SIDES / ONE STORY",
    experienceTitle: "EXPERIENCE",
    projectTitle: "PROJECTS",
    skillsTitle: "SKILLS",
    contactTitle: "LET'S TALK",
    background: "#201333",
    secondary: "#f4edfb",
    surface: "#ffffff",
    text: "#201333",
    accent: "#8b5cf6",
    border: "#d7c9eb",
    variant: "card",
    radius: 18,
    transition: "slide-left",
    scrollLength: 1350,
    ambient: "parallax",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  "swiss-grid": {
    id: "swiss-grid",
    eyebrow: "CURRICULUM VITAE",
    experienceTitle: "01 / EXPERIENCE",
    projectTitle: "02 / PROJECTS",
    skillsTitle: "03 / SKILLS",
    contactTitle: "04 / CONTACT",
    background: "#f5f5f0",
    secondary: "#ecece6",
    surface: "#ffffff",
    text: "#151515",
    accent: "#e23b31",
    border: "#b8b8b0",
    variant: "plain",
    radius: 0,
    transition: "fade",
    scrollLength: 1000,
    ambient: "none",
    fontFamily: "Helvetica Neue, Arial, sans-serif",
  },
  "career-timeline": {
    id: "career-timeline",
    eyebrow: "CAREER TIMELINE",
    experienceTitle: "MILESTONES",
    projectTitle: "SIDE QUESTS",
    skillsTitle: "TOOLKIT",
    contactTitle: "NEXT MILESTONE",
    background: "#fff9f1",
    secondary: "#f5eadc",
    surface: "#ffffff",
    text: "#3b2a22",
    accent: "#d97706",
    border: "#edd4b6",
    variant: "card",
    radius: 20,
    transition: "slide-left",
    scrollLength: 1600,
    ambient: "float",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  "case-study": {
    id: "case-study",
    eyebrow: "PORTFOLIO / CASE FILES",
    experienceTitle: "CONTEXT",
    projectTitle: "CASE STUDIES",
    skillsTitle: "METHODS",
    contactTitle: "START A CONVERSATION",
    background: "#f4f6f8",
    secondary: "#e8edf2",
    surface: "#ffffff",
    text: "#15212d",
    accent: "#0f766e",
    border: "#c9d7d6",
    variant: "card",
    radius: 16,
    transition: "fade",
    scrollLength: 1300,
    ambient: "none",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  "command-center": {
    id: "command-center",
    eyebrow: "SYSTEM ONLINE",
    experienceTitle: "MISSION HISTORY",
    projectTitle: "ACTIVE SYSTEMS",
    skillsTitle: "CAPABILITIES",
    contactTitle: "OPEN CHANNEL",
    background: "#07131e",
    secondary: "#102737",
    surface: "rgba(9,34,49,.88)",
    text: "#d9fbff",
    accent: "#22d3ee",
    border: "#164e63",
    variant: "glass",
    radius: 12,
    transition: "zoom",
    scrollLength: 1700,
    ambient: "particles",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  blueprint: {
    id: "blueprint",
    eyebrow: "DRAWING NO. 01",
    experienceTitle: "CAREER SCHEMATIC",
    projectTitle: "BUILD DETAILS",
    skillsTitle: "SPECIFICATIONS",
    contactTitle: "REVISION / CONTACT",
    background: "#0d4d78",
    secondary: "#0b3e62",
    surface: "rgba(9,57,89,.62)",
    text: "#f0fbff",
    accent: "#8ee5ff",
    border: "#7acbe6",
    variant: "plain",
    radius: 0,
    transition: "fade",
    scrollLength: 1200,
    ambient: "none",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  magazine: {
    id: "magazine",
    eyebrow: "THE CAREER EDIT",
    experienceTitle: "THE FEATURE",
    projectTitle: "PORTFOLIO PICKS",
    skillsTitle: "THE SHORT LIST",
    contactTitle: "BACK PAGE",
    background: "#fff5f3",
    secondary: "#f2d7d1",
    surface: "#fffdfc",
    text: "#201c1c",
    accent: "#ec4899",
    border: "#efc2d6",
    variant: "card",
    radius: 6,
    transition: "slide-left",
    scrollLength: 1350,
    ambient: "float",
    fontFamily: "Georgia, Times New Roman, serif",
  },
  "bold-typography": {
    id: "bold-typography",
    eyebrow: "MAKE IT LARGE",
    experienceTitle: "WORK.",
    projectTitle: "BUILD.",
    skillsTitle: "KNOW.",
    contactTitle: "TALK.",
    background: "#f4ff3f",
    secondary: "#ff6b2c",
    surface: "#111111",
    text: "#ffffff",
    accent: "#111111",
    border: "#111111",
    variant: "plain",
    radius: 0,
    transition: "zoom",
    scrollLength: 1500,
    ambient: "parallax",
    fontFamily: "Arial Black, Impact, sans-serif",
  },
  aurora: {
    id: "aurora",
    eyebrow: "NORTHERN LIGHTS",
    experienceTitle: "CAREER CONSTELLATIONS",
    projectTitle: "LUMINOUS WORK",
    skillsTitle: "SIGNALS",
    contactTitle: "FIND ME",
    background: "#071925",
    secondary: "#102039",
    surface: "rgba(13,30,45,.58)",
    text: "#f3f8ff",
    accent: "#79f2c0",
    border: "rgba(121,242,192,.34)",
    variant: "glass",
    radius: 24,
    transition: "fade",
    scrollLength: 1650,
    ambient: "gradient",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  "pitch-deck": {
    id: "pitch-deck",
    eyebrow: "PERSONAL DECK",
    experienceTitle: "WHY ME",
    projectTitle: "PROOF",
    skillsTitle: "WHAT I BRING",
    contactTitle: "LET'S BUILD",
    background: "#fbfaf7",
    secondary: "#efeee9",
    surface: "#ffffff",
    text: "#171717",
    accent: "#2e0562",
    border: "#ddd8e4",
    variant: "card",
    radius: 18,
    transition: "slide-left",
    scrollLength: 900,
    ambient: "none",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  "city-lights": {
    id: "city-lights",
    eyebrow: "NIGHT SHIFT",
    experienceTitle: "CAREER SKYLINE",
    projectTitle: "LIT-UP PROJECTS",
    skillsTitle: "CITY SIGNALS",
    contactTitle: "MEET DOWNTOWN",
    background: "#07111f",
    secondary: "#101d32",
    surface: "rgba(11,24,43,.86)",
    text: "#f8fbff",
    accent: "#fbbf24",
    border: "#2b3e59",
    variant: "glass",
    radius: 16,
    transition: "slide-up",
    scrollLength: 1600,
    ambient: "twinkle",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  scrapbook: {
    id: "scrapbook",
    eyebrow: "MY WORKBOOK",
    experienceTitle: "WHERE I'VE BEEN",
    projectTitle: "THINGS I'VE MADE",
    skillsTitle: "BITS & PIECES",
    contactTitle: "WRITE ME",
    background: "#efe5d1",
    secondary: "#e0d2b6",
    surface: "#fffdf7",
    text: "#342b24",
    accent: "#db6f55",
    border: "#c8b999",
    variant: "card",
    radius: 4,
    transition: "fade",
    scrollLength: 1400,
    ambient: "float",
    fontFamily: "Trebuchet MS, Comic Sans MS, cursive",
  },
  "retro-arcade": {
    id: "retro-arcade",
    eyebrow: "PLAYER ONE",
    experienceTitle: "CAREER LEVELS",
    projectTitle: "BONUS STAGES",
    skillsTitle: "POWER-UPS",
    contactTitle: "CONTINUE?",
    background: "#120522",
    secondary: "#21073a",
    surface: "#1f0a34",
    text: "#f8f2ff",
    accent: "#ff4fd8",
    border: "#7c3aed",
    variant: "terminal",
    radius: 8,
    transition: "zoom",
    scrollLength: 1500,
    ambient: "particles",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  },

  "botanical-greenhouse": {
    id: "botanical-greenhouse",
    eyebrow: "GROWTH HOUSE",
    experienceTitle: "CAREER GROWTH",
    projectTitle: "WHAT I'VE CULTIVATED",
    skillsTitle: "ROOT SYSTEM",
    contactTitle: "KEEP GROWING",
    background: "#e9f1df",
    secondary: "#c9ddbd",
    surface: "rgba(250,253,244,.88)",
    text: "#223125",
    accent: "#4f7d4a",
    border: "#9fba92",
    variant: "glass",
    radius: 24,
    transition: "fade",
    scrollLength: 1450,
    ambient: "float",
    fontFamily: "Avenir Next, Inter, system-ui, sans-serif",
  },
  "library-stacks": {
    id: "library-stacks",
    eyebrow: "PERSONAL ARCHIVE",
    experienceTitle: "CAREER VOLUMES",
    projectTitle: "SELECTED EDITIONS",
    skillsTitle: "REFERENCE SHELF",
    contactTitle: "CHECK OUT / CONNECT",
    background: "#3b2b25",
    secondary: "#5a4034",
    surface: "#f7efe1",
    text: "#2c201b",
    accent: "#9b3d2f",
    border: "#c8aa82",
    variant: "card",
    radius: 8,
    transition: "slide-left",
    scrollLength: 1200,
    ambient: "none",
    fontFamily: "Georgia, Times New Roman, serif",
  },
  "museum-gallery": {
    id: "museum-gallery",
    eyebrow: "EXHIBITION 01",
    experienceTitle: "CAREER COLLECTION",
    projectTitle: "FEATURED WORKS",
    skillsTitle: "CATALOGUE",
    contactTitle: "VISITOR BOOK",
    background: "#f4f1eb",
    secondary: "#e7e1d7",
    surface: "#fffdfa",
    text: "#1e1c19",
    accent: "#8a6742",
    border: "#d5cec2",
    variant: "plain",
    radius: 2,
    transition: "fade",
    scrollLength: 1050,
    ambient: "none",
    fontFamily: "Georgia, Times New Roman, serif",
  },
  "mountain-expedition": {
    id: "mountain-expedition",
    eyebrow: "EXPEDITION LOG",
    experienceTitle: "ASCENT",
    projectTitle: "SUMMITS",
    skillsTitle: "GEAR",
    contactTitle: "NEXT TRAIL",
    background: "#c9d8df",
    secondary: "#f0c78d",
    surface: "rgba(248,248,243,.84)",
    text: "#26343a",
    accent: "#cc6b3d",
    border: "#9aaeb5",
    variant: "card",
    radius: 18,
    transition: "slide-up",
    scrollLength: 1700,
    ambient: "parallax",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  "desert-roadtrip": {
    id: "desert-roadtrip",
    eyebrow: "OPEN ROAD",
    experienceTitle: "MILES BEHIND ME",
    projectTitle: "ROADSIDE BUILDS",
    skillsTitle: "PACKED FOR THE TRIP",
    contactTitle: "WHERE TO NEXT",
    background: "#f3c68e",
    secondary: "#d98058",
    surface: "rgba(255,245,224,.90)",
    text: "#4c2e22",
    accent: "#b54f32",
    border: "#d9a06c",
    variant: "card",
    radius: 20,
    transition: "slide-left",
    scrollLength: 1650,
    ambient: "parallax",
    fontFamily: "Trebuchet MS, Inter, system-ui, sans-serif",
  },
  "train-journey": {
    id: "train-journey",
    eyebrow: "NOW BOARDING",
    experienceTitle: "CAREER STATIONS",
    projectTitle: "EXPRESS PROJECTS",
    skillsTitle: "ONBOARD KIT",
    contactTitle: "NEXT CONNECTION",
    background: "#183a36",
    secondary: "#d8c6a3",
    surface: "#f5ead8",
    text: "#26312d",
    accent: "#b4513b",
    border: "#b9a17d",
    variant: "card",
    radius: 12,
    transition: "slide-left",
    scrollLength: 1450,
    ambient: "float",
    fontFamily: "Georgia, Times New Roman, serif",
  },
  "airport-departures": {
    id: "airport-departures",
    eyebrow: "DEPARTURES",
    experienceTitle: "CAREER ROUTES",
    projectTitle: "DESTINATIONS BUILT",
    skillsTitle: "CARRY-ON",
    contactTitle: "NEXT FLIGHT",
    background: "#e8eef4",
    secondary: "#c7d6e5",
    surface: "#ffffff",
    text: "#172331",
    accent: "#1769aa",
    border: "#a7bfd3",
    variant: "card",
    radius: 10,
    transition: "slide-left",
    scrollLength: 1250,
    ambient: "none",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  "recording-studio": {
    id: "recording-studio",
    eyebrow: "SESSION 01",
    experienceTitle: "CAREER TRACKS",
    projectTitle: "MIXED PROJECTS",
    skillsTitle: "CHANNEL STRIP",
    contactTitle: "OPEN MIC",
    background: "#111318",
    secondary: "#262a33",
    surface: "#1c2027",
    text: "#f5f2ea",
    accent: "#f59e0b",
    border: "#4d5664",
    variant: "terminal",
    radius: 10,
    transition: "fade",
    scrollLength: 1550,
    ambient: "particles",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  "cinema-credits": {
    id: "cinema-credits",
    eyebrow: "A CAREER PICTURE",
    experienceTitle: "STARRING",
    projectTitle: "FEATURE PRESENTATIONS",
    skillsTitle: "CREW & CRAFT",
    contactTitle: "END CREDITS",
    background: "#090909",
    secondary: "#1b1715",
    surface: "rgba(18,18,18,.88)",
    text: "#f4ead8",
    accent: "#c9232d",
    border: "#5c4a3b",
    variant: "plain",
    radius: 0,
    transition: "fade",
    scrollLength: 1400,
    ambient: "none",
    fontFamily: "Georgia, Times New Roman, serif",
  },
  "comic-book": {
    id: "comic-book",
    eyebrow: "ISSUE #01",
    experienceTitle: "ORIGIN STORY",
    projectTitle: "BIG ADVENTURES",
    skillsTitle: "SUPERPOWERS",
    contactTitle: "TO BE CONTINUED",
    background: "#f6e44d",
    secondary: "#49a7e8",
    surface: "#fffdf3",
    text: "#111111",
    accent: "#e83d3d",
    border: "#111111",
    variant: "card",
    radius: 0,
    transition: "zoom",
    scrollLength: 1500,
    ambient: "float",
    fontFamily: "Arial Black, Impact, sans-serif",
  },
  "science-lab": {
    id: "science-lab",
    eyebrow: "LAB NOTEBOOK",
    experienceTitle: "EXPERIMENT HISTORY",
    projectTitle: "ACTIVE STUDIES",
    skillsTitle: "METHODS & TOOLS",
    contactTitle: "COLLABORATE",
    background: "#edf7f6",
    secondary: "#cfe8e5",
    surface: "rgba(255,255,255,.9)",
    text: "#183337",
    accent: "#0f8b8d",
    border: "#a8d4d1",
    variant: "glass",
    radius: 14,
    transition: "fade",
    scrollLength: 1300,
    ambient: "particles",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  "detective-board": {
    id: "detective-board",
    eyebrow: "CASE FILE",
    experienceTitle: "EVIDENCE / EXPERIENCE",
    projectTitle: "CONNECTED CLUES",
    skillsTitle: "INVESTIGATIVE TOOLS",
    contactTitle: "OPEN THE CASE",
    background: "#8a603f",
    secondary: "#68462f",
    surface: "#f4e9d2",
    text: "#2f241c",
    accent: "#a62f2f",
    border: "#b79b72",
    variant: "card",
    radius: 4,
    transition: "fade",
    scrollLength: 1500,
    ambient: "float",
    fontFamily: "Trebuchet MS, Inter, system-ui, sans-serif",
  },
  "atlas-explorer": {
    id: "atlas-explorer",
    eyebrow: "FIELD ATLAS",
    experienceTitle: "ROUTES TRAVELED",
    projectTitle: "PLACES BUILT",
    skillsTitle: "NAVIGATION KIT",
    contactTitle: "SET A COURSE",
    background: "#e8ddc3",
    secondary: "#c6d4ca",
    surface: "rgba(250,247,235,.92)",
    text: "#2f392f",
    accent: "#316b68",
    border: "#a89979",
    variant: "card",
    radius: 8,
    transition: "slide-left",
    scrollLength: 1500,
    ambient: "parallax",
    fontFamily: "Georgia, Times New Roman, serif",
  },
  airmail: {
    id: "airmail",
    eyebrow: "SPECIAL DELIVERY",
    experienceTitle: "LETTERS FROM WORK",
    projectTitle: "POSTCARDS / PROJECTS",
    skillsTitle: "ENCLOSURES",
    contactTitle: "WRITE BACK",
    background: "#f7f0df",
    secondary: "#e4edf3",
    surface: "#fffdf7",
    text: "#27313b",
    accent: "#c83e45",
    border: "#7ca6c2",
    variant: "card",
    radius: 6,
    transition: "fade",
    scrollLength: 1200,
    ambient: "float",
    fontFamily: "Georgia, Times New Roman, serif",
  },
  "construction-site": {
    id: "construction-site",
    eyebrow: "WORK IN PROGRESS",
    experienceTitle: "BUILT EXPERIENCE",
    projectTitle: "STRUCTURES DELIVERED",
    skillsTitle: "TOOLS ON SITE",
    contactTitle: "NEXT BUILD",
    background: "#272a2f",
    secondary: "#454a52",
    surface: "#f3f0e8",
    text: "#24272c",
    accent: "#f2b705",
    border: "#6f757d",
    variant: "card",
    radius: 6,
    transition: "slide-up",
    scrollLength: 1450,
    ambient: "none",
    fontFamily: "Arial, Inter, system-ui, sans-serif",
  },
  "coffee-shop": {
    id: "coffee-shop",
    eyebrow: "HOUSE SPECIAL",
    experienceTitle: "ON THE MENU",
    projectTitle: "FRESHLY MADE",
    skillsTitle: "INGREDIENTS",
    contactTitle: "PULL UP A CHAIR",
    background: "#d8b899",
    secondary: "#8d654c",
    surface: "#fff8ec",
    text: "#402e24",
    accent: "#7a4b35",
    border: "#c39a77",
    variant: "card",
    radius: 18,
    transition: "fade",
    scrollLength: 1200,
    ambient: "float",
    fontFamily: "Georgia, Times New Roman, serif",
  },
  "zen-garden": {
    id: "zen-garden",
    eyebrow: "QUIET WORK",
    experienceTitle: "PATH",
    projectTitle: "SELECTED FORMS",
    skillsTitle: "PRACTICE",
    contactTitle: "BEGIN",
    background: "#efeee8",
    secondary: "#d6dbcf",
    surface: "rgba(255,255,252,.76)",
    text: "#282c29",
    accent: "#6d7d68",
    border: "#c8cbc1",
    variant: "plain",
    radius: 20,
    transition: "fade",
    scrollLength: 1000,
    ambient: "none",
    fontFamily: "Avenir Next, Inter, system-ui, sans-serif",
  },
  "chess-strategy": {
    id: "chess-strategy",
    eyebrow: "POSITION / 01",
    experienceTitle: "STRATEGIC MOVES",
    projectTitle: "WINNING POSITIONS",
    skillsTitle: "PIECES IN PLAY",
    contactTitle: "YOUR MOVE",
    background: "#eee8da",
    secondary: "#24211d",
    surface: "#fbf8f0",
    text: "#25211d",
    accent: "#a47a3b",
    border: "#8f8778",
    variant: "card",
    radius: 4,
    transition: "slide-left",
    scrollLength: 1300,
    ambient: "none",
    fontFamily: "Georgia, Times New Roman, serif",
  },
  "neon-subway": {
    id: "neon-subway",
    eyebrow: "NEXT TRAIN",
    experienceTitle: "CAREER LINE",
    projectTitle: "TRANSFER POINTS",
    skillsTitle: "SERVICE MAP",
    contactTitle: "NEXT STOP",
    background: "#071521",
    secondary: "#121d2c",
    surface: "rgba(9,27,42,.88)",
    text: "#f0fbff",
    accent: "#f43f9b",
    border: "#1f6685",
    variant: "glass",
    radius: 12,
    transition: "slide-left",
    scrollLength: 1700,
    ambient: "particles",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  "weather-station": {
    id: "weather-station",
    eyebrow: "CAREER FORECAST",
    experienceTitle: "RECENT CONDITIONS",
    projectTitle: "ACTIVE SYSTEMS",
    skillsTitle: "FORECAST TOOLS",
    contactTitle: "OUTLOOK",
    background: "#d8effb",
    secondary: "#f6fbff",
    surface: "rgba(255,255,255,.88)",
    text: "#17364c",
    accent: "#f2a81d",
    border: "#b7d9ea",
    variant: "glass",
    radius: 24,
    transition: "slide-up",
    scrollLength: 1300,
    ambient: "float",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  newspaper: {
    id: "newspaper",
    eyebrow: "THE CAREER DAILY",
    experienceTitle: "TOP STORY",
    projectTitle: "BUSINESS & PROJECTS",
    skillsTitle: "CLASSIFIED SKILLS",
    contactTitle: "CONTACT DESK",
    background: "#f4efe2",
    secondary: "#e7dfcf",
    surface: "#fdfaf2",
    text: "#17130f",
    accent: "#8b1e1e",
    border: "#7d776d",
    variant: "plain",
    radius: 0,
    transition: "fade",
    scrollLength: 1100,
    ambient: "none",
    fontFamily: "Georgia, Times New Roman, serif",
  },
};

function conceptMotionLevel(
  recipe: ConceptRecipe,
): InteractiveTemplateDefinition["motionLevel"] {
  return (
    INTERACTIVE_TEMPLATES.find(template => template.id === recipe.id)
      ?.motionLevel ?? "Subtle"
  );
}

function conceptAppearance(
  recipe: ConceptRecipe,
  variant: InteractiveObjectAppearance["variant"] = recipe.variant,
  overrides?: Partial<InteractiveObjectAppearance>,
): InteractiveObjectAppearance {
  return appearance(variant, {
    textColor: recipe.text,
    surfaceColor: recipe.surface,
    accentColor: recipe.accent,
    borderColor: recipe.border,
    radius: recipe.radius,
    fontFamily: recipe.fontFamily,
    ...(overrides ?? {}),
  });
}

function applyConceptAmbient(scene: InteractiveScene, recipe: ConceptRecipe): void {
  if (recipe.ambient === "float") {
    scene.ambient.floatingShapes.enabled = true;
    scene.ambient.floatingShapes.density = 12;
    scene.ambient.floatingShapes.speed = 0.35;
    scene.ambient.floatingShapes.intensity = 22;
  } else if (recipe.ambient === "particles") {
    scene.ambient.particles.enabled = true;
    scene.ambient.particles.density = 24;
    scene.ambient.particles.speed = 0.45;
    scene.ambient.particles.intensity = 30;
  } else if (recipe.ambient === "gradient") {
    scene.ambient.gradientDrift.enabled = true;
    scene.ambient.gradientDrift.speed = 0.4;
    scene.ambient.gradientDrift.intensity = 40;
  } else if (recipe.ambient === "parallax") {
    scene.ambient.parallax.enabled = true;
    scene.ambient.parallax.intensity = 38;
  } else if (recipe.ambient === "twinkle") {
    scene.ambient.twinkle.enabled = true;
    scene.ambient.twinkle.density = 48;
    scene.ambient.twinkle.speed = 0.55;
    scene.ambient.twinkle.intensity = 54;
  }
}

function conceptScene(
  recipe: ConceptRecipe,
  name: string,
  transition: InteractiveSceneTransitionType = recipe.transition,
): InteractiveScene {
  const scene = createInteractiveScene(name, {
    width: TEMPLATE_WIDTH,
    height: TEMPLATE_HEIGHT,
    scrollLength: recipe.scrollLength,
    background: {
      type: "gradient",
      color: recipe.background,
      secondaryColor: recipe.secondary,
    },
    transition: {
      type: transition,
      duration: 0.72,
      easing: "ease-in-out",
    },
  });
  applyConceptAmbient(scene, recipe);
  return scene;
}

function conceptSlots(
  id: ConceptTemplateId,
  section: "intro" | "work" | "project" | "skills" | "contact",
): ConceptSlot[] {
  const common = {
    intro: [
      { x: 110, y: 210, width: 760, height: 150 },
      { x: 110, y: 405, width: 780, height: 210 },
      { x: 110, y: 650, width: 360, height: 90 },
    ],
    work: [
      { x: 90, y: 180, width: 600, height: 280 },
      { x: 750, y: 180, width: 600, height: 280 },
      { x: 90, y: 510, width: 600, height: 280 },
      { x: 750, y: 510, width: 600, height: 280 },
    ],
    project: [
      { x: 90, y: 210, width: 390, height: 420 },
      { x: 525, y: 260, width: 390, height: 420 },
      { x: 960, y: 210, width: 390, height: 420 },
    ],
    skills: [
      { x: 110, y: 210, width: 330, height: 90 },
      { x: 485, y: 210, width: 330, height: 90 },
      { x: 860, y: 210, width: 330, height: 90 },
      { x: 110, y: 330, width: 330, height: 90 },
      { x: 485, y: 330, width: 330, height: 90 },
      { x: 860, y: 330, width: 330, height: 90 },
      { x: 110, y: 450, width: 330, height: 90 },
      { x: 485, y: 450, width: 330, height: 90 },
      { x: 860, y: 450, width: 330, height: 90 },
    ],
    contact: [
      { x: 110, y: 280, width: 720, height: 110 },
      { x: 110, y: 430, width: 720, height: 100 },
      { x: 110, y: 570, width: 720, height: 82 },
      { x: 110, y: 675, width: 720, height: 82 },
    ],
  };

  const layouts: Partial<Record<ConceptTemplateId, Partial<Record<typeof section, ConceptSlot[]>>>> = {
    underwater: {
      intro: [
        { x: 95, y: 190, width: 710, height: 150 },
        { x: 145, y: 390, width: 700, height: 220 },
        { x: 980, y: 640, width: 320, height: 95 },
      ],
      work: [
        { x: 95, y: 185, width: 500, height: 270 },
        { x: 790, y: 145, width: 540, height: 290 },
        { x: 180, y: 510, width: 520, height: 270 },
        { x: 825, y: 500, width: 475, height: 270 },
      ],
      project: [
        { x: 110, y: 220, width: 370, height: 390 },
        { x: 525, y: 305, width: 370, height: 390 },
        { x: 940, y: 190, width: 370, height: 390 },
      ],
    },
    "sky-balloon": {
      intro: [
        { x: 265, y: 155, width: 790, height: 150 },
        { x: 330, y: 365, width: 730, height: 205 },
        { x: 520, y: 640, width: 380, height: 90 },
      ],
      work: [
        { x: 105, y: 190, width: 545, height: 260 },
        { x: 780, y: 230, width: 545, height: 260 },
        { x: 180, y: 525, width: 545, height: 260 },
        { x: 710, y: 500, width: 545, height: 260 },
      ],
      project: [
        { x: 90, y: 280, width: 370, height: 360 },
        { x: 535, y: 190, width: 370, height: 360 },
        { x: 980, y: 300, width: 370, height: 360 },
      ],
    },
    "desktop-workspace": {
      intro: [
        { x: 125, y: 205, width: 690, height: 135 },
        { x: 180, y: 385, width: 820, height: 220 },
        { x: 1030, y: 190, width: 280, height: 110 },
      ],
      work: [
        { x: 95, y: 190, width: 610, height: 270 },
        { x: 735, y: 230, width: 610, height: 270 },
        { x: 145, y: 505, width: 610, height: 270 },
        { x: 685, y: 540, width: 610, height: 270 },
      ],
      project: [
        { x: 115, y: 220, width: 520, height: 410 },
        { x: 760, y: 190, width: 520, height: 410 },
      ],
    },
    "creative-office": {
      intro: [
        { x: 120, y: 185, width: 640, height: 145 },
        { x: 150, y: 390, width: 670, height: 220, rotation: -1.5 },
        { x: 960, y: 535, width: 320, height: 100, rotation: 2 },
      ],
      work: [
        { x: 95, y: 210, width: 520, height: 260, rotation: -1.5 },
        { x: 740, y: 170, width: 540, height: 280, rotation: 1.5 },
        { x: 160, y: 525, width: 520, height: 260, rotation: 1 },
        { x: 770, y: 500, width: 520, height: 260, rotation: -1 },
      ],
      project: [
        { x: 100, y: 235, width: 380, height: 380, rotation: -2 },
        { x: 525, y: 205, width: 380, height: 380, rotation: 1.5 },
        { x: 950, y: 255, width: 380, height: 380, rotation: -1 },
      ],
    },
    executive: {
      intro: [
        { x: 120, y: 215, width: 840, height: 165 },
        { x: 120, y: 430, width: 760, height: 190 },
        { x: 1030, y: 615, width: 270, height: 90 },
      ],
      work: [
        { x: 110, y: 210, width: 1210, height: 210 },
        { x: 180, y: 470, width: 1140, height: 210 },
        { x: 250, y: 720, width: 1070, height: 150 },
      ],
      project: [
        { x: 110, y: 220, width: 580, height: 410 },
        { x: 750, y: 220, width: 580, height: 410 },
      ],
    },
    editorial: {
      intro: [
        { x: 90, y: 190, width: 760, height: 165 },
        { x: 770, y: 400, width: 540, height: 260 },
        { x: 90, y: 610, width: 360, height: 100 },
      ],
      work: [
        { x: 90, y: 190, width: 390, height: 560 },
        { x: 525, y: 190, width: 390, height: 560 },
        { x: 960, y: 190, width: 390, height: 560 },
      ],
      project: [
        { x: 100, y: 180, width: 780, height: 520 },
        { x: 930, y: 260, width: 390, height: 360 },
      ],
    },
    "split-screen": {
      intro: [
        { x: 90, y: 215, width: 580, height: 160 },
        { x: 780, y: 315, width: 550, height: 230 },
        { x: 90, y: 640, width: 420, height: 90 },
      ],
      work: [
        { x: 70, y: 190, width: 590, height: 280 },
        { x: 780, y: 190, width: 590, height: 280 },
        { x: 70, y: 515, width: 590, height: 280 },
        { x: 780, y: 515, width: 590, height: 280 },
      ],
      project: [
        { x: 90, y: 220, width: 560, height: 440 },
        { x: 790, y: 220, width: 560, height: 440 },
      ],
    },
    "swiss-grid": {
      intro: [
        { x: 95, y: 160, width: 980, height: 170 },
        { x: 575, y: 390, width: 740, height: 220 },
        { x: 95, y: 640, width: 380, height: 85 },
      ],
      work: [
        { x: 95, y: 175, width: 395, height: 280 },
        { x: 520, y: 175, width: 395, height: 280 },
        { x: 945, y: 175, width: 395, height: 280 },
        { x: 95, y: 505, width: 395, height: 280 },
      ],
      project: [
        { x: 95, y: 220, width: 395, height: 430 },
        { x: 520, y: 220, width: 395, height: 430 },
        { x: 945, y: 220, width: 395, height: 430 },
      ],
    },
    "career-timeline": {
      intro: [
        { x: 120, y: 190, width: 780, height: 155 },
        { x: 170, y: 400, width: 740, height: 210 },
        { x: 995, y: 640, width: 300, height: 90 },
      ],
      work: [
        { x: 80, y: 230, width: 300, height: 310 },
        { x: 400, y: 330, width: 300, height: 310 },
        { x: 720, y: 230, width: 300, height: 310 },
        { x: 1040, y: 330, width: 300, height: 310 },
      ],
      project: [
        { x: 120, y: 240, width: 360, height: 390 },
        { x: 540, y: 240, width: 360, height: 390 },
        { x: 960, y: 240, width: 360, height: 390 },
      ],
    },
    "case-study": {
      intro: [
        { x: 110, y: 205, width: 680, height: 145 },
        { x: 110, y: 390, width: 900, height: 210 },
        { x: 1080, y: 610, width: 250, height: 95 },
      ],
      work: [
        { x: 110, y: 200, width: 1220, height: 230 },
        { x: 180, y: 480, width: 1150, height: 230 },
      ],
      project: [
        { x: 90, y: 190, width: 820, height: 520 },
        { x: 970, y: 250, width: 350, height: 350 },
      ],
    },
    "command-center": {
      intro: [
        { x: 90, y: 180, width: 690, height: 145 },
        { x: 90, y: 375, width: 710, height: 230 },
        { x: 1030, y: 590, width: 300, height: 95 },
      ],
      work: [
        { x: 90, y: 190, width: 590, height: 280 },
        { x: 760, y: 190, width: 590, height: 280 },
        { x: 90, y: 520, width: 590, height: 280 },
        { x: 760, y: 520, width: 590, height: 280 },
      ],
      project: [
        { x: 100, y: 210, width: 390, height: 430 },
        { x: 525, y: 210, width: 390, height: 430 },
        { x: 950, y: 210, width: 390, height: 430 },
      ],
    },
    blueprint: {
      intro: [
        { x: 100, y: 180, width: 760, height: 150 },
        { x: 150, y: 405, width: 780, height: 210 },
        { x: 1000, y: 640, width: 300, height: 90 },
      ],
      work: [
        { x: 90, y: 190, width: 610, height: 270 },
        { x: 740, y: 190, width: 610, height: 270 },
        { x: 90, y: 510, width: 610, height: 270 },
        { x: 740, y: 510, width: 610, height: 270 },
      ],
      project: [
        { x: 90, y: 220, width: 580, height: 420 },
        { x: 770, y: 220, width: 580, height: 420 },
      ],
    },
    magazine: {
      intro: [
        { x: 85, y: 180, width: 860, height: 160 },
        { x: 610, y: 405, width: 700, height: 250 },
        { x: 90, y: 620, width: 370, height: 90, rotation: -2 },
      ],
      work: [
        { x: 85, y: 180, width: 560, height: 300, rotation: -1 },
        { x: 740, y: 215, width: 610, height: 300, rotation: 1 },
        { x: 145, y: 520, width: 540, height: 260, rotation: 1 },
        { x: 770, y: 540, width: 540, height: 260, rotation: -1 },
      ],
      project: [
        { x: 80, y: 220, width: 520, height: 410, rotation: -2 },
        { x: 465, y: 280, width: 520, height: 410, rotation: 1 },
        { x: 850, y: 190, width: 520, height: 410, rotation: -1 },
      ],
    },
    "bold-typography": {
      intro: [
        { x: 80, y: 230, width: 1200, height: 170 },
        { x: 650, y: 470, width: 650, height: 210 },
        { x: 80, y: 690, width: 420, height: 90 },
      ],
      work: [
        { x: 75, y: 190, width: 1260, height: 250 },
        { x: 240, y: 505, width: 1100, height: 250 },
      ],
      project: [
        { x: 85, y: 215, width: 610, height: 440 },
        { x: 745, y: 215, width: 610, height: 440 },
      ],
    },
    aurora: {
      intro: [
        { x: 110, y: 205, width: 760, height: 150 },
        { x: 145, y: 410, width: 760, height: 215 },
        { x: 1030, y: 635, width: 280, height: 90 },
      ],
      work: [
        { x: 110, y: 185, width: 560, height: 290 },
        { x: 750, y: 235, width: 560, height: 290 },
        { x: 180, y: 525, width: 560, height: 270 },
        { x: 680, y: 520, width: 560, height: 270 },
      ],
      project: [
        { x: 100, y: 230, width: 390, height: 400 },
        { x: 525, y: 180, width: 390, height: 400 },
        { x: 950, y: 255, width: 390, height: 400 },
      ],
    },
    "pitch-deck": {
      intro: [
        { x: 120, y: 230, width: 930, height: 170 },
        { x: 120, y: 455, width: 820, height: 190 },
        { x: 1060, y: 675, width: 250, height: 80 },
      ],
      work: [
        { x: 120, y: 210, width: 1200, height: 240 },
        { x: 120, y: 505, width: 1200, height: 240 },
      ],
      project: [
        { x: 120, y: 220, width: 560, height: 420 },
        { x: 760, y: 220, width: 560, height: 420 },
      ],
    },
    "city-lights": {
      intro: [
        { x: 100, y: 175, width: 700, height: 145 },
        { x: 100, y: 375, width: 730, height: 220 },
        { x: 1010, y: 610, width: 300, height: 90 },
      ],
      work: [
        { x: 90, y: 190, width: 410, height: 300 },
        { x: 515, y: 240, width: 410, height: 300 },
        { x: 940, y: 180, width: 410, height: 300 },
        { x: 515, y: 555, width: 410, height: 250 },
      ],
      project: [
        { x: 100, y: 235, width: 390, height: 390 },
        { x: 525, y: 195, width: 390, height: 390 },
        { x: 950, y: 250, width: 390, height: 390 },
      ],
    },
    scrapbook: {
      intro: [
        { x: 110, y: 190, width: 680, height: 150, rotation: -2 },
        { x: 180, y: 410, width: 720, height: 210, rotation: 1 },
        { x: 980, y: 600, width: 320, height: 90, rotation: -3 },
      ],
      work: [
        { x: 95, y: 185, width: 520, height: 285, rotation: -3 },
        { x: 750, y: 170, width: 520, height: 285, rotation: 2 },
        { x: 155, y: 520, width: 520, height: 285, rotation: 2 },
        { x: 770, y: 515, width: 520, height: 285, rotation: -2 },
      ],
      project: [
        { x: 95, y: 220, width: 390, height: 400, rotation: -3 },
        { x: 520, y: 255, width: 390, height: 400, rotation: 2 },
        { x: 945, y: 205, width: 390, height: 400, rotation: -2 },
      ],
    },
    "retro-arcade": {
      intro: [
        { x: 150, y: 195, width: 780, height: 150 },
        { x: 230, y: 405, width: 760, height: 210 },
        { x: 1040, y: 640, width: 250, height: 90 },
      ],
      work: [
        { x: 100, y: 200, width: 590, height: 270 },
        { x: 750, y: 200, width: 590, height: 270 },
        { x: 100, y: 520, width: 590, height: 270 },
        { x: 750, y: 520, width: 590, height: 270 },
      ],
      project: [
        { x: 95, y: 230, width: 390, height: 390 },
        { x: 525, y: 230, width: 390, height: 390 },
        { x: 955, y: 230, width: 390, height: 390 },
      ],
    },

    "botanical-greenhouse": {
      intro: [
        { x: 105, y: 190, width: 720, height: 145 },
        { x: 170, y: 390, width: 680, height: 210 },
        { x: 1010, y: 585, width: 290, height: 90 },
      ],
      work: [
        { x: 90, y: 205, width: 500, height: 275, rotation: -1 },
        { x: 765, y: 165, width: 520, height: 285, rotation: 1 },
        { x: 185, y: 520, width: 520, height: 265, rotation: 1 },
        { x: 805, y: 505, width: 500, height: 265, rotation: -1 },
      ],
      project: [
        { x: 100, y: 245, width: 365, height: 380, rotation: -2 },
        { x: 535, y: 190, width: 365, height: 400 },
        { x: 970, y: 250, width: 365, height: 380, rotation: 2 },
      ],
    },
    "library-stacks": {
      intro: [
        { x: 350, y: 175, width: 700, height: 145 },
        { x: 410, y: 375, width: 650, height: 225 },
        { x: 1010, y: 660, width: 280, height: 85 },
      ],
      work: [
        { x: 95, y: 190, width: 300, height: 545 },
        { x: 420, y: 190, width: 300, height: 545 },
        { x: 745, y: 190, width: 300, height: 545 },
        { x: 1070, y: 190, width: 280, height: 545 },
      ],
      project: [
        { x: 120, y: 230, width: 560, height: 410 },
        { x: 760, y: 230, width: 560, height: 410 },
      ],
    },
    "museum-gallery": {
      intro: [
        { x: 430, y: 210, width: 580, height: 150 },
        { x: 455, y: 420, width: 530, height: 190 },
        { x: 610, y: 670, width: 220, height: 75 },
      ],
      work: [
        { x: 125, y: 210, width: 520, height: 420 },
        { x: 795, y: 210, width: 520, height: 420 },
      ],
      project: [
        { x: 110, y: 220, width: 360, height: 410 },
        { x: 540, y: 220, width: 360, height: 410 },
        { x: 970, y: 220, width: 360, height: 410 },
      ],
    },
    "mountain-expedition": {
      intro: [
        { x: 105, y: 170, width: 750, height: 145 },
        { x: 175, y: 360, width: 700, height: 210 },
        { x: 1030, y: 615, width: 260, height: 90 },
      ],
      work: [
        { x: 90, y: 480, width: 340, height: 300 },
        { x: 390, y: 355, width: 340, height: 300 },
        { x: 700, y: 250, width: 340, height: 300 },
        { x: 1010, y: 145, width: 340, height: 300 },
      ],
      project: [
        { x: 110, y: 380, width: 360, height: 360 },
        { x: 535, y: 275, width: 360, height: 360 },
        { x: 960, y: 170, width: 360, height: 360 },
      ],
    },
    "desert-roadtrip": {
      intro: [
        { x: 110, y: 190, width: 700, height: 145 },
        { x: 165, y: 395, width: 700, height: 210 },
        { x: 1010, y: 615, width: 290, height: 90 },
      ],
      work: [
        { x: 95, y: 200, width: 430, height: 280, rotation: -1 },
        { x: 505, y: 340, width: 430, height: 280, rotation: 1 },
        { x: 915, y: 200, width: 430, height: 280, rotation: -1 },
      ],
      project: [
        { x: 110, y: 235, width: 365, height: 395, rotation: -2 },
        { x: 535, y: 300, width: 365, height: 395, rotation: 1 },
        { x: 960, y: 215, width: 365, height: 395, rotation: -1 },
      ],
    },
    "train-journey": {
      intro: [
        { x: 140, y: 190, width: 650, height: 140 },
        { x: 175, y: 385, width: 650, height: 210 },
        { x: 1030, y: 615, width: 260, height: 90 },
      ],
      work: [
        { x: 80, y: 245, width: 300, height: 370 },
        { x: 405, y: 245, width: 300, height: 370 },
        { x: 730, y: 245, width: 300, height: 370 },
        { x: 1055, y: 245, width: 300, height: 370 },
      ],
      project: [
        { x: 110, y: 215, width: 560, height: 430 },
        { x: 770, y: 215, width: 560, height: 430 },
      ],
    },
    "airport-departures": {
      intro: [
        { x: 105, y: 190, width: 760, height: 145 },
        { x: 105, y: 390, width: 760, height: 210 },
        { x: 1050, y: 610, width: 260, height: 90 },
      ],
      work: [
        { x: 95, y: 185, width: 1240, height: 155 },
        { x: 95, y: 370, width: 1240, height: 155 },
        { x: 95, y: 555, width: 1240, height: 155 },
        { x: 95, y: 740, width: 1240, height: 120 },
      ],
      project: [
        { x: 100, y: 235, width: 390, height: 390 },
        { x: 525, y: 235, width: 390, height: 390 },
        { x: 950, y: 235, width: 390, height: 390 },
      ],
    },
    "recording-studio": {
      intro: [
        { x: 100, y: 180, width: 710, height: 145 },
        { x: 125, y: 390, width: 710, height: 210 },
        { x: 1050, y: 610, width: 250, height: 90 },
      ],
      work: [
        { x: 95, y: 190, width: 590, height: 270 },
        { x: 755, y: 190, width: 590, height: 270 },
        { x: 95, y: 505, width: 590, height: 270 },
        { x: 755, y: 505, width: 590, height: 270 },
      ],
      project: [
        { x: 100, y: 260, width: 390, height: 365 },
        { x: 525, y: 210, width: 390, height: 415 },
        { x: 950, y: 260, width: 390, height: 365 },
      ],
    },
    "cinema-credits": {
      intro: [
        { x: 330, y: 210, width: 780, height: 150 },
        { x: 400, y: 420, width: 640, height: 190 },
        { x: 570, y: 670, width: 300, height: 80 },
      ],
      work: [
        { x: 260, y: 200, width: 920, height: 180 },
        { x: 300, y: 420, width: 840, height: 180 },
        { x: 340, y: 640, width: 760, height: 140 },
      ],
      project: [
        { x: 95, y: 215, width: 590, height: 430 },
        { x: 755, y: 215, width: 590, height: 430 },
      ],
    },
    "comic-book": {
      intro: [
        { x: 95, y: 175, width: 760, height: 150, rotation: -1 },
        { x: 490, y: 385, width: 760, height: 220, rotation: 1 },
        { x: 120, y: 650, width: 330, height: 95, rotation: -3 },
      ],
      work: [
        { x: 70, y: 170, width: 430, height: 300, rotation: -2 },
        { x: 525, y: 170, width: 820, height: 300, rotation: 1 },
        { x: 70, y: 500, width: 820, height: 300, rotation: 1 },
        { x: 915, y: 500, width: 430, height: 300, rotation: -2 },
      ],
      project: [
        { x: 80, y: 190, width: 780, height: 470, rotation: -1 },
        { x: 900, y: 255, width: 430, height: 390, rotation: 2 },
      ],
    },
    "science-lab": {
      intro: [
        { x: 105, y: 190, width: 700, height: 145 },
        { x: 170, y: 395, width: 700, height: 210 },
        { x: 1020, y: 620, width: 280, height: 90 },
      ],
      work: [
        { x: 95, y: 190, width: 385, height: 280 },
        { x: 525, y: 190, width: 385, height: 280 },
        { x: 955, y: 190, width: 385, height: 280 },
        { x: 525, y: 520, width: 385, height: 280 },
      ],
      project: [
        { x: 110, y: 215, width: 570, height: 430 },
        { x: 760, y: 215, width: 570, height: 430 },
      ],
    },
    "detective-board": {
      intro: [
        { x: 110, y: 180, width: 650, height: 145, rotation: -2 },
        { x: 190, y: 400, width: 680, height: 215, rotation: 1 },
        { x: 1010, y: 600, width: 280, height: 95, rotation: -2 },
      ],
      work: [
        { x: 90, y: 180, width: 480, height: 270, rotation: -3 },
        { x: 760, y: 165, width: 500, height: 280, rotation: 2 },
        { x: 170, y: 510, width: 500, height: 270, rotation: 2 },
        { x: 800, y: 500, width: 470, height: 270, rotation: -2 },
      ],
      project: [
        { x: 105, y: 235, width: 380, height: 390, rotation: -3 },
        { x: 525, y: 190, width: 390, height: 410, rotation: 2 },
        { x: 950, y: 250, width: 380, height: 390, rotation: -2 },
      ],
    },
    "atlas-explorer": {
      intro: [
        { x: 110, y: 190, width: 710, height: 145 },
        { x: 180, y: 390, width: 680, height: 210 },
        { x: 1010, y: 610, width: 290, height: 90 },
      ],
      work: [
        { x: 95, y: 185, width: 490, height: 280, rotation: -1 },
        { x: 755, y: 185, width: 490, height: 280, rotation: 1 },
        { x: 235, y: 515, width: 490, height: 280, rotation: 1 },
        { x: 820, y: 515, width: 490, height: 280, rotation: -1 },
      ],
      project: [
        { x: 100, y: 235, width: 390, height: 390 },
        { x: 525, y: 285, width: 390, height: 390 },
        { x: 950, y: 215, width: 390, height: 390 },
      ],
    },
    airmail: {
      intro: [
        { x: 145, y: 190, width: 710, height: 145, rotation: -1 },
        { x: 245, y: 390, width: 700, height: 210, rotation: 1 },
        { x: 1010, y: 600, width: 280, height: 95, rotation: -3 },
      ],
      work: [
        { x: 95, y: 190, width: 540, height: 275, rotation: -2 },
        { x: 770, y: 190, width: 540, height: 275, rotation: 2 },
        { x: 160, y: 515, width: 540, height: 275, rotation: 1 },
        { x: 740, y: 515, width: 540, height: 275, rotation: -1 },
      ],
      project: [
        { x: 100, y: 225, width: 390, height: 400, rotation: -2 },
        { x: 525, y: 260, width: 390, height: 400, rotation: 1 },
        { x: 950, y: 225, width: 390, height: 400, rotation: -1 },
      ],
    },
    "construction-site": {
      intro: [
        { x: 110, y: 190, width: 760, height: 145 },
        { x: 160, y: 390, width: 740, height: 210 },
        { x: 1040, y: 610, width: 250, height: 90 },
      ],
      work: [
        { x: 90, y: 190, width: 600, height: 260 },
        { x: 750, y: 190, width: 600, height: 260 },
        { x: 90, y: 510, width: 600, height: 260 },
        { x: 750, y: 510, width: 600, height: 260 },
      ],
      project: [
        { x: 95, y: 220, width: 610, height: 420 },
        { x: 735, y: 220, width: 610, height: 420 },
      ],
    },
    "coffee-shop": {
      intro: [
        { x: 100, y: 190, width: 650, height: 145 },
        { x: 130, y: 390, width: 670, height: 210 },
        { x: 1000, y: 585, width: 300, height: 95 },
      ],
      work: [
        { x: 90, y: 190, width: 510, height: 275, rotation: -1 },
        { x: 740, y: 210, width: 510, height: 275, rotation: 1 },
        { x: 170, y: 520, width: 510, height: 275, rotation: 1 },
        { x: 770, y: 515, width: 510, height: 275, rotation: -1 },
      ],
      project: [
        { x: 110, y: 230, width: 560, height: 405 },
        { x: 770, y: 230, width: 560, height: 405 },
      ],
    },
    "zen-garden": {
      intro: [
        { x: 260, y: 225, width: 700, height: 140 },
        { x: 330, y: 440, width: 620, height: 185 },
        { x: 1030, y: 665, width: 230, height: 75 },
      ],
      work: [
        { x: 120, y: 215, width: 510, height: 250 },
        { x: 810, y: 215, width: 510, height: 250 },
        { x: 285, y: 545, width: 510, height: 230 },
      ],
      project: [
        { x: 130, y: 245, width: 350, height: 350 },
        { x: 545, y: 190, width: 350, height: 350 },
        { x: 960, y: 245, width: 350, height: 350 },
      ],
    },
    "chess-strategy": {
      intro: [
        { x: 100, y: 185, width: 680, height: 145 },
        { x: 120, y: 385, width: 700, height: 210 },
        { x: 1040, y: 610, width: 250, height: 90 },
      ],
      work: [
        { x: 95, y: 180, width: 390, height: 275 },
        { x: 525, y: 180, width: 390, height: 275 },
        { x: 955, y: 180, width: 390, height: 275 },
        { x: 525, y: 510, width: 390, height: 275 },
      ],
      project: [
        { x: 100, y: 220, width: 570, height: 420 },
        { x: 770, y: 220, width: 570, height: 420 },
      ],
    },
    "neon-subway": {
      intro: [
        { x: 105, y: 180, width: 720, height: 145 },
        { x: 155, y: 380, width: 710, height: 215 },
        { x: 1040, y: 600, width: 260, height: 90 },
      ],
      work: [
        { x: 95, y: 190, width: 530, height: 270 },
        { x: 815, y: 190, width: 530, height: 270 },
        { x: 245, y: 515, width: 530, height: 270 },
        { x: 815, y: 515, width: 530, height: 270 },
      ],
      project: [
        { x: 95, y: 225, width: 390, height: 400 },
        { x: 525, y: 225, width: 390, height: 400 },
        { x: 955, y: 225, width: 390, height: 400 },
      ],
    },
    "weather-station": {
      intro: [
        { x: 100, y: 185, width: 700, height: 145 },
        { x: 145, y: 385, width: 700, height: 210 },
        { x: 1020, y: 610, width: 280, height: 90 },
      ],
      work: [
        { x: 80, y: 220, width: 300, height: 390 },
        { x: 405, y: 220, width: 300, height: 390 },
        { x: 730, y: 220, width: 300, height: 390 },
        { x: 1055, y: 220, width: 300, height: 390 },
      ],
      project: [
        { x: 100, y: 240, width: 390, height: 390 },
        { x: 525, y: 200, width: 390, height: 390 },
        { x: 950, y: 240, width: 390, height: 390 },
      ],
    },
    newspaper: {
      intro: [
        { x: 80, y: 165, width: 1240, height: 140 },
        { x: 80, y: 390, width: 590, height: 260 },
        { x: 950, y: 630, width: 350, height: 90 },
      ],
      work: [
        { x: 80, y: 190, width: 390, height: 560 },
        { x: 525, y: 190, width: 390, height: 560 },
        { x: 970, y: 190, width: 390, height: 560 },
      ],
      project: [
        { x: 80, y: 200, width: 610, height: 470 },
        { x: 750, y: 200, width: 610, height: 470 },
      ],
    },
  };

  return layouts[id]?.[section] ?? common[section];
}

function conceptHeading(
  scene: InteractiveScene,
  recipe: ConceptRecipe,
  text: string,
  index?: number,
): void {
  const heading = index == null ? text : `${text} ${String(index + 1).padStart(2, "0")}`;
  textObject(scene, heading, 85, 72, 940, 70, {
    appearance: conceptAppearance(recipe, "plain", {
      textColor: recipe.accent,
      fontSize:
        recipe.id === "bold-typography"
          ? 64
          : recipe.id === "newspaper"
            ? 34
            : 28,
      fontWeight: 800,
      letterSpacing:
        recipe.id === "swiss-grid" || recipe.id === "blueprint" ? 2.4 : 0.8,
    }),
    parallaxDepth: recipe.id === "aurora" ? -0.25 : undefined,
  });
}

function conceptCloud(scene: InteractiveScene, x: number, y: number, scale = 1): void {
  const fill = "rgba(255,255,255,.85)";
  shapeObject(scene, "ellipse", x, y, 140 * scale, 70 * scale, { fill, opacity: 0.9 });
  shapeObject(scene, "ellipse", x + 70 * scale, y - 28 * scale, 110 * scale, 92 * scale, { fill, opacity: 0.9 });
  shapeObject(scene, "ellipse", x + 130 * scale, y, 140 * scale, 70 * scale, { fill, opacity: 0.9 });
}

function decorateConceptScene(
  scene: InteractiveScene,
  recipe: ConceptRecipe,
  stage: "intro" | "work" | "project" | "skills" | "contact",
): void {
  switch (recipe.id) {
    case "underwater":
      [140, 330, 980, 1190].forEach((x, index) => {
        shapeObject(scene, "ellipse", x, 120 + index * 120, 28 + index * 8, 28 + index * 8, {
          fill: "rgba(103,232,249,.16)",
          stroke: "rgba(165,243,252,.5)",
          strokeWidth: 2,
          parallaxDepth: 0.4 + index * 0.2,
          motion: { preset: "bob", speed: 0.45 + index * 0.08, intensity: 18 },
        });
      });
      shapeObject(scene, "line", 0, 790, 1440, 8, {
        stroke: "rgba(45,212,191,.42)",
        strokeWidth: 8,
      });
      break;
    case "sky-balloon":
      conceptCloud(scene, 70, 150, 0.75);
      conceptCloud(scene, 990, 135, 0.9);
      conceptCloud(scene, 820, 650, 0.55);
      shapeObject(scene, "ellipse", 1090, 350, 145, 180, {
        fill: "#ef8354",
        stroke: "#c95e34",
        strokeWidth: 4,
        motion: { preset: "float", speed: 0.5, intensity: 20 },
        parallaxDepth: 0.75,
      });
      shapeObject(scene, "rectangle", 1132, 530, 60, 48, {
        fill: "#8b5a3c",
        stroke: "#6f432b",
        strokeWidth: 3,
        parallaxDepth: 0.75,
      });
      break;
    case "desktop-workspace":
      shapeObject(scene, "rectangle", 70, 55, 1300, 790, {
        fill: "rgba(242,247,253,.72)",
        stroke: "#9cadc2",
        strokeWidth: 2,
      });
      shapeObject(scene, "rectangle", 70, 55, 1300, 54, {
        fill: "#d0dae7",
        stroke: "#9cadc2",
        strokeWidth: 2,
      });
      [98, 128, 158].forEach((x, index) =>
        shapeObject(scene, "ellipse", x, 72, 18, 18, {
          fill: ["#ff6b6b", "#ffd166", "#5fd38d"][index],
          stroke: "transparent",
        }),
      );
      break;
    case "creative-office":
      shapeObject(scene, "rectangle", 0, 690, 1440, 210, {
        fill: "#b7835f",
        stroke: "#9d6c4d",
        strokeWidth: 2,
      });
      shapeObject(scene, "rectangle", 990, 95, 300, 230, {
        fill: "#cfe7f2",
        stroke: "#a6c8d7",
        strokeWidth: 5,
      });
      shapeObject(scene, "rectangle", 1040, 690, 180, 28, {
        fill: "#5e4638",
        stroke: "#5e4638",
      });
      shapeObject(scene, "line", 1165, 570, 5, 120, {
        stroke: "#5e4638",
        strokeWidth: 5,
      });
      break;
    case "executive":
      shapeObject(scene, "rectangle", 70, 85, 8, 710, {
        fill: recipe.accent,
        stroke: recipe.accent,
      });
      shapeObject(scene, "line", 90, 150, 1180, 4, {
        stroke: "rgba(216,178,110,.42)",
        strokeWidth: 2,
      });
      break;
    case "editorial":
      [485, 935].forEach(x =>
        shapeObject(scene, "line", x, 160, 2, 610, {
          stroke: "#cfc3b5",
          strokeWidth: 2,
        }),
      );
      textObject(scene, stage === "intro" ? "W" : "§", 1110, 75, 220, 190, {
        appearance: conceptAppearance(recipe, "plain", {
          textColor: "rgba(166,59,50,.12)",
          fontSize: 150,
          fontWeight: 700,
          textAlign: "center",
        }),
      });
      break;
    case "split-screen":
      shapeObject(scene, "rectangle", 720, 0, 720, 900, {
        fill: "#f4edfb",
        stroke: "#f4edfb",
      });
      shapeObject(scene, "line", 718, 0, 4, 900, {
        stroke: recipe.accent,
        strokeWidth: 4,
      });
      break;
    case "swiss-grid":
      [90, 420, 750, 1080, 1350].forEach(x =>
        shapeObject(scene, "line", x, 80, 2, 720, {
          stroke: "rgba(30,30,30,.13)",
          strokeWidth: 1,
        }),
      );
      [160, 460, 760].forEach(y =>
        shapeObject(scene, "line", 70, y, 1300, 2, {
          stroke: "rgba(30,30,30,.13)",
          strokeWidth: 1,
        }),
      );
      shapeObject(scene, "rectangle", 90, 80, 16, 70, {
        fill: recipe.accent,
        stroke: recipe.accent,
      });
      break;
    case "career-timeline":
      shapeObject(scene, "line", 90, 690, 1260, 5, {
        stroke: "#e7b97d",
        strokeWidth: 5,
      });
      [130, 450, 770, 1090].forEach((x, index) =>
        shapeObject(scene, "ellipse", x, 664, 54, 54, {
          fill: index % 2 ? "#fff4dd" : recipe.accent,
          stroke: recipe.accent,
          strokeWidth: 4,
          motion: { preset: "pulse", speed: 0.55 + index * 0.05, intensity: 10 },
        }),
      );
      break;
    case "case-study":
      textObject(scene, stage === "project" ? "02" : "01", 1060, 70, 260, 170, {
        appearance: conceptAppearance(recipe, "plain", {
          textColor: "rgba(15,118,110,.12)",
          fontSize: 130,
          fontWeight: 800,
          textAlign: "right",
        }),
      });
      shapeObject(scene, "line", 90, 155, 1260, 3, {
        stroke: "#bfd3d1",
        strokeWidth: 3,
      });
      break;
    case "command-center":
      [1150, 1185, 1220].forEach((size, index) =>
        shapeObject(scene, "ellipse", 1010 - index * 17, 120 - index * 17, 230 + index * 34, 230 + index * 34, {
          fill: "rgba(34,211,238,.02)",
          stroke: `rgba(34,211,238,${0.42 - index * 0.1})`,
          strokeWidth: 2,
          motion: { preset: "spin", speed: 0.22 + index * 0.06, intensity: 10 },
        }),
      );
      shapeObject(scene, "line", 80, 150, 1280, 2, {
        stroke: "#164e63",
        strokeWidth: 2,
      });
      break;
    case "blueprint":
      for (let x = 60; x <= 1380; x += 110) {
        shapeObject(scene, "line", x, 50, 1, 800, {
          stroke: "rgba(142,229,255,.14)",
          strokeWidth: 1,
        });
      }
      for (let y = 80; y <= 820; y += 90) {
        shapeObject(scene, "line", 50, y, 1340, 1, {
          stroke: "rgba(142,229,255,.14)",
          strokeWidth: 1,
        });
      }
      shapeObject(scene, "rectangle", 70, 60, 1300, 760, {
        fill: "rgba(0,0,0,0)",
        stroke: "rgba(142,229,255,.48)",
        strokeWidth: 2,
      });
      break;
    case "magazine":
      shapeObject(scene, "rectangle", 0, 0, 1440, 82, {
        fill: "#231f20",
        stroke: "#231f20",
      });
      textObject(scene, "WERK /  ISSUE", 90, 20, 420, 50, {
        appearance: appearance("plain", {
          textColor: "#ffffff",
          accentColor: recipe.accent,
          fontFamily: recipe.fontFamily,
          fontSize: 28,
          fontWeight: 800,
          letterSpacing: 2,
        }),
      });
      shapeObject(scene, "rectangle", 1160, 100, 160, 160, {
        fill: "rgba(236,72,153,.13)",
        stroke: recipe.accent,
        strokeWidth: 3,
        rotation: 7,
      });
      break;
    case "bold-typography":
      textObject(scene, stage === "intro" ? "ME." : stage.toUpperCase() + ".", 40, 80, 1340, 260, {
        appearance: appearance("plain", {
          textColor: stage === "project" ? "#111111" : "rgba(17,17,17,.16)",
          accentColor: "#111111",
          fontFamily: recipe.fontFamily,
          fontSize: 190,
          fontWeight: 900,
          letterSpacing: -4,
        }),
        parallaxDepth: -0.8,
      });
      shapeObject(scene, "rectangle", 1100, 625, 250, 90, {
        fill: recipe.secondary,
        stroke: "#111111",
        strokeWidth: 5,
        rotation: -5,
        motion: { preset: "bob", speed: 0.65, intensity: 14 },
      });
      break;
    case "aurora":
      [
        { y: 110, color: "rgba(121,242,192,.18)", rotation: -7 },
        { y: 210, color: "rgba(110,168,255,.16)", rotation: 5 },
        { y: 315, color: "rgba(185,120,255,.14)", rotation: -4 },
      ].forEach((band, index) =>
        shapeObject(scene, "rectangle", -80, band.y, 1600, 90, {
          fill: band.color,
          stroke: "transparent",
          rotation: band.rotation,
          parallaxDepth: -0.5 + index * 0.15,
          motion: { preset: "float", speed: 0.25 + index * 0.08, intensity: 18 },
        }),
      );
      break;
    case "pitch-deck":
      shapeObject(scene, "rectangle", 55, 50, 1330, 800, {
        fill: "#ffffff",
        stroke: "#ddd8e4",
        strokeWidth: 2,
      });
      shapeObject(scene, "rectangle", 55, 50, 16, 800, {
        fill: recipe.accent,
        stroke: recipe.accent,
      });
      textObject(scene, stage.toUpperCase(), 1180, 765, 130, 40, {
        appearance: conceptAppearance(recipe, "plain", {
          textColor: "#8a8490",
          fontSize: 16,
          fontWeight: 700,
          textAlign: "right",
        }),
      });
      break;
    case "city-lights":
      [70, 190, 330, 520, 700, 890, 1080, 1230].forEach((x, index) => {
        const height = 180 + (index % 4) * 75;
        shapeObject(scene, "rectangle", x, 900 - height, 100 + (index % 3) * 20, height, {
          fill: index % 2 ? "#101f36" : "#0d1a2f",
          stroke: "#273a55",
          strokeWidth: 2,
          parallaxDepth: -0.3,
        });
        [0, 1, 2].forEach(row =>
          shapeObject(scene, "rectangle", x + 18, 900 - height + 28 + row * 45, 14, 22, {
            fill: row === index % 3 ? "rgba(251,191,36,.82)" : "rgba(125,211,252,.25)",
            stroke: "transparent",
          }),
        );
      });
      break;
    case "scrapbook":
      [
        { x: 75, y: 95, r: -8 },
        { x: 1190, y: 120, r: 10 },
        { x: 1080, y: 690, r: -6 },
      ].forEach(tape =>
        shapeObject(scene, "rectangle", tape.x, tape.y, 130, 34, {
          fill: "rgba(245,220,137,.62)",
          stroke: "rgba(166,138,73,.25)",
          strokeWidth: 1,
          rotation: tape.r,
        }),
      );
      shapeObject(scene, "ellipse", 1180, 540, 110, 110, {
        fill: "rgba(219,111,85,.14)",
        stroke: recipe.accent,
        strokeWidth: 3,
        rotation: 8,
      });
      break;
    case "retro-arcade":
      shapeObject(scene, "rectangle", 62, 60, 1315, 775, {
        fill: "rgba(8,0,20,.35)",
        stroke: "#7c3aed",
        strokeWidth: 4,
      });
      shapeObject(scene, "rectangle", 82, 80, 1275, 735, {
        fill: "rgba(0,0,0,0)",
        stroke: "#ff4fd8",
        strokeWidth: 2,
      });
      [150, 270, 390, 510].forEach((y, index) =>
        shapeObject(scene, "rectangle", 1185, y, 75, 18, {
          fill: index % 2 ? "#22d3ee" : "#ff4fd8",
          stroke: "transparent",
          motion: { preset: "pulse", speed: 0.45 + index * 0.08, intensity: 10 },
        }),
      );
      break;

    case "botanical-greenhouse":
      [110, 390, 670, 950, 1230].forEach(x =>
        shapeObject(scene, "line", x, 80, 2, 720, {
          stroke: "rgba(79,125,74,.22)",
          strokeWidth: 2,
        }),
      );
      [180, 690].forEach(y =>
        shapeObject(scene, "line", 70, y, 1300, 2, {
          stroke: "rgba(79,125,74,.18)",
          strokeWidth: 2,
        }),
      );
      [90, 250, 1140, 1260].forEach((x, index) => {
        shapeObject(scene, "ellipse", x, 560 - (index % 2) * 120, 70, 115, {
          fill: index % 2 ? "rgba(79,125,74,.18)" : "rgba(103,140,79,.24)",
          stroke: "rgba(79,125,74,.35)",
          strokeWidth: 2,
          rotation: index % 2 ? 24 : -24,
          motion: { preset: "bob", speed: 0.35 + index * 0.05, intensity: 8 },
        });
      });
      break;
    case "library-stacks":
      [85, 365, 645, 925, 1205].forEach((x, index) => {
        shapeObject(scene, "rectangle", x, 100, 150, 680, {
          fill: index % 2 ? "#4b342a" : "#51382d",
          stroke: "#6d4c3b",
          strokeWidth: 2,
        });
        [175, 325, 475, 625].forEach((y, row) =>
          shapeObject(scene, "rectangle", x + 22, y, 30 + (row % 2) * 14, 76, {
            fill: ["#8b4d3c", "#54705b", "#b08b54"][row % 3],
            stroke: "transparent",
            opacity: 0.72,
          }),
        );
      });
      break;
    case "museum-gallery":
      shapeObject(scene, "line", 70, 760, 1300, 3, {
        stroke: "#c8c0b5",
        strokeWidth: 3,
      });
      [160, 540, 920].forEach((x, index) => {
        shapeObject(scene, "rectangle", x, 150, 260, 190, {
          fill: "#f9f7f2",
          stroke: index === 1 ? recipe.accent : "#b9b0a4",
          strokeWidth: index === 1 ? 6 : 3,
        });
        shapeObject(scene, "rectangle", x + 85, 690, 90, 70, {
          fill: "#d9d2c6",
          stroke: "#c2baae",
          strokeWidth: 2,
        });
      });
      break;
    case "mountain-expedition":
      [
        { x: -40, y: 510, w: 620, h: 360, c: "#899da6", r: 18 },
        { x: 360, y: 420, w: 720, h: 440, c: "#6f858e", r: -10 },
        { x: 840, y: 360, w: 680, h: 500, c: "#526b74", r: 12 },
      ].forEach(m =>
        shapeObject(scene, "rectangle", m.x, m.y, m.w, m.h, {
          fill: m.c,
          stroke: "transparent",
          rotation: m.r,
          parallaxDepth: -0.45,
        }),
      );
      shapeObject(scene, "line", 100, 720, 1190, 5, {
        stroke: "rgba(204,107,61,.72)",
        strokeWidth: 5,
        rotation: -18,
      });
      break;
    case "desert-roadtrip":
      shapeObject(scene, "ellipse", 1110, 100, 170, 170, {
        fill: "rgba(246,177,86,.9)",
        stroke: "transparent",
        parallaxDepth: -0.4,
      });
      shapeObject(scene, "rectangle", -80, 655, 1600, 310, {
        fill: "#cf875d",
        stroke: "transparent",
        rotation: -4,
        parallaxDepth: -0.5,
      });
      shapeObject(scene, "line", 200, 820, 1120, 10, {
        stroke: "#4d3c36",
        strokeWidth: 10,
        rotation: -8,
      });
      [0, 1, 2, 3].forEach(index =>
        shapeObject(scene, "rectangle", 320 + index * 230, 760 - index * 32, 80, 8, {
          fill: "#f8dfac",
          stroke: "transparent",
          rotation: -8,
        }),
      );
      break;
    case "train-journey":
      shapeObject(scene, "rectangle", 45, 90, 1350, 690, {
        fill: "rgba(255,250,235,.08)",
        stroke: "#c5ad84",
        strokeWidth: 5,
      });
      [95, 430, 765, 1100].forEach(x =>
        shapeObject(scene, "rectangle", x, 150, 245, 360, {
          fill: "rgba(238,229,207,.12)",
          stroke: "#c5ad84",
          strokeWidth: 4,
        }),
      );
      shapeObject(scene, "line", 70, 735, 1300, 6, {
        stroke: "#d5c199",
        strokeWidth: 6,
      });
      break;
    case "airport-departures":
      shapeObject(scene, "rectangle", 70, 80, 1300, 92, {
        fill: "#172331",
        stroke: "#172331",
      });
      textObject(scene, stage === "intro" ? "ON TIME" : "GATE OPEN", 1090, 103, 210, 42, {
        appearance: conceptAppearance(recipe, "plain", {
          textColor: "#c8f0c2",
          fontSize: 22,
          fontWeight: 800,
          textAlign: "right",
        }),
      });
      [230, 410, 590, 770].forEach(y =>
        shapeObject(scene, "line", 85, y, 1270, 2, {
          stroke: "#b7c7d4",
          strokeWidth: 1,
        }),
      );
      shapeObject(scene, "line", 1040, 690, 260, 6, {
        stroke: recipe.accent,
        strokeWidth: 6,
        rotation: -18,
      });
      break;
    case "recording-studio":
      [80, 170, 260, 350, 440, 530, 620, 710, 800, 890, 980, 1070, 1160, 1250].forEach((x, index) =>
        shapeObject(scene, "rectangle", x, 685 - (index % 5) * 34, 34, 125 + (index % 5) * 34, {
          fill: index % 3 === 0 ? "#f59e0b" : index % 3 === 1 ? "#22d3ee" : "#8b5cf6",
          stroke: "transparent",
          opacity: 0.52,
          motion: { preset: "pulse", speed: 0.45 + (index % 4) * 0.08, intensity: 12 },
        }),
      );
      shapeObject(scene, "line", 70, 150, 1300, 2, {
        stroke: "#434a55",
        strokeWidth: 2,
      });
      break;
    case "cinema-credits":
      shapeObject(scene, "rectangle", 0, 0, 1440, 110, {
        fill: "#000000",
        stroke: "#000000",
      });
      shapeObject(scene, "rectangle", 0, 790, 1440, 110, {
        fill: "#000000",
        stroke: "#000000",
      });
      [45, 135, 225, 315, 405, 495, 585, 675, 765, 855, 945, 1035, 1125, 1215, 1305].forEach(x => {
        shapeObject(scene, "rectangle", x, 24, 48, 34, { fill: "#efe3cd", stroke: "transparent", opacity: 0.72 });
        shapeObject(scene, "rectangle", x, 842, 48, 34, { fill: "#efe3cd", stroke: "transparent", opacity: 0.72 });
      });
      textObject(scene, stage === "intro" ? "PRESENTS" : "SCENE", 1120, 140, 200, 42, {
        appearance: conceptAppearance(recipe, "plain", {
          textColor: "#d4b07a",
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: 4,
          textAlign: "right",
        }),
      });
      break;
    case "comic-book":
      [80, 520, 960].forEach((x, index) =>
        shapeObject(scene, "rectangle", x, 120 + (index % 2) * 42, 360, 230, {
          fill: index % 2 ? "#49a7e8" : "#fffdf3",
          stroke: "#111111",
          strokeWidth: 7,
          rotation: index === 1 ? 2 : -1,
        }),
      );
      shapeObject(scene, "ellipse", 1080, 620, 240, 130, {
        fill: "#ffffff",
        stroke: "#111111",
        strokeWidth: 6,
        rotation: -5,
      });
      textObject(scene, stage === "project" ? "POW!" : "NEXT!", 1120, 650, 160, 55, {
        appearance: conceptAppearance(recipe, "plain", {
          textColor: recipe.accent,
          fontSize: 34,
          fontWeight: 900,
          textAlign: "center",
        }),
        rotation: -6,
      });
      break;
    case "science-lab":
      [130, 1130].forEach((x, side) =>
        [180, 330, 480, 630].forEach((y, index) =>
          shapeObject(scene, "ellipse", x + (index % 2) * 50, y, 48 + index * 8, 48 + index * 8, {
            fill: side ? "rgba(15,139,141,.10)" : "rgba(52,152,219,.10)",
            stroke: side ? "rgba(15,139,141,.45)" : "rgba(52,152,219,.42)",
            strokeWidth: 2,
            motion: { preset: "bob", speed: 0.4 + index * 0.06, intensity: 9 },
          }),
        ),
      );
      [220, 440, 660].forEach(y =>
        shapeObject(scene, "line", 330, y, 780, 2, {
          stroke: "rgba(15,139,141,.15)",
          strokeWidth: 1,
        }),
      );
      break;
    case "detective-board":
      [
        { x: 120, y: 150, w: 280, h: 170, r: -4 },
        { x: 560, y: 130, w: 300, h: 185, r: 3 },
        { x: 1010, y: 165, w: 250, h: 160, r: -2 },
      ].forEach(note =>
        shapeObject(scene, "rectangle", note.x, note.y, note.w, note.h, {
          fill: "rgba(244,233,210,.72)",
          stroke: "#5e4935",
          strokeWidth: 2,
          rotation: note.r,
        }),
      );
      [
        [310, 300, 610, 220],
        [780, 260, 1080, 290],
        [350, 320, 1020, 650],
      ].forEach((line, index) =>
        shapeObject(scene, "line", line[0], line[1], line[2] - line[0], 4, {
          stroke: "rgba(166,47,47,.8)",
          strokeWidth: 4,
          rotation: index === 2 ? 23 : index ? 6 : -8,
        }),
      );
      [280, 730, 1130].forEach(x =>
        shapeObject(scene, "ellipse", x, 255, 18, 18, {
          fill: "#a62f2f",
          stroke: "#7d1f1f",
          strokeWidth: 2,
        }),
      );
      break;
    case "atlas-explorer":
      [180, 420, 660, 900, 1140].forEach(x =>
        shapeObject(scene, "line", x, 90, 2, 720, {
          stroke: "rgba(77,96,75,.18)",
          strokeWidth: 1,
        }),
      );
      [190, 390, 590].forEach(y =>
        shapeObject(scene, "line", 70, y, 1300, 2, {
          stroke: "rgba(77,96,75,.18)",
          strokeWidth: 1,
        }),
      );
      shapeObject(scene, "ellipse", 1070, 120, 210, 210, {
        fill: "rgba(255,255,255,.12)",
        stroke: recipe.accent,
        strokeWidth: 3,
        rotation: 10,
      });
      shapeObject(scene, "line", 1174, 135, 4, 180, {
        stroke: recipe.accent,
        strokeWidth: 4,
      });
      shapeObject(scene, "line", 1085, 224, 180, 4, {
        stroke: recipe.accent,
        strokeWidth: 4,
      });
      break;
    case "airmail":
      [0, 80, 160, 240, 320, 400, 480, 560, 640, 720, 800, 880, 960, 1040, 1120, 1200, 1280, 1360].forEach((x, index) =>
        shapeObject(scene, "rectangle", x, 0, 42, 18, {
          fill: index % 2 ? "#3f7fa5" : "#c83e45",
          stroke: "transparent",
          rotation: -18,
        }),
      );
      [0, 80, 160, 240, 320, 400, 480, 560, 640, 720, 800, 880, 960, 1040, 1120, 1200, 1280, 1360].forEach((x, index) =>
        shapeObject(scene, "rectangle", x, 875, 42, 18, {
          fill: index % 2 ? "#c83e45" : "#3f7fa5",
          stroke: "transparent",
          rotation: -18,
        }),
      );
      shapeObject(scene, "rectangle", 1110, 100, 180, 150, {
        fill: "rgba(255,255,255,.25)",
        stroke: "#c83e45",
        strokeWidth: 4,
        rotation: 6,
      });
      textObject(scene, "AIR", 1135, 145, 130, 50, {
        appearance: conceptAppearance(recipe, "plain", {
          textColor: "#c83e45",
          fontSize: 28,
          fontWeight: 900,
          textAlign: "center",
        }),
        rotation: 6,
      });
      break;
    case "construction-site":
      [80, 360, 640, 920, 1200].forEach(x =>
        shapeObject(scene, "line", x, 110, 4, 680, {
          stroke: "rgba(255,255,255,.18)",
          strokeWidth: 4,
        }),
      );
      [180, 410, 640].forEach(y =>
        shapeObject(scene, "line", 60, y, 1320, 4, {
          stroke: "rgba(255,255,255,.18)",
          strokeWidth: 4,
        }),
      );
      [0, 1, 2, 3, 4, 5].forEach(index =>
        shapeObject(scene, "rectangle", 980 + index * 55, 95, 36, 110, {
          fill: index % 2 ? "#24272c" : "#f2b705",
          stroke: "transparent",
          rotation: -35,
        }),
      );
      break;
    case "coffee-shop":
      shapeObject(scene, "rectangle", 0, 695, 1440, 205, {
        fill: "#855e45",
        stroke: "#6f4d38",
        strokeWidth: 2,
      });
      shapeObject(scene, "rectangle", 1010, 120, 280, 250, {
        fill: "#30271f",
        stroke: "#6f4d38",
        strokeWidth: 8,
      });
      textObject(scene, stage === "skills" ? "TODAY'S BLEND" : "MENU", 1060, 150, 180, 50, {
        appearance: conceptAppearance(recipe, "plain", {
          textColor: "#f4ead7",
          fontSize: 22,
          fontWeight: 800,
          textAlign: "center",
        }),
      });
      shapeObject(scene, "ellipse", 1110, 590, 100, 34, {
        fill: "#f2e6d4",
        stroke: "#7a4b35",
        strokeWidth: 4,
      });
      shapeObject(scene, "rectangle", 1125, 500, 70, 95, {
        fill: "#f2e6d4",
        stroke: "#7a4b35",
        strokeWidth: 4,
      });
      break;
    case "zen-garden":
      [170, 210, 250, 290, 330].forEach((y, index) =>
        shapeObject(scene, "ellipse", 930 - index * 12, y, 330 + index * 55, 110 + index * 26, {
          fill: "transparent",
          stroke: `rgba(109,125,104,${0.22 - index * 0.025})`,
          strokeWidth: 2,
          rotation: -5,
        }),
      );
      [
        { x: 1030, y: 500, w: 120, h: 88 },
        { x: 1170, y: 570, w: 95, h: 70 },
        { x: 910, y: 620, w: 105, h: 76 },
      ].forEach(stone =>
        shapeObject(scene, "ellipse", stone.x, stone.y, stone.w, stone.h, {
          fill: "#a9aea4",
          stroke: "#8a9187",
          strokeWidth: 2,
        }),
      );
      break;
    case "chess-strategy":
      [0, 1, 2, 3].forEach(row =>
        [0, 1, 2, 3].forEach(col =>
          shapeObject(scene, "rectangle", 960 + col * 92, 420 + row * 92, 92, 92, {
            fill: (row + col) % 2 ? "#2b2823" : "#d8c9a9",
            stroke: "transparent",
            opacity: 0.82,
          }),
        ),
      );
      textObject(scene, stage === "project" ? "♛" : "♞", 1055, 485, 180, 180, {
        appearance: conceptAppearance(recipe, "plain", {
          textColor: recipe.accent,
          fontSize: 125,
          fontWeight: 700,
          textAlign: "center",
        }),
      });
      break;
    case "neon-subway":
      shapeObject(scene, "line", 100, 700, 1180, 10, {
        stroke: "#22d3ee",
        strokeWidth: 10,
      });
      [160, 430, 700, 970, 1240].forEach((x, index) => {
        shapeObject(scene, "ellipse", x, 674, 54, 54, {
          fill: index === 2 ? recipe.accent : "#071521",
          stroke: index === 2 ? recipe.accent : "#22d3ee",
          strokeWidth: 5,
          motion: index === 2 ? { preset: "pulse", speed: 0.55, intensity: 16 } : undefined,
        });
      });
      shapeObject(scene, "rectangle", 950, 100, 340, 90, {
        fill: "#101f30",
        stroke: recipe.accent,
        strokeWidth: 3,
      });
      textObject(scene, stage === "contact" ? "EXIT →" : "LINE 08", 995, 126, 250, 42, {
        appearance: conceptAppearance(recipe, "plain", {
          textColor: "#ffffff",
          fontSize: 24,
          fontWeight: 800,
          textAlign: "center",
        }),
      });
      break;
    case "weather-station":
      shapeObject(scene, "ellipse", 1080, 95, 160, 160, {
        fill: "rgba(242,168,29,.92)",
        stroke: "rgba(242,168,29,.35)",
        strokeWidth: 8,
        motion: { preset: "pulse", speed: 0.5, intensity: 8 },
      });
      conceptCloud(scene, 870, 185, 0.55);
      [980, 1040, 1100].forEach((x, index) =>
        shapeObject(scene, "line", x, 310, 2, 72, {
          stroke: "#4da2d5",
          strokeWidth: 4,
          rotation: 8,
          motion: { preset: "bob", speed: 0.45 + index * 0.08, intensity: 8 },
        }),
      );
      shapeObject(scene, "line", 80, 705, 1280, 2, {
        stroke: "rgba(23,54,76,.16)",
        strokeWidth: 2,
      });
      break;
    case "newspaper":
      shapeObject(scene, "line", 70, 150, 1300, 5, {
        stroke: "#17130f",
        strokeWidth: 5,
      });
      shapeObject(scene, "line", 70, 167, 1300, 2, {
        stroke: "#17130f",
        strokeWidth: 2,
      });
      [485, 930].forEach(x =>
        shapeObject(scene, "line", x, 205, 2, 570, {
          stroke: "#b3aa9c",
          strokeWidth: 1,
        }),
      );
      break;
  }
}

function placeConceptBinding(
  scene: InteractiveScene,
  recipe: ConceptRecipe,
  binding: InteractiveResumeContentBinding,
  slot: ConceptSlot,
  index: number,
  name: string,
): InteractiveSceneObject {
  const object = boundObject(
    scene,
    binding,
    slot.x,
    slot.y,
    slot.width,
    slot.height,
    {
      appearance: conceptAppearance(recipe),
      enter: index % 3 === 1 ? "fade-left" : "fade-up",
      scrollY:
        conceptMotionLevel(recipe) === "Dynamic"
          ? [30 + index * 8, -20 - index * 5]
          : undefined,
      parallaxDepth:
        conceptMotionLevel(recipe) === "Dynamic"
          ? 0.12 + (index % 3) * 0.12
          : undefined,
      rotation: slot.rotation,
      name,
    },
  );
  return object;
}

function buildConceptTemplate(
  data: ResumeData,
  recipe: ConceptRecipe,
): InteractiveSceneCollection {
  const scenes: InteractiveScene[] = [];

  const intro = conceptScene(recipe, recipe.eyebrow);
  decorateConceptScene(intro, recipe, "intro");
  conceptHeading(intro, recipe, recipe.eyebrow);
  const introSlots = conceptSlots(recipe.id, "intro");
  placeConceptBinding(
    intro,
    recipe,
    { source: "personal", field: "fullName" },
    introSlots[0],
    0,
    "Full name",
  );
  placeConceptBinding(
    intro,
    recipe,
    { source: "personal", field: "summary" },
    introSlots[1],
    1,
    "Summary",
  );
  placeConceptBinding(
    intro,
    recipe,
    { source: "personal", field: "location" },
    introSlots[2],
    2,
    "Location",
  );
  scenes.push(intro);

  const work = workBindings(data);
  const workSlots = conceptSlots(recipe.id, "work");
  chunks(work, workSlots.length).forEach((bindings, page) => {
    const scene = conceptScene(
      recipe,
      page ? `${recipe.experienceTitle} ${page + 1}` : recipe.experienceTitle,
    );
    decorateConceptScene(scene, recipe, "work");
    conceptHeading(scene, recipe, recipe.experienceTitle, page);
    bindings.forEach((binding, index) =>
      placeConceptBinding(
        scene,
        recipe,
        binding,
        workSlots[index],
        index,
        "Experience",
      ),
    );
    scenes.push(scene);
  });

  const projects = projectBindings(data);
  const projectSlots = conceptSlots(recipe.id, "project");
  chunks(projects, projectSlots.length).forEach((bindings, page) => {
    const scene = conceptScene(
      recipe,
      page ? `${recipe.projectTitle} ${page + 1}` : recipe.projectTitle,
    );
    decorateConceptScene(scene, recipe, "project");
    conceptHeading(scene, recipe, recipe.projectTitle, page);
    bindings.forEach((binding, index) =>
      placeConceptBinding(
        scene,
        recipe,
        binding,
        projectSlots[index],
        index,
        "Project",
      ),
    );
    scenes.push(scene);
  });

  const skills = skillBindings(data);
  if (skills.length) {
    const scene = conceptScene(recipe, recipe.skillsTitle);
    decorateConceptScene(scene, recipe, "skills");
    conceptHeading(scene, recipe, recipe.skillsTitle);
    const skillSlots = conceptSlots(recipe.id, "skills");
    skills.slice(0, skillSlots.length).forEach((binding, index) => {
      placeConceptBinding(
        scene,
        recipe,
        binding,
        skillSlots[index],
        index,
        "Skill",
      );
    });
    scenes.push(scene);
  }

  const contact = conceptScene(recipe, recipe.contactTitle, "none");
  decorateConceptScene(contact, recipe, "contact");
  conceptHeading(contact, recipe, recipe.contactTitle);
  const contactSlots = conceptSlots(recipe.id, "contact");
  const contactBindings: InteractiveResumeContentBinding[] = [
    { source: "personal", field: "email" },
    { source: "personal", field: "website" },
    ...linkBindings(data).slice(0, 2),
  ];
  contactBindings.forEach((binding, index) => {
    const slot = contactSlots[index] ?? contactSlots[contactSlots.length - 1];
    placeConceptBinding(
      contact,
      recipe,
      binding,
      slot,
      index,
      "Contact",
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
  if (templateId === "minimal-motion") {
    return buildMinimalMotion(data);
  }

  return buildConceptTemplate(data, CONCEPT_RECIPES[templateId]);
}

/**
 * Maps Phase 18's old single template ID to the current library.
 */
export function normalizeInteractiveTemplateId(
  value: string | undefined,
): InteractiveTemplateId | undefined {
  if (value === "career-journey-starter") return "career-journey";
  if (
    value &&
    INTERACTIVE_TEMPLATES.some(template => template.id === value)
  ) {
    return value as InteractiveTemplateId;
  }
  return undefined;
}
