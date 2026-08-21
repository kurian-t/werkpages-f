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
import {
  atsBlocksFromHtml,
  projectResumeToATS,
} from "./resumeATS";

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
  const projected = projectResumeToATS(data);
  const size = data.design?.pageSize === "A4" ? "A4" : "LETTER";

  return (
    <Document
      title={projected.fullName ? `${projected.fullName} Resume` : "Resume"}
      author={projected.fullName}
      subject="ATS-friendly resume"
    >
      <Page size={size} style={styles.page}>
        {(projected.fullName || projected.contact.length > 0) && (
          <View>
            {!!projected.fullName && (
              <Text style={styles.name}>{projected.fullName}</Text>
            )}
            {projected.contact.length > 0 && (
              <Text
                style={{
                  ...styles.contact,
                  marginTop: projected.fullName ? styles.contact.marginTop : 0,
                }}
              >
                {projected.contact.join(" · ")}
              </Text>
            )}
          </View>
        )}

        {!!projected.summary && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Professional Summary</Text>
            <Text style={styles.summary}>{projected.summary}</Text>
          </View>
        )}

        {projected.work.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Professional Experience</Text>
            {projected.work.map((entry, index) => {
              const dates = formatDateRange(entry.startDate, entry.endDate, entry.current);
              const meta = [entry.company?.trim(), dates].filter(Boolean).join(" · ");
              return (
                <View key={entry.id ?? index} style={styles.entry}>
                  {!!entry.title?.trim() && (
                    <Text style={styles.entryTitle}>{entry.title.trim()}</Text>
                  )}
                  {!!meta && (
                    <Text
                      style={{
                        ...styles.meta,
                        marginTop: entry.title?.trim() ? styles.meta.marginTop : 0,
                      }}
                    >
                      {meta}
                    </Text>
                  )}
                  <ATSBodyPDF html={entry.body} />
                </View>
              );
            })}
          </View>
        )}

        {projected.projects.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Projects</Text>
            {projected.projects.map(project => {
              const urls = [project.githubUrl, project.liveUrl]
                .map(value => value.trim())
                .filter(Boolean);
              return (
                <View key={project.id} style={styles.entry}>
                  {!!project.title.trim() && (
                    <Text style={styles.entryTitle}>{project.title.trim()}</Text>
                  )}
                  {!!project.techStack.trim() && (
                    <Text
                      style={{
                        ...styles.meta,
                        marginTop: project.title.trim() ? styles.meta.marginTop : 0,
                      }}
                    >
                      {project.techStack.trim()}
                    </Text>
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

        {projected.education.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Education</Text>
            {projected.education.map((entry, index) => {
              const years = formatEduYears(entry.startYear, entry.endYear, entry.current);
              const credential = [entry.degree?.trim(), entry.field?.trim()].filter(Boolean).join(" — ");
              const meta = [credential, years].filter(Boolean).join(" · ");
              return (
                <View key={entry.id ?? index} style={styles.entry}>
                  {!!entry.school?.trim() && (
                    <Text style={styles.entryTitle}>{entry.school.trim()}</Text>
                  )}
                  {!!meta && (
                    <Text
                      style={{
                        ...styles.meta,
                        marginTop: entry.school?.trim() ? styles.meta.marginTop : 0,
                      }}
                    >
                      {meta}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {projected.skills.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Skills</Text>
            <Text style={styles.skills}>{projected.skills.join(", ")}</Text>
          </View>
        )}

        {projected.links.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Links</Text>
            {projected.links.map((link, index) => (
              <Text key={`${link.label}-${link.url}-${index}`} style={styles.link}>
                {[link.label, link.url].filter(Boolean).join(": ")}
              </Text>
            ))}
          </View>
        )}
      </Page>
    </Document>
  );
}
