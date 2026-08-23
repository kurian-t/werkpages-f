import type { ResumeData, ResumeDesign } from "./types";
import { formatDateRange, formatEduYears } from "./types";
import { getDesignObjects, type ImageDesignObject } from "./resumeDesignObjects";
import { companyLogoDomain } from "@/lib/utils";
import { atsBlocksFromHtml, type ATSBodyBlock } from "./resumeATS";
import {
  getResumeProjects,
  projectHasContent,
  splitTechStack,
  type ResumeProjectEntry,
} from "./resumeProjects";

export type ResumeWebTheme = "auto" | "light" | "dark";
export type ResumeWebHeroLayout = "split" | "centered";
export type ResumeWebDetailsMode = "first-two" | "all" | "collapsed";
export type ResumeWebAnimationStyle = "none" | "fade" | "slide" | "scale";
export type ResumeWebAnimationSpeed = "gentle" | "normal" | "lively";
export type ResumeWebVideoPlacement = "after-hero" | "after-about";
export type ResumeWebTemplateLayout = "single" | "sidebar-left" | "sidebar-right";

export interface ResumeWebTemplatePresentation {
  /**
   * Presentation recipe inherited from the shared Designed PDF template.
   * This is intentionally Web-specific presentation metadata, not resume content.
   * Keeping it here means "Make current design custom" can detach the PDF
   * template marker without making Responsive Web suddenly lose its appearance.
   */
  templateId: string;
  layout: ResumeWebTemplateLayout;
  accent: string;
  paper: string;
  sidebarColor: string;
  headerAccent: boolean;
  timeline: boolean;
}

/** @deprecated Projects are now shared ResumeData content. */
export type ResumeWebProject = ResumeProjectEntry;

export interface ResumeWebFeaturedLink {
  id: string;
  label: string;
  url: string;
  description: string;
}

export interface ResumeWebVideoIntro {
  enabled: boolean;
  url: string;
  title: string;
  caption: string;
  placement: ResumeWebVideoPlacement;
}

export interface ResumeWebSettings {
  theme: ResumeWebTheme;
  heroLayout: ResumeWebHeroLayout;
  detailsMode: ResumeWebDetailsMode;
  showNav: boolean;
  showSearch: boolean;
  showPrint: boolean;
  showBackToTop: boolean;
  showPhoto: boolean;

  // Phase 13B animation controls.
  animationStyle: ResumeWebAnimationStyle;
  animationSpeed: ResumeWebAnimationSpeed;
  animateHero: boolean;
  animateSections: boolean;
  animateSkills: boolean;
  hoverLift: boolean;

  // Shared-template presentation adapted for the responsive Web canvas.
  templatePresentation: ResumeWebTemplatePresentation;

  // Web-only content / visitor behavior.
  videoIntro: ResumeWebVideoIntro;
  featuredLinks: ResumeWebFeaturedLink[];
}

export const DEFAULT_RESUME_WEB_SETTINGS: ResumeWebSettings = {
  theme: "auto",
  heroLayout: "split",
  detailsMode: "first-two",
  showNav: true,
  showSearch: true,
  showPrint: true,
  showBackToTop: true,
  showPhoto: true,

  animationStyle: "none",
  animationSpeed: "normal",
  animateHero: false,
  animateSections: false,
  animateSkills: false,
  hoverLift: false,

  templatePresentation: {
    templateId: "",
    layout: "single",
    accent: "#5b21b6",
    paper: "#ffffff",
    sidebarColor: "",
    headerAccent: false,
    timeline: false,
  },

  videoIntro: {
    enabled: false,
    url: "",
    title: "Video introduction",
    caption: "",
    placement: "after-hero",
  },
  featuredLinks: [],
};

type ResumeDesignWithWeb = ResumeDesign & {
  webResume?: Partial<ResumeWebSettings> & {
    templatePresentation?: Partial<ResumeWebTemplatePresentation>;
    videoIntro?: Partial<ResumeWebVideoIntro>;
    featuredLinks?: ResumeWebFeaturedLink[];
    // Legacy Phase 13B fields are read only for migration compatibility.
    projects?: ResumeProjectEntry[];
    githubProfile?: string;
  };
};

export interface ResumeWebPalette {
  page: string;
  canvas: string;
  ink: string;
  muted: string;
  accent: string;
  accentSoft: string;
  accentText: string;
  border: string;
}

export interface ResumeWebProjection {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  website: string;
  summary: string;
  profilePhoto?: string;
  work: Array<{
    id: string;
    company: string;
    title: string;
    dates: string;
    logoUrl?: string;
    body: ATSBodyBlock[];
  }>;
  education: Array<{
    id: string;
    school: string;
    credential: string;
    years: string;
  }>;
  skills: string[];
  projects: ResumeProjectEntry[];
  links: Array<{ label: string; url: string }>;
  palette: ResumeWebPalette;
  settings: ResumeWebSettings;
  videoEmbed?: ResumeWebVideoEmbed;
}

export interface ResumeWebVideoEmbed {
  kind: "iframe" | "video";
  src: string;
  provider: "youtube" | "vimeo" | "direct";
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" ? value as Record<string, any> : {};
}

function safeCssColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const v = value.trim();
  if (
    /^#[0-9a-f]{3,8}$/i.test(v) ||
    /^rgba?\(\s*[\d.%\s,]+\)$/i.test(v) ||
    /^hsla?\(\s*[\d.%\s,]+\)$/i.test(v) ||
    /^[a-z]{3,20}$/i.test(v)
  ) {
    return v;
  }
  return fallback;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const value = hex.trim();
  const short = value.match(/^#([0-9a-f]{3})$/i);
  if (short) {
    const [r, g, b] = short[1].split("").map(ch => parseInt(ch + ch, 16));
    return { r, g, b };
  }
  const long = value.match(/^#([0-9a-f]{6})$/i);
  if (!long) return null;
  return {
    r: parseInt(long[1].slice(0, 2), 16),
    g: parseInt(long[1].slice(2, 4), 16),
    b: parseInt(long[1].slice(4, 6), 16),
  };
}

function softColor(accent: string, alpha = 0.10): string {
  const rgb = hexToRgb(accent);
  return rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})` : `rgba(124,58,237,${alpha})`;
}

function firstProfilePhoto(data: ResumeData): string | undefined {
  const photo = getDesignObjects(data.design).find(
    (object): object is ImageDesignObject =>
      object.type === "image" &&
      (object.imageKind ?? "image") === "photo" &&
      !object.hidden &&
      typeof object.src === "string" &&
      (
        object.src.startsWith("data:image/") ||
        object.src.startsWith("https://") ||
        object.src.startsWith("http://")
      )
  );
  return photo?.src;
}

function normalizeFeaturedLink(link: Partial<ResumeWebFeaturedLink>, index: number): ResumeWebFeaturedLink {
  return {
    id: link.id || `web-link-${index}`,
    label: link.label ?? "",
    url: link.url ?? "",
    description: link.description ?? "",
  };
}

export function getResumeWebSettings(design: ResumeDesign): ResumeWebSettings {
  const saved = (design as ResumeDesignWithWeb).webResume ?? {};
  const {
    projects: _legacyProjects,
    githubProfile: _legacyGithubProfile,
    ...currentSaved
  } = saved;

  return {
    ...DEFAULT_RESUME_WEB_SETTINGS,
    ...currentSaved,
    templatePresentation: {
      ...DEFAULT_RESUME_WEB_SETTINGS.templatePresentation,
      ...(saved.templatePresentation ?? {}),
    },
    videoIntro: {
      ...DEFAULT_RESUME_WEB_SETTINGS.videoIntro,
      ...(saved.videoIntro ?? {}),
    },
    featuredLinks: Array.isArray(saved.featuredLinks)
      ? saved.featuredLinks.map(normalizeFeaturedLink)
      : [],
  };
}

export function withResumeWebSettings(
  design: ResumeDesign,
  patch: Partial<ResumeWebSettings>,
): ResumeDesign {
  const current = getResumeWebSettings(design);
  const nextPatch = {
    ...patch,
    ...(patch.templatePresentation
      ? {
          templatePresentation: {
            ...current.templatePresentation,
            ...patch.templatePresentation,
          },
        }
      : {}),
    ...(patch.videoIntro
      ? { videoIntro: { ...current.videoIntro, ...patch.videoIntro } }
      : {}),
  };

  return {
    ...(design as ResumeDesignWithWeb),
    webResume: {
      ...current,
      ...nextPatch,
    },
  } as ResumeDesign;
}

export function resetResumeWebSettings(design: ResumeDesign): ResumeDesign {
  const next = { ...(design as ResumeDesignWithWeb) };
  delete next.webResume;
  return next as ResumeDesign;
}

export function resumeWebPalette(
  data: ResumeData,
  effectiveTheme?: "light" | "dark",
): ResumeWebPalette {
  const design = asRecord(data.design);
  const name = asRecord(design.name);
  const heading = asRecord(design.sectionHeading);
  const accent = safeCssColor(heading.color, "#5b21b6");

  if (effectiveTheme === "dark") {
    return {
      page: "#111318",
      canvas: "#090a0d",
      ink: "#f7f7f8",
      muted: "#d4d4d8",
      accent,
      accentSoft: softColor(accent, 0.18),
      accentText: "#ffffff",
      border: "#2b2d33",
    };
  }

  const page = safeCssColor(design.pageBackground, "#ffffff");
  const ink = safeCssColor(name.color, "#18181b");

  return {
    page,
    canvas: page.toLowerCase() === "#ffffff" || page.toLowerCase() === "white"
      ? "#f4f4f5"
      : "#f1f1f3",
    ink,
    muted: "#71717a",
    accent,
    accentSoft: softColor(accent),
    accentText: accent,
    border: "#e4e4e7",
  };
}

export function normalizeWebUrl(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^mailto:/i.test(raw) || /^tel:/i.test(raw)) return raw;

  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(raw)) return `https://${raw}`;
  return null;
}

export function normalizeImageUrl(value: string | null | undefined): string | null {
  const url = normalizeWebUrl(value);
  return url && /^https?:\/\//i.test(url) ? url : null;
}

export function resolveVideoEmbed(value: string | null | undefined): ResumeWebVideoEmbed | null {
  const raw = value?.trim();
  if (!raw) return null;

  const normalized = normalizeWebUrl(raw);
  if (!normalized || !/^https?:\/\//i.test(normalized)) return null;

  try {
    const url = new URL(normalized);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();

    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id ? {
        kind: "iframe",
        src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`,
        provider: "youtube",
      } : null;
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      let id = url.searchParams.get("v");
      if (!id) {
        const parts = url.pathname.split("/").filter(Boolean);
        const marker = parts.findIndex(part => part === "shorts" || part === "embed");
        if (marker >= 0) id = parts[marker + 1] ?? null;
      }
      return id ? {
        kind: "iframe",
        src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`,
        provider: "youtube",
      } : null;
    }

    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const id = url.pathname.split("/").filter(Boolean).find(part => /^\d+$/.test(part));
      return id ? {
        kind: "iframe",
        src: `https://player.vimeo.com/video/${encodeURIComponent(id)}`,
        provider: "vimeo",
      } : null;
    }

    if (/\.(mp4|webm)(\?.*)?$/i.test(normalized)) {
      return {
        kind: "video",
        src: normalized,
        provider: "direct",
      };
    }
  } catch {
    return null;
  }

  return null;
}

export function projectResumeToWeb(
  data: ResumeData,
  effectiveTheme?: "light" | "dark",
): ResumeWebProjection {
  const settings = getResumeWebSettings(data.design);

  return {
    fullName: `${data.firstName ?? ""} ${data.lastName ?? ""}`.trim() || "Your Name",
    email: data.email?.trim() ?? "",
    phone: data.phone?.trim() ?? "",
    location: data.location?.trim() ?? "",
    website: data.website?.trim() ?? "",
    summary: data.summary?.trim() ?? "",
    profilePhoto: settings.showPhoto ? firstProfilePhoto(data) : undefined,
    work: (data.workEntries ?? []).map((entry, index) => ({
      id: entry.id ?? `work-${index}`,
      company: entry.company?.trim() ?? "",
      title: entry.title?.trim() ?? "",
      dates: formatDateRange(entry.startDate, entry.endDate, entry.current),
      logoUrl: entry.logoUrl?.trim() || undefined,
      body: atsBlocksFromHtml(entry.body),
    })),
    education: (data.education ?? []).map((entry, index) => ({
      id: entry.id ?? `education-${index}`,
      school: entry.school?.trim() ?? "",
      credential: [entry.degree?.trim(), entry.field?.trim()].filter(Boolean).join(" — "),
      years: formatEduYears(entry.startYear, entry.endYear, entry.current),
    })),
    skills: (data.skills ?? []).map(skill => skill.trim()).filter(Boolean),
    projects: getResumeProjects(data),
    links: (data.extraLinks ?? [])
      .map(link => ({
        label: link.label?.trim() || link.url?.trim() || "Link",
        url: normalizeWebUrl(link.url) ?? "",
      }))
      .filter(link => !!link.url),
    palette: resumeWebPalette(data, effectiveTheme),
    settings,
    videoEmbed: settings.videoIntro.enabled
      ? resolveVideoEmbed(settings.videoIntro.url) ?? undefined
      : undefined,
  };
}

const WEB_LOGO_TOKEN = "pk_MXSjJV-uTC6-L5D_FbXZUA";

function companyLogoUrl(
  company: string,
  explicitLogoUrl?: string,
): string {
  if (explicitLogoUrl?.trim()) return explicitLogoUrl.trim();
  return `https://img.logo.dev/${companyLogoDomain(company)}?token=${WEB_LOGO_TOKEN}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function sectionNavItem(id: string, label: string): string {
  return `<a class="nav-link" href="#${id}" data-nav="${id}">${escapeHtml(label)}</a>`;
}

function bodyBlocksHtml(blocks: ATSBodyBlock[]): string {
  if (blocks.length === 0) return "";
  const out: string[] = [];
  let bullets: string[] = [];

  function flush() {
    if (bullets.length > 0) {
      out.push(`<ul>${bullets.map(text => `<li>${escapeHtml(text)}</li>`).join("")}</ul>`);
      bullets = [];
    }
  }

  for (const block of blocks) {
    if (block.kind === "bullet") bullets.push(block.text);
    else {
      flush();
      out.push(`<p>${escapeHtml(block.text)}</p>`);
    }
  }
  flush();
  return out.join("");
}

function detailsInitiallyOpen(mode: ResumeWebDetailsMode, index: number): boolean {
  if (mode === "all") return true;
  if (mode === "collapsed") return false;
  return index < 2;
}

function personSchema(data: ResumeData, p: ResumeWebProjection): Record<string, unknown> {
  const sameAs = [
    normalizeWebUrl(p.website),
    ...p.links.map(link => link.url),
    ...p.settings.featuredLinks.map(link => normalizeWebUrl(link.url)),
  ].filter(Boolean);

  const currentWork = (data.workEntries ?? []).find(entry => entry.current);
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: p.fullName,
  };

  if (p.email) schema.email = p.email;
  if (p.phone) schema.telephone = p.phone;
  if (p.location) schema.address = p.location;
  if (sameAs.length > 0) schema.sameAs = sameAs;
  if (currentWork?.company) {
    schema.worksFor = { "@type": "Organization", name: currentWork.company };
  }
  if ((data.education ?? []).some(entry => entry.school?.trim())) {
    schema.alumniOf = (data.education ?? [])
      .filter(entry => entry.school?.trim())
      .map(entry => ({ "@type": "EducationalOrganization", name: entry.school?.trim() }));
  }
  return schema;
}

function animationValues(settings: ResumeWebSettings): {
  duration: string;
  distance: string;
  startOpacity: string;
  startScale: string;
} {
  const duration =
    settings.animationSpeed === "gentle" ? "700ms" :
    settings.animationSpeed === "lively" ? "280ms" :
    "440ms";
  const distance =
    settings.animationSpeed === "gentle" ? "12px" :
    settings.animationSpeed === "lively" ? "22px" :
    "16px";

  if (settings.animationStyle === "none") {
    return { duration: "0ms", distance: "0px", startOpacity: "1", startScale: "1" };
  }
  if (settings.animationStyle === "fade") {
    return { duration, distance: "0px", startOpacity: "0", startScale: "1" };
  }
  if (settings.animationStyle === "scale") {
    return { duration, distance: "0px", startOpacity: "0", startScale: ".965" };
  }
  return { duration, distance, startOpacity: "0", startScale: "1" };
}

function renderVideoSection(p: ResumeWebProjection): string {
  if (!p.videoEmbed) return "";
  const title = p.settings.videoIntro.title?.trim() || "Video introduction";
  const caption = p.settings.videoIntro.caption?.trim() || "";
  const media = p.videoEmbed.kind === "iframe"
    ? `<iframe src="${escapeAttribute(p.videoEmbed.src)}" title="${escapeAttribute(title)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`
    : `<video src="${escapeAttribute(p.videoEmbed.src)}" controls preload="metadata"></video>`;

  return `
    <section class="section${p.settings.animateSections ? " reveal" : ""}" id="video" data-web-style-instance="section:video">
      <div class="section-kicker">Meet me</div>
      <h2 data-web-instance="heading:video">${escapeHtml(title)}</h2>
      <div data-web-instance="body:video">${caption ? `<p class="section-intro">${escapeHtml(caption)}</p>` : ""}
      <div class="video-frame" data-web-instance="video:intro">${media}</div></div>
    </section>`;
}

function renderProjects(p: ResumeWebProjection): string {
  const projects = p.projects.filter(projectHasContent);
  if (projects.length === 0) return "";

  return `
    <section class="section${p.settings.animateSections ? " reveal" : ""}" id="projects" data-web-style-instance="section:projects">
      <h2 data-web-instance="heading:projects">Projects</h2>
      <div class="project-grid" data-web-instance="body:projects">
        ${projects.map((rawProject, index) => {
          const project = {
            id: String(rawProject.id ?? `project-${index}`),
            title: String(rawProject.title ?? ""),
            description: String(rawProject.description ?? ""),
            techStack: String(rawProject.techStack ?? ""),
            githubUrl: String(rawProject.githubUrl ?? ""),
            liveUrl: String(rawProject.liveUrl ?? ""),
            imageUrl: String(rawProject.imageUrl ?? ""),
          };
          const github = normalizeWebUrl(project.githubUrl);
          const live = normalizeWebUrl(project.liveUrl);
          const image = normalizeImageUrl(project.imageUrl);
          const stack = splitTechStack(project.techStack);
          const searchable = [project.title, project.description, project.techStack].join(" ").toLowerCase();
          return `
            <article class="project-card searchable hover-card" data-web-instance="project:${escapeAttribute(project.id || String(index))}" data-search="${escapeAttribute(searchable)}">
              ${image ? `<img class="project-image" src="${escapeAttribute(image)}" alt="" loading="lazy" />` : ""}
              <div class="project-body">
                <h3 data-web-instance="project-title:${escapeAttribute(project.id)}">${escapeHtml(project.title || "Project")}</h3>
                ${project.description ? `<p data-web-instance="project-description:${escapeAttribute(project.id)}">${escapeHtml(project.description)}</p>` : ""}
                ${stack.length ? `<div class="project-stack" data-web-instance="project-tech:${escapeAttribute(project.id)}">${stack.map(item => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}
                ${(github || live) ? `<div class="project-actions">
                  ${github ? `<a href="${escapeAttribute(github)}" target="_blank" rel="noreferrer">GitHub ↗</a>` : ""}
                  ${live ? `<a href="${escapeAttribute(live)}" target="_blank" rel="noreferrer">Live ↗</a>` : ""}
                </div>` : ""}
              </div>
            </article>`;
        }).join("")}
      </div>
    </section>`;
}

function renderFeaturedLinks(p: ResumeWebProjection): string {
  const links = p.settings.featuredLinks
    .map(link => ({ ...link, normalized: normalizeWebUrl(link.url) }))
    .filter(link => link.normalized);

  if (links.length === 0) return "";
  return `
    <section class="section${p.settings.animateSections ? " reveal" : ""}" id="featured" data-web-style-instance="section:featured">
      <div class="section-kicker">Find me online</div>
      <h2 data-web-instance="heading:featured">Featured links</h2>
      <div class="featured-grid" data-web-instance="body:featured">
        ${links.map((link, index) => `
          <a class="featured-card hover-card searchable" data-web-instance="link:${escapeAttribute(link.id || String(index))}" data-search="${escapeAttribute(`${link.label} ${link.description}`.toLowerCase())}" href="${escapeAttribute(link.normalized!)}" target="_blank" rel="noreferrer">
            <div><strong>${escapeHtml(link.label || "Link")}</strong>${link.description ? `<p>${escapeHtml(link.description)}</p>` : ""}</div><span>↗</span>
          </a>`).join("")}
      </div>
    </section>`;
}

/**
 * Self-contained responsive resume site.
 * No external runtime JS, analytics or trackers are added.
 */
export function buildStandaloneResumeWebHtml(data: ResumeData): string {
  const settings = getResumeWebSettings(data.design);
  const initialTheme: "light" | "dark" = settings.theme === "dark" ? "dark" : "light";
  const p = projectResumeToWeb(data, initialTheme);
  const animation = animationValues(settings);
  const projectCount = p.projects.filter(project =>
    project.title.trim() || project.githubUrl.trim() || project.liveUrl.trim()
  ).length;
  const featuredCount =
    settings.featuredLinks.filter(link => normalizeWebUrl(link.url)).length;

  const sections = [
    p.summary ? ["about", "About"] : null,
    p.videoEmbed ? ["video", "Video"] : null,
    p.work.length ? ["experience", "Experience"] : null,
    projectCount ? ["projects", "Projects"] : null,
    p.education.length ? ["education", "Education"] : null,
    p.skills.length ? ["skills", "Skills"] : null,
    featuredCount ? ["featured", "Featured"] : null,
    p.links.length ? ["links", "Links"] : null,
  ].filter(Boolean) as string[][];

  const contactItems: string[] = [];
  if (p.email) contactItems.push(`<a href="mailto:${escapeAttribute(p.email)}">${escapeHtml(p.email)}</a>`);
  if (p.phone) {
    const tel = p.phone.replace(/[^\d+]/g, "");
    contactItems.push(`<a href="tel:${escapeAttribute(tel)}">${escapeHtml(p.phone)}</a>`);
  }
  if (p.location) contactItems.push(`<span>${escapeHtml(p.location)}</span>`);
  const website = normalizeWebUrl(p.website);
  if (website) contactItems.push(`<a href="${escapeAttribute(website)}" target="_blank" rel="noreferrer">${escapeHtml(p.website)}</a>`);

  const photo = p.profilePhoto
    ? `<img class="avatar" src="${escapeAttribute(p.profilePhoto)}" alt="" />`
    : "";

  const work = p.work.map((entry, index) => {
    const title = entry.title || "Role";
    const meta = [entry.company, entry.dates].filter(Boolean).join(" · ");
    const details = bodyBlocksHtml(entry.body);
    const open = detailsInitiallyOpen(settings.detailsMode, index);
    const searchable = [title, meta, ...entry.body.map(block => block.text)].join(" ").toLowerCase();
    const logo = data.design.showCompanyLogos && entry.company
      ? `<img
          class="company-logo"
          data-web-instance="work-logo:${escapeAttribute(entry.id)}"
          src="${escapeAttribute(companyLogoUrl(entry.company, entry.logoUrl))}"
          data-fallback-logo="${escapeAttribute(companyLogoUrl(entry.company))}"
          alt=""
          loading="lazy"
        />`
      : "";

    return `
      <article class="role-card${settings.animateSections ? " reveal" : ""} searchable" data-web-instance="work:${escapeAttribute(entry.id)}" data-search="${escapeAttribute(searchable)}" style="--reveal-index:${index}">
        <div class="role-head">
          <div class="role-identity">
            ${logo}
            <div class="role-copy">
              <h3>${escapeHtml(title)}</h3>
              ${meta ? `<p class="meta">${escapeHtml(meta)}</p>` : ""}
            </div>
          </div>
          ${details ? `<button class="details-toggle" type="button" aria-expanded="${open ? "true" : "false"}">${open ? "Hide details" : "Details"}</button>` : ""}
        </div>
        ${details ? `<div class="role-details${open ? " open" : ""}" data-web-instance="work-body:${escapeAttribute(entry.id)}">${details}</div>` : ""}
      </article>`;
  }).join("");

  const education = p.education.map((entry, index) => {
    const searchable = [entry.school, entry.credential, entry.years].join(" ").toLowerCase();
    return `
      <article class="education-card${settings.animateSections ? " reveal" : ""} searchable" data-web-instance="education:${escapeAttribute(entry.id)}" data-search="${escapeAttribute(searchable)}" style="--reveal-index:${index}">
        <h3>${escapeHtml(entry.school || "School")}</h3>
        ${entry.credential ? `<p>${escapeHtml(entry.credential)}</p>` : ""}
        ${entry.years ? `<p class="meta">${escapeHtml(entry.years)}</p>` : ""}
      </article>`;
  }).join("");

  const skills = p.skills.map((skill, index) =>
    `<span class="skill searchable${settings.animateSkills ? " skill-animated" : ""}" data-web-instance="skill:${index}" data-search="${escapeAttribute(skill.toLowerCase())}" style="--skill-index:${index}">${escapeHtml(skill)}</span>`
  ).join("");

  const links = p.links.map((link, index) => `
    <a class="link-card${settings.animateSections ? " reveal" : ""} searchable hover-card" data-web-instance="resume-link:${index}" data-search="${escapeAttribute(`${link.label} ${link.url}`.toLowerCase())}" href="${escapeAttribute(link.url)}" target="_blank" rel="noreferrer">
      <span>${escapeHtml(link.label)}</span><span aria-hidden="true">↗</span>
    </a>
  `).join("");

  const lightPalette = resumeWebPalette(data, "light");
  const darkPalette = resumeWebPalette(data, "dark");
  const schema = personSchema(data, p);

  const searchControls = settings.showSearch
    ? `<label class="search-wrap" aria-label="Search resume"><span aria-hidden="true">⌕</span><input id="resume-search" type="search" placeholder="Search resume" autocomplete="off" /></label>`
    : "";
  const printControl = settings.showPrint
    ? `<button class="utility-button" id="print-resume" type="button" title="Print or save as PDF">Print</button>`
    : "";
  const themeControl = `<button class="utility-button" id="theme-toggle" type="button" title="Switch light/dark theme">Theme</button>`;
  const navHtml = settings.showNav
    ? `<nav class="site-nav" aria-label="Resume sections">
         <div class="brand"><span class="brand-dot"></span>${escapeHtml(p.fullName)}</div>
         <div class="nav-links">${sections.map(([id,label]) => sectionNavItem(id,label)).join("")}</div>
         <div class="nav-tools">${searchControls}${themeControl}${printControl}</div>
       </nav>`
    : `<div class="floating-tools">${searchControls}${themeControl}${printControl}</div>`;

  // Phase 15 removes the old preset-style hero layout. The Web canvas starts
  // structurally neutral; responsive position/size comes from presentation state.
  const heroClass = `${settings.animateHero ? "reveal " : ""}hero`;
  const noMotion = settings.animationStyle === "none" ? " no-motion" : "";
  const videoHtml = renderVideoSection(p);
  const projectsHtml = renderProjects(p);
  const featuredHtml = renderFeaturedLinks(p);
  const videoAfterHero = p.videoEmbed && settings.videoIntro.placement === "after-hero" ? videoHtml : "";
  const videoAfterAbout = p.videoEmbed && settings.videoIntro.placement === "after-about" ? videoHtml : "";

  return `<!doctype html>
<html lang="en" data-theme="${initialTheme}" data-theme-setting="${settings.theme}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(p.fullName)} — Resume</title>
<meta name="description" content="${escapeAttribute(p.summary.slice(0, 155) || `${p.fullName} resume`)}" />
<meta name="theme-color" content="${escapeAttribute(lightPalette.accent)}" />
<script type="application/ld+json">${safeJsonForScript(schema)}</script>
<style>
:root{
  --light-page:${lightPalette.page};--light-canvas:${lightPalette.canvas};--light-ink:${lightPalette.ink};
  --light-muted:${lightPalette.muted};--light-accent:${lightPalette.accent};--light-accent-soft:${lightPalette.accentSoft};--light-accent-text:${lightPalette.accentText};--light-border:${lightPalette.border};
  --dark-page:${darkPalette.page};--dark-canvas:${darkPalette.canvas};--dark-ink:${darkPalette.ink};
  --dark-muted:${darkPalette.muted};--dark-accent:${darkPalette.accent};--dark-accent-soft:${darkPalette.accentSoft};--dark-accent-text:${darkPalette.accentText};--dark-border:${darkPalette.border};
  --page:var(--light-page);--canvas:var(--light-canvas);--ink:var(--light-ink);--muted:var(--light-muted);
  --accent:var(--light-accent);--accent-soft:var(--light-accent-soft);--accent-text:var(--light-accent-text);--border:var(--light-border);
  --anim-duration:${animation.duration};--anim-distance:${animation.distance};--anim-opacity:${animation.startOpacity};--anim-scale:${animation.startScale};
}
html[data-theme="dark"]{
  --page:var(--dark-page);--canvas:var(--dark-canvas);--ink:var(--dark-ink);--muted:var(--dark-muted);
  --accent:var(--dark-accent);--accent-soft:var(--dark-accent-soft);--accent-text:var(--dark-accent-text);--border:var(--dark-border);
}
html[data-theme="dark"] body{color:var(--ink)}
html[data-theme="dark"] .hero-summary,
html[data-theme="dark"] .contact,
html[data-theme="dark"] .meta,
html[data-theme="dark"] .role-details,
html[data-theme="dark"] .about-text,
html[data-theme="dark"] .project-body p,
html[data-theme="dark"] .footer{color:var(--muted)}
html[data-theme="dark"] h1,
html[data-theme="dark"] h2,
html[data-theme="dark"] h3,
html[data-theme="dark"] .skill,
html[data-theme="dark"] .link-card,
html[data-theme="dark"] .featured-card{color:var(--ink)}
*{box-sizing:border-box}
html{scroll-behavior:smooth;background:var(--canvas)}
body{
  margin:0;background:var(--page);color:var(--ink);
  font-family:Arial,Helvetica,sans-serif;line-height:1.55;
  transition:background .2s ease,color .2s ease;
}
body.no-motion,body.no-motion *{scroll-behavior:auto!important;animation:none!important;transition:none!important}
a{color:inherit}
#scroll-progress{position:fixed;left:0;top:0;height:2px;width:0;background:var(--accent);z-index:100}
.shell{max-width:1040px;margin:0 auto;padding:22px 28px 64px}

.site-nav,.floating-tools{
  position:sticky;top:8px;z-index:20;display:flex;align-items:center;
  justify-content:space-between;gap:14px;
  margin-left:-28px;margin-right:-28px;
  padding:9px 28px;
  border-top:1px solid var(--border);border-bottom:1px solid var(--border);
  border-left:0;border-right:0;border-radius:0;
  background:color-mix(in srgb,var(--page) 96%,transparent);
  box-shadow:0 3px 12px rgba(15,23,42,.045);
  backdrop-filter:blur(10px);min-width:0
}
html[data-theme="dark"] .site-nav,
html[data-theme="dark"] .floating-tools{box-shadow:0 3px 12px rgba(0,0,0,.12)}
.site-nav{justify-content:space-between}
.floating-tools{justify-content:flex-end;width:auto;margin-left:auto}
.brand{display:flex;align-items:center;gap:8px;font-weight:800;font-size:13px;min-width:0}
.brand-dot{width:7px;height:7px;border-radius:50%;background:var(--accent);flex-shrink:0}
.nav-links{
  display:flex;align-items:center;flex:1 1 auto;gap:16px;
  overflow-x:auto;overflow-y:hidden;min-width:0;
  scrollbar-width:none;padding:0 4px 0 2px
}
.nav-links::-webkit-scrollbar{display:none}
.nav-link{
  white-space:nowrap;text-decoration:none;padding:6px 1px 5px;color:var(--muted);
  font-size:10.5px;font-weight:650;border-bottom:1px solid transparent
}
.nav-link:hover{color:var(--ink)}
.nav-link.active{color:var(--ink);font-weight:800;border-bottom-color:var(--accent)}
.nav-tools{
  display:flex;align-items:center;justify-content:flex-end;gap:8px;min-width:0;flex:0 0 auto
}
.search-wrap{
  display:flex;align-items:center;gap:6px;height:30px;min-width:0;width:136px;
  padding:0 9px;border:1px solid var(--border);border-radius:9px;
  color:var(--muted);background:color-mix(in srgb,var(--ink) 2.8%,transparent)
}
.search-wrap input{
  width:100%;min-width:0;border:0;outline:0;background:transparent;
  color:var(--ink);font:inherit;font-size:10px
}
.utility-button{
  height:30px;flex-shrink:0;padding:0 9px;border:1px solid transparent;border-radius:8px;
  background:color-mix(in srgb,var(--ink) 2%,transparent);
  color:var(--ink);font:inherit;font-size:10px;font-weight:700;cursor:pointer
}
.utility-button:hover{color:var(--ink)}

.hero{
  margin-top:28px;padding:24px 0 34px;display:grid;
  grid-template-columns:minmax(0,1fr) auto;gap:28px;align-items:start;background:transparent
}
.hero-centered{grid-template-columns:1fr;text-align:center}
.hero-centered .avatar{grid-row:1;margin:0 auto}
.hero-centered .contact{justify-content:center}
.hero-centered .hero-summary{margin-left:auto;margin-right:auto}
.eyebrow{display:none}
h1{
  font-size:clamp(38px,7vw,68px);line-height:1;letter-spacing:-.045em;
  margin:0 0 14px;max-width:780px
}
.hero-centered h1{margin-left:auto;margin-right:auto}
.hero-summary{max-width:690px;margin:0;color:var(--muted);font-size:clamp(14px,2vw,17px)}
.contact{display:flex;flex-wrap:wrap;gap:5px 14px;margin-top:16px}
.contact a,.contact span{font-size:11.5px;padding:0;text-decoration:none}
.contact a:hover{color:var(--accent-text)}
.avatar{width:clamp(96px,15vw,156px);height:clamp(96px,15vw,156px);object-fit:cover;background:transparent}

.content{display:grid;grid-template-columns:minmax(0,1fr);gap:0;margin-top:0}
.section{scroll-margin-top:76px;padding:26px 0;background:transparent}
.section-kicker{display:none}
.section h2{font-size:clamp(22px,4vw,32px);line-height:1.08;letter-spacing:-.025em;margin:0 0 14px}
.section-intro,.about-text{max-width:820px;margin:0;color:var(--muted);font-size:14px;white-space:pre-wrap}

.role-card,.education-card{padding:14px 0;border-top:1px solid var(--border)}
.role-card:first-of-type,.education-card:first-of-type{border-top:0;padding-top:0}
.role-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.role-identity{display:flex;align-items:flex-start;gap:10px;min-width:0}
.role-copy{min-width:0}
.company-logo{
  display:block;width:30px;height:30px;flex:0 0 30px;
  object-fit:contain;border-radius:5px;background:transparent
}
h3{margin:0;font-size:15px;line-height:1.3}
.meta{margin:3px 0 0;color:var(--muted);font-size:11.5px}
.details-toggle{
  flex-shrink:0;border:0;background:transparent;color:var(--muted);font:inherit;
  font-size:10.5px;font-weight:700;padding:2px 0;cursor:pointer;text-decoration:underline;text-underline-offset:2px
}
.details-toggle:hover{color:var(--ink)}
.role-details{display:none;color:var(--muted);font-size:13px;padding-top:9px;max-width:850px}
.role-details.open{display:block}
.role-details p{margin:7px 0 0}
.role-details ul{margin:7px 0 0;padding-left:18px}
.role-details li{margin:3px 0}

.skills{display:flex;flex-wrap:wrap;gap:7px 14px}
.skill{padding:0;background:transparent;color:var(--ink);font-size:12px;font-weight:600}

.links-grid,.featured-grid{display:grid;gap:7px}
.link-card,.featured-card{
  display:flex;justify-content:space-between;align-items:baseline;gap:12px;
  text-decoration:underline;text-underline-offset:2px;border:0;border-radius:0;padding:3px 0;background:transparent
}
.featured-card p{margin:2px 0 0;color:var(--muted);font-size:10.5px}
.link-card:hover,.featured-card:hover{color:var(--accent-text)}

.video-frame{position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;background:#000}
.video-frame iframe,.video-frame video{width:100%;height:100%;border:0;display:block}

.project-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:24px}
.project-card{overflow:visible;background:transparent}
.project-image{width:100%;aspect-ratio:16/9;object-fit:cover;display:block;background:var(--canvas)}
.project-body{padding:10px 0 0}
.project-body p{margin:6px 0 0;color:var(--muted);font-size:12.5px;line-height:1.5}
.project-stack{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.project-stack span{
  display:inline-flex;align-items:center;min-height:22px;padding:2px 7px;
  border:1px solid var(--border);border-radius:4px;
  background:color-mix(in srgb,var(--ink) 4.5%,transparent);
  color:var(--ink);font-size:10px;font-weight:650;line-height:1.25
}
.project-actions{display:flex;gap:12px;margin-top:10px}
.project-actions a{
  padding:0;border:0;border-radius:0;text-decoration:underline;text-underline-offset:2px;
  font-size:11px;font-weight:750
}
.project-actions a:hover{color:var(--accent-text)}

.search-hidden{display:none!important}
.search-status{display:none;margin:0 0 12px;padding:7px 0;color:var(--accent-text);font-size:10.5px;font-weight:700}
.search-status.visible{display:block}
#back-to-top{
  position:fixed;right:22px;bottom:22px;width:36px;height:36px;border:1px solid var(--border);
  border-radius:50%;background:var(--page);color:var(--ink);font-weight:800;cursor:pointer;
  opacity:0;pointer-events:none;transform:translateY(8px);transition:.2s ease
}
#back-to-top.visible{opacity:1;pointer-events:auto;transform:none}
.footer{text-align:left;color:var(--muted);font-size:10px;padding:26px 0 0}

.reveal{
  opacity:var(--anim-opacity);transform:translateY(var(--anim-distance)) scale(var(--anim-scale));
  transition:opacity var(--anim-duration) ease,transform var(--anim-duration) cubic-bezier(.2,.8,.2,1);
  transition-delay:calc(var(--reveal-index,0) * 55ms)
}
.reveal.visible{opacity:1;transform:none}
.skill-animated{
  animation:skill-pop var(--anim-duration) cubic-bezier(.2,.8,.2,1) both;
  animation-delay:calc(var(--skill-index,0) * 40ms)
}
@keyframes skill-pop{
  from{opacity:var(--anim-opacity);transform:translateY(calc(var(--anim-distance) * .5)) scale(var(--anim-scale))}
  to{opacity:1;transform:none}
}
${settings.hoverLift ? `.hover-card{transition:transform 180ms ease,box-shadow 180ms ease}.hover-card:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(15,23,42,.08)}` : ""}

@media(max-width:540px){
  .site-nav{flex-direction:column;align-items:stretch;gap:9px;padding-top:10px;padding-bottom:10px}
  .nav-links{width:100%;padding:0 2px}
  .nav-tools{width:100%;justify-content:space-between}
  .search-wrap{flex:1 1 auto;max-width:230px;width:auto}
}
@media(max-width:700px){
  .shell{padding:14px 18px 48px}
  .site-nav,.floating-tools{
    top:0;
    margin-left:-18px;
    margin-right:-18px;
    padding-left:18px;
    padding-right:18px
  }
  .hero{grid-template-columns:1fr;padding:22px 0 28px}
  .avatar{grid-row:1;width:88px;height:88px}
  .section{padding:22px 0}
  .role-head{gap:10px}
  #back-to-top{right:12px;bottom:12px}
}
@media(prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
  .reveal{opacity:1;transform:none;transition:none}
  .skill-animated{animation:none!important}
}
@media print{
  #scroll-progress,.site-nav,.floating-tools,#back-to-top,.details-toggle{display:none!important}
  html,body{background:#fff!important;color:#111!important}
  .shell{max-width:none;padding:0}
  .role-details{display:block!important;color:#333!important}
  .reveal{opacity:1!important;transform:none!important}
  .video-frame{display:none}
}
</style>
</head>
<body class="${noMotion.trim()}">
<div id="scroll-progress"></div>
<div class="shell">
  ${navHtml}
  <header class="${heroClass}">
    <div>
      <div class="eyebrow">Interactive resume</div>
      <h1>${escapeHtml(p.fullName)}</h1>
      ${p.summary ? `<p class="hero-summary">${escapeHtml(p.summary)}</p>` : ""}
      ${contactItems.length ? `<div class="contact">${contactItems.join("")}</div>` : ""}
    </div>
    ${photo}
  </header>

  <main class="content">
    <div id="search-status" class="search-status" aria-live="polite"></div>
    ${videoAfterHero}
    ${p.summary ? `<section class="section${settings.animateSections ? " reveal" : ""}" id="about" data-web-style-instance="section:about"><div class="section-kicker">Profile</div><h2 data-web-instance="heading:about">About</h2><p class="about-text" data-web-instance="body:about">${escapeHtml(p.summary)}</p></section>` : ""}
    ${videoAfterAbout}
    ${p.work.length ? `<section class="section${settings.animateSections ? " reveal" : ""}" id="experience" data-web-style-instance="section:experience"><div class="section-kicker">Career</div><h2 data-web-instance="heading:experience">Experience</h2><div data-web-instance="body:experience">${work}</div></section>` : ""}
    ${projectsHtml}
    ${p.education.length ? `<section class="section${settings.animateSections ? " reveal" : ""}" id="education" data-web-style-instance="section:education"><div class="section-kicker">Background</div><h2 data-web-instance="heading:education">Education</h2><div data-web-instance="body:education">${education}</div></section>` : ""}
    ${p.skills.length ? `<section class="section${settings.animateSections ? " reveal" : ""}" id="skills" data-web-style-instance="section:skills"><div class="section-kicker">Toolkit</div><h2 data-web-instance="heading:skills">Skills</h2><div class="skills" data-web-instance="body:skills">${skills}</div></section>` : ""}
    ${featuredHtml}
    ${p.links.length ? `<section class="section${settings.animateSections ? " reveal" : ""}" id="links" data-web-style-instance="section:links"><div class="section-kicker">Elsewhere</div><h2 data-web-instance="heading:links">Links</h2><div class="links-grid" data-web-instance="body:links">${links}</div></section>` : ""}
  </main>
  <footer class="footer">${escapeHtml(p.fullName)} · Interactive resume</footer>
</div>
${settings.showBackToTop ? `<button id="back-to-top" type="button" aria-label="Back to top">↑</button>` : ""}

<script>
(() => {
  const root = document.documentElement;
  const themeSetting = root.dataset.themeSetting || 'auto';
  const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const storedTheme = (() => { try { return localStorage.getItem('resume-web-theme'); } catch { return null; } })();

  function applyTheme(theme) {
    root.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', getComputedStyle(root).getPropertyValue('--accent').trim());
  }

  if (storedTheme === 'light' || storedTheme === 'dark') applyTheme(storedTheme);
  else if (themeSetting === 'dark') applyTheme('dark');
  else if (themeSetting === 'light') applyTheme('light');
  else applyTheme(media?.matches ? 'dark' : 'light');

  media?.addEventListener?.('change', event => {
    if (themeSetting !== 'auto' || storedTheme) return;
    applyTheme(event.matches ? 'dark' : 'light');
  });

  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem('resume-web-theme', next); } catch {}
  });

  document.getElementById('print-resume')?.addEventListener('click', () => window.print());

  const links = [...document.querySelectorAll('[data-nav]')];
  const sections = links.map(link => document.getElementById(link.dataset.nav)).filter(Boolean);
  if ('IntersectionObserver' in window) {
    const navObserver = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a,b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      links.forEach(link => link.classList.toggle('active', link.dataset.nav === visible.target.id));
    }, { rootMargin: '-28% 0px -62% 0px', threshold: [0,.2,.5,1] });
    sections.forEach(section => navObserver.observe(section));
  }

  document.querySelectorAll('.details-toggle').forEach(button => {
    button.addEventListener('click', () => {
      const details = button.closest('.role-card')?.querySelector('.role-details');
      if (!details) return;
      const open = details.classList.toggle('open');
      button.setAttribute('aria-expanded', String(open));
      button.textContent = open ? 'Hide details' : 'Details';
    });
  });

  const revealNodes = [...document.querySelectorAll('.reveal')];
  if (${settings.animationStyle !== "none" ? "true" : "false"} && 'IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: .08 });
    revealNodes.forEach(node => revealObserver.observe(node));
  } else revealNodes.forEach(node => node.classList.add('visible'));

  document.querySelectorAll('.company-logo').forEach(img=>{
    img.addEventListener('error',()=>{
      const fallback=img.getAttribute('data-fallback-logo');
      if(fallback && img.getAttribute('src')!==fallback){
        img.setAttribute('src',fallback);
        return;
      }
      img.style.display='none';
    });
  });

  const search = document.getElementById('resume-search');
  const searchables = [...document.querySelectorAll('.searchable')];
  const searchStatus = document.getElementById('search-status');
  search?.addEventListener('input', () => {
    const query = search.value.trim().toLowerCase();
    let visible = 0;
    searchables.forEach(node => {
      const haystack = (node.dataset.search || node.textContent || '').toLowerCase();
      const match = !query || haystack.includes(query);
      node.classList.toggle('search-hidden', !match);
      if (match) visible += 1;
    });
    if (searchStatus) {
      if (!query) {
        searchStatus.classList.remove('visible');
        searchStatus.textContent = '';
      } else {
        searchStatus.classList.add('visible');
        searchStatus.textContent = visible ? visible + ' matching item' + (visible === 1 ? '' : 's') : 'No matches';
      }
    }
  });

  const progress = document.getElementById('scroll-progress');
  const backTop = document.getElementById('back-to-top');
  function onScroll() {
    const doc = document.documentElement;
    const max = Math.max(1, doc.scrollHeight - window.innerHeight);
    const ratio = Math.min(1, Math.max(0, window.scrollY / max));
    if (progress) progress.style.width = (ratio * 100) + '%';
    backTop?.classList.toggle('visible', window.scrollY > 360);
  }
  window.addEventListener('scroll', onScroll, { passive:true });
  onScroll();

  backTop?.addEventListener('click', () => window.scrollTo({ top:0, behavior:${settings.animationStyle === "none" ? "'auto'" : "'smooth'"} }));
})();
</script>
</body>
</html>`;
}
