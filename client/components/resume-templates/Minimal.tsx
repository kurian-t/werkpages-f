import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { ResumeData, formatDateRange, formatEduYears } from "./types";

const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10, color: "#222", paddingTop: 52, paddingBottom: 52, paddingHorizontal: 60, backgroundColor: "#ffffff" },
  name: { fontSize: 28, fontFamily: "Helvetica-Bold", color: "#111", marginBottom: 4 },
  contact: { flexDirection: "row", flexWrap: "wrap", gap: 14, fontSize: 9, color: "#777", marginBottom: 28 },
  secGroup: { flexDirection: "row", marginBottom: 20 },
  secLabel: { width: 110, fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#999", textTransform: "uppercase", letterSpacing: 1, paddingTop: 1.5 },
  secContent: { flex: 1 },
  summary: { color: "#333", lineHeight: 1.7, fontSize: 10 },
  entryTitle: { fontFamily: "Helvetica-Bold", color: "#111", fontSize: 10 },
  entryMeta: { color: "#777", fontSize: 9, marginTop: 1, marginBottom: 4 },
  entry: { marginBottom: 12 },
  bullet: { flexDirection: "row", marginBottom: 1 },
  dot: { width: 10, color: "#aaa" },
  bText: { flex: 1, color: "#444", lineHeight: 1.3 },
  skillList: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  skill: { fontSize: 9.5, color: "#444" },
});

function Bullets({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <>
      {text.split("\n").map(l => l.trim()).filter(Boolean).map((line, i) => (
        <View key={i} style={s.bullet}>
          <Text style={s.dot}>–</Text>
          <Text style={s.bText}>{line}</Text>
        </View>
      ))}
    </>
  );
}

export default function Minimal({ data }: { data: ResumeData }) {
  const fullName = `${data.firstName} ${data.lastName}`.trim();
  const contactItems = [data.email, data.phone, data.location, data.website].filter(Boolean) as string[];

  return (
    <Document>
      <Page size="LETTER" style={s.page}>

        <Text style={s.name}>{fullName}</Text>
        {contactItems.length > 0 && (
          <View style={s.contact}>
            {contactItems.map((item, i) => <Text key={i}>{item}</Text>)}
          </View>
        )}

        {data.summary.trim() && (
          <View style={s.secGroup}>
            <Text style={s.secLabel}>About</Text>
            <View style={s.secContent}>
              <Text style={s.summary}>{data.summary}</Text>
            </View>
          </View>
        )}

        {data.workEntries.length > 0 && (
          <View style={s.secGroup}>
            <Text style={s.secLabel}>Experience</Text>
            <View style={s.secContent}>
              {data.workEntries.map((e, i) => (
                <View key={i} style={s.entry}>
                  <Text style={s.entryTitle}>{e.title}</Text>
                  <Text style={s.entryMeta}>
                    {e.company}{" "}
                    {formatDateRange(e.startDate, e.endDate, e.current) && `· ${formatDateRange(e.startDate, e.endDate, e.current)}`}
                  </Text>
                  <Bullets text={(e.bullets ?? []).map(b => b.text).filter(Boolean).join("\n")} />
                </View>
              ))}
            </View>
          </View>
        )}

        {data.education.length > 0 && (
          <View style={s.secGroup}>
            <Text style={s.secLabel}>Education</Text>
            <View style={s.secContent}>
              {data.education.map((e, i) => (
                <View key={i} style={s.entry}>
                  <Text style={s.entryTitle}>{e.school}</Text>
                  <Text style={s.entryMeta}>
                    {[e.degree, e.field].filter(Boolean).join(", ")}
                    {formatEduYears(e.startYear, e.endYear, e.current) && ` · ${formatEduYears(e.startYear, e.endYear, e.current)}`}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {data.skills.length > 0 && (
          <View style={s.secGroup}>
            <Text style={s.secLabel}>Skills</Text>
            <View style={[s.secContent, { paddingTop: 1 }]}>
              <View style={s.skillList}>
                {data.skills.map((sk, i) => (
                  <Text key={i} style={s.skill}>
                    {sk}{i < data.skills.length - 1 ? " ·" : ""}
                  </Text>
                ))}
              </View>
            </View>
          </View>
        )}

      </Page>
    </Document>
  );
}
