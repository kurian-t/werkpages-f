import type { CSSProperties, ReactNode } from "react";
import type { ResumeData } from "./types";
import { formatDateRange, formatEduYears } from "./types";
import { atsBlocksFromHtml, buildATSChecks } from "./resumeATS";
import { getResumeProjects, projectHasContent } from "./resumeProjects";

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section style={{ marginTop: 24 }}>
      <h2
        style={{
          margin: 0,
          paddingBottom: 5,
          borderBottom: "1px solid #d4d4d8",
          fontSize: 13,
          lineHeight: 1.2,
          fontWeight: 700,
          letterSpacing: "0.02em",
          color: "#18181b",
          textTransform: "uppercase",
        }}
      >
        {title}
      </h2>
      <div style={{ marginTop: 10 }}>{children}</div>
    </section>
  );
}

function ATSBody({ html }: { html?: string }) {
  const blocks = atsBlocksFromHtml(html);
  if (blocks.length === 0) return null;

  return (
    <div style={{ marginTop: 7 }}>
      {blocks.map((block, index) =>
        block.kind === "bullet" ? (
          <div
            key={index}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 7,
              marginTop: index === 0 ? 0 : 3,
              fontSize: 11,
              lineHeight: 1.48,
              color: "#27272a",
            }}
          >
            <span aria-hidden="true" style={{ flexShrink: 0 }}>•</span>
            <span>{block.text}</span>
          </div>
        ) : (
          <p
            key={index}
            style={{
              margin: index === 0 ? 0 : "5px 0 0",
              fontSize: 11,
              lineHeight: 1.48,
              color: "#27272a",
            }}
          >
            {block.text}
          </p>
        )
      )}
    </div>
  );
}

export default function ResumeATSTwin({ data }: { data: ResumeData }) {
  const checks = buildATSChecks(data);
  const passed = checks.filter(check => check.ok).length;

  const contact = [
    data.email?.trim(),
    data.phone?.trim(),
    data.location?.trim(),
    data.website?.trim(),
  ].filter(Boolean) as string[];

  const paper: CSSProperties = {
    width: "100%",
    maxWidth: 760,
    margin: "0 auto",
    background: "#ffffff",
    border: "1px solid #e4e4e7",
    boxShadow: "0 10px 30px rgba(15,23,42,0.08)",
    padding: "42px 46px 54px",
    color: "#18181b",
    fontFamily: "Arial, Helvetica, sans-serif",
    boxSizing: "border-box",
  };

  return (
    <div style={{ width: "100%" }}>
      <div
        style={{
          maxWidth: 760,
          margin: "0 auto 12px",
          padding: "12px 14px",
          borderRadius: 10,
          border: "1px solid #ddd6fe",
          background: "#faf8ff",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#4c1d95" }}>ATS twin</div>
            <div style={{ marginTop: 2, fontSize: 10.5, lineHeight: 1.45, color: "#6b7280" }}>
              Live projection from the same resume data. It intentionally removes design-only elements and does not create a second copy of your content.
            </div>
          </div>
          <div
            style={{
              flexShrink: 0,
              borderRadius: 999,
              background: passed === checks.length ? "#ecfdf5" : "#fff7ed",
              color: passed === checks.length ? "#047857" : "#c2410c",
              padding: "4px 8px",
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            {passed}/{checks.length} checks
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 6,
            marginTop: 10,
          }}
        >
          {checks.map(check => (
            <div
              key={check.id}
              title={check.detail}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                minWidth: 0,
                padding: "6px 8px",
                borderRadius: 7,
                background: check.ok ? "#ffffff" : "#fff7ed",
                border: `1px solid ${check.ok ? "#e4e4e7" : "#fed7aa"}`,
                fontSize: 9.5,
                color: check.ok ? "#52525b" : "#9a3412",
              }}
            >
              <span style={{ fontWeight: 800 }}>{check.ok ? "✓" : "!"}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{check.label}</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 8, fontSize: 9.5, color: "#71717a" }}>
          These are structural checks, not a guarantee of parsing or ranking by every applicant-tracking system.
        </div>
      </div>

      <article style={paper}>
        <header>
          <h1
            style={{
              margin: 0,
              fontSize: 26,
              lineHeight: 1.15,
              fontWeight: 700,
              color: "#111827",
            }}
          >
            {`${data.firstName ?? ""} ${data.lastName ?? ""}`.trim() || "Your Name"}
          </h1>

          {contact.length > 0 && (
            <div
              style={{
                marginTop: 7,
                fontSize: 10.5,
                lineHeight: 1.45,
                color: "#4b5563",
                overflowWrap: "anywhere",
              }}
            >
              {contact.join(" · ")}
            </div>
          )}
        </header>

        {data.summary?.trim() && (
          <Section title="Professional Summary">
            <p style={{ margin: 0, fontSize: 11, lineHeight: 1.5, color: "#27272a", whiteSpace: "pre-wrap" }}>
              {data.summary.trim()}
            </p>
          </Section>
        )}

        {(data.workEntries ?? []).length > 0 && (
          <Section title="Professional Experience">
            {(data.workEntries ?? []).map((entry, index) => {
              const dates = formatDateRange(entry.startDate, entry.endDate, entry.current);
              return (
                <div key={entry.id ?? index} style={{ marginTop: index === 0 ? 0 : 18 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, lineHeight: 1.3 }}>
                    {entry.title || "Role"}
                  </div>
                  <div style={{ marginTop: 2, fontSize: 10.5, color: "#3f3f46" }}>
                    {[entry.company, dates].filter(Boolean).join(" · ")}
                  </div>
                  <ATSBody html={entry.body} />
                </div>
              );
            })}
          </Section>
        )}

        {getResumeProjects(data).filter(projectHasContent).length > 0 && (
          <Section title="Projects">
            {getResumeProjects(data).filter(projectHasContent).map(project => (
              <div key={project.id} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#18181b" }}>
                  {project.title || "Project"}
                </div>

                {!!project.techStack.trim() && (
                  <div style={{
                    marginTop: 2,
                    fontSize: 10.5,
                    lineHeight: 1.4,
                    color: "#52525b",
                  }}>
                    {project.techStack}
                  </div>
                )}

                {!!project.description.trim() && (
                  <p style={{
                    margin: "6px 0 0",
                    fontSize: 11,
                    lineHeight: 1.48,
                    color: "#27272a",
                  }}>
                    {project.description}
                  </p>
                )}

                {[project.githubUrl, project.liveUrl]
                  .map(value => value.trim())
                  .filter(Boolean)
                  .map((url, index) => (
                    <div
                      key={`${project.id}-url-${index}`}
                      style={{
                        marginTop: 4,
                        fontSize: 10.5,
                        lineHeight: 1.4,
                        color: "#27272a",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {url}
                    </div>
                  ))}
              </div>
            ))}
          </Section>
        )}

        {(data.education ?? []).length > 0 && (
          <Section title="Education">
            {(data.education ?? []).map((entry, index) => {
              const years = formatEduYears(entry.startYear, entry.endYear, entry.current);
              const credential = [entry.degree, entry.field].filter(Boolean).join(" — ");
              return (
                <div key={entry.id ?? index} style={{ marginTop: index === 0 ? 0 : 14 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, lineHeight: 1.3 }}>
                    {entry.school || "School"}
                  </div>
                  {(credential || years) && (
                    <div style={{ marginTop: 2, fontSize: 10.5, lineHeight: 1.4, color: "#3f3f46" }}>
                      {[credential, years].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </div>
              );
            })}
          </Section>
        )}

        {(data.skills ?? []).length > 0 && (
          <Section title="Skills">
            <p style={{ margin: 0, fontSize: 11, lineHeight: 1.5, color: "#27272a" }}>
              {(data.skills ?? []).join(", ")}
            </p>
          </Section>
        )}

        {(data.extraLinks ?? []).some(link => link?.label?.trim() || link?.url?.trim()) && (
          <Section title="Links">
            {(data.extraLinks ?? []).map((link, index) => {
              if (!link?.label?.trim() && !link?.url?.trim()) return null;
              return (
                <div
                  key={index}
                  style={{
                    marginTop: index === 0 ? 0 : 5,
                    fontSize: 10.5,
                    lineHeight: 1.45,
                    color: "#27272a",
                    overflowWrap: "anywhere",
                  }}
                >
                  {[link.label?.trim(), link.url?.trim()].filter(Boolean).join(": ")}
                </div>
              );
            })}
          </Section>
        )}
      </article>
    </div>
  );
}
