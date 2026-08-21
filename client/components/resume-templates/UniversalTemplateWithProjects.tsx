import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  Link,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import UniversalTemplateBase from "./UniversalTemplate";
import type { ResumeData, TextStyle } from "./types";
import {
  getResumeProjects,
  projectHasContent,
  splitTechStack,
  type ResumeProjectEntry,
} from "./resumeProjects";

const fallback = StyleSheet.create({
  section: { marginTop: 14 },
  heading: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    marginBottom: 7,
  },
  entry: { marginBottom: 10 },
  title: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10.5,
    lineHeight: 1.25,
  },
  tech: {
    marginTop: 2,
    fontFamily: "Helvetica",
    fontSize: 9.5,
    color: "#444444",
  },
  techTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 4,
    marginBottom: 2,
  },
  techTag: {
    paddingVertical: 2,
    paddingHorizontal: 5,
    borderWidth: 0.6,
    borderColor: "#cbd5e1",
    borderRadius: 3,
    backgroundColor: "#f8fafc",
    fontFamily: "Helvetica",
    fontSize: 7.5,
    lineHeight: 1.15,
    color: "#334155",
  },
  body: {
    marginTop: 4,
    fontFamily: "Helvetica",
    fontSize: 9.8,
    lineHeight: 1.4,
  },
  link: {
    marginTop: 3,
    fontFamily: "Helvetica",
    fontSize: 9.2,
    color: "#333333",
    textDecoration: "underline",
  },
});

function pdfTextStyle(
  source: TextStyle | undefined,
  base: Record<string, unknown>,
): Record<string, unknown> {
  if (!source) return base;
  return {
    ...base,
    fontFamily: source.fontFamily,
    fontSize: source.fontSize,
    color: source.color,
    lineHeight: source.lineHeight,
    letterSpacing: source.letterSpacing,
    textAlign: source.textAlign,
    textTransform: source.textTransform,
    marginTop: source.marginTop,
    marginBottom: source.marginBottom,
  };
}

function href(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function ProjectTechTagsPDF({
  project,
  data,
}: {
  project: ResumeProjectEntry;
  data: ResumeData;
}) {
  const tags = splitTechStack(project.techStack);
  if (!tags.length) return null;

  const source = data.design?.entryOrg;
  const fontFamily = source?.fontFamily ?? "Helvetica";
  const color = source?.color ?? "#334155";

  return (
    <View style={fallback.techTags}>
      {tags.map((tag, index) => (
        <Text
          key={`${project.id}-tech-${index}-${tag}`}
          style={[
            fallback.techTag,
            {
              fontFamily,
              color,
            },
          ]}
        >
          {tag}
        </Text>
      ))}
    </View>
  );
}

function ProjectLinks({ project, data }: {
  project: ResumeProjectEntry;
  data: ResumeData;
}) {
  const links = [project.githubUrl, project.liveUrl].map(value => value.trim()).filter(Boolean);
  if (!links.length) return null;

  const style = pdfTextStyle(data.design?.linkItem, fallback.link as unknown as Record<string, unknown>);

  return (
    <View>
      {links.map((url, index) => (
        <Link key={`${url}-${index}`} src={href(url)} style={style}>
          {url}
        </Link>
      ))}
    </View>
  );
}

function ProjectsPDFSection({ data }: { data: ResumeData }) {
  const projects = getResumeProjects(data).filter(projectHasContent);
  if (!projects.length || data.design?.hiddenSections?.includes("projects" as never)) {
    return null;
  }

  const headingStyle = pdfTextStyle(
    data.design?.sectionHeading,
    fallback.heading as unknown as Record<string, unknown>,
  );
  const titleStyle = pdfTextStyle(
    data.design?.entryTitle,
    fallback.title as unknown as Record<string, unknown>,
  );
  const bodyStyle = pdfTextStyle(
    data.design?.entryBullet,
    fallback.body as unknown as Record<string, unknown>,
  );

  return (
    <View style={fallback.section}>
      <Text style={headingStyle}>Projects</Text>
      {projects.map(project => (
        <View key={project.id} style={fallback.entry} wrap={false}>
          <Text style={titleStyle}>{project.title || "Project"}</Text>
          <ProjectTechTagsPDF project={project} data={data} />
          {!!project.description.trim() && (
            <Text style={bodyStyle}>{project.description.trim()}</Text>
          )}
          <ProjectLinks project={project} data={data} />
        </View>
      ))}
    </View>
  );
}

/**
 * Compatibility wrapper around the existing Designed-PDF renderer.
 *
 * The legacy UniversalTemplate source is intentionally left untouched. This wrapper
 * preserves its entire Document/Page tree and appends the new first-class Projects
 * section to the last flowing Page. React-PDF then handles page wrapping normally.
 */
export default function UniversalTemplateWithProjects({ data }: { data: ResumeData }) {
  const projects = getResumeProjects(data).filter(projectHasContent);
  if (!projects.length) {
    return <UniversalTemplateBase data={data} />;
  }

  const base = UniversalTemplateBase({ data }) as ReactElement<{ children?: ReactNode }>;
  if (!isValidElement(base)) return <UniversalTemplateBase data={data} />;

  const documentChildren = Children.toArray(base.props.children);
  let lastPageIndex = -1;
  documentChildren.forEach((child, index) => {
    if (isValidElement(child)) lastPageIndex = index;
  });

  if (lastPageIndex < 0) return <UniversalTemplateBase data={data} />;

  const nextChildren = documentChildren.map((child, index) => {
    if (index !== lastPageIndex || !isValidElement(child)) return child;

    const page = child as ReactElement<{ children?: ReactNode }>;
    return cloneElement(
      page,
      page.props,
      ...Children.toArray(page.props.children),
      <ProjectsPDFSection key="shared-projects" data={data} />,
    );
  });

  return cloneElement(base, base.props, ...nextChildren);
}
