// Resume builder — branded PDF v1 (lead magnet, free tier).
// Single-page-friendly layout: clean header, Summary, Key Experience,
// Frameworks & Strengths. Rendered server-side via @react-pdf/renderer
// (no Chromium/Remotion — confirmed incompatible with Vercel serverless).
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { ResumeFramework } from "@/lib/claude";

export type ResumeData = {
  name: string;
  title: string | null;
  subtitle: string | null; // e.g. "Technology · Executive · 15+ yrs experience"
  email: string;
  summary: string;
  keyExperience: string[];
  frameworks: ResumeFramework[];
  strengths: string[];
};

const COLORS = {
  ink: "#111111",
  sub: "#555555",
  faint: "#888888",
  rule: "#dddddd",
  accent: "#166534",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 44,
    paddingHorizontal: 44,
    fontFamily: "Helvetica",
    fontSize: 9.5,
    color: COLORS.ink,
  },
  name: {
    fontFamily: "Helvetica-Bold",
    fontSize: 22,
    marginBottom: 2,
  },
  titleLine: {
    fontSize: 11,
    color: COLORS.sub,
    marginBottom: 2,
  },
  subtitleLine: {
    fontSize: 9,
    color: COLORS.faint,
    marginBottom: 10,
  },
  headerRule: {
    borderBottomWidth: 1.5,
    borderBottomColor: COLORS.ink,
    marginBottom: 16,
  },
  section: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    letterSpacing: 1,
    color: COLORS.ink,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  sectionRule: {
    borderBottomWidth: 0.75,
    borderBottomColor: COLORS.rule,
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 9.5,
    lineHeight: 1.45,
    color: COLORS.ink,
  },
  bulletRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  bulletDot: {
    width: 10,
    fontSize: 9.5,
    color: COLORS.sub,
  },
  bulletText: {
    flex: 1,
    fontSize: 9.5,
    lineHeight: 1.4,
  },
  frameworkRow: {
    marginBottom: 6,
  },
  frameworkName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9.5,
    marginBottom: 1,
  },
  frameworkDesc: {
    fontSize: 9,
    color: COLORS.sub,
    lineHeight: 1.35,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 2,
  },
  tag: {
    fontSize: 8.5,
    color: COLORS.accent,
    backgroundColor: "#f0fdf4",
    borderWidth: 0.75,
    borderColor: "#bbf7d0",
    borderRadius: 3,
    paddingVertical: 3,
    paddingHorizontal: 7,
    marginRight: 6,
    marginBottom: 6,
  },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 44,
    right: 44,
    textAlign: "center",
    fontSize: 7.5,
    color: COLORS.faint,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.rule,
    paddingTop: 8,
  },
});

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletDot}>—</Text>
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

export function ResumeDocument({ data }: { data: ResumeData }) {
  const headerMeta = [data.title, data.subtitle].filter(Boolean);

  return (
    <Document title={`${data.name} — Resume`} author="Human Bloom">
      <Page size="LETTER" style={styles.page}>
        <View>
          <Text style={styles.name}>{data.name}</Text>
          {headerMeta[0] && <Text style={styles.titleLine}>{headerMeta[0]}</Text>}
          <Text style={styles.subtitleLine}>
            {[headerMeta[1], data.email].filter(Boolean).join("  ·  ")}
          </Text>
        </View>
        <View style={styles.headerRule} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Summary</Text>
          <View style={styles.sectionRule} />
          <Text style={styles.paragraph}>{data.summary}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Key Experience</Text>
          <View style={styles.sectionRule} />
          {data.keyExperience.map((item, i) => (
            <Bullet key={i} text={item} />
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Frameworks</Text>
          <View style={styles.sectionRule} />
          {data.frameworks.map((f, i) => (
            <View key={i} style={styles.frameworkRow}>
              <Text style={styles.frameworkName}>{f.name}</Text>
              <Text style={styles.frameworkDesc}>{f.description}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Strengths</Text>
          <View style={styles.sectionRule} />
          <View style={styles.tagRow}>
            {data.strengths.map((s, i) => (
              <Text key={i} style={styles.tag}>
                {s}
              </Text>
            ))}
          </View>
        </View>

        <Text style={styles.footer} fixed>
          Built with Human Bloom — capture and prove your expertise at spiderweb-nine.vercel.app
        </Text>
      </Page>
    </Document>
  );
}
