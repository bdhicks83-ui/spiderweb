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

// Viridescent palette. @react-pdf/renderer resolves styles in its own PDF
// layout engine and never sees the DOM, so CSS custom properties are
// unavailable here — these are hex literals mirrored VERBATIM from
// src/styles/theme.css (same copy-don't-import doctrine as
// src/remotion/brand/tokens.ts). Change a value in theme.css → change it here.
const COLORS = {
  ink: "#1b4d49", // --pine
  sub: "#33625d", // --pine-soft
  faint: "#52706c", // --muted
  rule: "#d7ded6", // --line
  accent: "#2f7a56", // --growth
  accentBg: "#e0ede4", // --growth-soft
  accentBorder: "#a9cf8e", // --ok-border
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 34,
    paddingBottom: 32,
    paddingHorizontal: 44,
    fontFamily: "Helvetica",
    fontSize: 9.5,
    color: COLORS.ink,
  },
  name: {
    fontFamily: "Helvetica-Bold",
    fontSize: 20,
    marginBottom: 2,
  },
  titleLine: {
    fontSize: 10.5,
    color: COLORS.sub,
    marginBottom: 2,
  },
  subtitleLine: {
    fontSize: 8.5,
    color: COLORS.faint,
    marginBottom: 8,
  },
  headerRule: {
    borderBottomWidth: 1.5,
    borderBottomColor: COLORS.ink,
    marginBottom: 11,
  },
  section: {
    marginBottom: 9,
  },
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9.5,
    letterSpacing: 1,
    color: COLORS.ink,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  sectionRule: {
    borderBottomWidth: 0.75,
    borderBottomColor: COLORS.rule,
    marginBottom: 6,
  },
  paragraph: {
    fontSize: 9.5,
    lineHeight: 1.4,
    color: COLORS.ink,
  },
  bulletRow: {
    flexDirection: "row",
    marginBottom: 3,
  },
  bulletDot: {
    width: 10,
    fontSize: 9.5,
    color: COLORS.sub,
  },
  bulletText: {
    flex: 1,
    fontSize: 9.5,
    lineHeight: 1.35,
  },
  frameworkRow: {
    marginBottom: 4,
  },
  frameworkName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9.5,
    marginBottom: 1,
  },
  frameworkDesc: {
    fontSize: 9,
    color: COLORS.sub,
    lineHeight: 1.3,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 1,
  },
  tag: {
    fontSize: 8.5,
    color: COLORS.accent,
    backgroundColor: COLORS.accentBg,
    borderWidth: 0.75,
    borderColor: COLORS.accentBorder,
    borderRadius: 3,
    paddingVertical: 2.5,
    paddingHorizontal: 7,
    marginRight: 5,
    marginBottom: 5,
  },
  footer: {
    position: "absolute",
    bottom: 12,
    left: 44,
    right: 44,
    textAlign: "center",
    fontSize: 7,
    color: COLORS.faint,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.rule,
    paddingTop: 5,
  },
});

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.bulletRow} wrap={false}>
      <Text style={styles.bulletDot}>—</Text>
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

export function ResumeDocument({ data }: { data: ResumeData }) {
  const headerMeta = [data.title, data.subtitle].filter(Boolean);

  return (
    <Document title={`${data.name} — Resume`} author="Viridescent">
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
            <View key={i} style={styles.frameworkRow} wrap={false}>
              <Text style={styles.frameworkName}>{f.name}</Text>
              <Text style={styles.frameworkDesc}>{f.description}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section} wrap={false}>
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
          Built with Viridescent — capture and prove your expertise at spiderweb-nine.vercel.app
        </Text>
      </Page>
    </Document>
  );
}
