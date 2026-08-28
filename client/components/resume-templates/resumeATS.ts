import type { ResumeData } from "./types";
import { getResumeProjects, projectHasContent } from "./resumeProjects";

export type ATSBodyBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "bullet"; text: string };

export interface ATSCheck {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface ATSProjectedLink {
  label: string;
  url: string;
}

export interface ATSResumeProjection {
  fullName: string;
  contact: string[];
  summary: string;
  work: ResumeData["workEntries"];
  projects: ReturnType<typeof getResumeProjects>;
  education: ResumeData["education"];
  skills: string[];
  links: ATSProjectedLink[];
  hasContent: boolean;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  bull: "•",
  middot: "·",
  ndash: "–",
  mdash: "-",
};

export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, raw) => {
      const code = Number(raw);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, raw) => {
      const code = Number.parseInt(raw, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&([a-z]+);/gi, (whole, name) => NAMED_ENTITIES[name.toLowerCase()] ?? whole);
}

export function normalizeATSText(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Converts the editor's rich HTML into plain semantic ATS blocks.
 * Formatting is intentionally discarded; textual order and list semantics remain.
 */
export function atsBlocksFromHtml(html: string | null | undefined): ATSBodyBlock[] {
  if (!html?.trim()) return [];

  const blocks: ATSBodyBlock[] = [];
  const blockRegex = /<(p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(html)) !== null) {
    const text = normalizeATSText(match[2]);
    if (!text) continue;
    blocks.push({
      kind: match[1].toLowerCase() === "li" ? "bullet" : "paragraph",
      text,
    });
  }

  if (blocks.length > 0) return blocks;

  const fallback = normalizeATSText(html);
  return fallback ? [{ kind: "paragraph", text: fallback }] : [];
}

export function atsPlainTextFromHtml(html: string | null | undefined): string {
  return atsBlocksFromHtml(html).map(block => block.text).join("\n");
}

function clean(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const trimmed = clean(value);
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }

  return result;
}

function workEntryHasContent(entry: ResumeData["workEntries"][number]): boolean {
  return Boolean(
    clean(entry.title) ||
    clean(entry.company) ||
    clean(entry.startDate) ||
    clean(entry.endDate) ||
    atsPlainTextFromHtml(entry.body)
  );
}

function educationEntryHasContent(entry: ResumeData["education"][number]): boolean {
  return Boolean(
    clean(entry.school) ||
    clean(entry.degree) ||
    clean(entry.field) ||
    clean(entry.startYear) ||
    clean(entry.endYear)
  );
}

/**
 * One semantic projection powers both the on-screen ATS twin and exported ATS PDF.
 * Empty placeholder rows are excluded so preview/export never invent resume content.
 */
export function projectResumeToATS(data: ResumeData): ATSResumeProjection {
  const fullName = `${data.firstName ?? ""} ${data.lastName ?? ""}`.trim();
  const contact = uniqueNonEmpty([
    data.email,
    data.phone,
    data.location,
    data.website,
  ]);
  const summary = clean(data.summary);

  const work = (data.workEntries ?? []).filter(workEntryHasContent);
  const projects = getResumeProjects(data).filter(projectHasContent);
  const education = (data.education ?? []).filter(educationEntryHasContent);
  const skills = uniqueNonEmpty(data.skills ?? []);
  const links = (data.extraLinks ?? [])
    .map(link => ({
      label: clean(link?.label),
      url: clean(link?.url),
    }))
    .filter(link => Boolean(link.label || link.url));

  const hasContent = Boolean(
    fullName ||
    contact.length ||
    summary ||
    work.length ||
    projects.length ||
    education.length ||
    skills.length ||
    links.length
  );

  return {
    fullName,
    contact,
    summary,
    work,
    projects,
    education,
    skills,
    links,
    hasContent,
  };
}

/**
 * These are structural/content-presence checks, not a proprietary "ATS score".
 * Actual parsing/ranking differs between applicant-tracking systems.
 */
export function buildATSChecks(data: ResumeData): ATSCheck[] {
  const projection = projectResumeToATS(data);
  const hasContact = Boolean(
    data.email?.trim() ||
    data.phone?.trim() ||
    data.website?.trim()
  );

  const namedWorkEntries = projection.work.filter(entry =>
    Boolean(entry.title?.trim() || entry.company?.trim())
  );
  const workWithText = projection.work.filter(entry =>
    atsPlainTextFromHtml(entry.body).length > 0
  );

  const namedProjects = projection.projects.filter(project => project.title.trim().length > 0);
  const describedProjects = projection.projects.filter(project =>
    Boolean(project.description.trim() || project.techStack.trim())
  );

  return [
    {
      id: "identity",
      label: "Name is plain text",
      ok: projection.fullName.length > 0,
      detail: projection.fullName
        ? "Your name is exposed as normal selectable text."
        : "Add your first or last name.",
    },
    {
      id: "contact",
      label: "Contact method included",
      ok: hasContact,
      detail: hasContact
        ? "At least one email, phone number, or website is present."
        : "Add an email, phone number, or website.",
    },
    {
      id: "experience",
      label: "Experience uses standard fields",
      ok: projection.work.length === 0 || namedWorkEntries.length === projection.work.length,
      detail: projection.work.length === 0
        ? "No experience entries are present yet."
        : namedWorkEntries.length === projection.work.length
          ? "Every experience entry has a title and/or company."
          : "One or more experience entries are missing both title and company.",
    },
    {
      id: "descriptions",
      label: "Experience text is extractable",
      ok: projection.work.length === 0 || workWithText.length > 0,
      detail: projection.work.length === 0
        ? "No experience entries are present yet."
        : workWithText.length > 0
          ? "Rich descriptions are projected into plain paragraphs and bullets."
          : "Add at least one role description so the ATS twin carries experience detail.",
    },
    {
      id: "projects",
      label: "Projects use semantic text",
      ok: projection.projects.length === 0 || namedProjects.length === projection.projects.length,
      detail: projection.projects.length === 0
        ? "No project entries are present yet."
        : namedProjects.length === projection.projects.length
          ? "Every project has a plain-text title; project URLs remain extractable."
          : "Add a title to every project so ATS parsers can identify the entries.",
    },
    {
      id: "project-detail",
      label: "Project detail is extractable",
      ok: projection.projects.length === 0 || describedProjects.length > 0,
      detail: projection.projects.length === 0
        ? "No project entries are present yet."
        : describedProjects.length > 0
          ? "Project descriptions and technology stacks are projected as plain text."
          : "Add a description or technology stack to at least one project.",
    },
    {
      id: "visuals",
      label: "No visual dependency",
      ok: true,
      detail: "The ATS twin excludes photos, logos, icons, shapes, sidebars, columns, and absolute positioning.",
    },
  ];
}
