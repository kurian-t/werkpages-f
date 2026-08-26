import { describe, it, expect } from "vitest";
import {
  sharedContentBindingKey,
  sharedContentBindingLabel,
  isSharedContentBindingLocal,
  snapshotSharedContentBinding,
  effectiveResumeDataForSurface,
  mergeSurfaceResumeDataChange,
  unlinkSharedContentBinding,
  relinkSharedContentUsingShared,
  relinkSharedContentUsingLocal,
} from "./resumeSharedContentOverrides";

const SURFACE = "pdf" as any;

function baseData(overrides: any = {}): any {
  return {
    firstName: "Ann", lastName: "Lee",
    email: "a@b.com", phone: "555", location: "NYC", website: "a.dev",
    summary: "Shared summary",
    skills: ["JS", "TS"],
    extraLinks: [{ label: "L", url: "u" }],
    workEntries: [{ id: "w1", title: "Dev", company: "Acme" }],
    education: [{ id: "e1", school: "MIT" }],
    projects: [{ id: "p1", title: "Proj" }],
    design: {},
    ...overrides,
  };
}

describe("sharedContentBindingKey", () => {
  it("returns the kind for singleton bindings", () => {
    for (const kind of ["name", "contact", "summary", "skills", "links"] as const) {
      expect(sharedContentBindingKey({ kind } as any)).toBe(kind);
    }
  });
  it("namespaces id-bearing bindings", () => {
    expect(sharedContentBindingKey({ kind: "work", id: "w1" } as any)).toBe("work:w1");
    expect(sharedContentBindingKey({ kind: "project", id: "p2" } as any)).toBe("project:p2");
    expect(sharedContentBindingKey({ kind: "education", id: "e3" } as any)).toBe("education:e3");
  });
});

describe("sharedContentBindingLabel", () => {
  it("maps each kind to a human label", () => {
    const cases: Record<string, string> = {
      name: "Name", contact: "Contact", summary: "Summary", work: "Experience",
      project: "Project", education: "Education", skills: "Skills", links: "Links",
    };
    for (const [kind, label] of Object.entries(cases)) {
      expect(sharedContentBindingLabel({ kind } as any)).toBe(label);
    }
  });
});

describe("isSharedContentBindingLocal", () => {
  it("false when no local override exists", () => {
    expect(isSharedContentBindingLocal({} as any, SURFACE, { kind: "summary" } as any)).toBe(false);
    expect(isSharedContentBindingLocal({ formatLocalContent: {} } as any, SURFACE, { kind: "summary" } as any)).toBe(false);
  });
  it("true only for the exact surface + binding key", () => {
    const design = { formatLocalContent: { pdf: { "work:w1": { title: "Local" } } } } as any;
    expect(isSharedContentBindingLocal(design, SURFACE, { kind: "work", id: "w1" } as any)).toBe(true);
    expect(isSharedContentBindingLocal(design, "web" as any, { kind: "work", id: "w1" } as any)).toBe(false);
    expect(isSharedContentBindingLocal(design, SURFACE, { kind: "work", id: "w2" } as any)).toBe(false);
  });
});

describe("snapshotSharedContentBinding", () => {
  const data = baseData();
  it("snapshots each singleton binding", () => {
    expect(snapshotSharedContentBinding(data, { kind: "name" } as any)).toEqual({ firstName: "Ann", lastName: "Lee" });
    expect(snapshotSharedContentBinding(data, { kind: "contact" } as any)).toEqual({ email: "a@b.com", phone: "555", location: "NYC", website: "a.dev" });
    expect(snapshotSharedContentBinding(data, { kind: "summary" } as any)).toBe("Shared summary");
    expect(snapshotSharedContentBinding(data, { kind: "skills" } as any)).toEqual(["JS", "TS"]);
    expect(snapshotSharedContentBinding(data, { kind: "links" } as any)).toEqual([{ label: "L", url: "u" }]);
  });
  it("snapshots id-bearing bindings (found and not found)", () => {
    expect(snapshotSharedContentBinding(data, { kind: "work", id: "w1" } as any)).toMatchObject({ id: "w1", title: "Dev" });
    expect(snapshotSharedContentBinding(data, { kind: "work", id: "nope" } as any)).toBeNull();
    expect(snapshotSharedContentBinding(data, { kind: "project", id: "p1" } as any)).toMatchObject({ id: "p1", title: "Proj" });
    expect(snapshotSharedContentBinding(data, { kind: "education", id: "e1" } as any)).toMatchObject({ id: "e1", school: "MIT" });
  });
  it("clones (does not return the same reference)", () => {
    const snap = snapshotSharedContentBinding(data, { kind: "skills" } as any) as string[];
    expect(snap).not.toBe(data.skills);
  });
});

describe("unlink / relink lifecycle", () => {
  it("unlink creates a local snapshot; a second unlink is a no-op", () => {
    const data = baseData();
    const unlinked = unlinkSharedContentBinding(data, SURFACE, { kind: "summary" } as any);
    expect(isSharedContentBindingLocal(unlinked.design, SURFACE, { kind: "summary" } as any)).toBe(true);
    // idempotent
    expect(unlinkSharedContentBinding(unlinked, SURFACE, { kind: "summary" } as any)).toBe(unlinked);
  });

  it("relinkUsingShared discards the local snapshot", () => {
    const data = unlinkSharedContentBinding(baseData(), SURFACE, { kind: "summary" } as any);
    const relinked = relinkSharedContentUsingShared(data, SURFACE, { kind: "summary" } as any);
    expect(isSharedContentBindingLocal(relinked.design, SURFACE, { kind: "summary" } as any)).toBe(false);
  });

  it("relinkUsingLocal promotes the local snapshot to shared then clears local", () => {
    // Build a design where summary is locally overridden to "LOCAL".
    const data = baseData({
      design: { formatLocalContent: { pdf: { summary: { binding: { kind: "summary" }, snapshot: "LOCAL summary" } } } },
    });
    const out = relinkSharedContentUsingLocal(data, SURFACE, { kind: "summary" } as any);
    expect(out.summary).toBe("LOCAL summary");
    expect(isSharedContentBindingLocal(out.design, SURFACE, { kind: "summary" } as any)).toBe(false);
  });

  it("relinkUsingLocal is a no-op when there is no local snapshot", () => {
    const data = baseData();
    expect(relinkSharedContentUsingLocal(data, SURFACE, { kind: "summary" } as any)).toBe(data);
  });
});

describe("applySnapshot (exercised via relinkUsingLocal) covers every binding kind", () => {
  function relinkLocal(binding: any, snapshot: unknown, overrides: any = {}) {
    const key = sharedContentBindingKey(binding);
    const data = baseData({
      ...overrides,
      design: { formatLocalContent: { pdf: { [key]: { binding, snapshot } } } },
    });
    return relinkSharedContentUsingLocal(data, SURFACE, binding);
  }

  it("name + contact", () => {
    const n = relinkLocal({ kind: "name" }, { firstName: "New", lastName: "Name" });
    expect(n.firstName).toBe("New");
    expect(n.lastName).toBe("Name");
    const c = relinkLocal({ kind: "contact" }, { email: "new@x", phone: "1", location: "L", website: "w" });
    expect(c.email).toBe("new@x");
    expect(c.website).toBe("w");
  });

  it("work: update existing, append new, and remove on null", () => {
    expect(relinkLocal({ kind: "work", id: "w1" }, { id: "w1", title: "Updated" }).workEntries.find((w: any) => w.id === "w1").title).toBe("Updated");
    expect(relinkLocal({ kind: "work", id: "w2" }, { id: "w2", title: "Fresh" }).workEntries.some((w: any) => w.id === "w2")).toBe(true);
    expect(relinkLocal({ kind: "work", id: "w1" }, null).workEntries.some((w: any) => w.id === "w1")).toBe(false);
  });

  it("project: update, append, remove", () => {
    expect(relinkLocal({ kind: "project", id: "p1" }, { id: "p1", title: "UpdatedP" }).projects.find((p: any) => p.id === "p1").title).toBe("UpdatedP");
    expect(relinkLocal({ kind: "project", id: "p9" }, { id: "p9", title: "NewP" }).projects.some((p: any) => p.id === "p9")).toBe(true);
    expect(relinkLocal({ kind: "project", id: "p1" }, null).projects.some((p: any) => p.id === "p1")).toBe(false);
  });

  it("education: update, append, remove", () => {
    expect(relinkLocal({ kind: "education", id: "e1" }, { id: "e1", school: "Updated" }).education.find((e: any) => e.id === "e1").school).toBe("Updated");
    expect(relinkLocal({ kind: "education", id: "e9" }, { id: "e9", school: "New" }).education.some((e: any) => e.id === "e9")).toBe(true);
    expect(relinkLocal({ kind: "education", id: "e1" }, null).education.some((e: any) => e.id === "e1")).toBe(false);
  });

  it("skills + links replace the arrays (or reset to [] for non-arrays)", () => {
    expect(relinkLocal({ kind: "skills" }, ["A", "B"]).skills).toEqual(["A", "B"]);
    expect(relinkLocal({ kind: "skills" }, "not-an-array").skills).toEqual([]);
    expect(relinkLocal({ kind: "links" }, [{ label: "X", url: "y" }]).extraLinks).toEqual([{ label: "X", url: "y" }]);
    expect(relinkLocal({ kind: "links" }, null).extraLinks).toEqual([]);
  });
});

describe("effectiveResumeDataForSurface", () => {
  it("returns shared data unchanged when there are no local overrides", () => {
    const data = baseData();
    expect(effectiveResumeDataForSurface(data, SURFACE)).toBe(data);
  });
  it("applies local snapshots for the surface", () => {
    const data = baseData({
      design: { formatLocalContent: { pdf: { summary: { binding: { kind: "summary" }, snapshot: "LOCAL" } } } },
    });
    expect(effectiveResumeDataForSurface(data, SURFACE).summary).toBe("LOCAL");
  });
});

describe("mergeSurfaceResumeDataChange", () => {
  it("returns the edited data directly when the surface has no local overrides", () => {
    const shared = baseData();
    const next = baseData({ summary: "edited" });
    expect(mergeSurfaceResumeDataChange(shared, next, SURFACE)).toBe(next);
  });
  it("preserves the shared value for locally-bound content while refreshing the local snapshot", () => {
    const shared = baseData({
      design: { formatLocalContent: { pdf: { summary: { binding: { kind: "summary" }, snapshot: "old local" } } } },
    });
    const next = baseData({ summary: "edited in surface" });
    const merged = mergeSurfaceResumeDataChange(shared, next, SURFACE);
    // Shared summary stays canonical (from sharedData), local snapshot captures the surface edit.
    expect(merged.summary).toBe("Shared summary");
    const store = merged.design.formatLocalContent.pdf.summary;
    expect(store.snapshot).toBe("edited in surface");
  });
});
