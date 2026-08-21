import type { ResumeData } from "./types";
import type {
  InteractiveAnimationProperty,
  InteractiveAnimationTrack,
  InteractiveObjectAppearance,
  InteractiveSceneBackground,
  InteractiveSceneObject,
} from "./resumeInteractive";
import {
  buildInteractiveVisitorProjection,
  type InteractiveVisitorObject,
  type InteractiveVisitorProjection,
  type InteractiveVisitorScene,
} from "./resumeInteractiveRuntime";
import {
  INTERACTIVE_MOTION_CSS,
  objectMotionAnimation,
} from "./resumeInteractiveMotion";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function attr(value: unknown): string {
  return escapeHtml(value);
}

function css(value: unknown): string {
  return String(value ?? "")
    .replace(/[\r\n]/g, " ")
    .replace(/<\/style/gi, "<\\/style");
}

function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function safeHref(value: string | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;

  if (/^(https?:|mailto:|tel:)/i.test(raw)) return raw;
  if (/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(raw)) {
    return `mailto:${raw}`;
  }
  if (/^www\./i.test(raw)) return `https://${raw}`;
  return null;
}

function safeImage(value: string | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^data:image\//i.test(raw)) return raw;
  return null;
}

function styleString(
  values: Record<string, string | number | undefined | null>,
): string {
  return Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}:${String(value)}`)
    .join(";");
}

function appearanceStyle(
  appearance: InteractiveObjectAppearance | undefined,
): {
  shell: string;
  text: string;
  muted: string;
  accent: string;
} {
  const variant = appearance?.variant ?? "card";
  const text = appearance?.textColor ?? "#2e0562";
  const accent = appearance?.accentColor ?? text;
  const surface =
    appearance?.surfaceColor ??
    (
      variant === "plain"
        ? "transparent"
        : variant === "glass"
          ? "rgba(255,255,255,.12)"
          : variant === "terminal"
            ? "rgba(4,15,8,.94)"
            : "#ffffff"
    );
  const border =
    appearance?.borderColor ??
    (
      variant === "plain"
        ? "transparent"
        : variant === "glass"
          ? "rgba(255,255,255,.26)"
          : variant === "terminal"
            ? "#1e6a36"
            : "rgba(46,5,98,.10)"
    );
  const radius =
    appearance?.radius ??
    (variant === "terminal" ? 8 : variant === "plain" ? 0 : 14);

  const shell = styleString({
    color: text,
    background: surface,
    border: variant === "plain" ? "none" : `1px solid ${border}`,
    "border-radius": `${radius}px`,
    "box-sizing": "border-box",
    "box-shadow":
      variant === "glass"
        ? "0 18px 45px rgba(0,0,0,.16), inset 0 1px rgba(255,255,255,.14)"
        : variant === "accent"
          ? `0 10px 28px ${accent}18`
          : "none",
    "backdrop-filter": variant === "glass" ? "blur(10px)" : undefined,
    "font-family":
      variant === "terminal"
        ? "ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace"
        : undefined,
  });

  return {
    shell,
    text,
    muted: `${text}A6`,
    accent,
  };
}

function renderBackground(background: InteractiveSceneBackground): string {
  if (background.type === "transparent") {
    return `background:transparent`;
  }

  if (background.type === "gradient") {
    return styleString({
      background: `linear-gradient(135deg,${
        background.color || "#ffffff"
      },${background.secondaryColor || "#f4f1fa"})`,
      "background-size": "220% 220%",
    });
  }

  if (background.type === "image" && safeImage(background.imageUrl)) {
    return styleString({
      background: background.color || "#ffffff",
      "background-image": `url("${safeImage(background.imageUrl)}")`,
      "background-position": "center",
      "background-repeat": "no-repeat",
      "background-size":
        background.imageFit === "contain"
          ? "contain"
          : background.imageFit === "stretch"
            ? "100% 100%"
            : "cover",
    });
  }

  return `background:${background.color || "#ffffff"}`;
}

function renderAmbient(scene: InteractiveVisitorScene): string {
  const ink = scene.scene.background.color?.toLowerCase() === "#ffffff"
    ? "#2e0562"
    : "#ffffff";

  const twinkle = scene.ambient.twinkle
    .map(
      (particle, index) => `<span
        class="wp-ambient wp-twinkle"
        data-ambient-kind="twinkle"
        data-ambient-index="${index}"
        aria-hidden="true"
        style="${styleString({
          left: `${particle.x}%`,
          top: `${particle.y}%`,
          width: `${particle.size}px`,
          height: `${particle.size}px`,
          opacity: particle.opacity,
          background: ink,
          "box-shadow": `0 0 ${particle.size * 2.5}px ${ink}`,
          "animation-duration": `${particle.duration}s`,
          "animation-delay": `${particle.delay}s`,
        })}"
      ></span>`,
    )
    .join("");

  const particles = scene.ambient.particles
    .map(
      (particle, index) => `<span
        class="wp-ambient wp-particle"
        data-ambient-kind="particles"
        data-ambient-index="${index}"
        aria-hidden="true"
        style="${styleString({
          left: `${particle.x}%`,
          top: `${particle.y}%`,
          width: `${particle.size}px`,
          height: `${particle.size}px`,
          opacity: particle.opacity * 0.72,
          background: ink,
          "animation-duration": `${particle.duration}s`,
          "animation-delay": `${particle.delay}s`,
          "--wp-drift-x": `${particle.driftX}px`,
          "--wp-drift-y": `${particle.driftY}px`,
        })}"
      ></span>`,
    )
    .join("");

  const shapes = scene.ambient.floatingShapes
    .map(
      (particle, index) => `<span
        class="wp-ambient wp-floating-shape wp-floating-shape-${attr(particle.shape)}"
        data-ambient-kind="floatingShapes"
        data-ambient-index="${index}"
        aria-hidden="true"
        style="${styleString({
          left: `${particle.x}%`,
          top: `${particle.y}%`,
          width: `${particle.size}px`,
          height: `${particle.size}px`,
          opacity: particle.opacity * 0.6,
          border: `1px solid ${ink}`,
          background:
            particle.shape === "circle"
              ? `${ink}18`
              : "transparent",
          "animation-duration": `${particle.duration}s`,
          "animation-delay": `${particle.delay}s`,
          "--wp-drift-x": `${particle.driftX}px`,
          "--wp-drift-y": `${particle.driftY}px`,
          "--wp-start-rotation": `${particle.rotation}deg`,
        })}"
      ></span>`,
    )
    .join("");

  return twinkle + particles + shapes;
}

function renderShape(object: Extract<InteractiveSceneObject, { type: "shape" }>): string {
  const style =
    object.shape === "line"
      ? styleString({
          width: "100%",
          height: "100%",
          "border-top": `${Math.max(1, object.strokeWidth ?? 1)}px solid ${
            object.stroke || "#7c3aed"
          }`,
        })
      : styleString({
          width: "100%",
          height: "100%",
          "border-radius": object.shape === "ellipse" ? "999px" : "3px",
          background: object.fill || "#ede9fe",
          border: `${object.strokeWidth ?? 1}px solid ${
            object.stroke || "#7c3aed"
          }`,
          "box-sizing": "border-box",
        });

  return `<div class="wp-shape" style="${style}"></div>`;
}

function renderImage(
  object: Extract<InteractiveSceneObject, { type: "image" }>,
): string {
  const src = safeImage(object.src);
  if (!src) {
    return `<div class="wp-image-placeholder">Image</div>`;
  }

  return `<img
    class="wp-image"
    src="${attr(src)}"
    alt="${attr(object.alt || "")}"
    draggable="false"
    style="object-fit:${
      object.fit === "contain"
        ? "contain"
        : object.fit === "stretch"
          ? "fill"
          : "cover"
    }"
  />`;
}

function renderResolvedContent(visitorObject: InteractiveVisitorObject): string {
  const object = visitorObject.object;
  if (object.type !== "resume-content") return "";

  const appearance = appearanceStyle(object.appearance);
  const resolved = visitorObject.resolved;

  if (!resolved) {
    return `<div class="wp-content-shell" style="${appearance.shell}">
      <div class="wp-content-main">
        <div class="wp-label" style="color:${appearance.accent}">Resume content</div>
        <div class="wp-primary">Choose shared content</div>
      </div>
    </div>`;
  }

  if (!resolved.found) {
    return `<div class="wp-content-shell wp-missing">
      <div class="wp-content-main">
        <div class="wp-label">Missing shared content</div>
        <div class="wp-primary">${escapeHtml(resolved.primary)}</div>
        <div class="wp-secondary">${escapeHtml(resolved.secondary || "")}</div>
      </div>
    </div>`;
  }

  const image = safeImage(resolved.imageUrl);
  const href = safeHref(resolved.href);
  const imageOnly =
    !!image &&
    !resolved.body &&
    !resolved.secondary &&
    (
      object.binding?.field === "logoUrl" ||
      object.binding?.field === "imageUrl"
    );

  if (imageOnly) {
    return `<div class="wp-content-shell wp-image-only" style="${appearance.shell}">
      <img src="${attr(image)}" alt="${attr(resolved.primary || resolved.label)}" />
    </div>`;
  }

  const content = `<div class="wp-content-shell" style="${appearance.shell}">
    ${
      image
        ? `<div class="wp-content-image" style="border-color:${appearance.accent}2B">
            <img src="${attr(image)}" alt="" />
          </div>`
        : ""
    }
    <div class="wp-content-main">
      <div class="wp-label" style="color:${appearance.accent}">
        ${escapeHtml(resolved.label)}
      </div>
      <div class="wp-primary">${escapeHtml(resolved.primary || "Empty shared field")}</div>
      ${
        resolved.secondary
          ? `<div class="wp-secondary" style="color:${appearance.muted}">
              ${escapeHtml(resolved.secondary)}
            </div>`
          : ""
      }
      ${
        resolved.body
          ? `<div class="wp-body" style="color:${appearance.muted}">
              ${escapeHtml(resolved.body).replace(/\n/g, "<br>")}
            </div>`
          : ""
      }
      ${
        href
          ? `<div class="wp-link-label" style="color:${appearance.accent}">
              ${escapeHtml(resolved.href || "")}
            </div>`
          : ""
      }
    </div>
  </div>`;

  return href
    ? `<a class="wp-bound-link" href="${attr(href)}" ${
        /^https?:/i.test(href) ? 'target="_blank" rel="noopener noreferrer"' : ""
      }>${content}</a>`
    : content;
}

function renderText(
  object: Extract<InteractiveSceneObject, { type: "text" }>,
): string {
  const appearance = appearanceStyle(object.appearance);
  return `<div class="wp-text" style="${appearance.shell}">
    <div style="color:${appearance.text}">${escapeHtml(object.text)}</div>
  </div>`;
}

function trackValueWithUnit(
  property: InteractiveAnimationProperty,
  value: number,
): string {
  if (property === "x" || property === "y" || property === "blur") {
    return `${value}px`;
  }
  if (property === "rotation") return `${value}deg`;
  return String(value);
}

function initialTrackStyle(track: InteractiveAnimationTrack): string {
  const value = trackValueWithUnit(track.property, track.from);
  if (track.property === "x") return `transform:translate3d(${value},0,0)`;
  if (track.property === "y") return `transform:translate3d(0,${value},0)`;
  if (track.property === "rotation") return `transform:rotate(${value})`;
  if (track.property === "scale") return `transform:scale(${value})`;
  if (track.property === "blur") return `filter:blur(${value})`;
  return `opacity:${track.from}`;
}

function renderAdvancedLayers(
  object: InteractiveSceneObject,
  content: string,
  allowKeyboardClick: boolean,
): string {
  return (object.animationTracks ?? []).slice(0, 12).reduceRight(
    (html, track, index) => `<div
      class="wp-advanced-layer"
      data-track-index="${index}"
      data-trigger="${attr(track.trigger)}"
      ${
        track.trigger === "click" && allowKeyboardClick
          ? 'tabindex="0" role="button" aria-label="Activate animation"'
          : ""
      }
      style="${initialTrackStyle(track)};width:100%;height:100%;transform-origin:center"
    >${html}</div>`,
    content,
  );
}

function renderEasyMotion(
  object: InteractiveSceneObject,
  content: string,
): string {
  const animation = objectMotionAnimation(object.motion);
  const variables = animation.variables ?? {};
  const style = styleString({
    width: "100%",
    height: "100%",
    "animation-name": animation.animationName,
    "animation-duration": animation.animationDuration,
    "animation-delay": animation.animationDelay,
    "animation-timing-function": animation.animationTimingFunction,
    "animation-iteration-count": animation.animationIterationCount,
    "animation-direction": animation.animationDirection,
    "transform-origin": animation.transformOrigin,
    ...variables,
  });

  return `<div
    class="wp-easy-motion"
    data-easy-motion="${attr(object.motion?.preset || "")}"
    style="${style}"
  >${content}</div>`;
}

function renderObject(visitorObject: InteractiveVisitorObject): string {
  const object = visitorObject.object;
  const geometry = object.geometry;

  let content = "";
  if (object.type === "shape") content = renderShape(object);
  else if (object.type === "image") content = renderImage(object);
  else if (object.type === "resume-content") {
    content = renderResolvedContent(visitorObject);
  } else {
    content = renderText(object);
  }

  const hasBoundLink =
    object.type === "resume-content" &&
    !!safeHref(visitorObject.resolved?.href);

  content = renderEasyMotion(object, content);
  content = renderAdvancedLayers(object, content, !hasBoundLink);

  return `<div
    class="wp-object"
    data-object-id="${attr(object.id)}"
    tabindex="-1"
    style="${styleString({
      left: `${geometry.x}px`,
      top: `${geometry.y}px`,
      width: `${geometry.width}px`,
      height: `${geometry.height}px`,
      opacity: geometry.opacity,
      rotate: geometry.rotation ? `${geometry.rotation}deg` : undefined,
      "z-index": geometry.zIndex,
      display: geometry.hidden ? "none" : "block",
    })}"
  >
    <div class="wp-parallax-layer">
      <div class="wp-path-layer">
        <div class="wp-scroll-layer">
          ${content}
        </div>
      </div>
    </div>
  </div>`;
}

function renderScene(
  scene: InteractiveVisitorScene,
  index: number,
): string {
  const model = scene.scene;
  const behavior = model.scrollBehavior;
  const gradientDrift =
    model.ambient.gradientDrift.enabled &&
    model.background.type === "gradient";

  return `<section
    class="wp-scene-section wp-scene-${attr(behavior)}"
    data-scene-id="${attr(model.id)}"
    data-scene-index="${index}"
    data-scroll-length="${model.scrollLength}"
    style="--wp-scroll-length:${model.scrollLength}px"
    aria-label="${attr(model.name)}"
  >
    <div class="wp-stage">
      <div class="wp-stage-fit">
        <div
          class="wp-scene-canvas"
          data-scene-width="${model.width}"
          data-scene-height="${model.height}"
          style="width:${model.width}px;height:${model.height}px"
        >
          <div
            class="wp-scene-background${gradientDrift ? " wp-gradient-drift" : ""}"
            data-background-parallax="${model.ambient.parallax.enabled ? "1" : "0"}"
            style="${renderBackground(model.background)}"
          ></div>
          ${renderAmbient(scene)}
          ${scene.objects.map(renderObject).join("")}
        </div>
      </div>
    </div>
  </section>`;
}

function runtimeScript(projection: InteractiveVisitorProjection): string {
  const payload = jsonForScript(projection);

  return String.raw`
<script id="wp-interactive-data" type="application/json">${payload}</script>
<script>
(() => {
  "use strict";

  const DATA = JSON.parse(
    document.getElementById("wp-interactive-data").textContent || "{}"
  );
  const sections = Array.from(document.querySelectorAll(".wp-scene-section"));
  const reduceMotionQuery = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false, addEventListener(){} };
  let reduceMotion = !!reduceMotionQuery.matches;
  let performanceTier = "full";
  let raf = 0;
  let activeSceneIndex = -1;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const cssEscape = value =>
    window.CSS && typeof window.CSS.escape === "function"
      ? window.CSS.escape(String(value))
      : String(value).replace(/[^a-zA-Z0-9_-]/g, character =>
          "\\" + character.charCodeAt(0).toString(16) + " "
        );

  const breakpointForWidth = width => {
    if (width < 700) return "mobile";
    if (width < 1100) return "tablet";
    return "desktop";
  };

  const sceneLayout = (scene, breakpoint) => {
    if (breakpoint === "desktop") {
      return {
        width: scene.width,
        height: scene.height,
        scrollLength: scene.scrollLength,
      };
    }

    const override = scene.responsive && scene.responsive[breakpoint];
    const recommendedWidth = breakpoint === "mobile" ? 430 : 1024;

    return {
      width: override && override.width != null
        ? override.width
        : recommendedWidth,
      height: override && override.height != null
        ? override.height
        : scene.height,
      scrollLength: override && override.scrollLength != null
        ? override.scrollLength
        : scene.scrollLength,
    };
  };

  const objectGeometry = (
    object,
    breakpoint,
    scene,
    layout
  ) => {
    if (breakpoint === "desktop") return { ...object.geometry };

    const scale =
      scene && scene.width
        ? layout.width / scene.width
        : 1;
    const fallback = {
      ...object.geometry,
      x: object.geometry.x * scale,
      y: object.geometry.y * scale,
      width: object.geometry.width * scale,
      height: object.geometry.height * scale,
    };
    const override =
      object.responsive && object.responsive[breakpoint]
        ? object.responsive[breakpoint]
        : null;

    return override
      ? { ...fallback, ...override }
      : fallback;
  };

  const currentBreakpoint = () =>
    breakpointForWidth(
      Math.max(
        1,
        document.documentElement.clientWidth || window.innerWidth || 1440
      )
    );

  const applyResponsiveLayout = (section, visitorScene) => {
    const breakpoint = currentBreakpoint();
    const scene = visitorScene.scene;
    const layout = sceneLayout(scene, breakpoint);
    section.dataset.breakpoint = breakpoint;
    section.style.setProperty(
      "--wp-scroll-length",
      layout.scrollLength + "px"
    );

    const canvas = section.querySelector(".wp-scene-canvas");
    if (canvas) {
      canvas.dataset.sceneWidth = String(layout.width);
      canvas.dataset.sceneHeight = String(layout.height);
      canvas.style.width = layout.width + "px";
      canvas.style.height = layout.height + "px";
    }

    visitorScene.objects.forEach(visitorObject => {
      const object = visitorObject.object;
      const root = section.querySelector(
        '[data-object-id="' + cssEscape(object.id) + '"]'
      );
      if (!root) return;
      const geometry = objectGeometry(
        object,
        breakpoint,
        scene,
        layout
      );
      root.style.left = geometry.x + "px";
      root.style.top = geometry.y + "px";
      root.style.width = geometry.width + "px";
      root.style.height = geometry.height + "px";
      root.style.opacity = String(geometry.opacity);
      root.style.rotate = geometry.rotation
        ? geometry.rotation + "deg"
        : "";
      root.style.zIndex = String(geometry.zIndex);
      root.style.display = geometry.hidden ? "none" : "block";
    });

    return layout;
  };

  const choosePerformanceTier = () => {
    if (reduceMotion) return "reduced";

    const connection =
      navigator.connection ||
      navigator.mozConnection ||
      navigator.webkitConnection;
    const saveData = !!(connection && connection.saveData);
    const memory = Number(navigator.deviceMemory || 0);
    const cores = Number(navigator.hardwareConcurrency || 0);
    const breakpoint = currentBreakpoint();

    if (
      saveData ||
      (memory > 0 && memory <= 4) ||
      (cores > 0 && cores <= 4)
    ) {
      return "lite";
    }

    if (
      breakpoint === "mobile" ||
      (memory > 0 && memory <= 8) ||
      (cores > 0 && cores <= 6)
    ) {
      return "balanced";
    }

    return "full";
  };

  const applyPerformanceTier = () => {
    performanceTier = choosePerformanceTier();
    document.documentElement.dataset.wpPerformance =
      performanceTier;

    const caps =
      performanceTier === "lite"
        ? {
            twinkle: 12,
            particles: 8,
            floatingShapes: 4,
          }
        : performanceTier === "balanced"
          ? {
              twinkle: 30,
              particles: 18,
              floatingShapes: 8,
            }
          : {
              twinkle: Infinity,
              particles: Infinity,
              floatingShapes: Infinity,
            };

    document
      .querySelectorAll("[data-ambient-kind]")
      .forEach(element => {
        const kind = element.dataset.ambientKind;
        const index = Number(element.dataset.ambientIndex || 0);
        const cap = caps[kind] ?? Infinity;
        element.hidden = index >= cap;
      });

    document
      .querySelectorAll('.wp-advanced-layer[data-trigger="loop"]')
      .forEach(element => {
        if (typeof element.getAnimations !== "function") return;
        element.getAnimations().forEach(animation => {
          if (
            performanceTier === "lite" ||
            performanceTier === "reduced"
          ) {
            animation.pause();
          } else {
            animation.play();
          }
        });
      });
  };

  const ease = (value, easing) => {
    const t = clamp(value, 0, 1);
    if (easing === "linear") return t;
    if (easing === "ease-in") return t * t;
    if (easing === "ease-out") return 1 - (1 - t) * (1 - t);
    if (easing === "ease-in-out") {
      return t < .5
        ? 2 * t * t
        : 1 - Math.pow(-2 * t + 2, 2) / 2;
    }
    return t * t * (3 - 2 * t);
  };

  const valueAt = (track, progress) => {
    const frames = [...(track.keyframes || [])].sort(
      (a, b) => a.progress - b.progress
    );
    if (!frames.length) return 0;
    const p = clamp(progress, 0, 100);
    if (p <= frames[0].progress) return frames[0].value;
    if (p >= frames[frames.length - 1].progress) {
      return frames[frames.length - 1].value;
    }
    for (let i = 0; i < frames.length - 1; i += 1) {
      const from = frames[i];
      const to = frames[i + 1];
      if (p < from.progress || p > to.progress) continue;
      const span = Math.max(.0001, to.progress - from.progress);
      const local = (p - from.progress) / span;
      const t = ease(local, track.easing);
      return from.value + (to.value - from.value) * t;
    }
    return frames[frames.length - 1].value;
  };

  const pathPointAt = (path, progress) => {
    if (!path || !path.enabled || !path.points || path.points.length < 2) {
      return { x: 0, y: 0, angle: 0 };
    }
    const points = [...path.points].sort((a,b) => a.progress - b.progress);
    const sample = p => {
      p = clamp(p, 0, 100);
      let index = 0;
      let local = 0;
      if (p >= points[points.length - 1].progress) {
        index = points.length - 2;
        local = 1;
      } else if (p <= points[0].progress) {
        index = 0;
        local = 0;
      } else {
        for (let i = 0; i < points.length - 1; i += 1) {
          if (p >= points[i].progress && p <= points[i + 1].progress) {
            index = i;
            const span = Math.max(.0001, points[i + 1].progress - points[i].progress);
            local = (p - points[i].progress) / span;
            break;
          }
        }
      }
      const p1 = points[index];
      const p2 = points[index + 1];
      if (path.curve !== "smooth") {
        return {
          x: p1.x + (p2.x - p1.x) * local,
          y: p1.y + (p2.y - p1.y) * local,
        };
      }
      const p0 = points[Math.max(0, index - 1)] || p1;
      const p3 = points[Math.min(points.length - 1, index + 2)] || p2;
      const cat = (a,b,c,d,t) => {
        const t2 = t*t;
        const t3 = t2*t;
        return .5 * (
          2*b +
          (-a+c)*t +
          (2*a - 5*b + 4*c - d)*t2 +
          (-a + 3*b - 3*c + d)*t3
        );
      };
      return {
        x: cat(p0.x,p1.x,p2.x,p3.x,local),
        y: cat(p0.y,p1.y,p2.y,p3.y,local),
      };
    };
    const point = sample(progress);
    const before = sample(progress - .15);
    const after = sample(progress + .15);
    return {
      ...point,
      angle: Math.atan2(after.y - before.y, after.x - before.x) * 180 / Math.PI,
    };
  };

  const propertyStyle = (property, value) => {
    if (property === "x") return { transform: "translate3d(" + value + "px,0,0)" };
    if (property === "y") return { transform: "translate3d(0," + value + "px,0)" };
    if (property === "rotation") return { transform: "rotate(" + value + "deg)" };
    if (property === "scale") return { transform: "scale(" + value + ")" };
    if (property === "blur") return { filter: "blur(" + value + "px)" };
    return { opacity: String(value) };
  };

  const applyStyle = (element, style) => {
    if ("transform" in style) element.style.transform = style.transform || "";
    if ("filter" in style) element.style.filter = style.filter || "";
    if ("opacity" in style) element.style.opacity = style.opacity == null ? "" : String(style.opacity);
  };

  const initializeAdvancedTrack = (layer, track) => {
    const activate = active => {
      applyStyle(layer, propertyStyle(track.property, active ? track.to : track.from));
      layer.style.transitionProperty =
        track.property === "opacity"
          ? "opacity"
          : track.property === "blur"
            ? "filter"
            : "transform";
      layer.style.transitionDuration = track.duration + "s";
      layer.style.transitionDelay = active ? track.delay + "s" : "0s";
      layer.style.transitionTimingFunction = track.easing;
    };

    if (reduceMotion) {
      activate(true);
      return;
    }

    if (track.trigger === "loop" && performanceTier === "lite") {
      activate(true);
      return;
    }

    if (track.trigger === "loop" && layer.animate) {
      const from = propertyStyle(track.property, track.from);
      const to = propertyStyle(track.property, track.to);
      layer.animate([from, to], {
        duration: Math.max(1, track.duration * 1000),
        delay: Math.max(0, track.delay * 1000),
        easing: track.easing,
        iterations: Infinity,
        direction: "alternate",
        fill: "both",
      });
      return;
    }

    activate(false);

    if (track.trigger === "load") {
      requestAnimationFrame(() => requestAnimationFrame(() => activate(true)));
      return;
    }

    if (track.trigger === "enter") {
      if (!("IntersectionObserver" in window)) {
        activate(true);
        return;
      }
      let done = false;
      const observer = new IntersectionObserver(entries => {
        if (done) return;
        if (entries.some(entry => entry.isIntersecting)) {
          done = true;
          activate(true);
          observer.disconnect();
        }
      }, { threshold: .12 });
      observer.observe(layer);
      return;
    }

    if (track.trigger === "hover") {
      layer.addEventListener("pointerenter", () => activate(true));
      layer.addEventListener("pointerleave", () => activate(false));
      return;
    }

    if (track.trigger === "click") {
      let active = false;
      const toggle = event => {
        if (
          event.type === "keydown" &&
          event.key !== "Enter" &&
          event.key !== " "
        ) return;
        if (event.type === "keydown") event.preventDefault();
        active = !active;
        activate(active);
      };
      layer.addEventListener("click", toggle);
      layer.addEventListener("keydown", toggle);
    }
  };

  const initializeAdvancedMotion = () => {
    sections.forEach((section, sceneIndex) => {
      const scene = DATA.scenes[sceneIndex];
      if (!scene) return;
      scene.objects.forEach(visitorObject => {
        const object = visitorObject.object;
        const root = section.querySelector(
          '[data-object-id="' + cssEscape(object.id) + '"]'
        );
        if (!root) return;
        const layers = Array.from(root.querySelectorAll(".wp-advanced-layer"));
        (object.animationTracks || []).slice(0, 12).forEach((track, index) => {
          if (layers[index]) initializeAdvancedTrack(layers[index], track);
        });
      });
    });
  };

  const positionSceneCanvas = (
    section,
    visitorScene,
    progress = 0
  ) => {
    const stage = section.querySelector(".wp-stage-fit");
    const canvas = section.querySelector(".wp-scene-canvas");
    if (!stage || !canvas) return;

    const layout = applyResponsiveLayout(section, visitorScene);
    const width = layout.width;
    const height = layout.height;
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const breakpoint = currentBreakpoint();
    const containScale = Math.min(
      rect.width / width,
      rect.height / height
    );
    const widthScale = rect.width / width;
    const tallResponsiveCanvas =
      breakpoint !== "desktop" &&
      height * widthScale > rect.height * 1.05;
    const scale = tallResponsiveCanvas
      ? widthScale
      : containScale;

    const scaledWidth = width * scale;
    const scaledHeight = height * scale;
    const x = (rect.width - scaledWidth) / 2;
    const overflowY = Math.max(0, scaledHeight - rect.height);
    const y = tallResponsiveCanvas
      ? -overflowY * clamp(progress / 100, 0, 1)
      : (rect.height - scaledHeight) / 2;

    canvas.style.transform =
      "translate3d(" + x + "px," + y + "px,0) scale(" + scale + ")";
  };

  const sceneProgress = section => {
    if (reduceMotion) return 100;
    const rect = section.getBoundingClientRect();
    if (section.classList.contains("wp-scene-pinned")) {
      const range = Math.max(1, section.offsetHeight - window.innerHeight);
      return clamp((-rect.top / range) * 100, 0, 100);
    }

    const denominator = Math.max(1, window.innerHeight + rect.height);
    return clamp(
      ((window.innerHeight - rect.top) / denominator) * 100,
      0,
      100
    );
  };

  const applyScrollTracks = (layer, tracks, progress) => {
    const values = new Map();
    (tracks || []).slice(0, 8).forEach(track => {
      values.set(track.property, valueAt(track, progress));
    });
    const x = values.get("x") || 0;
    const y = values.get("y") || 0;
    const rotation = values.get("rotation") || 0;
    const scale = values.has("scale") ? values.get("scale") : 1;
    const opacity = values.get("opacity");
    const blur = values.get("blur") || 0;

    const transforms = [];
    if (x || y) transforms.push("translate3d(" + x + "px," + y + "px,0)");
    if (rotation) transforms.push("rotate(" + rotation + "deg)");
    if (scale !== 1) transforms.push("scale(" + scale + ")");
    layer.style.transform = transforms.join(" ");
    layer.style.opacity = opacity == null ? "" : String(opacity);
    layer.style.filter = blur ? "blur(" + blur + "px)" : "";
  };

  const applyPath = (layer, path, progress) => {
    if (!path || !path.enabled) {
      layer.style.transform = "";
      return;
    }
    const point = pathPointAt(path, progress);
    const transforms = [
      "translate3d(" + point.x + "px," + point.y + "px,0)"
    ];
    if (path.autoRotate) transforms.push("rotate(" + point.angle + "deg)");
    layer.style.transform = transforms.join(" ");
  };

  const applyTransition = (stage, transition, t, incoming) => {
    if (!transition || transition.type === "none") {
      stage.style.opacity = "";
      stage.style.transform = "";
      return;
    }
    const p = ease(clamp(t, 0, 1), transition.easing);
    let opacity = 1;
    let transform = "";

    if (performanceTier === "lite") {
      opacity = incoming ? p : 1 - p;
    } else if (transition.type === "fade") {
      opacity = incoming ? p : 1 - p;
    } else if (transition.type === "slide-left") {
      transform = incoming
        ? "translate3d(" + ((1 - p) * 100) + "%,0,0)"
        : "translate3d(" + (-p * 100) + "%,0,0)";
    } else if (transition.type === "slide-up") {
      transform = incoming
        ? "translate3d(0," + ((1 - p) * 100) + "%,0)"
        : "translate3d(0," + (-p * 100) + "%,0)";
    } else if (transition.type === "zoom") {
      opacity = incoming ? p : 1 - p;
      transform = incoming
        ? "scale(" + (.9 + p * .1) + ")"
        : "scale(" + (1 + p * .12) + ")";
    }

    stage.style.opacity = String(opacity);
    stage.style.transform = transform;
  };

  const updateScene = (section, sceneIndex) => {
    const visitorScene = DATA.scenes[sceneIndex];
    if (!visitorScene) return 0;
    const scene = visitorScene.scene;
    const progress = sceneProgress(section);
    const stage = section.querySelector(".wp-stage");

    positionSceneCanvas(section, visitorScene, progress);

    visitorScene.objects.forEach(visitorObject => {
      const object = visitorObject.object;
      const root = section.querySelector(
        '[data-object-id="' + cssEscape(object.id) + '"]'
      );
      if (!root) return;
      const scrollLayer = root.querySelector(".wp-scroll-layer");
      const pathLayer = root.querySelector(".wp-path-layer");
      if (scrollLayer) applyScrollTracks(scrollLayer, object.scrollTracks, progress);
      if (pathLayer) applyPath(pathLayer, object.motionPath, progress);
    });

    if (stage && !reduceMotion) {
      const outgoingStart = 88;
      if (progress >= outgoingStart && sceneIndex < DATA.scenes.length - 1) {
        applyTransition(
          stage,
          scene.transition,
          (progress - outgoingStart) / (100 - outgoingStart),
          false
        );
      } else if (sceneIndex > 0 && progress <= 12) {
        const previous = DATA.scenes[sceneIndex - 1].scene.transition;
        applyTransition(stage, previous, progress / 12, true);
      } else {
        stage.style.opacity = "";
        stage.style.transform = "";
      }
    } else if (stage) {
      stage.style.opacity = "";
      stage.style.transform = "";
    }

    return progress;
  };

  const updateActiveNav = () => {
    let best = -1;
    let bestDistance = Infinity;
    sections.forEach((section, index) => {
      const rect = section.getBoundingClientRect();
      const center = (rect.top + rect.bottom) / 2;
      const distance = Math.abs(center - window.innerHeight / 2);
      if (distance < bestDistance) {
        best = index;
        bestDistance = distance;
      }
    });

    if (best === activeSceneIndex) return;
    activeSceneIndex = best;
    document.querySelectorAll(".wp-scene-dot").forEach((dot, index) => {
      dot.classList.toggle("is-active", index === activeSceneIndex);
      dot.setAttribute("aria-current", index === activeSceneIndex ? "step" : "false");
    });
  };

  const update = () => {
    raf = 0;
    sections.forEach((section, index) => updateScene(section, index));
    updateActiveNav();
  };

  const schedule = () => {
    if (raf) return;
    raf = requestAnimationFrame(update);
  };

  const initializeParallax = () => {
    sections.forEach((section, sceneIndex) => {
      const visitorScene = DATA.scenes[sceneIndex];
      if (!visitorScene || !visitorScene.scene.ambient.parallax.enabled) return;
      const stage = section.querySelector(".wp-stage");
      if (!stage) return;
      const intensity = visitorScene.scene.ambient.parallax.intensity;

      const reset = () => {
        const bg = section.querySelector(".wp-scene-background");
        if (bg) bg.style.transform = "";
        visitorScene.objects.forEach(visitorObject => {
          const object = visitorObject.object;
          const root = section.querySelector(
            '[data-object-id="' + cssEscape(object.id) + '"]'
          );
          const layer = root && root.querySelector(".wp-parallax-layer");
          if (layer) layer.style.transform = "";
        });
      };

      stage.addEventListener("pointermove", event => {
        if (
          reduceMotion ||
          performanceTier === "lite"
        ) return reset();

        const rect = stage.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const x = ((event.clientX - rect.left) / rect.width - .5) * 2;
        const y = ((event.clientY - rect.top) / rect.height - .5) * 2;
        const tierMultiplier =
          performanceTier === "balanced" ? .62 : 1;
        const strength = (4 + intensity * .13) * tierMultiplier;

        const bg = section.querySelector(".wp-scene-background");
        if (bg) {
          bg.style.transform =
            "translate3d(" + (-x * strength) + "px," +
            (-y * strength) + "px,0) scale(1.05)";
        }

        visitorScene.objects.forEach(visitorObject => {
          const object = visitorObject.object;
          const depth = clamp(Number(object.parallaxDepth || 0), -2, 2);
          const root = section.querySelector(
            '[data-object-id="' + cssEscape(object.id) + '"]'
          );
          const layer = root && root.querySelector(".wp-parallax-layer");
          if (!layer) return;
          layer.style.transform = depth
            ? "translate3d(" + (x * depth * strength) + "px," +
              (y * depth * strength) + "px,0)"
            : "";
        });
      });

      stage.addEventListener("pointerleave", reset);
    });
  };

  const initializeNav = () => {
    document.querySelectorAll(".wp-scene-dot").forEach((dot, index) => {
      dot.addEventListener("click", () => {
        sections[index]?.scrollIntoView({
          behavior: reduceMotion ? "auto" : "smooth",
          block: "start",
        });
      });
    });
  };

  const fitAll = () =>
    sections.forEach((section, index) => {
      const visitorScene = DATA.scenes[index];
      if (!visitorScene) return;
      positionSceneCanvas(
        section,
        visitorScene,
        sceneProgress(section)
      );
    });

  const onReducedMotionChange = event => {
    reduceMotion = !!event.matches;
    applyPerformanceTier();
    schedule();
  };

  reduceMotionQuery.addEventListener?.("change", onReducedMotionChange);
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", () => {
    applyPerformanceTier();
    fitAll();
    schedule();
  }, { passive: true });

  applyPerformanceTier();
  fitAll();
  initializeAdvancedMotion();
  initializeParallax();
  initializeNav();
  schedule();
})();
</script>`;
}

export function buildStandaloneInteractiveResumeHtml(
  data: ResumeData,
): string {
  const projection = buildInteractiveVisitorProjection(data);

  if (!projection.scenes.length) {
    throw new Error(
      "Interactive Experience has no scenes to publish.",
    );
  }

  const nav = projection.scenes
    .map(
      (visitorScene, index) => `<button
        class="wp-scene-dot"
        type="button"
        aria-label="Go to ${attr(visitorScene.scene.name)}"
        title="${attr(visitorScene.scene.name)}"
      ><span>${index + 1}</span></button>`,
    )
    .join("");

  const scenes = projection.scenes.map(renderScene).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="${attr(projection.description)}">
<title>${escapeHtml(projection.title)}</title>
<style>
:root{
  color-scheme:light dark;
  --wp-purple:#2e0562;
  --wp-accent:#7c3aed;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0;width:100%;min-height:100%;background:#08070c}
html{scroll-behavior:smooth}
body{
  overflow-x:hidden;
  color:#18111f;
  font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
}
button,a{font:inherit}
.wp-skip{
  position:fixed;left:12px;top:12px;z-index:10000;
  transform:translateY(-160%);
  background:white;color:#1b1030;border-radius:8px;padding:10px 14px;
  box-shadow:0 8px 30px rgba(0,0,0,.2)
}
.wp-skip:focus{transform:none}
#wp-interactive-root{position:relative;width:100%}
.wp-scene-section{position:relative;width:100%;background:#08070c}
.wp-scene-pinned{height:calc(100vh + var(--wp-scroll-length))}
.wp-scene-pinned .wp-stage{
  position:sticky;top:0;height:100vh;height:100svh;
}
.wp-scene-flow{min-height:100vh;min-height:100svh}
.wp-scene-flow .wp-stage{
  position:relative;height:100vh;height:100svh;
}
.wp-stage{
  width:100%;overflow:hidden;background:#08070c;
  transform-origin:center center;
}
.wp-stage-fit{position:relative;width:100%;height:100%;overflow:hidden}
.wp-scene-canvas{
  position:absolute;left:0;top:0;transform-origin:0 0;overflow:hidden;isolation:isolate;
}
.wp-scene-background{
  position:absolute;inset:-2.5%;z-index:-10;pointer-events:none;
  transform-origin:center center;will-change:transform,background-position
}
.wp-gradient-drift{
  animation:wp-interactive-gradient-drift 24s ease-in-out infinite;
}
.wp-ambient{
  position:absolute;z-index:-4;pointer-events:none;display:block
}
.wp-twinkle{
  border-radius:999px;
  animation-name:wp-interactive-twinkle;
  animation-timing-function:ease-in-out;
  animation-iteration-count:infinite
}
.wp-particle{
  border-radius:999px;
  animation-name:wp-interactive-particle;
  animation-timing-function:ease-in-out;
  animation-iteration-count:infinite;
  animation-direction:alternate
}
.wp-floating-shape{
  border-radius:4px;
  animation-name:wp-interactive-shape;
  animation-timing-function:ease-in-out;
  animation-iteration-count:infinite;
  animation-direction:alternate
}
.wp-floating-shape-circle{border-radius:999px}
.wp-floating-shape-diamond{rotate:45deg}
.wp-object{
  position:absolute;transform-origin:center center;overflow:visible;
  will-change:transform,opacity
}
.wp-parallax-layer,.wp-path-layer,.wp-scroll-layer,
.wp-advanced-layer,.wp-easy-motion{width:100%;height:100%;transform-origin:center center}
.wp-text{
  display:flex;align-items:center;width:100%;height:100%;overflow:hidden;padding:12px 18px;
}
.wp-text>div{font-size:24px;font-weight:650;line-height:1.35}
.wp-image{display:block;width:100%;height:100%;user-select:none}
.wp-image-placeholder{
  display:flex;width:100%;height:100%;align-items:center;justify-content:center;
  background:rgba(124,58,237,.08);color:#7c3aed;font-weight:700
}
.wp-content-shell{
  display:flex;width:100%;height:100%;overflow:hidden;
}
.wp-content-image{
  width:22%;min-width:70px;flex:none;display:flex;align-items:center;justify-content:center;
  padding:18px;border-right:1px solid rgba(46,5,98,.12)
}
.wp-content-image img,.wp-image-only img{
  display:block;max-width:100%;max-height:100%;object-fit:contain
}
.wp-image-only{
  display:flex;align-items:center;justify-content:center;padding:18px
}
.wp-content-main{
  min-width:0;flex:1;overflow:hidden;padding:20px 24px
}
.wp-label{
  font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.12em;opacity:.72
}
.wp-primary{
  margin-top:5px;font-size:25px;font-weight:800;line-height:1.15
}
.wp-secondary{
  margin-top:7px;font-size:15px;font-weight:600;line-height:1.3
}
.wp-body{
  margin-top:12px;font-size:14px;font-weight:520;line-height:1.55;overflow:hidden
}
.wp-link-label{
  margin-top:10px;font-size:12px;font-weight:700;opacity:.75;overflow:hidden;text-overflow:ellipsis;white-space:nowrap
}
.wp-bound-link{display:block;width:100%;height:100%;color:inherit;text-decoration:none}
.wp-bound-link:focus-visible .wp-content-shell{
  outline:4px solid rgba(124,58,237,.5);outline-offset:3px
}
.wp-missing{
  background:#fff8e7;color:#8a4b00;border:1px solid #f6d68b;border-radius:12px
}
.wp-scene-nav{
  position:fixed;right:max(14px,env(safe-area-inset-right));top:50%;z-index:9000;
  display:flex;flex-direction:column;gap:7px;transform:translateY(-50%);
  padding:8px;border-radius:999px;background:rgba(12,10,18,.35);backdrop-filter:blur(12px)
}
.wp-scene-dot{
  display:grid;place-items:center;width:24px;height:24px;padding:0;
  border:1px solid rgba(255,255,255,.24);border-radius:999px;
  background:rgba(255,255,255,.08);color:rgba(255,255,255,.78);
  cursor:pointer;transition:transform .18s ease,background .18s ease,border-color .18s ease
}
.wp-scene-dot span{font-size:8px;font-weight:800}
.wp-scene-dot:hover,.wp-scene-dot:focus-visible{transform:scale(1.08);outline:none;border-color:white}
.wp-scene-dot.is-active{background:white;color:#2e0562;border-color:white}
${css(INTERACTIVE_MOTION_CSS)}
html[data-wp-performance="balanced"] .wp-gradient-drift{
  animation-duration:34s!important
}
html[data-wp-performance="lite"] .wp-gradient-drift,
html[data-wp-performance="lite"] .wp-easy-motion{
  animation:none!important;
  transition:none!important
}
html[data-wp-performance="lite"] .wp-scene-background{
  will-change:auto
}
@media (max-width:700px){
  .wp-scene-nav{right:8px;gap:5px;padding:6px}
  .wp-scene-dot{width:21px;height:21px}
}
@media (prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
  .wp-stage,.wp-scene-background,.wp-parallax-layer,.wp-path-layer,
  .wp-scroll-layer,.wp-advanced-layer,.wp-easy-motion{
    transition:none!important;animation:none!important
  }
}
@media print{
  .wp-scene-nav,.wp-skip{display:none!important}
  .wp-scene-section{height:auto!important;min-height:0!important;break-after:page}
  .wp-stage{position:relative!important;height:100vh!important}
}
</style>
</head>
<body>
<a class="wp-skip" href="#wp-interactive-root">Skip to interactive resume</a>
<nav class="wp-scene-nav" aria-label="Interactive resume scenes">${nav}</nav>
<main id="wp-interactive-root">
${scenes}
</main>
${runtimeScript(projection)}
</body>
</html>`;
}
