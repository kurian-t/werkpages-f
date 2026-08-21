import type { ResumeData, ResumeDesign } from "./types";
import { buildStandaloneResumeWebHtml } from "./resumeWeb";
import { buildResumePresentationCss } from "./resumePresentation";

export type WebMotionEffect =
  | "none"
  | "fade"
  | "fade-up"
  | "slide-left"
  | "slide-right"
  | "blur-in"
  | "tracking-in"
  | "pop"
  | "flip-in";

export type WebMotionSpeed = "slow" | "normal" | "fast";

export interface WebMotionSpec {
  effect: WebMotionEffect;
  speed: WebMotionSpeed;
  delayMs: number;
  staggerMs: number;
}

export type WebAnimationTarget =
  | "hero"
  | "name"
  | "summary"
  | "contact"
  | "photo"
  | "section"
  | "sectionHeading"
  | "sectionBody"
  | "experience"
  | "projects"
  | "education"
  | "skills"
  | "links"
  | "video";

export type WebBackgroundEffect =
  | "none"
  | "gradient-drift"
  | "aurora"
  | "floating-orbs"
  | "grid-flow"
  | "spotlight";

export type WebBackgroundSpeed = "slow" | "normal" | "fast";
export type WebHoverEffect = "none" | "lift" | "glow" | "tilt";

export interface WebAnimationStudioSettings {
  targets: Record<WebAnimationTarget, WebMotionSpec>;
  instances: Record<string, WebMotionSpec>;
  background: {
    effect: WebBackgroundEffect;
    speed: WebBackgroundSpeed;
    intensity: number;
    secondaryColor: string;
  };
  hoverEffect: WebHoverEffect;
}

export type WebAnimationPreset =
  | "none"
  | "polished"
  | "editorial"
  | "bold"
  | "playful";

type DesignWithAnimationStudio = ResumeDesign & {
  webResume?: Record<string, unknown> & {
    animationStudio?: Partial<WebAnimationStudioSettings> & {
      targets?: Partial<Record<WebAnimationTarget, Partial<WebMotionSpec>>>;
      instances?: Record<string, Partial<WebMotionSpec>>;
      background?: Partial<WebAnimationStudioSettings["background"]>;
    };
  };
};

function spec(
  effect: WebMotionEffect,
  speed: WebMotionSpeed = "normal",
  delayMs = 0,
  staggerMs = 0,
): WebMotionSpec {
  return { effect, speed, delayMs, staggerMs };
}

export const DEFAULT_WEB_ANIMATION_STUDIO: WebAnimationStudioSettings = {
  // Neutral by default. Templates or the user opt into motion deliberately.
  targets: {
    hero: spec("none"),
    name: spec("none"),
    summary: spec("none"),
    contact: spec("none"),
    photo: spec("none"),
    section: spec("none"),
    sectionHeading: spec("none"),
    sectionBody: spec("none"),
    experience: spec("none"),
    projects: spec("none"),
    education: spec("none"),
    skills: spec("none"),
    links: spec("none"),
    video: spec("none"),
  } as Record<WebAnimationTarget, WebMotionSpec>,
  instances: {},
  background: {
    effect: "none",
    speed: "slow",
    intensity: 24,
    secondaryColor: "#7c3aed",
  },
  hoverEffect: "none",
};


const TARGETS: WebAnimationTarget[] = [
  "hero",
  "name",
  "summary",
  "contact",
  "photo",
  "section",
  "sectionHeading",
  "sectionBody",
  "experience",
  "projects",
  "education",
  "skills",
  "links",
  "video",
];

function normalizeSpec(
  value: Partial<WebMotionSpec> | undefined,
  fallback: WebMotionSpec,
): WebMotionSpec {
  const allowedEffects: WebMotionEffect[] = [
    "none",
    "fade",
    "fade-up",
    "slide-left",
    "slide-right",
    "blur-in",
    "tracking-in",
    "pop",
    "flip-in",
  ];
  const allowedSpeeds: WebMotionSpeed[] = ["slow", "normal", "fast"];

  return {
    effect: allowedEffects.includes(value?.effect as WebMotionEffect)
      ? value!.effect as WebMotionEffect
      : fallback.effect,
    speed: allowedSpeeds.includes(value?.speed as WebMotionSpeed)
      ? value!.speed as WebMotionSpeed
      : fallback.speed,
    delayMs: Math.max(
      0,
      Math.min(4000, Number(value?.delayMs ?? fallback.delayMs) || 0),
    ),
    staggerMs: Math.max(
      0,
      Math.min(1000, Number(value?.staggerMs ?? fallback.staggerMs) || 0),
    ),
  };
}

export function getWebAnimationStudio(
  design: ResumeDesign,
): WebAnimationStudioSettings {
  const saved = (design as DesignWithAnimationStudio).webResume?.animationStudio;
  const targets = {} as Record<WebAnimationTarget, WebMotionSpec>;

  for (const target of TARGETS) {
    targets[target] = normalizeSpec(
      saved?.targets?.[target],
      DEFAULT_WEB_ANIMATION_STUDIO.targets[target],
    );
  }

  const instances: Record<string, WebMotionSpec> = {};
  Object.entries(saved?.instances ?? {}).forEach(([instanceId, value]) => {
    instances[instanceId] = normalizeSpec(
      value,
      DEFAULT_WEB_ANIMATION_STUDIO.targets.section,
    );
  });

  const background = {
    ...DEFAULT_WEB_ANIMATION_STUDIO.background,
    ...(saved?.background ?? {}),
  };

  background.intensity = Math.max(
    0,
    Math.min(100, Number(background.intensity) || 0),
  );

  const allowedBackgrounds: WebBackgroundEffect[] = [
    "none",
    "gradient-drift",
    "aurora",
    "floating-orbs",
    "grid-flow",
    "spotlight",
  ];
  if (!allowedBackgrounds.includes(background.effect as WebBackgroundEffect)) {
    background.effect = "none";
  }

  const allowedBackgroundSpeeds: WebBackgroundSpeed[] = [
    "slow",
    "normal",
    "fast",
  ];
  if (!allowedBackgroundSpeeds.includes(background.speed as WebBackgroundSpeed)) {
    background.speed = "slow";
  }

  const hoverEffect =
    saved?.hoverEffect === "none" ||
    saved?.hoverEffect === "lift" ||
    saved?.hoverEffect === "glow" ||
    saved?.hoverEffect === "tilt"
      ? saved.hoverEffect
      : DEFAULT_WEB_ANIMATION_STUDIO.hoverEffect;

  return {
    targets,
    instances,
    background: background as WebAnimationStudioSettings["background"],
    hoverEffect,
  };
}

export function withWebAnimationStudio(
  design: ResumeDesign,
  studio: WebAnimationStudioSettings,
): ResumeDesign {
  const current = (design as DesignWithAnimationStudio).webResume ?? {};

  return {
    ...(design as DesignWithAnimationStudio),
    webResume: {
      ...current,
      animationStudio: studio,
    },
  } as ResumeDesign;
}

export function updateWebAnimationTarget(
  design: ResumeDesign,
  target: WebAnimationTarget,
  patch: Partial<WebMotionSpec>,
): ResumeDesign {
  const current = getWebAnimationStudio(design);
  return withWebAnimationStudio(design, {
    ...current,
    targets: {
      ...current.targets,
      [target]: normalizeSpec(
        { ...current.targets[target], ...patch },
        current.targets[target],
      ),
    },
  });
}

export function updateWebInstanceAnimation(
  design: ResumeDesign,
  instanceId: string,
  fallbackTarget: WebAnimationTarget,
  patch: Partial<WebMotionSpec>,
): ResumeDesign {
  const current = getWebAnimationStudio(design);
  const fallback =
    current.instances[instanceId] ??
    current.targets[fallbackTarget];

  return withWebAnimationStudio(design, {
    ...current,
    instances: {
      ...current.instances,
      [instanceId]: normalizeSpec(
        { ...fallback, ...patch },
        fallback,
      ),
    },
  });
}

export function clearWebInstanceAnimation(
  design: ResumeDesign,
  instanceId: string,
): ResumeDesign {
  const current = getWebAnimationStudio(design);
  const instances = { ...current.instances };
  delete instances[instanceId];

  return withWebAnimationStudio(design, {
    ...current,
    instances,
  });
}

export function effectiveWebMotionSpec(
  studio: WebAnimationStudioSettings,
  target: WebAnimationTarget,
  instanceId?: string,
): WebMotionSpec {
  return (
    (instanceId ? studio.instances[instanceId] : undefined) ??
    studio.targets[target]
  );
}

export function applyWebAnimationPreset(
  design: ResumeDesign,
  preset: WebAnimationPreset,
): ResumeDesign {
  const current = getWebAnimationStudio(design);

  if (preset === "none") {
    const targets = { ...current.targets };
    for (const target of TARGETS) targets[target] = spec("none");
    return withWebAnimationStudio(design, {
      ...current,
      targets,
      background: { ...current.background, effect: "none" },
      hoverEffect: "none",
    });
  }

  if (preset === "editorial") {
    return withWebAnimationStudio(design, {
      ...current,
      targets: {
        hero: spec("fade", "slow"),
        name: spec("tracking-in", "slow", 100),
        summary: spec("fade", "slow", 220),
        contact: spec("fade", "slow", 320, 55),
        photo: spec("fade", "slow", 160),
        section: spec("fade-up", "slow"),
        sectionHeading: spec("tracking-in", "slow"),
        sectionBody: spec("fade", "slow", 100),
        experience: spec("fade", "slow", 100, 90),
        projects: spec("fade-up", "slow", 100, 90),
        education: spec("fade", "slow", 100, 90),
        skills: spec("fade", "slow", 90, 55),
        links: spec("fade", "slow", 90, 65),
        video: spec("fade-up", "slow", 90),
      },
      background: {
        ...current.background,
        effect: "gradient-drift",
        speed: "slow",
        intensity: 16,
      },
      hoverEffect: "glow",
    });
  }

  if (preset === "bold") {
    return withWebAnimationStudio(design, {
      ...current,
      targets: {
        hero: spec("pop", "fast"),
        name: spec("slide-right", "fast", 80),
        summary: spec("slide-left", "normal", 160),
        contact: spec("pop", "fast", 230, 32),
        photo: spec("pop", "fast", 120),
        section: spec("fade-up", "normal"),
        sectionHeading: spec("slide-right", "fast"),
        sectionBody: spec("fade-up", "normal", 60),
        experience: spec("slide-left", "normal", 80, 55),
        projects: spec("pop", "fast", 80, 55),
        education: spec("slide-right", "normal", 80, 55),
        skills: spec("pop", "fast", 70, 28),
        links: spec("slide-left", "fast", 70, 35),
        video: spec("pop", "fast", 70),
      },
      background: {
        ...current.background,
        effect: "aurora",
        speed: "normal",
        intensity: 34,
      },
      hoverEffect: "glow",
    });
  }

  if (preset === "playful") {
    return withWebAnimationStudio(design, {
      ...current,
      targets: {
        hero: spec("pop", "normal"),
        name: spec("flip-in", "normal", 70),
        summary: spec("blur-in", "normal", 170),
        contact: spec("pop", "fast", 230, 35),
        photo: spec("pop", "normal", 130),
        section: spec("fade-up", "normal"),
        sectionHeading: spec("tracking-in", "normal"),
        sectionBody: spec("fade-up", "normal", 70),
        experience: spec("fade-up", "normal", 80, 70),
        projects: spec("pop", "normal", 80, 70),
        education: spec("fade-up", "normal", 80, 70),
        skills: spec("pop", "fast", 80, 32),
        links: spec("pop", "fast", 80, 40),
        video: spec("pop", "normal", 80),
      },
      background: {
        ...current.background,
        effect: "floating-orbs",
        speed: "normal",
        intensity: 38,
      },
      hoverEffect: "tilt",
    });
  }

  return withWebAnimationStudio(design, {
    ...current,
    targets: {
      hero: spec("fade-up", "normal"),
      name: spec("tracking-in", "normal", 80),
      summary: spec("fade-up", "normal", 180),
      contact: spec("pop", "normal", 260, 45),
      photo: spec("pop", "normal", 120),
      section: spec("fade-up", "normal"),
      sectionHeading: spec("slide-right", "normal"),
      sectionBody: spec("fade-up", "normal", 70),
      experience: spec("fade-up", "normal", 80, 70),
      projects: spec("pop", "normal", 80, 70),
      education: spec("fade-up", "normal", 80, 70),
      skills: spec("pop", "normal", 80, 38),
      links: spec("pop", "normal", 80, 45),
      video: spec("fade-up", "normal", 80),
    },
    background: {
      ...current.background,
      effect: "none",
    },
    hoverEffect: "lift",
  });
}

export function motionDurationMs(speed: WebMotionSpeed): number {
  return speed === "slow" ? 760 : speed === "fast" ? 300 : 470;
}

export function backgroundDurationSeconds(speed: WebBackgroundSpeed): number {
  return speed === "slow" ? 22 : speed === "fast" ? 7 : 13;
}

export function motionStyle(
  spec: WebMotionSpec,
  index = 0,
): Record<string, string> {
  return {
    "--motion-duration": `${motionDurationMs(spec.speed)}ms`,
    "--motion-delay": `${spec.delayMs + spec.staggerMs * index}ms`,
  };
}

export function motionClass(effect: WebMotionEffect): string {
  return `motion-${effect}`;
}

function escapeStyleValue(value: string): string {
  return value.replace(/[<>"'`]/g, "");
}


function addMotionToFirst(
  html: string,
  search: RegExp,
  spec: WebMotionSpec,
): string {
  if (spec.effect === "none") return html;
  return html.replace(search, match => {
    const classMatch = match.match(/class="([^"]*)"/);
    const style = motionStyle(spec);
    if (classMatch) {
      return match
        .replace(
          classMatch[0],
          `class="${classMatch[1]} ${motionClass(spec.effect)}"`,
        )
        .replace(
          /^(<[a-z0-9-]+)/i,
          `$1 data-motion-item style="--motion-duration:${style["--motion-duration"]};--motion-delay:${style["--motion-delay"]}"`,
        );
    }

    return match.replace(
      /^(<[a-z0-9-]+)([^>]*)>/i,
      `$1$2 data-motion-item class="${motionClass(spec.effect)}" style="--motion-duration:${style["--motion-duration"]};--motion-delay:${style["--motion-delay"]}">`,
    );
  });
}

function addMotionToAll(
  html: string,
  search: RegExp,
  spec: WebMotionSpec,
): string {
  if (spec.effect === "none") return html;
  let index = 0;
  return html.replace(search, match => {
    const style = motionStyle(spec, index++);
    const classMatch = match.match(/class="([^"]*)"/);
    if (classMatch) {
      return match
        .replace(
          classMatch[0],
          `class="${classMatch[1]} ${motionClass(spec.effect)}"`,
        )
        .replace(
          /^(<[a-z0-9-]+)/i,
          `$1 data-motion-item style="--motion-duration:${style["--motion-duration"]};--motion-delay:${style["--motion-delay"]}"`,
        );
    }

    return match.replace(
      /^(<[a-z0-9-]+)([^>]*)>/i,
      `$1$2 data-motion-item class="${motionClass(spec.effect)}" style="--motion-duration:${style["--motion-duration"]};--motion-delay:${style["--motion-delay"]}">`,
    );
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function addMotionToInstance(
  html: string,
  instanceId: string,
  spec: WebMotionSpec,
): string {
  const safe = escapeRegExp(instanceId);
  const pattern = new RegExp(
    `<([a-z][a-z0-9-]*)([^>]*\\\\sdata-web-instance="${safe}"[^>]*)>`,
    "gi",
  );

  return html.replace(pattern, match => {
    const duration = `${motionDurationMs(spec.speed)}ms`;
    const delay = `${spec.delayMs}ms`;
    const motionClassName = motionClass(spec.effect);

    let next = match;

    const classMatch = next.match(/class="([^"]*)"/i);
    if (classMatch) {
      const cleaned = classMatch[1]
        .split(/\\s+/)
        .filter(Boolean)
        .filter(name => !name.startsWith("motion-"));
      cleaned.push(motionClassName);
      next = next.replace(
        classMatch[0],
        `class="${cleaned.join(" ")}"`,
      );
    } else {
      next = next.replace(
        /^(<[a-z][a-z0-9-]*)/i,
        `$1 class="${motionClassName}"`,
      );
    }

    const styleMatch = next.match(/style="([^"]*)"/i);
    const motionStyleText =
      `--motion-duration:${duration};--motion-delay:${delay};`;
    if (styleMatch) {
      const cleanedStyle = styleMatch[1]
        .replace(/--motion-duration:[^;"]*;?/g, "")
        .replace(/--motion-delay:[^;"]*;?/g, "");
      next = next.replace(
        styleMatch[0],
        `style="${motionStyleText}${cleanedStyle}"`,
      );
    } else {
      next = next.replace(
        /^(<[a-z][a-z0-9-]*)/i,
        `$1 style="${motionStyleText}"`,
      );
    }

    if (!/\\sdata-motion-item(?:\\s|=|>)/i.test(next)) {
      next = next.replace(
        /^(<[a-z][a-z0-9-]*)/i,
        "$1 data-motion-item",
      );
    }

    return next;
  });
}

function backgroundClass(effect: WebBackgroundEffect): string {
  if (effect === "gradient-drift") return "studio-bg-gradient";
  if (effect === "grid-flow") return "studio-bg-grid";
  return "";
}

function backgroundMarkup(effect: WebBackgroundEffect): string {
  if (effect === "floating-orbs") {
    return `<div class="studio-bg studio-bg-orbs" aria-hidden="true"><i></i><i></i><i></i></div>`;
  }
  if (effect === "aurora") {
    return `<div class="studio-bg studio-bg-aurora" aria-hidden="true"><i></i><i></i><i></i></div>`;
  }
  if (effect === "spotlight") {
    return `<div class="studio-bg studio-bg-spotlight" aria-hidden="true"><i></i></div>`;
  }
  return "";
}

function studioCss(studio: WebAnimationStudioSettings): string {
  const duration = backgroundDurationSeconds(studio.background.speed);
  const intensity = Math.max(0, Math.min(1, studio.background.intensity / 100));
  const secondary = escapeStyleValue(studio.background.secondaryColor || "#7c3aed");

  return `
<style id="werkpages-animation-studio">
:root{--studio-bg-duration:${duration}s;--studio-bg-intensity:${intensity};--studio-bg-secondary:${secondary}}
html[data-theme="dark"] .nav-link.active{color:#fff!important}
html[data-theme="dark"] .nav-link:hover{color:#fff}
[data-motion-item]{opacity:0;animation-duration:var(--motion-duration);animation-delay:var(--motion-delay);animation-fill-mode:both;animation-timing-function:cubic-bezier(.2,.8,.2,1)}
.motion-none{opacity:1!important;animation:none!important}
.motion-fade{animation-name:studioFade}
.motion-fade-up{animation-name:studioFadeUp}
.motion-slide-left{animation-name:studioSlideLeft}
.motion-slide-right{animation-name:studioSlideRight}
.motion-blur-in{animation-name:studioBlur}
.motion-tracking-in{animation-name:studioTracking}
.motion-pop{animation-name:studioPop}
.motion-flip-in{animation-name:studioFlip;transform-origin:50% 0}
@keyframes studioFade{from{opacity:0}to{opacity:1}}
@keyframes studioFadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
@keyframes studioSlideLeft{from{opacity:0;transform:translateX(38px)}to{opacity:1;transform:none}}
@keyframes studioSlideRight{from{opacity:0;transform:translateX(-38px)}to{opacity:1;transform:none}}
@keyframes studioBlur{from{opacity:0;filter:blur(12px);transform:translateY(8px)}to{opacity:1;filter:blur(0);transform:none}}
@keyframes studioTracking{from{opacity:0;letter-spacing:.18em;filter:blur(3px)}to{opacity:1;letter-spacing:normal;filter:blur(0)}}
@keyframes studioPop{0%{opacity:0;transform:scale(.82)}70%{opacity:1;transform:scale(1.035)}100%{opacity:1;transform:scale(1)}}
@keyframes studioFlip{from{opacity:0;transform:perspective(700px) rotateX(-65deg) translateY(8px)}to{opacity:1;transform:none}}
.studio-motion-section [data-motion-item]{animation-play-state:paused}
.studio-motion-section[data-motion-item]{animation-play-state:paused}
.studio-motion-section.studio-visible [data-motion-item]{animation-play-state:running}
.studio-motion-section.studio-visible[data-motion-item]{animation-play-state:running}

.studio-bg{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;opacity:calc(.18 + var(--studio-bg-intensity) * .72)}
.shell{position:relative;z-index:1}
body.studio-bg-gradient{background:linear-gradient(120deg,var(--canvas),color-mix(in srgb,var(--accent) calc(var(--studio-bg-intensity) * 24%),var(--canvas)),color-mix(in srgb,var(--studio-bg-secondary) calc(var(--studio-bg-intensity) * 22%),var(--canvas)),var(--canvas));background-size:320% 320%;animation:studioGradient var(--studio-bg-duration) ease-in-out infinite}
@keyframes studioGradient{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
body.studio-bg-grid{background-color:var(--canvas);background-image:linear-gradient(color-mix(in srgb,var(--accent) calc(var(--studio-bg-intensity) * 18%),transparent) 1px,transparent 1px),linear-gradient(90deg,color-mix(in srgb,var(--accent) calc(var(--studio-bg-intensity) * 18%),transparent) 1px,transparent 1px);background-size:34px 34px;animation:studioGrid var(--studio-bg-duration) linear infinite}
@keyframes studioGrid{to{background-position:34px 34px}}
.studio-bg-orbs i,.studio-bg-aurora i{position:absolute;border-radius:50%;filter:blur(42px);background:var(--accent);animation:studioFloat var(--studio-bg-duration) ease-in-out infinite}
.studio-bg-orbs i:nth-child(1),.studio-bg-aurora i:nth-child(1){width:34vw;height:34vw;left:-8vw;top:8vh}
.studio-bg-orbs i:nth-child(2),.studio-bg-aurora i:nth-child(2){width:28vw;height:28vw;right:-4vw;top:35vh;background:var(--studio-bg-secondary);animation-delay:calc(var(--studio-bg-duration) * -.33)}
.studio-bg-orbs i:nth-child(3),.studio-bg-aurora i:nth-child(3){width:22vw;height:22vw;left:34vw;bottom:-5vw;animation-delay:calc(var(--studio-bg-duration) * -.66)}
.studio-bg-aurora i{width:58vw!important;height:18vw!important;border-radius:55% 45% 60% 40%;filter:blur(68px);transform:rotate(-18deg)}
@keyframes studioFloat{0%,100%{transform:translate3d(0,0,0) scale(1)}35%{transform:translate3d(8vw,-4vh,0) scale(1.08)}70%{transform:translate3d(-5vw,5vh,0) scale(.94)}}
.studio-bg-spotlight i{position:absolute;width:70vw;height:70vw;left:15vw;top:-25vw;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--accent) calc(var(--studio-bg-intensity) * 72%),transparent),transparent 66%);animation:studioSpot var(--studio-bg-duration) ease-in-out infinite}
@keyframes studioSpot{0%,100%{transform:translateX(-20%)}50%{transform:translateX(20%)}}
.studio-hover-lift,.studio-hover-glow,.studio-hover-tilt{transition:transform 180ms ease,box-shadow 180ms ease,border-color 180ms ease}
.studio-hover-lift:hover{transform:translateY(-4px);box-shadow:0 14px 30px rgba(15,23,42,.12)}
.studio-hover-glow:hover{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft),0 14px 30px rgba(15,23,42,.10)}
.studio-hover-tilt:hover{transform:translateY(-2px) rotate(-.7deg) scale(1.012);box-shadow:0 14px 30px rgba(15,23,42,.11)}
@media(prefers-reduced-motion:reduce){
  [data-motion-item]{opacity:1!important;transform:none!important;filter:none!important;letter-spacing:inherit!important;animation:none!important}
  .studio-bg{display:none!important}
  body.studio-bg-gradient,body.studio-bg-grid{animation:none!important}
}
@media print{.studio-bg{display:none!important}}
</style>`;
}

function studioScript(): string {
  return `
<script id="werkpages-animation-studio-runtime">
(() => {
  const sections = [...document.querySelectorAll('.studio-motion-section')];
  const reveal = node => node.classList.add('studio-visible');

  if ('IntersectionObserver' in window &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          reveal(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: .08, rootMargin: '0px 0px -8% 0px' });
    sections.forEach(section => observer.observe(section));
  } else {
    sections.forEach(reveal);
  }
})();
</script>`;
}

export function buildAnimatedStandaloneResumeWebHtml(
  data: ResumeData,
): string {
  const studio = getWebAnimationStudio(data.design);
  let html = buildStandaloneResumeWebHtml(data);

  // Fix the dark-mode selected nav issue in the exported site as well.
  html = html.replace(
    "</head>",
    `${studioCss(studio)}<style id="werkpages-unified-presentation">${buildResumePresentationCss(data.design)}</style></head>`,
  );

  const bodyClass = backgroundClass(studio.background.effect);
  html = html.replace(
    /<body class="([^"]*)">/,
    `<body class="$1 ${bodyClass}">${backgroundMarkup(studio.background.effect)}`,
  );

  html = addMotionToFirst(
    html,
    /<header class="[^"]*hero[^"]*">/,
    studio.targets.hero,
  );
  html = addMotionToFirst(html, /<h1>/, studio.targets.name);
  html = addMotionToFirst(
    html,
    /<p class="hero-summary">/,
    studio.targets.summary,
  );
  html = addMotionToFirst(
    html,
    /<div class="contact">/,
    studio.targets.contact,
  );
  html = addMotionToFirst(
    html,
    /<img class="avatar"[^>]*>/,
    studio.targets.photo,
  );

  html = html.replace(
    /<section class="section([^"]*)" id="([^"]+)">/g,
    `<section class="section$1 studio-motion-section" id="$2">`,
  );

  html = addMotionToAll(
    html,
    /<section class="section([^"]*) studio-motion-section" id="([^"]+)">/g,
    studio.targets.section,
  );

  html = addMotionToAll(
    html,
    /<h2>/g,
    studio.targets.sectionHeading,
  );
  html = addMotionToAll(
    html,
    /<p class="about-text([^"]*)"/g,
    studio.targets.sectionBody,
  );
  html = addMotionToAll(
    html,
    /<div class="project-grid([^"]*)"/g,
    studio.targets.sectionBody,
  );
  html = addMotionToAll(
    html,
    /<div class="skills([^"]*)"/g,
    studio.targets.sectionBody,
  );
  html = addMotionToAll(
    html,
    /<div class="featured-grid([^"]*)"/g,
    studio.targets.sectionBody,
  );
  html = addMotionToAll(
    html,
    /<div class="links-grid([^"]*)"/g,
    studio.targets.sectionBody,
  );

  html = addMotionToAll(
    html,
    /<article class="role-card([^"]*)"/g,
    studio.targets.experience,
  );
  html = addMotionToAll(
    html,
    /<article class="project-card([^"]*)"/g,
    studio.targets.projects,
  );
  html = addMotionToAll(
    html,
    /<article class="education-card([^"]*)"/g,
    studio.targets.education,
  );
  html = addMotionToAll(
    html,
    /<span class="skill([^"]*)"/g,
    studio.targets.skills,
  );
  html = addMotionToAll(
    html,
    /<a class="(?:featured-card|link-card)([^"]*)"/g,
    studio.targets.links,
  );
  html = addMotionToAll(
    html,
    /<div class="video-frame">/g,
    studio.targets.video,
  );

  // Per-instance overrides run after group motion so one selected item can
  // have its own motion without changing the rest of the group.
  Object.entries(studio.instances).forEach(([instanceId, spec]) => {
    html = addMotionToInstance(html, instanceId, spec);
  });

  if (studio.hoverEffect !== "none") {
    const hoverClass = `studio-hover-${studio.hoverEffect}`;
    html = html.replace(
      /class="project-card([^"]*)"/g,
      `class="project-card$1 ${hoverClass}"`,
    );
    html = html.replace(
      /class="featured-card([^"]*)"/g,
      `class="featured-card$1 ${hoverClass}"`,
    );
    html = html.replace(
      /class="link-card([^"]*)"/g,
      `class="link-card$1 ${hoverClass}"`,
    );
  }

  html = html.replace("</body>", `${studioScript()}</body>`);
  return html;
}