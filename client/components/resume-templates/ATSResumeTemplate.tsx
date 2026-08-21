import {
  Document,
  Page,
  Link,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { ResumeData } from "./types";
import { formatDateRange, formatEduYears } from "./types";
import { atsBlocksFromHtml } from "./resumeATS";
import { getResumeProjects, projectHasContent } from "./resumeProjects";

const styles = StyleSheet.create({
  page: {
    paddingTop: 38,
    paddingBottom: 42,
    paddingHorizontal: 44,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#111111",
    lineHeight: 1.35,
  },
  name: {
    fontFamily: "Helvetica-Bold",
    fontSize: 21,
    lineHeight: 1.1,
  },
  contact: {
    marginTop: 5,
    fontSize: 9.5,
    color: "#333333",
    lineHeight: 1.35,
  },
  section: {
    marginTop: 16,
  },
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    textTransform: "uppercase",
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 0.6,
    borderBottomColor: "#999999",
  },
  summary: {
    fontSize: 10,
    lineHeight: 1.4,
  },
  entry: {
    marginBottom: 10,
  },
  entryTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10.5,
    lineHeight: 1.25,
  },
  meta: {
    marginTop: 2,
    fontSize: 9.5,
    color: "#333333",
  },
  paragraph: {
    marginTop: 4,
    fontSize: 9.8,
    lineHeight: 1.4,
  },
  bulletRow: {
    marginTop: 3,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  bullet: {
    width: 10,
    fontSize: 9.8,
  },
  bulletText: {
    flex: 1,
    fontSize: 9.8,
    lineHeight: 1.4,
  },
  skills: {
    fontSize: 10,
    lineHeight: 1.4,
  },
  link: {
    marginBottom: 3,
    fontSize: 9.5,
    lineHeight: 1.35,
  },
  projectLink: {
    marginTop: 3,
    fontSize: 9.3,
    color: "#222222",
    textDecoration: "underline",
  },
});

function ATSBodyPDF({ html }: { html?: string }) {
  const blocks = atsBlocksFromHtml(html);
  if (blocks.length === 0) return null;

  return (
    <View>
      {blocks.map((block, index) =>
        block.kind === "bullet" ? (
          <View key={index} style={styles.bulletRow}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.bulletText}>{block.text}</Text>
          </View>
        ) : (
          <Text key={index} style={styles.paragraph}>{block.text}</Text>
        )
      )}
    </View>
  );
}

function normalizedHref(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export default function ATSResumeTemplate({ data }: { data: ResumeData }) {
  const contact = [
    data.email?.trim(),
    data.phone?.trim(),
    data.location?.trim(),
    data.website?.trim(),
  ].filter(Boolean) as string[];

  const projects = getResumeProjects(data).filter(projectHasContent);
  const size = data.design?.pageSize === "A4" ? "A4" : "LETTER";

  return (
    <Document
      title={`${data.firstName ?? ""} ${data.lastName ?? ""} Resume`.trim()}
      author={`${data.firstName ?? ""} ${data.lastName ?? ""}`.trim()}
      subject="ATS-friendly resume"
    >
      <Page size={size} style={styles.page}>
        <View>
          <Text style={styles.name}>
            {`${data.firstName ?? ""} ${data.lastName ?? ""}`.trim() || "Your Name"}
          </Text>
          {contact.length > 0 && (
            <Text style={styles.contact}>{contact.join(" · ")}</Text>
          )}
        </View>

        {data.summary?.trim() && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Professional Summary</Text>
            <Text style={styles.summary}>{data.summary.trim()}</Text>
          </View>
        )}

        {(data.workEntries ?? []).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Professional Experience</Text>
            {(data.workEntries ?? []).map((entry, index) => {
              const dates = formatDateRange(entry.startDate, entry.endDate, entry.current);
              return (
                <View key={entry.id ?? index} style={styles.entry}>
                  <Text style={styles.entryTitle}>{entry.title || "Role"}</Text>
                  <Text style={styles.meta}>
                    {[entry.company, dates].filter(Boolean).join(" · ")}
                  </Text>
                  <ATSBodyPDF html={entry.body} />
                </View>
              );
            })}
          </View>
        )}

        {projects.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Projects</Text>
            {projects.map(project => {
              const urls = [project.githubUrl, project.liveUrl]
                .map(value => value.trim())
                .filter(Boolean);
              return (
                <View key={project.id} style={styles.entry}>
                  <Text style={styles.entryTitle}>{project.title || "Project"}</Text>
                  {!!project.techStack.trim() && (
                    <Text style={styles.meta}>{project.techStack.trim()}</Text>
                  )}
                  {!!project.description.trim() && (
                    <Text style={styles.paragraph}>{project.description.trim()}</Text>
                  )}
                  {urls.map((url, index) => (
                    <Link
                      key={`${project.id}-url-${index}`}
                      src={normalizedHref(url)}
                      style={styles.projectLink}
                    >
                      {url}
                    </Link>
                  ))}
                </View>
              );
            })}
          </View>
        )}

        {(data.education ?? []).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Education</Text>
            {(data.education ?? []).map((entry, index) => {
              const years = formatEduYears(entry.startYear, entry.endYear, entry.current);
              const credential = [entry.degree, entry.field].filter(Boolean).join(" — ");
              return (
                <View key={entry.id ?? index} style={styles.entry}>
                  <Text style={styles.entryTitle}>{entry.school || "School"}</Text>
                  {(credential || years) && (
                    <Text style={styles.meta}>
                      {[credential, years].filter(Boolean).join(" · ")}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {(data.skills ?? []).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Skills</Text>
            <Text style={styles.skills}>{(data.skills ?? []).join(", ")}</Text>
          </View>
        )}

        {(data.extraLinks ?? []).some(link => link?.label?.trim() || link?.url?.trim()) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Links</Text>
            {(data.extraLinks ?? []).map((link, index) => {
              if (!link?.label?.trim() && !link?.url?.trim()) return null;
              return (
                <Text key={index} style={styles.link}>
                  {[link.label?.trim(), link.url?.trim()].filter(Boolean).join(": ")}
                </Text>
              );
            })}
          </View>
        )}
      </Page>
    </Document>
  );
}
