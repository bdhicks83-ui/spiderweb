// P0 — Framework artifact PDF: a completed Pattern Record rendered as a
// branded, proposal-ready one-pager. Same serverless-safe path as the resume
// builder (@react-pdf/renderer — no Chromium/Remotion on Vercel).
//
// Co-branding posture (leaning, not locked — see MASTER-STATE.md): the
// framework carries the CONSULTANT'S name; the Viridescent attribution rides
// in the footer. Wording is founder-approval territory — keep changes to the
// footer/attribution lines flagged for Brian.
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { FrameworkArtifact } from "@/lib/elicitation";

export type FrameworkPdfData = {
  consultantName: string;
  consultantTitle: string | null; // e.g. "Operations Consultant"
  framework: FrameworkArtifact;
  contextLine: string | null; // e.g. "Manufacturing · Finance · 200–1000 people"
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
  warn: "#8a5a20", // --warn-text — boundaries, "when NOT to use"
  warnBg: "#fdf3e0", // --warn-bg
  warnBorder: "#ecd9a8", // --warn-border
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 40,
    paddingHorizontal: 48,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: COLORS.ink,
  },
  kicker: {
    fontSize: 8.5,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: COLORS.accent,
    marginBottom: 6,
  },
  name: {
    fontFamily: "Helvetica-Bold",
    fontSize: 24,
    marginBottom: 4,
  },
  tagline: {
    fontSize: 11,
    color: COLORS.sub,
    lineHeight: 1.4,
    marginBottom: 6,
  },
  attribution: {
    fontSize: 9,
    color: COLORS.faint,
    marginBottom: 10,
  },
  headerRule: {
    borderBottomWidth: 2,
    borderBottomColor: COLORS.accent,
    marginBottom: 14,
  },
  section: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: COLORS.ink,
    marginBottom: 5,
  },
  sectionRule: {
    borderBottomWidth: 0.75,
    borderBottomColor: COLORS.rule,
    marginBottom: 7,
  },
  paragraph: {
    fontSize: 10,
    lineHeight: 1.5,
    color: COLORS.ink,
  },
  bulletRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  bulletDot: {
    width: 12,
    fontSize: 10,
    color: COLORS.accent,
  },
  bulletText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 1.45,
  },
  signalsCard: {
    backgroundColor: COLORS.accentBg,
    borderWidth: 1,
    borderColor: COLORS.accentBorder,
    borderRadius: 6,
    padding: 10,
  },
  boundariesCard: {
    backgroundColor: COLORS.warnBg,
    borderWidth: 1,
    borderColor: COLORS.warnBorder,
    borderRadius: 6,
    padding: 10,
  },
  boundariesTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: COLORS.warn,
    marginBottom: 5,
  },
  boundaryDot: {
    width: 12,
    fontSize: 10,
    color: COLORS.warn,
  },
  footer: {
    position: "absolute",
    bottom: 14,
    left: 48,
    right: 48,
    textAlign: "center",
    fontSize: 7.5,
    color: COLORS.faint,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.rule,
    paddingTop: 6,
  },
});

function Bullet({
  text,
  dotStyle,
}: {
  text: string;
  dotStyle?: typeof styles.bulletDot;
}) {
  return (
    <View style={styles.bulletRow} wrap={false}>
      <Text style={dotStyle ?? styles.bulletDot}>■</Text>
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

export function FrameworkDocument({ data }: { data: FrameworkPdfData }) {
  const { framework: f } = data;
  const attribution = [
    `A ${data.consultantName} methodology`,
    data.consultantTitle,
    data.contextLine,
  ]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <Document title={`${f.name} — ${data.consultantName}`} author={data.consultantName}>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.kicker}>Framework</Text>
        <Text style={styles.name}>{f.name}</Text>
        <Text style={styles.tagline}>{f.tagline}</Text>
        <Text style={styles.attribution}>{attribution}</Text>
        <View style={styles.headerRule} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>When to apply</Text>
          <View style={styles.sectionRule} />
          {f.when_to_apply.map((item, i) => (
            <Bullet key={i} text={item} />
          ))}
        </View>

        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>Signals to look for</Text>
          <View style={styles.sectionRule} />
          <View style={styles.signalsCard}>
            {f.signals.map((item, i) => (
              <Bullet key={i} text={item} />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>The play</Text>
          <View style={styles.sectionRule} />
          <Text style={styles.paragraph}>{f.the_play}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Why it works</Text>
          <View style={styles.sectionRule} />
          <Text style={styles.paragraph}>{f.why_it_works}</Text>
        </View>

        <View style={styles.section} wrap={false}>
          <View style={styles.boundariesCard}>
            <Text style={styles.boundariesTitle}>
              Boundaries — when NOT to use this
            </Text>
            {f.boundaries.map((item, i) => (
              <Bullet key={i} text={item} dotStyle={styles.boundaryDot} />
            ))}
          </View>
        </View>

        <Text style={styles.footer} fixed>
          {`${f.name} is proprietary methodology of ${data.consultantName} — codified with Viridescent`}
        </Text>
      </Page>
    </Document>
  );
}
