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
  mdash: "—",
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

/**
 * These are structural/content-presence checks, not a proprietary "ATS score".
 * Actual parsing/ranking differs between applicant-tracking systems.
 */
export function buildATSChecks(data: ResumeData): ATSCheck[] {
  const fullName = `${data.firstName ?? ""} ${data.lastName ?? ""}`.trim();
  const hasContact = Boolean(
    data.email?.trim() ||
    data.phone?.trim() ||
    data.website?.trim()
  );

  const workEntries = data.workEntries ?? [];
  const namedWorkEntries = workEntries.filter(entry =>
    Boolean(entry.title?.trim() || entry.company?.trim())
  );
  const workWithText = workEntries.filter(entry =>
    atsPlainTextFromHtml(entry.body).length > 0
  );

  const projects = getResumeProjects(data).filter(projectHasContent);
  const namedProjects = projects.filter(project => project.title.trim().length > 0);
  const describedProjects = projects.filter(project =>
    Boolean(project.description.trim() || project.techStack.trim())
  );

  return [
    {
      id: "identity",
      label: "Name is plain text",
      ok: fullName.length > 0,
      detail: fullName
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
      ok: workEntries.length === 0 || namedWorkEntries.length === workEntries.length,
      detail: workEntries.length === 0
        ? "No experience entries are present yet."
        : namedWorkEntries.length === workEntries.length
          ? "Every experience entry has a title and/or company."
          : "One or more experience entries are missing both title and company.",
    },
    {
      id: "descriptions",
      label: "Experience text is extractable",
      ok: workEntries.length === 0 || workWithText.length > 0,
      detail: workEntries.length === 0
        ? "No experience entries are present yet."
        : workWithText.length > 0
          ? "Rich descriptions are projected into plain paragraphs and bullets."
          : "Add at least one role description so the ATS twin carries experience detail.",
    },
    {
      id: "projects",
      label: "Projects use semantic text",
      ok: projects.length === 0 || namedProjects.length === projects.length,
      detail: projects.length === 0
        ? "No project entries are present yet."
        : namedProjects.length === projects.length
          ? "Every project has a plain-text title; project URLs remain extractable."
          : "Add a title to every project so ATS parsers can identify the entries.",
    },
    {
      id: "project-detail",
      label: "Project detail is extractable",
      ok: projects.length === 0 || describedProjects.length > 0,
      detail: projects.length === 0
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
