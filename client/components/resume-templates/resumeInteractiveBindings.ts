import type { ResumeData } from "./types";
import { getResumeProjects, withResumeProjects } from "./resumeProjects";
import type {
  InteractiveResumeContentBinding,
  InteractiveResumeContentObject,
  InteractiveResumeContentSource,
} from "./resumeInteractive";

export interface InteractiveBindingOption {
  id: string;
  group:
    | "Personal"
    | "Experience"
    | "Projects"
    | "Education"
    | "Skills"
    | "Links";
  label: string;
  detail?: string;
  binding: InteractiveResumeContentBinding;
}

export interface ResolvedInteractiveBinding {
  found: boolean;
  source: InteractiveResumeContentSource;
  label: string;
  primary: string;
  secondary?: string;
  body?: string;
  imageUrl?: string;
  href?: string;
  empty?: boolean;
}

function asText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return String(value);
  } catch {
    return "";
  }
}

function stripHtml(value: unknown): string {
  const html = asText(value);
  if (!html) return "";

  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function monthYear(value: unknown): string {
  const raw = asText(value).trim();
  if (!raw) return "";
  const match = raw.match(/^(\d{4})-(\d{1,2})$/);
  if (!match) return raw;

  const month = Number(match[2]);
  const names = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${names[Math.max(0, Math.min(11, month - 1))]} ${match[1]}`;
}

function workDates(entry: Record<string, unknown>): string {
  const start = monthYear(entry.startDate);
  const end = entry.current ? "Present" : monthYear(entry.endDate);
  return [start, end].filter(Boolean).join(" – ");
}

function educationYears(entry: Record<string, unknown>): string {
  const start = asText(entry.startYear).trim();
  const end = entry.current ? "Present" : asText(entry.endYear).trim();
  return [start, end].filter(Boolean).join(" – ");
}

function workEntries(data: ResumeData): Array<Record<string, unknown>> {
  const entries: unknown[] = Array.isArray(data.workEntries)
    ? (data.workEntries as unknown[])
    : [];

  return entries
    .filter(entry => !!entry && typeof entry === "object")
    .map(entry => entry as Record<string, unknown>);
}

function educationEntries(data: ResumeData): Array<Record<string, unknown>> {
  const entries: unknown[] = Array.isArray(data.education)
    ? (data.education as unknown[])
    : [];

  return entries
    .filter(entry => !!entry && typeof entry === "object")
    .map(entry => entry as Record<string, unknown>);
}

function binding(
  source: InteractiveResumeContentSource,
  field: string,
  entryId?: string,
): InteractiveResumeContentBinding {
  return {
    source,
    field,
    entryId,
  };
}

function option(
  group: InteractiveBindingOption["group"],
  label: string,
  detail: string | undefined,
  bind: InteractiveResumeContentBinding,
): InteractiveBindingOption {
  return {
    id: `${bind.source}:${bind.entryId ?? ""}:${bind.field ?? ""}`,
    group,
    label,
    detail,
    binding: bind,
  };
}

export function getInteractiveBindingOptions(
  data: ResumeData,
): InteractiveBindingOption[] {
  const options: InteractiveBindingOption[] = [];

  const fullName = `${asText(data.firstName)} ${asText(data.lastName)}`.trim();

  [
    ["Full name", fullName, "fullName"],
    ["First name", asText(data.firstName), "firstName"],
    ["Last name", asText(data.lastName), "lastName"],
    ["Email", asText(data.email), "email"],
    ["Phone", asText(data.phone), "phone"],
    ["Location", asText(data.location), "location"],
    ["Website", asText(data.website), "website"],
    ["Bio / summary", asText(data.summary), "summary"],
  ].forEach(([label, detail, field]) => {
    options.push(
      option(
        "Personal",
        label,
        detail || undefined,
        binding("personal", field),
      ),
    );
  });

  workEntries(data).forEach((entry, index) => {
    const id = asText(entry.id).trim() || `work-${index}`;
    const company = asText(entry.company).trim();
    const title = asText(entry.title).trim();
    const descriptor = [title, company].filter(Boolean).join(" · ");

    options.push(
      option(
        "Experience",
        descriptor || `Role ${index + 1}`,
        "Entire role",
        binding("work", "entry", id),
      ),
    );

    [
      ["Role title", title, "title"],
      ["Company", company, "company"],
      ["Dates", workDates(entry), "dates"],
      ["Description", stripHtml(entry.body ?? entry.description), "body"],
      ["Company logo", asText(entry.logoUrl), "logoUrl"],
    ].forEach(([label, detail, field]) => {
      options.push(
        option(
          "Experience",
          `${descriptor || `Role ${index + 1}`} — ${label}`,
          detail || undefined,
          binding("work", field, id),
        ),
      );
    });
  });

  getResumeProjects(data).forEach((project, index) => {
    const id = project.id || `project-${index}`;
    const descriptor = project.title || `Project ${index + 1}`;

    options.push(
      option(
        "Projects",
        descriptor,
        "Entire project",
        binding("project", "entry", id),
      ),
    );

    [
      ["Title", project.title, "title"],
      ["Description", project.description, "description"],
      ["Tech stack", project.techStack, "techStack"],
      ["GitHub URL", project.githubUrl, "githubUrl"],
      ["Live URL", project.liveUrl, "liveUrl"],
      ["Project image", project.imageUrl, "imageUrl"],
    ].forEach(([label, detail, field]) => {
      options.push(
        option(
          "Projects",
          `${descriptor} — ${label}`,
          detail || undefined,
          binding("project", field, id),
        ),
      );
    });
  });

  educationEntries(data).forEach((entry, index) => {
    const id = asText(entry.id).trim() || `education-${index}`;
    const school = asText(entry.school).trim();
    const degree = asText(entry.degree).trim();
    const fieldValue = asText(entry.field).trim();
    const descriptor =
      [degree, fieldValue].filter(Boolean).join(" · ") ||
      school ||
      `Education ${index + 1}`;

    options.push(
      option(
        "Education",
        descriptor,
        school || "Entire education entry",
        binding("education", "entry", id),
      ),
    );

    [
      ["School", school, "school"],
      ["Degree", degree, "degree"],
      ["Field", fieldValue, "field"],
      ["Years", educationYears(entry), "years"],
    ].forEach(([label, detail, field]) => {
      options.push(
        option(
          "Education",
          `${descriptor} — ${label}`,
          detail || undefined,
          binding("education", field, id),
        ),
      );
    });
  });

  (Array.isArray(data.skills) ? data.skills : []).forEach((skill, index) => {
    const value = asText(skill);
    options.push(
      option(
        "Skills",
        value || `Skill ${index + 1}`,
        "Shared skill",
        binding("skill", "value", String(index)),
      ),
    );
  });

  (Array.isArray(data.extraLinks) ? data.extraLinks : []).forEach(
    (link, index) => {
      const record =
        link && typeof link === "object"
          ? (link as Record<string, unknown>)
          : {};
      const label = asText(record.label).trim() || `Link ${index + 1}`;
      const url = asText(record.url).trim();

      options.push(
        option(
          "Links",
          label,
          url || "Shared link",
          binding("link", "entry", String(index)),
        ),
      );
    },
  );

  return options;
}

function missing(
  bindingValue: InteractiveResumeContentBinding,
): ResolvedInteractiveBinding {
  return {
    found: false,
    source: bindingValue.source,
    label: "Missing shared content",
    primary: "Content no longer exists",
    secondary: "Choose another resume binding.",
    empty: true,
  };
}


export type InteractiveBindingDraft = Record<string, string>;

/** Apply a resume-content editor draft to a cloned ResumeData value. */
export function applyInteractiveBindingDraft(
  data: ResumeData,
  binding: InteractiveResumeContentBinding | undefined,
  draft: InteractiveBindingDraft,
): ResumeData {
  if (!binding) return data;

  if (binding.source === "personal") {
    const next = { ...data } as ResumeData & Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(draft, "fullName")) {
      const parts = (draft.fullName ?? "").trim().split(/\s+/).filter(Boolean);
      next.firstName = parts.shift() ?? "";
      next.lastName = parts.join(" ");
    }
    ["firstName", "lastName", "email", "phone", "location", "website", "summary"].forEach(key => {
      if (Object.prototype.hasOwnProperty.call(draft, key)) next[key] = draft[key];
    });
    return next as ResumeData;
  }

  if (binding.source === "work") {
    const source = data as ResumeData & { workEntries?: unknown[] };
    const workEntries = Array.isArray(source.workEntries)
      ? source.workEntries.map((raw, index) => {
          if (!raw || typeof raw !== "object") return raw;
          const entry = raw as Record<string, unknown>;
          const id = asText(entry.id).trim() || `work-${index}`;
          if (id !== asText(binding.entryId)) return raw;
          return { ...entry, ...draft };
        })
      : source.workEntries;
    return { ...data, workEntries } as ResumeData;
  }

  if (binding.source === "project") {
    const projects = getResumeProjects(data).map(project =>
      project.id === binding.entryId ? { ...project, ...draft } : project,
    );
    return withResumeProjects(data, projects);
  }

  if (binding.source === "education") {
    const source = data as ResumeData & { education?: unknown[] };
    const education = Array.isArray(source.education)
      ? source.education.map((raw, index) => {
          if (!raw || typeof raw !== "object") return raw;
          const entry = raw as Record<string, unknown>;
          const id = asText(entry.id).trim() || `education-${index}`;
          if (id !== asText(binding.entryId)) return raw;
          return { ...entry, ...draft };
        })
      : source.education;
    return { ...data, education } as ResumeData;
  }

  if (binding.source === "skill") {
    const index = Number(binding.entryId);
    if (!Number.isInteger(index)) return data;
    const skills = Array.isArray(data.skills) ? [...data.skills] : [];
    if (index < 0 || index >= skills.length) return data;
    skills[index] = draft.value ?? asText(skills[index]);
    return { ...data, skills } as ResumeData;
  }

  if (binding.source === "link") {
    const index = Number(binding.entryId);
    if (!Number.isInteger(index)) return data;
    const links = Array.isArray(data.extraLinks) ? [...data.extraLinks] : [];
    if (index < 0 || index >= links.length) return data;
    const current = links[index] && typeof links[index] === "object"
      ? (links[index] as Record<string, unknown>)
      : {};
    links[index] = { ...current, ...draft } as typeof links[number];
    return { ...data, extraLinks: links } as ResumeData;
  }

  return data;
}

/** Resolve a resume-content object using its local snapshot when unlinked. */
export function resolveInteractiveObjectBinding(
  data: ResumeData,
  object: InteractiveResumeContentObject,
): ResolvedInteractiveBinding | null {
  const effectiveData =
    object.sharedContentUnlinked && object.localContent
      ? applyInteractiveBindingDraft(data, object.binding, object.localContent)
      : data;
  return resolveInteractiveBinding(effectiveData, object.binding);
}

export function resolveInteractiveBinding(
  data: ResumeData,
  bindingValue: InteractiveResumeContentBinding | undefined,
): ResolvedInteractiveBinding | null {
  if (!bindingValue) return null;

  const field = bindingValue.field ?? "entry";

  if (bindingValue.source === "personal") {
    const fullName = `${asText(data.firstName)} ${asText(data.lastName)}`.trim();
    const map: Record<string, string> = {
      fullName,
      firstName: asText(data.firstName),
      lastName: asText(data.lastName),
      email: asText(data.email),
      phone: asText(data.phone),
      location: asText(data.location),
      website: asText(data.website),
      summary: asText(data.summary),
    };
    const labels: Record<string, string> = {
      fullName: "Name",
      firstName: "First name",
      lastName: "Last name",
      email: "Email",
      phone: "Phone",
      location: "Location",
      website: "Website",
      summary: "Bio",
    };
    const value = map[field] ?? "";

    return {
      found: true,
      source: "personal",
      label: labels[field] ?? "Personal",
      primary: value,
      href:
        field === "website" && value
          ? value
          : field === "email" && value
            ? `mailto:${value}`
            : undefined,
      empty: !value.trim(),
    };
  }

  if (bindingValue.source === "work") {
    const entry = workEntries(data).find(
      item => asText(item.id) === asText(bindingValue.entryId),
    );
    if (!entry) return missing(bindingValue);

    const company = asText(entry.company).trim();
    const title = asText(entry.title).trim();
    const dates = workDates(entry);
    const body = stripHtml(entry.body ?? entry.description);
    const logoUrl = asText(entry.logoUrl).trim();

    if (field === "entry") {
      return {
        found: true,
        source: "work",
        label: "Experience",
        primary: title || company || "Role",
        secondary: [company, dates].filter(Boolean).join(" · "),
        body,
        imageUrl: logoUrl || undefined,
        empty: !(title || company || dates || body || logoUrl),
      };
    }

    const values: Record<string, string> = {
      title,
      company,
      dates,
      body,
      logoUrl,
    };
    const value = values[field] ?? "";

    return {
      found: true,
      source: "work",
      label:
        field === "logoUrl"
          ? "Company logo"
          : field === "body"
            ? "Role description"
            : field === "dates"
              ? "Role dates"
              : field === "company"
                ? "Company"
                : "Role title",
      primary: field === "logoUrl" ? company || "Company logo" : value,
      body: field === "body" ? value : undefined,
      imageUrl: field === "logoUrl" ? value || undefined : undefined,
      empty: !value.trim(),
    };
  }

  if (bindingValue.source === "project") {
    const project = getResumeProjects(data).find(
      item => item.id === bindingValue.entryId,
    );
    if (!project) return missing(bindingValue);

    if (field === "entry") {
      return {
        found: true,
        source: "project",
        label: "Project",
        primary: project.title || "Project",
        secondary: project.techStack || undefined,
        body: project.description || undefined,
        imageUrl: project.imageUrl || undefined,
        href: project.liveUrl || project.githubUrl || undefined,
        empty: !(
          project.title ||
          project.description ||
          project.techStack ||
          project.githubUrl ||
          project.liveUrl ||
          project.imageUrl
        ),
      };
    }

    const values: Record<string, string> = {
      title: project.title,
      description: project.description,
      techStack: project.techStack,
      githubUrl: project.githubUrl,
      liveUrl: project.liveUrl,
      imageUrl: project.imageUrl,
    };
    const value = values[field] ?? "";

    return {
      found: true,
      source: "project",
      label:
        field === "imageUrl"
          ? "Project image"
          : field === "description"
            ? "Project description"
            : field === "techStack"
              ? "Tech stack"
              : field === "githubUrl"
                ? "GitHub"
                : field === "liveUrl"
                  ? "Live project"
                  : "Project title",
      primary:
        field === "imageUrl"
          ? project.title || "Project image"
          : value,
      body: field === "description" ? value : undefined,
      imageUrl: field === "imageUrl" ? value || undefined : undefined,
      href:
        field === "githubUrl" || field === "liveUrl"
          ? value || undefined
          : undefined,
      empty: !value.trim(),
    };
  }

  if (bindingValue.source === "education") {
    const entry = educationEntries(data).find(
      item => asText(item.id) === asText(bindingValue.entryId),
    );
    if (!entry) return missing(bindingValue);

    const school = asText(entry.school).trim();
    const degree = asText(entry.degree).trim();
    const fieldValue = asText(entry.field).trim();
    const years = educationYears(entry);

    if (field === "entry") {
      return {
        found: true,
        source: "education",
        label: "Education",
        primary: [degree, fieldValue].filter(Boolean).join(" · ") || school,
        secondary: [school, years].filter(Boolean).join(" · "),
        empty: !(school || degree || fieldValue || years),
      };
    }

    const values: Record<string, string> = {
      school,
      degree,
      field: fieldValue,
      years,
    };
    const value = values[field] ?? "";

    return {
      found: true,
      source: "education",
      label:
        field === "school"
          ? "School"
          : field === "degree"
            ? "Degree"
            : field === "field"
              ? "Field"
              : "Years",
      primary: value,
      empty: !value.trim(),
    };
  }

  if (bindingValue.source === "skill") {
    const index = Number(bindingValue.entryId);
    const skills = Array.isArray(data.skills) ? data.skills : [];
    if (!Number.isInteger(index) || index < 0 || index >= skills.length) {
      return missing(bindingValue);
    }
    const value = asText(skills[index]);

    return {
      found: true,
      source: "skill",
      label: "Skill",
      primary: value,
      empty: !value.trim(),
    };
  }

  if (bindingValue.source === "link") {
    const index = Number(bindingValue.entryId);
    const links = Array.isArray(data.extraLinks) ? data.extraLinks : [];
    if (!Number.isInteger(index) || index < 0 || index >= links.length) {
      return missing(bindingValue);
    }

    const raw = links[index];
    const record =
      raw && typeof raw === "object"
        ? (raw as Record<string, unknown>)
        : {};
    const label = asText(record.label).trim();
    const url = asText(record.url).trim();

    return {
      found: true,
      source: "link",
      label: "Link",
      primary: label || url,
      secondary: label && url ? url : undefined,
      href: url || undefined,
      empty: !(label || url),
    };
  }

  return missing(bindingValue);
}

export function interactiveBindingDisplayName(
  data: ResumeData,
  bindingValue: InteractiveResumeContentBinding | undefined,
): string {
  const resolved = resolveInteractiveBinding(data, bindingValue);
  if (!resolved) return "Unbound resume content";
  if (!resolved.found) return resolved.label;
  return resolved.primary || resolved.label;
}
