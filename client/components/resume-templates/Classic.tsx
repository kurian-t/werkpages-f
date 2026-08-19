import { Document, Page, Text, View, StyleSheet, Link } from "@react-pdf/renderer";
import { ResumeData, formatDateRange, formatEduYears } from "./types";

const C = {
  black:  "#111111",
  dark:   "#222222",
  mid:    "#555555",
  light:  "#888888",
  rule:   "#cccccc",
  white:  "#ffffff",
};

const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10, color: C.dark, paddingTop: 40, paddingBottom: 40, paddingHorizontal: 50, backgroundColor: C.white },
  name: { fontSize: 22, fontFamily: "Helvetica-Bold", color: C.black },
  contact: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4, fontSize: 9, color: C.mid },
  contactSep: { color: C.rule },
  section: { marginTop: 14 },
  sectionTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", color: C.black, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 4 },
  rule: { borderBottomWidth: 1, borderBottomColor: C.rule, marginBottom: 8 },
  entryRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
  entryTitle: { fontFamily: "Helvetica-Bold", color: C.black, fontSize: 10, flex: 1, marginRight: 8 },
  entryDate: { color: C.mid, fontSize: 9, flexShrink: 0 },
  entryCompany: { color: C.mid, fontSize: 9, marginBottom: 3 },
  bullet: { flexDirection: "row", marginBottom: 1, paddingLeft: 8 },
  bulletDot: { width: 10, color: C.mid },
  bulletText: { flex: 1, color: C.dark, lineHeight: 1.3 },
  summary: { color: C.dark, lineHeight: 1.6, marginBottom: 4 },
  skills: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  skill: { backgroundColor: "#f3f4f6", borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2, fontSize: 9, color: C.dark },
});

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.rule} />
    </View>
  );
}

function DescBullets({ text }: { text: string }) {
  if (!text.trim()) return null;
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  return (
    <>
      {lines.map((line, i) => (
        <View key={i} style={s.bullet}>
          <Text style={s.bulletDot}>•</Text>
          <Text style={s.bulletText}>{line}</Text>
        </View>
      ))}
    </>
  );
}

export default function Classic({ data }: { data: ResumeData }) {
  const fullName = `${data.firstName} ${data.lastName}`.trim();
  const contactItems = [data.email, data.phone, data.location, data.website].filter(Boolean) as string[];

  return (
    <Document>
      <Page size="LETTER" style={s.page}>

        {/* Header */}
        <Text style={s.name}>{fullName}</Text>
        {contactItems.length > 0 && (
          <Text style={s.contact}>{contactItems.join(" · ")}</Text>
        )}

        {/* Summary */}
        {data.summary.trim() && (
          <>
            <SectionHeader title="Summary" />
            <Text style={s.summary}>{data.summary}</Text>
          </>
        )}

        {/* Experience */}
        {data.workEntries.length > 0 && (
          <>
            <SectionHeader title="Experience" />
            {data.workEntries.map((e, i) => (
              <View key={i} style={{ marginBottom: 10 }}>
                <View style={s.entryRow}>
                  <Text style={s.entryTitle}>{e.title}</Text>
                  <Text style={s.entryDate}>{formatDateRange(e.startDate, e.endDate, e.current)}</Text>
                </View>
                <Text style={s.entryCompany}>{e.company}</Text>
                <DescBullets text={(e.bullets ?? []).map(b => b.text).filter(Boolean).join("\n")} />
              </View>
            ))}
          </>
        )}

        {/* Education */}
        {data.education.length > 0 && (
          <>
            <SectionHeader title="Education" />
            {data.education.map((e, i) => (
              <View key={i} style={{ marginBottom: 8 }}>
                <View style={s.entryRow}>
                  <Text style={s.entryTitle}>{e.school}</Text>
                  <Text style={s.entryDate}>{formatEduYears(e.startYear, e.endYear, e.current)}</Text>
                </View>
                {(e.degree || e.field) && (
                  <Text style={s.entryCompany}>{[e.degree, e.field].filter(Boolean).join(", ")}</Text>
                )}
              </View>
            ))}
          </>
        )}

        {/* Skills */}
        {data.skills.length > 0 && (
          <>
            <SectionHeader title="Skills" />
            <View style={s.skills}>
              {data.skills.map((sk, i) => (
                <Text key={i} style={s.skill}>{sk}</Text>
              ))}
            </View>
          </>
        )}

        {/* Extra links */}
        {data.extraLinks.length > 0 && (
          <>
            <SectionHeader title="Links" />
            {data.extraLinks.map((lnk, i) => (
              <Text key={i} style={{ fontSize: 9, color: C.mid, marginBottom: 2 }}>
                {lnk.label}: <Link src={lnk.url}>{lnk.url}</Link>
              </Text>
            ))}
          </>
        )}

      </Page>
    </Document>
  );
}
