import type { ResumeData, ResumeDesign } from "./types";

/**
 * First-class resume project content.
 *
 * The record is shared by Designed PDF, ATS and Web. Each presentation decides
 * how to render it: PDF/ATS stay semantic and text-forward, while Web may use
 * the image and richer card interactions.
 */
export interface ResumeProjectEntry {
  id: string;
  title: string;
  description: string;
  techStack: string;
  githubUrl: string;
  liveUrl: string;
  /** Optional richer Web presentation asset. Ignored by ATS and text-first PDF. */
  imageUrl: string;
}

type ResumeDataWithProjects = ResumeData & {
  projects?: ResumeProjectEntry[];
};

type LegacyWebProject = Partial<ResumeProjectEntry>;

type ResumeDesignWithLegacyPortfolio = ResumeDesign & {
  webResume?: Record<string, unknown> & {
    projects?: LegacyWebProject[];
    githubProfile?: string;
  };
};

function projectString(value: unknown): string {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}

export function normalizeResumeProject(
  project: LegacyWebProject | null | undefined,
  index = 0,
): ResumeProjectEntry {
  const source = project ?? {};

  return {
    id: projectString(source.id).trim() || `project-${index}`,
    title: projectString(source.title),
    description: projectString(source.description),
    techStack: projectString(source.techStack),
    githubUrl: projectString(source.githubUrl),
    liveUrl: projectString(source.liveUrl),
    imageUrl: projectString(source.imageUrl),
  };
}

export function getResumeProjects(data: ResumeData): ResumeProjectEntry[] {
  const raw = (data as ResumeDataWithProjects).projects;
  if (!Array.isArray(raw)) return [];

  return raw
    .filter(project => project != null && typeof project === "object")
    .map((project, index) => normalizeResumeProject(project, index));
}

export function withResumeProjects(
  data: ResumeData,
  projects: ResumeProjectEntry[],
): ResumeData {
  return {
    ...(data as ResumeDataWithProjects),
    projects: projects.map((project, index) =>
      normalizeResumeProject(project, index)
    ),
  } as ResumeData;
}

export function splitTechStack(value: unknown): string[] {
  return projectString(value)
    .split(/[,;|\n]+/)
    .map(item => item.trim())
    .filter(Boolean);
}

export function projectHasContent(
  project: Partial<ResumeProjectEntry> | null | undefined,
): boolean {
  if (!project) return false;

  return Boolean(
    projectString(project.title).trim() ||
    projectString(project.description).trim() ||
    projectString(project.techStack).trim() ||
    projectString(project.githubUrl).trim() ||
    projectString(project.liveUrl).trim() ||
    projectString(project.imageUrl).trim()
  );
}

function isGithubLink(label: string | undefined, url: string | undefined): boolean {
  return /github/i.test(label ?? "") || /github\.com/i.test(url ?? "");
}

/**
 * Phase 16 migration.
 *
 * Projects used to live under design.webResume.projects and the Web panel had a
 * second GitHub profile field. Promote projects into shared ResumeData and move
 * the legacy GitHub URL into the already-shared links collection. The legacy
 * fields are then removed from design state so they cannot silently diverge.
 */
export function migrateLegacyWebPortfolioData(data: ResumeData): ResumeData {
  const rawData = data as ResumeDataWithProjects;
  const rawDesign = (data.design ?? {}) as ResumeDesignWithLegacyPortfolio;
  const legacyWeb = rawDesign.webResume ?? {};

  const sharedProjects = getResumeProjects(data);
  const legacyProjects = Array.isArray(legacyWeb.projects)
    ? legacyWeb.projects.map((project, index) =>
        normalizeResumeProject(project, index)
      )
    : [];

  // Prefer first-class shared content once it exists. During the one-time
  // migration, an empty shared array must not mask old Web-only projects.
  const projects = sharedProjects.length > 0
    ? sharedProjects
    : legacyProjects;

  const extraLinks = [...(data.extraLinks ?? [])];
  const legacyGithub = typeof legacyWeb.githubProfile === "string"
    ? legacyWeb.githubProfile.trim()
    : "";

  if (
    legacyGithub &&
    !extraLinks.some(link => isGithubLink(link?.label, link?.url))
  ) {
    extraLinks.push({ label: "GitHub", url: legacyGithub });
  }

  const nextWebResume = { ...legacyWeb };
  delete nextWebResume.projects;
  delete nextWebResume.githubProfile;

  const nextDesign = {
    ...rawDesign,
    webResume: nextWebResume,
  } as ResumeDesign;

  return {
    ...(rawData as ResumeData),
    projects,
    extraLinks,
    design: nextDesign,
  } as ResumeData;
}