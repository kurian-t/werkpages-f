import { describe, it, expect } from "vitest";
import {
  normalizeResumeProject,
  getResumeProjects,
  withResumeProjects,
  splitTechStack,
  projectHasContent,
  migrateLegacyWebPortfolioData,
} from "./resumeProjects";

describe("normalizeResumeProject", () => {
  it("fills defaults and synthesises an id from the index", () => {
    expect(normalizeResumeProject(null, 3)).toEqual({
      id: "project-3", title: "", description: "", techStack: "", githubUrl: "", liveUrl: "", imageUrl: "",
    });
  });
  it("keeps a provided id and coerces non-string fields", () => {
    const p = normalizeResumeProject({ id: " abc ", title: 42 as any } as any, 0);
    expect(p.id).toBe("abc");
    expect(p.title).toBe("42");
  });
  it("falls back to project-<index> when id is blank", () => {
    expect(normalizeResumeProject({ id: "   " } as any, 5).id).toBe("project-5");
  });
});

describe("getResumeProjects", () => {
  it("returns [] when projects is missing or not an array", () => {
    expect(getResumeProjects({} as any)).toEqual([]);
    expect(getResumeProjects({ projects: "nope" } as any)).toEqual([]);
  });
  it("filters out null/non-object entries and normalizes the rest", () => {
    const out = getResumeProjects({ projects: [null, 5, { title: "X" }] } as any);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("X");
    expect(out[0].id).toBe("project-0");
  });
});

describe("withResumeProjects", () => {
  it("stores normalized projects on the data", () => {
    const data = withResumeProjects({ summary: "s" } as any, [{ title: "P" } as any]);
    expect((data as any).summary).toBe("s");
    expect((data as any).projects[0].title).toBe("P");
  });
});

describe("splitTechStack", () => {
  it("splits on comma, semicolon, pipe and newline; trims and drops empties", () => {
    expect(splitTechStack("React, Node; TS | Go\n\nRust")).toEqual(["React", "Node", "TS", "Go", "Rust"]);
  });
  it("returns [] for null/empty and coerces non-strings", () => {
    expect(splitTechStack(null)).toEqual([]);
    expect(splitTechStack("")).toEqual([]);
    expect(splitTechStack(123 as any)).toEqual(["123"]);
  });
});

describe("projectHasContent", () => {
  it("false for null/undefined and all-empty", () => {
    expect(projectHasContent(null)).toBe(false);
    expect(projectHasContent({})).toBe(false);
    expect(projectHasContent({ title: "   " })).toBe(false);
  });
  it("true when any field has content", () => {
    expect(projectHasContent({ description: "hi" })).toBe(true);
    expect(projectHasContent({ githubUrl: "g" })).toBe(true);
    expect(projectHasContent({ imageUrl: "img" })).toBe(true);
  });
});

describe("migrateLegacyWebPortfolioData", () => {
  it("prefers shared projects and strips legacy web fields", () => {
    const data = {
      projects: [{ title: "Shared" }],
      extraLinks: [],
      design: { webResume: { projects: [{ title: "Legacy" }], githubProfile: "https://github.com/me", theme: "dark" } },
    } as any;
    const out = migrateLegacyWebPortfolioData(data) as any;
    expect(out.projects[0].title).toBe("Shared");           // shared wins
    expect(out.design.webResume.projects).toBeUndefined();  // legacy removed
    expect(out.design.webResume.githubProfile).toBeUndefined();
    expect(out.design.webResume.theme).toBe("dark");        // other design kept
    expect(out.extraLinks).toContainEqual({ label: "GitHub", url: "https://github.com/me" });
  });

  it("falls back to legacy web projects when no shared projects exist", () => {
    const out = migrateLegacyWebPortfolioData({
      extraLinks: [], design: { webResume: { projects: [{ title: "Legacy" }] } },
    } as any) as any;
    expect(out.projects[0].title).toBe("Legacy");
  });

  it("does not duplicate the GitHub link when one already exists", () => {
    const out = migrateLegacyWebPortfolioData({
      extraLinks: [{ label: "GitHub", url: "https://github.com/existing" }],
      design: { webResume: { githubProfile: "https://github.com/me" } },
    } as any) as any;
    expect(out.extraLinks.filter((l: any) => /github/i.test(l.label))).toHaveLength(1);
  });

  it("handles completely empty input without throwing", () => {
    const out = migrateLegacyWebPortfolioData({} as any) as any;
    expect(out.projects).toEqual([]);
    expect(out.extraLinks).toEqual([]);
  });
});
