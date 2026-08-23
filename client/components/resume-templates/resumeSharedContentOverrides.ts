import type { ResumeData, ResumeDesign } from "./types";
import {
  getResumeProjects,
  withResumeProjects,
  type ResumeProjectEntry,
} from "./resumeProjects";

/**
 * Format-local snapshots for structured resume content.
 *
 * Shared Resume Data remains canonical. A snapshot exists only after the user
 * explicitly chooses “Edit only here” from a contextual toolbar. Presence of a
 * snapshot means that one logical content binding is local on that surface.
 */
export type SharedContentSurface = "pdf" | "responsive";

export type SharedContentBinding =
  | { kind: "name" }
  | { kind: "contact" }
  | { kind: "summary" }
  | { kind: "work"; id: string }
  | { kind: "project"; id: string }
  | { kind: "education"; id: string }
  | { kind: "skills" }
  | { kind: "links" };

type LocalEntry = {
  binding: SharedContentBinding;
  snapshot: unknown;
};

type LocalSurfaceStore = Record<string, LocalEntry>;

type LocalContentStore = Partial<Record<SharedContentSurface, LocalSurfaceStore>>;

type ResumeDesignWithLocalContent = ResumeDesign & {
  formatLocalContent?: LocalContentStore;
};

function cloneValue<T>(value: T): T {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(item => cloneValue(item)) as T;
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      result[key] = cloneValue(item);
    });
    return result as T;
  }
  return value;
}

export function sharedContentBindingKey(binding: SharedContentBinding): string {
  switch (binding.kind) {
    case "name":
    case "contact":
    case "summary":
    case "skills":
    case "links":
      return binding.kind;
    case "work":
      return `work:${binding.id}`;
    case "project":
      return `project:${binding.id}`;
    case "education":
      return `education:${binding.id}`;
  }
}

export function sharedContentBindingLabel(binding: SharedContentBinding): string {
  switch (binding.kind) {
    case "name": return "Name";
    case "contact": return "Contact";
    case "summary": return "Summary";
    case "work": return "Experience";
    case "project": return "Project";
    case "education": return "Education";
    case "skills": return "Skills";
    case "links": return "Links";
  }
}

function storeForDesign(design: ResumeDesign): LocalContentStore {
  return (design as ResumeDesignWithLocalContent).formatLocalContent ?? {};
}

function surfaceStore(design: ResumeDesign, surface: SharedContentSurface): LocalSurfaceStore {
  return storeForDesign(design)[surface] ?? {};
}

function withSurfaceStore(
  design: ResumeDesign,
  surface: SharedContentSurface,
  nextSurface: LocalSurfaceStore,
): ResumeDesign {
  const current = storeForDesign(design);
  const nextStore: LocalContentStore = { ...current };

  if (Object.keys(nextSurface).length) nextStore[surface] = nextSurface;
  else delete nextStore[surface];

  const nextDesign = { ...design } as ResumeDesignWithLocalContent;
  if (Object.keys(nextStore).length) nextDesign.formatLocalContent = nextStore;
  else delete nextDesign.formatLocalContent;
  return nextDesign;
}

export function isSharedContentBindingLocal(
  design: ResumeDesign,
  surface: SharedContentSurface,
  binding: SharedContentBinding,
): boolean {
  return Boolean(surfaceStore(design, surface)[sharedContentBindingKey(binding)]);
}

export function snapshotSharedContentBinding(
  data: ResumeData,
  binding: SharedContentBinding,
): unknown {
  switch (binding.kind) {
    case "name":
      return cloneValue({ firstName: data.firstName ?? "", lastName: data.lastName ?? "" });
    case "contact":
      return cloneValue({
        email: data.email ?? "",
        phone: data.phone ?? "",
        location: data.location ?? "",
        website: data.website ?? "",
      });
    case "summary":
      return data.summary ?? "";
    case "work":
      return cloneValue((data.workEntries ?? []).find(entry => entry.id === binding.id) ?? null);
    case "project":
      return cloneValue(getResumeProjects(data).find(entry => entry.id === binding.id) ?? null);
    case "education":
      return cloneValue((data.education ?? []).find(entry => entry.id === binding.id) ?? null);
    case "skills":
      return cloneValue(data.skills ?? []);
    case "links":
      return cloneValue(data.extraLinks ?? []);
  }
}

function applySnapshot(
  data: ResumeData,
  binding: SharedContentBinding,
  snapshot: unknown,
): ResumeData {
  switch (binding.kind) {
    case "name": {
      const value = (snapshot ?? {}) as { firstName?: string; lastName?: string };
      return {
        ...data,
        firstName: value.firstName ?? "",
        lastName: value.lastName ?? "",
      };
    }
    case "contact": {
      const value = (snapshot ?? {}) as {
        email?: string;
        phone?: string;
        location?: string;
        website?: string;
      };
      return {
        ...data,
        email: value.email ?? "",
        phone: value.phone ?? "",
        location: value.location ?? "",
        website: value.website ?? "",
      };
    }
    case "summary":
      return { ...data, summary: typeof snapshot === "string" ? snapshot : "" };
    case "work": {
      const value = snapshot as ResumeData["workEntries"][number] | null;
      const existing = data.workEntries ?? [];
      if (!value) {
        return { ...data, workEntries: existing.filter(entry => entry.id !== binding.id) };
      }
      const found = existing.some(entry => entry.id === binding.id);
      return {
        ...data,
        workEntries: found
          ? existing.map(entry => entry.id === binding.id ? cloneValue(value) : entry)
          : [...existing, cloneValue(value)],
      };
    }
    case "project": {
      const value = snapshot as ResumeProjectEntry | null;
      const existing = getResumeProjects(data);
      if (!value) {
        return withResumeProjects(data, existing.filter(entry => entry.id !== binding.id));
      }
      const found = existing.some(entry => entry.id === binding.id);
      return withResumeProjects(
        data,
        found
          ? existing.map(entry => entry.id === binding.id ? cloneValue(value) : entry)
          : [...existing, cloneValue(value)],
      );
    }
    case "education": {
      const value = snapshot as ResumeData["education"][number] | null;
      const existing = data.education ?? [];
      if (!value) {
        return { ...data, education: existing.filter(entry => entry.id !== binding.id) };
      }
      const found = existing.some(entry => entry.id === binding.id);
      return {
        ...data,
        education: found
          ? existing.map(entry => entry.id === binding.id ? cloneValue(value) : entry)
          : [...existing, cloneValue(value)],
      };
    }
    case "skills":
      return { ...data, skills: cloneValue(Array.isArray(snapshot) ? snapshot as string[] : []) };
    case "links":
      return { ...data, extraLinks: cloneValue(Array.isArray(snapshot) ? snapshot as ResumeData["extraLinks"] : []) };
  }
}

export function effectiveResumeDataForSurface(
  sharedData: ResumeData,
  surface: SharedContentSurface,
): ResumeData {
  let effective = sharedData;
  const entries = Object.values(surfaceStore(sharedData.design, surface));
  for (const entry of entries) {
    effective = applySnapshot(effective, entry.binding, entry.snapshot);
  }
  return effective;
}

/**
 * Existing editors already emit a complete ResumeData value. When one or more
 * bindings are local on this surface, preserve their shared/canonical values
 * while refreshing only their local snapshots from the edited effective data.
 */
export function mergeSurfaceResumeDataChange(
  sharedData: ResumeData,
  nextEffectiveData: ResumeData,
  surface: SharedContentSurface,
): ResumeData {
  const existingSurface = surfaceStore(sharedData.design, surface);
  if (!Object.keys(existingSurface).length) return nextEffectiveData;

  let sharedNext = nextEffectiveData;
  const refreshed: LocalSurfaceStore = { ...existingSurface };

  Object.entries(existingSurface).forEach(([key, entry]) => {
    refreshed[key] = {
      binding: entry.binding,
      snapshot: snapshotSharedContentBinding(nextEffectiveData, entry.binding),
    };
    sharedNext = applySnapshot(
      sharedNext,
      entry.binding,
      snapshotSharedContentBinding(sharedData, entry.binding),
    );
  });

  return {
    ...sharedNext,
    design: withSurfaceStore(nextEffectiveData.design, surface, refreshed),
  };
}

export function unlinkSharedContentBinding(
  sharedData: ResumeData,
  surface: SharedContentSurface,
  binding: SharedContentBinding,
): ResumeData {
  const current = surfaceStore(sharedData.design, surface);
  const key = sharedContentBindingKey(binding);
  if (current[key]) return sharedData;

  return {
    ...sharedData,
    design: withSurfaceStore(sharedData.design, surface, {
      ...current,
      [key]: {
        binding,
        snapshot: snapshotSharedContentBinding(sharedData, binding),
      },
    }),
  };
}

/** Shared → Here: discard the local snapshot and resume using canonical data. */
export function relinkSharedContentUsingShared(
  sharedData: ResumeData,
  surface: SharedContentSurface,
  binding: SharedContentBinding,
): ResumeData {
  const current = { ...surfaceStore(sharedData.design, surface) };
  delete current[sharedContentBindingKey(binding)];
  return {
    ...sharedData,
    design: withSurfaceStore(sharedData.design, surface, current),
  };
}

/** Here → Shared: promote the local snapshot to canonical data, then relink. */
export function relinkSharedContentUsingLocal(
  sharedData: ResumeData,
  surface: SharedContentSurface,
  binding: SharedContentBinding,
): ResumeData {
  const current = { ...surfaceStore(sharedData.design, surface) };
  const key = sharedContentBindingKey(binding);
  const local = current[key];
  if (!local) return sharedData;

  let next = applySnapshot(sharedData, binding, local.snapshot);
  delete current[key];
  next = {
    ...next,
    design: withSurfaceStore(sharedData.design, surface, current),
  };
  return next;
}
