import { describe, it, expect } from "vitest";
import {
  applyInteractiveBindingDraft,
  resolveInteractiveBinding,
  resolveInteractiveObjectBinding,
  interactiveBindingDisplayName,
  getInteractiveBindingOptions,
} from "./resumeInteractiveBindings";

const personal = { source: "personal" } as any;

function richData(overrides: any = {}): any {
  return {
    firstName: "Ada", lastName: "Lovelace",
    email: "ada@x.com", phone: "", location: "", website: "ada.dev", summary: "",
    workEntries: [{ id: "w1", title: "Dev", company: "Acme", startDate: "2020-01", endDate: "2021-01", body: "<p>Built things</p>", logoUrl: "logo.png" }],
    projects: [{ id: "p1", title: "Proj", description: "Desc", techStack: "TS", githubUrl: "gh", liveUrl: "live", imageUrl: "img" }],
    education: [{ id: "e1", school: "MIT", degree: "BSc", field: "CS", startYear: "2016", endYear: "2020" }],
    skills: ["JS", "TS"],
    extraLinks: [{ label: "GH", url: "http://gh" }],
    ...overrides,
  };
}

describe("applyInteractiveBindingDraft (personal source)", () => {
  it("returns the same data when the binding is undefined", () => {
    const data = { firstName: "A" } as any;
    expect(applyInteractiveBindingDraft(data, undefined, { email: "x" })).toBe(data);
  });

  it("splits fullName into first and last name", () => {
    const out = applyInteractiveBindingDraft({} as any, personal, { fullName: "Ada Lovelace" }) as any;
    expect(out.firstName).toBe("Ada");
    expect(out.lastName).toBe("Lovelace");
  });

  it("treats a single-word fullName as first name with empty last name", () => {
    const out = applyInteractiveBindingDraft({ firstName: "old", lastName: "old" } as any, personal, { fullName: "Madonna" }) as any;
    expect(out.firstName).toBe("Madonna");
    expect(out.lastName).toBe("");
  });

  it("joins the remaining words into the last name", () => {
    const out = applyInteractiveBindingDraft({} as any, personal, { fullName: "  Jean  Luc  Picard  " }) as any;
    expect(out.firstName).toBe("Jean");
    expect(out.lastName).toBe("Luc Picard");
  });

  it("applies scalar personal fields present in the draft", () => {
    const out = applyInteractiveBindingDraft({} as any, personal, {
      email: "a@b.com", phone: "555", location: "NYC", website: "a.dev", summary: "hi",
    }) as any;
    expect(out.email).toBe("a@b.com");
    expect(out.phone).toBe("555");
    expect(out.location).toBe("NYC");
    expect(out.website).toBe("a.dev");
    expect(out.summary).toBe("hi");
  });

  it("does not mutate the original data object", () => {
    const data = { firstName: "Keep", email: "keep@x" } as any;
    const out = applyInteractiveBindingDraft(data, personal, { email: "new@x" }) as any;
    expect(data.email).toBe("keep@x"); // original untouched
    expect(out.email).toBe("new@x");
  });
});

describe("resolveInteractiveBinding", () => {
  const data = richData();

  it("returns null for an undefined binding", () => {
    expect(resolveInteractiveBinding(data, undefined)).toBeNull();
  });

  it("personal: fullName / email / website / empty summary", () => {
    expect(resolveInteractiveBinding(data, { source: "personal", field: "fullName" } as any))
      .toMatchObject({ found: true, source: "personal", label: "Name", primary: "Ada Lovelace", empty: false });
    expect(resolveInteractiveBinding(data, { source: "personal", field: "email" } as any)?.href).toBe("mailto:ada@x.com");
    expect(resolveInteractiveBinding(data, { source: "personal", field: "website" } as any)?.href).toBe("ada.dev");
    expect(resolveInteractiveBinding(data, { source: "personal", field: "summary" } as any))
      .toMatchObject({ empty: true, label: "Bio" });
  });

  it("work: entry, individual fields, and missing", () => {
    const entry = resolveInteractiveBinding(data, { source: "work", field: "entry", entryId: "w1" } as any)!;
    expect(entry).toMatchObject({ found: true, source: "work", primary: "Dev" });
    expect(entry.secondary).toContain("Acme");
    expect(entry.body).toBe("Built things");

    expect(resolveInteractiveBinding(data, { source: "work", field: "company", entryId: "w1" } as any))
      .toMatchObject({ label: "Company", primary: "Acme" });
    expect(resolveInteractiveBinding(data, { source: "work", field: "logoUrl", entryId: "w1" } as any))
      .toMatchObject({ label: "Company logo", imageUrl: "logo.png" });
    expect(resolveInteractiveBinding(data, { source: "work", field: "entry", entryId: "nope" } as any)?.found).toBe(false);
  });

  it("project: entry, fields, and missing", () => {
    const entry = resolveInteractiveBinding(data, { source: "project", field: "entry", entryId: "p1" } as any)!;
    expect(entry).toMatchObject({ found: true, source: "project", primary: "Proj" });
    expect(entry.href).toBe("live"); // liveUrl preferred over githubUrl
    expect(resolveInteractiveBinding(data, { source: "project", field: "githubUrl", entryId: "p1" } as any)?.href).toBe("gh");
    expect(resolveInteractiveBinding(data, { source: "project", field: "description", entryId: "p1" } as any))
      .toMatchObject({ label: "Project description", body: "Desc" });
    expect(resolveInteractiveBinding(data, { source: "project", field: "entry", entryId: "zzz" } as any)?.found).toBe(false);
  });

  it("education: entry, fields, and missing", () => {
    const entry = resolveInteractiveBinding(data, { source: "education", field: "entry", entryId: "e1" } as any)!;
    expect(entry).toMatchObject({ found: true, source: "education" });
    expect(entry.primary).toContain("BSc");
    expect(entry.secondary).toContain("MIT");
    expect(resolveInteractiveBinding(data, { source: "education", field: "school", entryId: "e1" } as any))
      .toMatchObject({ label: "School", primary: "MIT" });
    expect(resolveInteractiveBinding(data, { source: "education", field: "entry", entryId: "no" } as any)?.found).toBe(false);
  });

  it("skill: valid index and out-of-range", () => {
    expect(resolveInteractiveBinding(data, { source: "skill", entryId: "0" } as any))
      .toMatchObject({ found: true, source: "skill", primary: "JS" });
    expect(resolveInteractiveBinding(data, { source: "skill", entryId: "9" } as any)?.found).toBe(false);
    expect(resolveInteractiveBinding(data, { source: "skill", entryId: "x" } as any)?.found).toBe(false);
  });

  it("link: valid index and out-of-range", () => {
    expect(resolveInteractiveBinding(data, { source: "link", entryId: "0" } as any))
      .toMatchObject({ found: true, source: "link", primary: "GH", href: "http://gh" });
    expect(resolveInteractiveBinding(data, { source: "link", entryId: "5" } as any)?.found).toBe(false);
  });

  it("unknown source resolves to a missing binding", () => {
    expect(resolveInteractiveBinding(data, { source: "mystery" } as any)?.found).toBe(false);
  });
});

describe("interactiveBindingDisplayName", () => {
  const data = richData();
  it("Unbound when no binding", () => {
    expect(interactiveBindingDisplayName(data, undefined)).toBe("Unbound resume content");
  });
  it("uses the resolved primary for a found binding", () => {
    expect(interactiveBindingDisplayName(data, { source: "personal", field: "fullName" } as any)).toBe("Ada Lovelace");
  });
  it("falls back to the label for a missing binding", () => {
    const name = interactiveBindingDisplayName(data, { source: "work", field: "entry", entryId: "nope" } as any);
    expect(typeof name).toBe("string");
    expect(name.length).toBeGreaterThan(0);
  });
});

describe("resolveInteractiveObjectBinding", () => {
  const data = richData();
  it("resolves against shared data by default", () => {
    const obj = { binding: { source: "personal", field: "fullName" } } as any;
    expect(resolveInteractiveObjectBinding(data, obj)?.primary).toBe("Ada Lovelace");
  });
  it("applies the local unlinked draft before resolving", () => {
    const obj = {
      binding: { source: "personal", field: "fullName" },
      sharedContentUnlinked: true,
      localContent: { fullName: "Grace Hopper" },
    } as any;
    expect(resolveInteractiveObjectBinding(data, obj)?.primary).toBe("Grace Hopper");
  });
});

describe("getInteractiveBindingOptions", () => {
  it("empty resume yields only the 8 personal options", () => {
    const opts = getInteractiveBindingOptions({} as any);
    expect(opts).toHaveLength(8);
    expect(opts.every((o: any) => o.group === "Personal")).toBe(true);
    expect(opts.find((o: any) => o.label === "Full name")?.binding).toMatchObject({ source: "personal", field: "fullName" });
  });

  it("enumerates options across every content group", () => {
    const opts = getInteractiveBindingOptions(richData());
    const groups = new Set(opts.map((o: any) => o.group));
    ["Personal", "Experience", "Projects", "Education", "Skills", "Links"].forEach(g => expect(groups).toContain(g));
    // 8 personal + (1+5) work + (1+6) project + (1+4) education + 2 skills + 1 link
    expect(opts).toHaveLength(8 + 6 + 7 + 5 + 2 + 1);
    expect(opts.find((o: any) => o.binding?.source === "work" && o.binding?.field === "entry")).toBeTruthy();
    expect(opts.find((o: any) => o.binding?.source === "skill")?.binding).toMatchObject({ source: "skill", entryId: "0" });
  });
});
