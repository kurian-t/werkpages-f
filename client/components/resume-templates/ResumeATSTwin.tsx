import type { CSSProperties, ReactNode } from "react";
import type { ResumeData } from "./types";
import { formatDateRange, formatEduYears } from "./types";
import {
  atsBlocksFromHtml,
  projectResumeToATS,
} from "./resumeATS";

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
  const projected = projectResumeToATS(data);

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

  if (!projected.hasContent) {
    return (
      <div
        style={{
          width: "100%",
          maxWidth: 760,
          minHeight: 300,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px dashed #d4d4d8",
          borderRadius: 16,
          background: "#ffffff",
          padding: 32,
          textAlign: "center",
          boxSizing: "border-box",
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#27272a" }}>
            Your ATS resume is empty
          </div>
          <div style={{ marginTop: 6, fontSize: 11, lineHeight: 1.5, color: "#71717a" }}>
            Add shared resume content on the left and the ATS version will update automatically.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: "100%" }}>
      <article aria-label="ATS resume preview" style={paper}>
        {(projected.fullName || projected.contact.length > 0) && (
          <header>
            {projected.fullName && (
              <h1
                style={{
                  margin: 0,
                  fontSize: 26,
                  lineHeight: 1.15,
                  fontWeight: 700,
                  color: "#111827",
                }}
              >
                {projected.fullName}
              </h1>
            )}

            {projected.contact.length > 0 && (
              <div
                style={{
                  marginTop: projected.fullName ? 7 : 0,
                  fontSize: 10.5,
                  lineHeight: 1.45,
                  color: "#4b5563",
                  overflowWrap: "anywhere",
                }}
              >
                {projected.contact.join(" · ")}
              </div>
            )}
          </header>
        )}

        {projected.summary && (
          <Section title="Professional Summary">
            <p style={{ margin: 0, fontSize: 11, lineHeight: 1.5, color: "#27272a", whiteSpace: "pre-wrap" }}>
              {projected.summary}
            </p>
          </Section>
        )}

        {projected.work.length > 0 && (
          <Section title="Professional Experience">
            {projected.work.map((entry, index) => {
              const dates = formatDateRange(entry.startDate, entry.endDate, entry.current);
              const meta = [entry.company?.trim(), dates].filter(Boolean).join(" · ");
              return (
                <div key={entry.id ?? index} style={{ marginTop: index === 0 ? 0 : 18 }}>
                  {!!entry.title?.trim() && (
                    <div style={{ fontSize: 11.5, fontWeight: 700, lineHeight: 1.3 }}>
                      {entry.title.trim()}
                    </div>
                  )}
                  {meta && (
                    <div style={{ marginTop: entry.title?.trim() ? 2 : 0, fontSize: 10.5, color: "#3f3f46" }}>
                      {meta}
                    </div>
                  )}
                  <ATSBody html={entry.body} />
                </div>
              );
            })}
          </Section>
        )}

        {projected.projects.length > 0 && (
          <Section title="Projects">
            {projected.projects.map((project, index) => (
              <div key={project.id} style={{ marginTop: index === 0 ? 0 : 14 }}>
                {!!project.title.trim() && (
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#18181b" }}>
                    {project.title.trim()}
                  </div>
                )}

                {!!project.techStack.trim() && (
                  <div style={{
                    marginTop: project.title.trim() ? 2 : 0,
                    fontSize: 10.5,
                    lineHeight: 1.4,
                    color: "#52525b",
                  }}>
                    {project.techStack.trim()}
                  </div>
                )}

                {!!project.description.trim() && (
                  <p style={{
                    margin: "6px 0 0",
                    fontSize: 11,
                    lineHeight: 1.48,
                    color: "#27272a",
                    whiteSpace: "pre-wrap",
                  }}>
                    {project.description.trim()}
                  </p>
                )}

                {[project.githubUrl, project.liveUrl]
                  .map(value => value.trim())
                  .filter(Boolean)
                  .map((url, urlIndex) => (
                    <div
                      key={`${project.id}-url-${urlIndex}`}
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

        {projected.education.length > 0 && (
          <Section title="Education">
            {projected.education.map((entry, index) => {
              const years = formatEduYears(entry.startYear, entry.endYear, entry.current);
              const credential = [entry.degree?.trim(), entry.field?.trim()].filter(Boolean).join(" — ");
              const meta = [credential, years].filter(Boolean).join(" · ");
              return (
                <div key={entry.id ?? index} style={{ marginTop: index === 0 ? 0 : 14 }}>
                  {!!entry.school?.trim() && (
                    <div style={{ fontSize: 11.5, fontWeight: 700, lineHeight: 1.3 }}>
                      {entry.school.trim()}
                    </div>
                  )}
                  {meta && (
                    <div style={{ marginTop: entry.school?.trim() ? 2 : 0, fontSize: 10.5, lineHeight: 1.4, color: "#3f3f46" }}>
                      {meta}
                    </div>
                  )}
                </div>
              );
            })}
          </Section>
        )}

        {projected.skills.length > 0 && (
          <Section title="Skills">
            <p style={{ margin: 0, fontSize: 11, lineHeight: 1.5, color: "#27272a" }}>
              {projected.skills.join(", ")}
            </p>
          </Section>
        )}

        {projected.links.length > 0 && (
          <Section title="Links">
            {projected.links.map((link, index) => (
              <div
                key={`${link.label}-${link.url}-${index}`}
                style={{
                  marginTop: index === 0 ? 0 : 5,
                  fontSize: 10.5,
                  lineHeight: 1.45,
                  color: "#27272a",
                  overflowWrap: "anywhere",
                }}
              >
                {[link.label, link.url].filter(Boolean).join(": ")}
              </div>
            ))}
          </Section>
        )}
      </article>
    </div>
  );
}
