import { describe, it, expect } from "vitest";
import {
  decodeHtmlEntities,
  normalizeATSText,
  atsBlocksFromHtml,
  atsPlainTextFromHtml,
  projectResumeToATS,
  buildATSChecks,
} from "./resumeATS";

describe("decodeHtmlEntities", () => {
  it("decodes numeric, hex and named entities", () => {
    expect(decodeHtmlEntities("A&#66;C")).toBe("ABC");        // &#66; = B
    expect(decodeHtmlEntities("&#x41;&#x42;")).toBe("AB");    // hex A B
    expect(decodeHtmlEntities("a &amp; b")).toBe("a & b");
    expect(decodeHtmlEntities("&bull; item")).toBe("• item");
  });
  it("leaves unknown named entities untouched", () => {
    expect(decodeHtmlEntities("&frobnicate;")).toBe("&frobnicate;");
  });
});

describe("normalizeATSText", () => {
  it("strips script/style blocks entirely", () => {
    expect(normalizeATSText("keep<script>evil()</script>this")).toBe("keep this");
    expect(normalizeATSText("a<style>.x{}</style>b")).toBe("a b");
  });
  it("turns <br> into newlines and other tags into spaces", () => {
    expect(normalizeATSText("line1<br>line2")).toBe("line1\nline2");
    expect(normalizeATSText("<b>bold</b> text")).toBe("bold text");
  });
  it("collapses whitespace, nbsp entity, and consecutive newlines; trims", () => {
    expect(normalizeATSText("  a  b   c  ")).toBe("a b c");
    expect(normalizeATSText("x&nbsp;y")).toBe("x y");         // nbsp normalized to a plain space
    expect(normalizeATSText("a<br><br><br><br>b")).toBe("a\nb"); // runs collapse to a single newline
  });
});

describe("atsBlocksFromHtml / atsPlainTextFromHtml", () => {
  it("returns [] for null/empty/whitespace", () => {
    expect(atsBlocksFromHtml(null)).toEqual([]);
    expect(atsBlocksFromHtml("   ")).toEqual([]);
  });
  it("maps <p> to paragraph and <li> to bullet, skipping empty blocks", () => {
    const blocks = atsBlocksFromHtml("<p>Intro</p><ul><li>One</li><li>  </li><li>Two</li></ul>");
    expect(blocks).toEqual([
      { kind: "paragraph", text: "Intro" },
      { kind: "bullet", text: "One" },
      { kind: "bullet", text: "Two" },
    ]);
  });
  it("falls back to a single paragraph when there are no p/li tags", () => {
    expect(atsBlocksFromHtml("just <b>text</b> here")).toEqual([{ kind: "paragraph", text: "just text here" }]);
  });
  it("plain text joins block texts with newlines", () => {
    expect(atsPlainTextFromHtml("<p>A</p><li>B</li>")).toBe("A\nB");
  });
});

describe("projectResumeToATS", () => {
  it("hasContent=false and empty fields for an empty resume", () => {
    const p = projectResumeToATS({} as any);
    expect(p.fullName).toBe("");
    expect(p.contact).toEqual([]);
    expect(p.hasContent).toBe(false);
  });

  it("collects content and filters empty work/education/project rows", () => {
    const p = projectResumeToATS({
      firstName: "Ada", lastName: "Lovelace",
      email: "ada@x.com", phone: "", location: "London", website: "ada.dev",
      summary: "  Engineer  ",
      workEntries: [
        { title: "Dev", company: "Acme", body: "<p>Did things</p>" },
        { title: "", company: "", startDate: "", endDate: "", body: "" }, // empty -> excluded
      ],
      education: [
        { school: "MIT", degree: "BSc" },
        { school: "", degree: "", field: "", startYear: "", endYear: "" }, // excluded
      ],
      projects: [{ title: "Proj" }, { title: "" }],
      skills: ["JS", "JS", "TS", ""],
      extraLinks: [{ label: "GH", url: "http://gh" }, { label: "", url: "" }],
    } as any);

    expect(p.fullName).toBe("Ada Lovelace");
    expect(p.summary).toBe("Engineer");
    expect(p.contact).toEqual(["ada@x.com", "London", "ada.dev"]);
    expect(p.work).toHaveLength(1);
    expect(p.education).toHaveLength(1);
    expect(p.projects).toHaveLength(1);
    expect(p.skills).toEqual(["JS", "TS"]); // dedup + drop empty
    expect(p.links).toEqual([{ label: "GH", url: "http://gh" }]);
    expect(p.hasContent).toBe(true);
  });
});

describe("buildATSChecks", () => {
  it("returns 7 checks; visuals always ok; identity/contact reflect data", () => {
    const checks = buildATSChecks({} as any);
    expect(checks).toHaveLength(7);
    const byId = Object.fromEntries(checks.map(c => [c.id, c]));
    expect(byId.identity.ok).toBe(false);
    expect(byId.contact.ok).toBe(false);
    expect(byId.visuals.ok).toBe(true);
    expect(byId.experience.ok).toBe(true);  // vacuous (no entries)
    expect(byId.projects.ok).toBe(true);
  });

  it("flags experience entries missing both title and company", () => {
    const checks = buildATSChecks({
      firstName: "A", email: "a@b.com",
      workEntries: [{ title: "", company: "", body: "<p>work</p>" }],
    } as any);
    const byId = Object.fromEntries(checks.map(c => [c.id, c]));
    expect(byId.identity.ok).toBe(true);
    expect(byId.contact.ok).toBe(true);
    expect(byId.experience.ok).toBe(false);
  });

  it("passes experience/description/project checks for well-formed content", () => {
    const checks = buildATSChecks({
      firstName: "A", email: "a@b.com",
      workEntries: [{ title: "Dev", company: "Acme", body: "<p>Built stuff</p>" }],
      projects: [{ title: "Proj", description: "Cool", techStack: "TS" }],
    } as any);
    const byId = Object.fromEntries(checks.map(c => [c.id, c]));
    expect(byId.experience.ok).toBe(true);
    expect(byId.descriptions.ok).toBe(true);
    expect(byId.projects.ok).toBe(true);
    expect(byId["project-detail"].ok).toBe(true);
  });
});
