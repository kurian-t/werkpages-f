import { Document, Page, Text, View, Link, Image } from "@react-pdf/renderer";
import { DEFAULT_DESIGN } from "./defaults";
import type { ResumeData, ResumeDesign, TextStyle, WorkEntry } from "./types";
import { formatDateRange, formatEduYears } from "./types";
import { companyLogoDomain } from "@/lib/utils";

const LOGO_TOKEN = "pk_MXSjJV-uTC6-L5D_FbXZUA";
function entryLogoSrc(e: WorkEntry): string {
  return e.logoUrl ?? `https://img.logo.dev/${companyLogoDomain(e.company)}?token=${LOGO_TOKEN}`;
}

// ── Style helper ──────────────────────────────────────────────────────────────
// Converts a TextStyle object to a react-pdf-compatible style object.
// Strips zero-width borders and transparent colours to avoid PDF artefacts.

type PS = Record<string, any>;

function ts(style: TextStyle, extra?: PS): PS {
  const out: PS = {};
  for (const [k, v] of Object.entries(style)) {
    if ((k === "backgroundColor" || k === "borderBottomColor") && v === "transparent") continue;
    if (k === "borderBottomWidth" && v === 0) continue;
    out[k] = v;
  }
  return extra ? { ...out, ...extra } : out;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type SectionId = "work" | "education" | "skills" | "bio" | "links";

const SECTION_LABELS: Record<SectionId, string> = {
  work:      "Experience",
  education: "Education",
  skills:    "Skills",
  bio:       "Summary",
  links:     "Links",
};

const ALL_SECTIONS: SectionId[] = ["work", "education", "skills", "bio", "links"];

function sectionHasContent(id: SectionId, data: ResumeData): boolean {
  switch (id) {
    case "work":      return data.workEntries.length > 0;
    case "education": return data.education.length > 0;
    case "skills":    return data.skills.length > 0;
    case "bio":       return data.summary.trim().length > 0;
    case "links":     return data.extraLinks.length > 0;
  }
}

function getOrderedSections(d: ResumeDesign): SectionId[] {
  const ordered: SectionId[] = [];
  for (const id of d.sectionOrder) {
    if (ALL_SECTIONS.includes(id as SectionId) && !d.hiddenSections.includes(id)) {
      ordered.push(id as SectionId);
    }
  }
  for (const id of ALL_SECTIONS) {
    if (!ordered.includes(id) && !d.hiddenSections.includes(id)) {
      ordered.push(id);
    }
  }
  return ordered;
}

// ── HTML body → PDF blocks ────────────────────────────────────────────────────
// Parses a limited subset of Tiptap HTML output into react-pdf components.
// Handles: <p>, <ul>/<ol>/<li>, <strong>, <em>, <u>, <br>.
// Inline styles (font-size, font-family from Tiptap TextStyle) are parsed and applied.

type Span = { text: string; bold?: boolean; italic?: boolean; underline?: boolean; fontSize?: number };
type Block = { type: "p" | "li"; ordered?: boolean; spans: Span[]; align?: string };

function parseHtmlBody(html: string): Block[] {
  if (typeof document === "undefined") return [];
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  const blocks: Block[] = [];

  function parseInline(node: ChildNode, bold = false, italic = false, underline = false): Span[] {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      return text ? [{ text, bold: bold || undefined, italic: italic || undefined, underline: underline || undefined }] : [];
    }
    const el = node as HTMLElement;
    const tag = el.tagName?.toLowerCase();
    const b = bold || tag === "strong" || tag === "b";
    const i = italic || tag === "em" || tag === "i";
    const u = underline || tag === "u";
    const styleAttr = el.style?.fontSize ?? "";
    const fs = styleAttr ? parseFloat(styleAttr) : undefined;
    const spans: Span[] = [];
    for (const child of el.childNodes) {
      const childSpans = parseInline(child, b, i, u);
      if (fs) childSpans.forEach(s => { s.fontSize = s.fontSize ?? fs; });
      spans.push(...childSpans);
    }
    if (tag === "br") spans.push({ text: "\n" });
    return spans;
  }

  function walkBlock(el: Element, ordered = false) {
    const tag = el.tagName?.toLowerCase();
    if (tag === "ul" || tag === "ol") {
      for (const child of el.children) walkBlock(child, tag === "ol");
      return;
    }
    if (tag === "li") {
      blocks.push({ type: "li", ordered, spans: parseInline(el), align: (el as HTMLElement).style?.textAlign || undefined });
      return;
    }
    if (tag === "p" || tag === "div" || !tag) {
      const spans = parseInline(el);
      if (spans.length > 0 || blocks.length === 0) {
        blocks.push({ type: "p", spans, align: (el as HTMLElement).style?.textAlign || undefined });
      }
      return;
    }
  }

  for (const child of tmp.children) walkBlock(child);
  return blocks;
}

function BodyLines({ body, d }: { body?: string; d: ResumeDesign }) {
  if (!body) return null;
  const blocks = parseHtmlBody(body);
  if (blocks.length === 0) return null;
  const baseSt: PS = { ...ts(d.entryBullet), flex: 1, marginLeft: 0, marginBottom: 0 };
  const markerSt: PS = { width: d.bulletMarkerWidth, color: d.bulletMarkerColor, fontFamily: d.entryBullet.fontFamily, fontSize: d.entryBullet.fontSize };
  let orderedIdx = 0;
  return (
    <>
      {blocks.map((block, i) => {
        if (block.type === "li") {
          const marker = block.ordered ? `${++orderedIdx}.` : d.bulletMarkerChar;
          return (
            <View key={i} style={{ flexDirection: "row", marginBottom: d.entryBullet.marginBottom || 1 }}>
              <Text style={markerSt}>{marker}</Text>
              <Text style={{ ...baseSt, textAlign: (block.align as any) || "left" }}>
                {block.spans.map((s, j) => (
                  <Text key={j} style={{ fontWeight: s.bold ? "bold" : undefined, fontStyle: s.italic ? "italic" : undefined, textDecoration: s.underline ? "underline" : undefined, fontSize: s.fontSize || undefined }}>{s.text}</Text>
                ))}
              </Text>
            </View>
          );
        }
        return (
          <Text key={i} style={{ ...baseSt, textAlign: (block.align as any) || "left", marginBottom: 2 }}>
            {block.spans.map((s, j) => (
              <Text key={j} style={{ fontWeight: s.bold ? "bold" : undefined, fontStyle: s.italic ? "italic" : undefined, textDecoration: s.underline ? "underline" : undefined, fontSize: s.fontSize || undefined }}>{s.text}</Text>
            ))}
          </Text>
        );
      })}
    </>
  );
}

// ── Section heading ───────────────────────────────────────────────────────────

function SectionHeading({ title, d }: { title: string; d: ResumeDesign }) {
  return (
    <View>
      <Text style={ts(d.sectionHeading)}>{title}</Text>
      {d.sectionRuleShow && (
        <View style={{
          borderBottomWidth: d.sectionRuleThickness || 1,
          borderBottomColor: d.sectionRuleColor,
          marginTop: d.sectionRuleMarginTop,
          marginBottom: d.sectionRuleMarginBottom,
        }} />
      )}
    </View>
  );
}

// ── Section content renderers ─────────────────────────────────────────────────

function WorkContent({ data, d }: { data: ResumeData; d: ResumeDesign }) {
  return (
    <>
      {data.workEntries.map((e, i) => (
        <View key={i} style={{ marginBottom: d.entrySpacing }}>
          {d.entryDate.position === "right" ? (
            <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
              <Text style={{ ...ts(d.entryTitle), flex: 1, marginRight: 8 }}>{e.title}</Text>
              <Text style={{ ...ts(d.entryDate), flexShrink: 0 }}>
                {formatDateRange(e.startDate, e.endDate, e.current)}
              </Text>
            </View>
          ) : (
            <Text style={ts(d.entryTitle)}>{e.title}</Text>
          )}
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            {d.showCompanyLogos && e.company && (
              <Image src={entryLogoSrc(e)} style={{ width: 14, height: 14, marginRight: 4, borderRadius: 2 }} />
            )}
            <Text style={ts(d.entryOrg)}>{e.company}</Text>
          </View>
          {d.entryDate.position === "below" && formatDateRange(e.startDate, e.endDate, e.current) && (
            <Text style={ts(d.entryDate)}>{formatDateRange(e.startDate, e.endDate, e.current)}</Text>
          )}
          <BodyLines body={e.body} d={d} />
        </View>
      ))}
    </>
  );
}

function EduContent({ data, d }: { data: ResumeData; d: ResumeDesign }) {
  return (
    <>
      {data.education.map((e, i) => (
        <View key={i} style={{ marginBottom: d.entrySpacing }}>
          {d.entryDate.position === "right" ? (
            <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
              <Text style={{ ...ts(d.entryTitle), flex: 1, marginRight: 8 }}>{e.school}</Text>
              <Text style={{ ...ts(d.entryDate), flexShrink: 0 }}>
                {formatEduYears(e.startYear, e.endYear, e.current)}
              </Text>
            </View>
          ) : (
            <Text style={ts(d.entryTitle)}>{e.school}</Text>
          )}
          {(e.degree || e.field) && (
            <Text style={ts(d.entryOrg)}>{[e.degree, e.field].filter(Boolean).join(", ")}</Text>
          )}
          {d.entryDate.position === "below" && formatEduYears(e.startYear, e.endYear, e.current) && (
            <Text style={ts(d.entryDate)}>{formatEduYears(e.startYear, e.endYear, e.current)}</Text>
          )}
        </View>
      ))}
    </>
  );
}

function SkillsContent({ data, d }: { data: ResumeData; d: ResumeDesign }) {
  const { skillDisplay, skillItem, skillGridColumns } = d;

  if (skillDisplay === "tags") {
    return (
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {data.skills.map((sk, i) => <Text key={i} style={ts(skillItem)}>{sk}</Text>)}
      </View>
    );
  }

  if (skillDisplay === "inline") {
    return <Text style={ts(skillItem)}>{data.skills.join(" · ")}</Text>;
  }

  if (skillDisplay === "grid") {
    const rows: string[][] = [];
    for (let i = 0; i < data.skills.length; i += skillGridColumns) {
      rows.push(data.skills.slice(i, i + skillGridColumns));
    }
    return (
      <>
        {rows.map((row, ri) => (
          <View key={ri} style={{ flexDirection: "row" }}>
            {row.map((sk, ci) => <Text key={ci} style={{ ...ts(skillItem), flex: 1 }}>{sk}</Text>)}
          </View>
        ))}
      </>
    );
  }

  // list
  const markerSt: PS = {
    width: d.bulletMarkerWidth,
    color: d.bulletMarkerColor,
    fontFamily: skillItem.fontFamily,
    fontSize: skillItem.fontSize,
  };
  return (
    <>
      {data.skills.map((sk, i) => (
        <View key={i} style={{ flexDirection: "row", marginBottom: 2 }}>
          <Text style={markerSt}>{d.bulletMarkerChar}</Text>
          <Text style={ts(skillItem)}>{sk}</Text>
        </View>
      ))}
    </>
  );
}

function BioContent({ data, d }: { data: ResumeData; d: ResumeDesign }) {
  return <Text style={ts(d.summary)}>{data.summary}</Text>;
}

function LinksContent({ data, d }: { data: ResumeData; d: ResumeDesign }) {
  return (
    <>
      {data.extraLinks.filter(lnk => lnk.label || lnk.url).map((lnk, i) => (
        <Text key={i} style={ts(d.linkItem)}>
          {lnk.url
            ? <Link src={lnk.url}>{lnk.label || lnk.url}</Link>
            : lnk.label}
        </Text>
      ))}
    </>
  );
}

function SectionContent({ id, data, d }: { id: SectionId; data: ResumeData; d: ResumeDesign }) {
  switch (id) {
    case "work":      return <WorkContent data={data} d={d} />;
    case "education": return <EduContent data={data} d={d} />;
    case "skills":    return <SkillsContent data={data} d={d} />;
    case "bio":       return <BioContent data={data} d={d} />;
    case "links":     return <LinksContent data={data} d={d} />;
  }
}

// Full section block: heading + rule + content
function Section({ id, data, d }: { id: SectionId; data: ResumeData; d: ResumeDesign }) {
  if (!sectionHasContent(id, data)) return null;
  return (
    <View>
      <SectionHeading title={SECTION_LABELS[id]} d={d} />
      <SectionContent id={id} data={data} d={d} />
    </View>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────

function Header({ data, d }: { data: ResumeData; d: ResumeDesign }) {
  const fullName     = `${data.firstName} ${data.lastName}`.trim();
  const contactItems = [data.email, data.phone, data.location, data.website].filter(Boolean) as string[];
  return (
    <View>
      <Text style={ts(d.name)}>{fullName || "Your Name"}</Text>
      {contactItems.length > 0 && (
        <Text style={ts(d.contact)}>{contactItems.join(d.contact.separator)}</Text>
      )}
    </View>
  );
}

// ── Layout: single column ─────────────────────────────────────────────────────

function SingleLayout({ data, d }: { data: ResumeData; d: ResumeDesign }) {
  const sections = getOrderedSections(d);
  return (
    <>
      <Header data={data} d={d} />
      {sections.map(id => <Section key={id} id={id} data={data} d={d} />)}
    </>
  );
}

// ── Layout: sidebar (left or right) ──────────────────────────────────────────
// Page is rendered with flexDirection:"row". Sidebar handles its own padding.

function SidebarLayout({ side, data, d }: { side: "left" | "right"; data: ResumeData; d: ResumeDesign }) {
  const sections  = getOrderedSections(d);
  const inSidebar = sections.filter(id =>  d.sidebarSections.includes(id));
  const inMain    = sections.filter(id => !d.sidebarSections.includes(id));
  const innerGap  = Math.max(d.columnGap, 16);

  const fullName     = `${data.firstName} ${data.lastName}`.trim();
  const contactItems = [data.email, data.phone, data.location, data.website].filter(Boolean) as string[];

  const sidebarView = (
    <View style={{
      width: `${d.sidebarWidth}%`,
      backgroundColor: d.sidebarBackground === "transparent" ? undefined : d.sidebarBackground,
      paddingTop:    d.pageMarginTop,
      paddingBottom: d.pageMarginBottom,
      paddingLeft:   side === "left" ? d.pageMarginLeft : innerGap,
      paddingRight:  side === "left" ? innerGap          : d.pageMarginRight,
    }}>
      <Text style={ts(d.name)}>{fullName || "Your Name"}</Text>
      {contactItems.length > 0 && (
        <Text style={ts(d.contact)}>{contactItems.join(d.contact.separator)}</Text>
      )}
      {inSidebar.map(id => <Section key={id} id={id} data={data} d={d} />)}
    </View>
  );

  const mainView = (
    <View style={{
      flex: 1,
      paddingTop:    d.pageMarginTop,
      paddingBottom: d.pageMarginBottom,
      paddingLeft:   side === "left" ? innerGap          : d.pageMarginLeft,
      paddingRight:  side === "left" ? d.pageMarginRight : innerGap,
    }}>
      {inMain.map(id => <Section key={id} id={id} data={data} d={d} />)}
    </View>
  );

  return side === "left"
    ? <>{sidebarView}{mainView}</>
    : <>{mainView}{sidebarView}</>;
}

// ── Layout: two column ────────────────────────────────────────────────────────

function TwoColumnLayout({ data, d }: { data: ResumeData; d: ResumeDesign }) {
  const sections      = getOrderedSections(d);
  const mid           = Math.ceil(sections.length / 2);
  const leftSections  = sections.slice(0, mid);
  const rightSections = sections.slice(mid);
  const gap           = Math.max(d.columnGap, 20);

  return (
    <>
      <Header data={data} d={d} />
      <View style={{ flexDirection: "row" }}>
        <View style={{ flex: 1, marginRight: gap / 2 }}>
          {leftSections.map(id => <Section key={id} id={id} data={data} d={d} />)}
        </View>
        <View style={{ flex: 1, marginLeft: gap / 2 }}>
          {rightSections.map(id => <Section key={id} id={id} data={data} d={d} />)}
        </View>
      </View>
    </>
  );
}

// ── Layout: label (narrow label column + wide content column) ─────────────────

function LabelLayout({ data, d }: { data: ResumeData; d: ResumeDesign }) {
  const sections = getOrderedSections(d);
  const fullName     = `${data.firstName} ${data.lastName}`.trim();
  const contactItems = [data.email, data.phone, data.location, data.website].filter(Boolean) as string[];

  return (
    <>
      <Text style={ts(d.name)}>{fullName || "Your Name"}</Text>
      {contactItems.length > 0 && (
        <Text style={ts(d.contact)}>{contactItems.join(d.contact.separator)}</Text>
      )}
      {sections.filter(id => sectionHasContent(id, data)).map(id => (
        <View key={id} style={{ flexDirection: "row", marginTop: d.sectionHeading.marginTop || 0 }}>
          <View style={{ width: d.sidebarWidth, paddingTop: 1.5 }}>
            <Text style={{ ...ts(d.sectionHeading), marginTop: 0 }}>{SECTION_LABELS[id]}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: d.columnGap }}>
            <SectionContent id={id} data={data} d={d} />
          </View>
        </View>
      ))}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function UniversalTemplate({ data }: { data: ResumeData }) {
  const d: ResumeDesign = data.design ?? DEFAULT_DESIGN;
  const isSidebar       = d.layout === "sidebar-left" || d.layout === "sidebar-right";

  return (
    <Document>
      <Page
        size={d.pageSize}
        style={{
          fontFamily:      "Helvetica",
          fontSize:        10,
          backgroundColor: d.pageBackground,
          // Sidebar layouts go full-bleed; each column manages its own padding
          ...(isSidebar
            ? { flexDirection: "row" }
            : {
                paddingTop:    d.pageMarginTop,
                paddingBottom: d.pageMarginBottom,
                paddingLeft:   d.pageMarginLeft,
                paddingRight:  d.pageMarginRight,
              }),
        }}
      >
        {d.layout === "single"        && <SingleLayout     data={data} d={d} />}
        {d.layout === "sidebar-left"  && <SidebarLayout side="left"  data={data} d={d} />}
        {d.layout === "sidebar-right" && <SidebarLayout side="right" data={data} d={d} />}
        {d.layout === "two-column"    && <TwoColumnLayout  data={data} d={d} />}
        {d.layout === "label"         && <LabelLayout      data={data} d={d} />}
      </Page>
    </Document>
  );
}
