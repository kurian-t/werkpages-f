import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { ResumeData, formatDateRange, formatEduYears } from "./types";

const SIDEBAR = 170;
const ACCENT  = "#2e0562";

const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10, flexDirection: "row", backgroundColor: "#ffffff" },

  sidebar: { width: SIDEBAR, backgroundColor: "#1a1135", paddingTop: 36, paddingBottom: 36, paddingHorizontal: 18 },
  sName:   { fontSize: 17, fontFamily: "Helvetica-Bold", color: "#ffffff", lineHeight: 1.3, marginBottom: 10 },
  sLabel:  { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#c4b5fd", textTransform: "uppercase", letterSpacing: 1.2, marginTop: 16, marginBottom: 6 },
  sRule:   { borderBottomWidth: 1, borderBottomColor: "#3d2a6e", marginBottom: 8 },
  sText:   { fontSize: 8.5, color: "#d1d5db", lineHeight: 1.6, marginBottom: 3 },
  sBadge:  { backgroundColor: "#3d2a6e", borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 4, alignSelf: "flex-start" },
  sBadgeTxt: { fontSize: 8.5, color: "#e9d5ff" },

  main: { flex: 1, paddingTop: 36, paddingBottom: 36, paddingHorizontal: 24 },
  secTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", color: ACCENT, marginBottom: 3, marginTop: 14 },
  secRule:  { borderBottomWidth: 1.5, borderBottomColor: ACCENT, marginBottom: 8 },
  row:      { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
  jobTitle: { fontFamily: "Helvetica-Bold", color: "#111", fontSize: 10, flex: 1, marginRight: 8 },
  date:     { color: "#888", fontSize: 9, flexShrink: 0 },
  company:  { color: "#555", fontSize: 9, marginBottom: 3 },
  bullet:   { flexDirection: "row", paddingLeft: 8, marginBottom: 1 },
  dot:      { width: 10, color: "#888" },
  bText:    { flex: 1, color: "#333", lineHeight: 1.3 },
  summary:  { color: "#333", lineHeight: 1.6 },
});

function MainSection({ title }: { title: string }) {
  return (
    <View>
      <Text style={s.secTitle}>{title}</Text>
      <View style={s.secRule} />
    </View>
  );
}

function Bullets({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <>
      {text.split("\n").map(l => l.trim()).filter(Boolean).map((line, i) => (
        <View key={i} style={s.bullet}>
          <Text style={s.dot}>•</Text>
          <Text style={s.bText}>{line}</Text>
        </View>
      ))}
    </>
  );
}

export default function Modern({ data }: { data: ResumeData }) {
  const fullName = `${data.firstName} ${data.lastName}`.trim();
  const contactItems = [data.email, data.phone, data.location].filter(Boolean) as string[];

  return (
    <Document>
      <Page size="LETTER" style={s.page}>

        {/* ── Sidebar ── */}
        <View style={s.sidebar}>
          <Text style={s.sName}>{fullName}</Text>

          {contactItems.length > 0 && (
            <>
              <Text style={s.sLabel}>Contact</Text>
              <View style={s.sRule} />
              {contactItems.map((item, i) => <Text key={i} style={s.sText}>{item}</Text>)}
              {data.website && <Text style={s.sText}>{data.website}</Text>}
            </>
          )}

          {data.skills.length > 0 && (
            <>
              <Text style={s.sLabel}>Skills</Text>
              <View style={s.sRule} />
              {data.skills.map((sk, i) => (
                <View key={i} style={s.sBadge}>
                  <Text style={s.sBadgeTxt}>{sk}</Text>
                </View>
              ))}
            </>
          )}

          {data.extraLinks.length > 0 && (
            <>
              <Text style={s.sLabel}>Links</Text>
              <View style={s.sRule} />
              {data.extraLinks.map((lnk, i) => (
                <Text key={i} style={[s.sText, { marginBottom: 4 }]}>
                  {lnk.label}
                </Text>
              ))}
            </>
          )}
        </View>

        {/* ── Main ── */}
        <View style={s.main}>

          {data.summary.trim() && (
            <>
              <MainSection title="Profile" />
              <Text style={s.summary}>{data.summary}</Text>
            </>
          )}

          {data.workEntries.length > 0 && (
            <>
              <MainSection title="Experience" />
              {data.workEntries.map((e, i) => (
                <View key={i} style={{ marginBottom: 10 }}>
                  <View style={s.row}>
                    <Text style={s.jobTitle}>{e.title}</Text>
                    <Text style={s.date}>{formatDateRange(e.startDate, e.endDate, e.current)}</Text>
                  </View>
                  <Text style={s.company}>{e.company}</Text>
                  <Bullets text={(e.bullets ?? []).map(b => b.text).filter(Boolean).join("\n")} />
                </View>
              ))}
            </>
          )}

          {data.education.length > 0 && (
            <>
              <MainSection title="Education" />
              {data.education.map((e, i) => (
                <View key={i} style={{ marginBottom: 8 }}>
                  <View style={s.row}>
                    <Text style={s.jobTitle}>{e.school}</Text>
                    <Text style={s.date}>{formatEduYears(e.startYear, e.endYear, e.current)}</Text>
                  </View>
                  {(e.degree || e.field) && (
                    <Text style={s.company}>{[e.degree, e.field].filter(Boolean).join(", ")}</Text>
                  )}
                </View>
              ))}
            </>
          )}

        </View>
      </Page>
    </Document>
  );
}
