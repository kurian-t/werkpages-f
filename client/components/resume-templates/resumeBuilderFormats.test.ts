import { describe, it, expect } from "vitest";
import {
  LEGACY_RESUME_BUILDER_FORMATS,
  NEW_RESUME_BUILDER_FORMATS,
  getResumeBuilderFormats,
  withResumeBuilderFormats,
  createNewResumeDesignWithFormatChooser,
  hasAnyEnabledFormat,
  isWorkspaceEnabled,
  firstEnabledOutputWorkspace,
  firstEnabledWebWorkspace,
  type ResumeBuilderEnabledFormats,
} from "./resumeBuilderFormats";

const ALL_ON: ResumeBuilderEnabledFormats = { designedPdf: true, ats: true, responsiveWeb: true, interactiveWeb: true };
const ALL_OFF: ResumeBuilderEnabledFormats = { designedPdf: false, ats: false, responsiveWeb: false, interactiveWeb: false };

describe("getResumeBuilderFormats", () => {
  it("returns legacy (all enabled, onboarding complete) when no builderFormats present", () => {
    expect(getResumeBuilderFormats({} as any)).toEqual(LEGACY_RESUME_BUILDER_FORMATS);
  });

  it("defaults each missing field to true / onboardingComplete true", () => {
    const state = getResumeBuilderFormats({ builderFormats: { enabled: { ats: false } } } as any);
    expect(state.onboardingComplete).toBe(true);
    expect(state.enabled.ats).toBe(false);
    expect(state.enabled.designedPdf).toBe(true);
    expect(state.enabled.responsiveWeb).toBe(true);
    expect(state.enabled.interactiveWeb).toBe(true);
  });

  it("honours explicit false onboardingComplete and full enabled map", () => {
    const state = getResumeBuilderFormats({ builderFormats: { onboardingComplete: false, enabled: ALL_OFF } } as any);
    expect(state.onboardingComplete).toBe(false);
    expect(state.enabled).toEqual(ALL_OFF);
  });

  it("ignores non-boolean values (falls back to true)", () => {
    const state = getResumeBuilderFormats({ builderFormats: { onboardingComplete: "yes" as any, enabled: { ats: 1 as any } } } as any);
    expect(state.onboardingComplete).toBe(true);
    expect(state.enabled.ats).toBe(true);
  });
});

describe("withResumeBuilderFormats / createNewResumeDesignWithFormatChooser", () => {
  it("writes the given state onto the design (cloning enabled)", () => {
    const design = withResumeBuilderFormats({ foo: 1 } as any, NEW_RESUME_BUILDER_FORMATS) as any;
    expect(design.foo).toBe(1);
    expect(design.builderFormats.onboardingComplete).toBe(false);
    expect(design.builderFormats.enabled).toEqual(ALL_OFF);
    expect(design.builderFormats.enabled).not.toBe(NEW_RESUME_BUILDER_FORMATS.enabled); // cloned
  });

  it("createNewResumeDesignWithFormatChooser applies NEW format state", () => {
    const design = createNewResumeDesignWithFormatChooser({} as any) as any;
    expect(getResumeBuilderFormats(design)).toEqual(NEW_RESUME_BUILDER_FORMATS);
  });
});

describe("hasAnyEnabledFormat", () => {
  it("true when at least one enabled, false when none", () => {
    expect(hasAnyEnabledFormat(ALL_ON)).toBe(true);
    expect(hasAnyEnabledFormat({ ...ALL_OFF, interactiveWeb: true })).toBe(true);
    expect(hasAnyEnabledFormat(ALL_OFF)).toBe(false);
  });
});

describe("isWorkspaceEnabled", () => {
  it("content is always enabled", () => {
    expect(isWorkspaceEnabled("content", ALL_OFF)).toBe(true);
  });
  it("maps each output workspace to its flag", () => {
    expect(isWorkspaceEnabled("designed-pdf", { ...ALL_OFF, designedPdf: true })).toBe(true);
    expect(isWorkspaceEnabled("ats", { ...ALL_OFF, ats: true })).toBe(true);
    expect(isWorkspaceEnabled("responsive-web", { ...ALL_OFF, responsiveWeb: true })).toBe(true);
    expect(isWorkspaceEnabled("interactive-web", { ...ALL_OFF, interactiveWeb: true })).toBe(true);
    expect(isWorkspaceEnabled("designed-pdf", ALL_OFF)).toBe(false);
  });
});

describe("firstEnabledOutputWorkspace", () => {
  it("respects priority order designed-pdf > ats > responsive > interactive", () => {
    expect(firstEnabledOutputWorkspace(ALL_ON)).toBe("designed-pdf");
    expect(firstEnabledOutputWorkspace({ ...ALL_OFF, ats: true, responsiveWeb: true })).toBe("ats");
    expect(firstEnabledOutputWorkspace({ ...ALL_OFF, responsiveWeb: true })).toBe("responsive-web");
    expect(firstEnabledOutputWorkspace({ ...ALL_OFF, interactiveWeb: true })).toBe("interactive-web");
  });
  it("returns null when nothing enabled", () => {
    expect(firstEnabledOutputWorkspace(ALL_OFF)).toBeNull();
  });
});

describe("firstEnabledWebWorkspace", () => {
  it("prefers responsive over interactive, null when neither", () => {
    expect(firstEnabledWebWorkspace({ ...ALL_OFF, responsiveWeb: true, interactiveWeb: true })).toBe("responsive-web");
    expect(firstEnabledWebWorkspace({ ...ALL_OFF, interactiveWeb: true })).toBe("interactive-web");
    expect(firstEnabledWebWorkspace(ALL_OFF)).toBeNull();
  });
});
