// TIER 1 / BUILD 3 — the value readout as a branded PDF.
//
// ⭐ THIS FILE IS THE ACTUAL DELIVERABLE OF TIER 1. A pilot does not renew
// because a dashboard looked good; it renews because somebody forwarded two
// pages to a person who was never in the room and that person said yes. Every
// number on these pages has to survive being read by a skeptic with no context
// and no reason to be generous.
//
// Same serverless-safe path as the framework and resume exports
// (@react-pdf/renderer — no Chromium/Remotion on Vercel).
//
// ⚠️ COPY ON THESE PAGES IS CUSTOMER-FACING AND LEAVES THE BUILDING. It is
// DRAFT pending Brian, and it is the highest-stakes copy in the product: it is
// read by the budget holder, not the user.
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { Readout } from "@/lib/value-readout";

// Viridescent palette. @react-pdf/renderer runs its own layout engine and never
// sees the DOM, so CSS custom properties are unavailable — these are hex
// literals mirrored VERBATIM from src/styles/theme.css (the same
// copy-don't-import doctrine as framework-pdf.tsx and remotion/brand/tokens.ts).
// Change a value in theme.css → change it here.
const COLORS = {
  ink: "#1b4d49", // --pine
  sub: "#33625d", // --pine-soft
  faint: "#52706c", // --muted
  rule: "#d7ded6", // --line
  accent: "#2f7a56", // --growth
  accentBg: "#e0ede4", // --growth-soft
  warn: "#8a5a20", // --warn-text
  warnBg: "#fdf3e0", // --warn-bg
  warnBorder: "#ecd9a8", // --warn-border
};

const styles = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 48, paddingHorizontal: 48, fontSize: 10, color: COLORS.ink },
  brandRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 18 },
  brand: { fontSize: 12, color: COLORS.accent, letterSpacing: 0.5 },
  period: { fontSize: 9, color: COLORS.faint },
  h1: { fontSize: 20, marginBottom: 4, color: COLORS.ink },
  orgLine: { fontSize: 11, color: COLORS.sub, marginBottom: 18 },
  section: { marginBottom: 16 },
  h2: { fontSize: 12, color: COLORS.accent, marginBottom: 6 },
  rule: { borderBottomWidth: 1, borderBottomColor: COLORS.rule, marginBottom: 8 },
  lead: { fontSize: 10, color: COLORS.sub, lineHeight: 1.5, marginBottom: 8 },
  bigRow: { flexDirection: "row", marginBottom: 10 },
  bigCell: { flex: 1, paddingRight: 12 },
  bigNum: { fontSize: 22, color: COLORS.ink },
  bigLabel: { fontSize: 8.5, color: COLORS.faint, marginTop: 2, lineHeight: 1.35 },
  anchorBox: {
    backgroundColor: COLORS.accentBg,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
    padding: 12,
    marginBottom: 12,
  },
  anchorNum: { fontSize: 24, color: COLORS.ink },
  anchorText: { fontSize: 10, color: COLORS.sub, lineHeight: 1.5, marginTop: 4 },
  row: { flexDirection: "row", paddingVertical: 3 },
  cellName: { flex: 3, fontSize: 10, color: COLORS.ink },
  cellTitle: { flex: 4, fontSize: 9, color: COLORS.faint },
  cellNum: { flex: 1, fontSize: 10, color: COLORS.ink, textAlign: "right" },
  bullet: { fontSize: 9.5, color: COLORS.sub, lineHeight: 1.5, marginBottom: 3 },
  caveat: {
    backgroundColor: COLORS.warnBg,
    borderWidth: 1,
    borderColor: COLORS.warnBorder,
    padding: 10,
    marginTop: 6,
  },
  caveatTitle: { fontSize: 9, color: COLORS.warn, marginBottom: 4 },
  caveatLine: { fontSize: 9, color: COLORS.warn, lineHeight: 1.45, marginBottom: 2 },
  footer: {
    position: "absolute",
    bottom: 26,
    left: 48,
    right: 48,
    fontSize: 8,
    color: COLORS.faint,
    textAlign: "center",
  },
});

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

// ═════════════════════════════════════════════════════════════════════════════
// ⚠️⚠️ DRAFT CUSTOMER-FACING COPY — PENDING BRIAN'S SIGN-OFF (T1B3) ⚠️⚠️
//
// ⭐ THE ONE RULE: NO DOLLAR FIGURE, EVER. Not a saving, not a valuation, not a
// "conservatively." The standing GTM position is to anchor on REPLACEMENT COST
// and let the reader price it with their own numbers — so the biggest number on
// this page is YEARS OF JUDGMENT, stated plainly and sourced to named people.
// The moment this page computes a dollar it becomes a document that gets
// checked, and it only has to be caught once.
//
// Second rule: the caveats are not fine print, they are the credibility. A
// readout that admits what it cannot see is a readout the reader trusts about
// what it can.
// ═════════════════════════════════════════════════════════════════════════════
const COPY = {
  brand: "Viridescent",
  title: "What your team wrote down",
  orgLine: (org: string) => org,
  periodLine: (since: string | null, until: string) =>
    since ? `${fmtDate(since)} — ${fmtDate(until)}` : `Everything through ${fmtDate(until)}`,

  s1: "What is now written down",
  s1lead:
    "Judgment that existed only in someone's head at the start of this period, and now exists in your team's library — attributed, searchable, and yours.",
  anchor: (years: number, partial: boolean, people: number) =>
    `${partial ? "At least " : ""}${years} years of experience are now represented in writing, across ${people} ${
      people === 1 ? "person" : "people"
    }.`,
  anchorTail:
    "That is the replacement cost you were carrying without a copy. What it is worth to you is your number to run — we do not estimate it.",

  s2: "What people asked for",
  s2lead:
    "Every question someone brought to the library, and whether the answer was there.",

  s3: "Where it changed what someone did",
  s3lead:
    "The hardest thing to claim, so it is the most guarded number here. This counts only confirmed outcomes — never activity.",

  s4: "Disagreements you did not know you had",
  s4lead:
    "Two people on your team, both experienced, both confident, giving opposite guidance on the same situation. Nobody was hiding it; nothing had ever put the two answers side by side.",

  s5: "What you asked for and what came back",

  s6: "What this readout cannot see",
  s6lead:
    "Read this section first if you are deciding anything. It is the shortest honest description of the limits of everything above.",

  earlyBadge:
    "EARLY SIGNAL — too few observations to call this a pattern. Reported because it is real, not because it is settled.",
  noneBadge: "NOTHING RECORDED YET in this period.",

  footer:
    "Generated by Viridescent from your organization's own records. No figure on this page is estimated, modeled, or extrapolated.",
};

export function ReadoutDocument({ readout }: { readout: Readout }) {
  const r = readout;
  const c = r.captured;

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.brandRow}>
          <Text style={styles.brand}>{COPY.brand}</Text>
          <Text style={styles.period}>{COPY.periodLine(r.period.since, r.period.until)}</Text>
        </View>

        <Text style={styles.h1}>{COPY.title}</Text>
        <Text style={styles.orgLine}>{COPY.orgLine(r.org_name)}</Text>

        {/* ─── 1. CAPTURED ─── */}
        <View style={styles.section}>
          <Text style={styles.h2}>{COPY.s1}</Text>
          <View style={styles.rule} />
          <Text style={styles.lead}>{COPY.s1lead}</Text>

          {c.years_of_judgment !== null && c.contributors.length > 0 && (
            <View style={styles.anchorBox}>
              <Text style={styles.anchorNum}>
                {c.years_is_partial ? "≥" : ""}
                {c.years_of_judgment} years
              </Text>
              <Text style={styles.anchorText}>
                {COPY.anchor(c.years_of_judgment, c.years_is_partial, c.contributors.length)}
              </Text>
              <Text style={styles.anchorText}>{COPY.anchorTail}</Text>
            </View>
          )}

          <View style={styles.bigRow}>
            <View style={styles.bigCell}>
              <Text style={styles.bigNum}>{c.frameworks}</Text>
              <Text style={styles.bigLabel}>frameworks captured</Text>
            </View>
            <View style={styles.bigCell}>
              <Text style={styles.bigNum}>{c.contributors.length}</Text>
              <Text style={styles.bigLabel}>people contributed</Text>
            </View>
            <View style={styles.bigCell}>
              <Text style={styles.bigNum}>{c.methods_used}</Text>
              <Text style={styles.bigLabel}>elicitation methods used</Text>
            </View>
            <View style={styles.bigCell}>
              <Text style={styles.bigNum}>{c.people_on_account}</Text>
              <Text style={styles.bigLabel}>people on the account</Text>
            </View>
          </View>

          {c.contributors.slice(0, 12).map((p) => (
            <View key={p.person_id} style={styles.row}>
              <Text style={styles.cellName}>{p.name}</Text>
              <Text style={styles.cellTitle}>{p.title ?? ""}</Text>
              <Text style={styles.cellNum}>{p.frameworks}</Text>
            </View>
          ))}
        </View>

        {/* ─── 2. DEMAND ─── */}
        <View style={styles.section}>
          <Text style={styles.h2}>{COPY.s2}</Text>
          <View style={styles.rule} />
          <Text style={styles.lead}>{COPY.s2lead}</Text>
          <View style={styles.bigRow}>
            <View style={styles.bigCell}>
              <Text style={styles.bigNum}>{r.demand.questions_asked}</Text>
              <Text style={styles.bigLabel}>questions brought to the library (a floor, see limits)</Text>
            </View>
            <View style={styles.bigCell}>
              <Text style={styles.bigNum}>{r.demand.gaps_filled}</Text>
              <Text style={styles.bigLabel}>unanswered questions since answered</Text>
            </View>
            <View style={styles.bigCell}>
              <Text style={styles.bigNum}>{r.demand.gaps_open_now}</Text>
              <Text style={styles.bigLabel}>still with no captured answer</Text>
            </View>
            <View style={styles.bigCell}>
              <Text style={styles.bigNum}>{r.demand.unanswered_asks}</Text>
              <Text style={styles.bigLabel}>times someone hit one of those and found nothing</Text>
            </View>
          </View>
          {r.demand.top_open.slice(0, 3).map((g, i) => (
            <Text key={i} style={styles.bullet}>
              • “{g.question}” — asked {g.asked_count}×, still open
            </Text>
          ))}
        </View>

        <Text style={styles.footer}>{COPY.footer}</Text>
      </Page>

      <Page size="LETTER" style={styles.page}>
        {/* ─── 3. APPLIED ─── */}
        <View style={styles.section}>
          <Text style={styles.h2}>{COPY.s3}</Text>
          <View style={styles.rule} />
          <Text style={styles.lead}>{COPY.s3lead}</Text>
          <View style={styles.bigRow}>
            <View style={styles.bigCell}>
              <Text style={styles.bigNum}>{r.applied.retrieval_marked_useful}</Text>
              <Text style={styles.bigLabel}>times someone said a retrieved framework helped</Text>
            </View>
            <View style={styles.bigCell}>
              <Text style={styles.bigNum}>{r.applied.prescriptions_effective}</Text>
              <Text style={styles.bigLabel}>interventions the problem stopped recurring after</Text>
            </View>
            <View style={styles.bigCell}>
              <Text style={styles.bigNum}>{r.applied.prescriptions_escalated}</Text>
              <Text style={styles.bigLabel}>that did not land and were redesigned</Text>
            </View>
            <View style={styles.bigCell}>
              <Text style={styles.bigNum}>{r.applied.training_generated}</Text>
              <Text style={styles.bigLabel}>training pieces built from your own experts</Text>
            </View>
          </View>
          {/* ⚠️ THE GUARDRAIL. Below the evidence threshold this section says so
              in the section itself, not in a footnote — the same rule P-7 Build 6
              enforces in code for retrieval effectiveness. */}
          {r.applied.thin && (
            <View style={styles.caveat}>
              <Text style={styles.caveatTitle}>
                {r.applied.evidence === "none" ? COPY.noneBadge : COPY.earlyBadge}
              </Text>
            </View>
          )}
        </View>

        {/* ─── 4. CONTESTED ─── */}
        <View style={styles.section}>
          <Text style={styles.h2}>{COPY.s4}</Text>
          <View style={styles.rule} />
          <Text style={styles.lead}>{COPY.s4lead}</Text>
          <View style={styles.bigRow}>
            <View style={styles.bigCell}>
              <Text style={styles.bigNum}>{r.contested.surfaced}</Text>
              <Text style={styles.bigLabel}>contested calls surfaced</Text>
            </View>
            <View style={styles.bigCell}>
              <Text style={styles.bigNum}>{r.contested.resolved}</Text>
              <Text style={styles.bigLabel}>settled on the record</Text>
            </View>
            <View style={styles.bigCell}>
              <Text style={styles.bigNum}>{r.contested.open}</Text>
              <Text style={styles.bigLabel}>still open, both sides visible to anyone who asks</Text>
            </View>
            <View style={styles.bigCell} />
          </View>
          {r.contested.examples.map((e, i) => (
            <Text key={i} style={styles.bullet}>
              • “{e.a}” vs “{e.b}” — {e.status}
            </Text>
          ))}
        </View>

        {/* ─── 5. CAMPAIGNS ─── */}
        {r.campaigns.run > 0 && (
          <View style={styles.section}>
            <Text style={styles.h2}>{COPY.s5}</Text>
            <View style={styles.rule} />
            <View style={styles.bigRow}>
              <View style={styles.bigCell}>
                <Text style={styles.bigNum}>{r.campaigns.asks_sent}</Text>
                <Text style={styles.bigLabel}>specific questions put to specific people</Text>
              </View>
              <View style={styles.bigCell}>
                <Text style={styles.bigNum}>{r.campaigns.asks_captured}</Text>
                <Text style={styles.bigLabel}>answered with a captured framework</Text>
              </View>
              <View style={styles.bigCell}>
                <Text style={styles.bigNum}>{r.campaigns.asks_declined}</Text>
                <Text style={styles.bigLabel}>redirected to someone better placed</Text>
              </View>
              <View style={styles.bigCell}>
                <Text style={styles.bigNum}>{r.campaigns.asks_outstanding}</Text>
                <Text style={styles.bigLabel}>still outstanding</Text>
              </View>
            </View>
          </View>
        )}

        {/* ─── 6. LIMITS ─── */}
        <View style={styles.section}>
          <Text style={styles.h2}>{COPY.s6}</Text>
          <View style={styles.rule} />
          <Text style={styles.lead}>{COPY.s6lead}</Text>
          <View style={styles.caveat}>
            {r.still_dark.notes.map((n, i) => (
              <Text key={i} style={styles.caveatLine}>
                • {n}
              </Text>
            ))}
            {r.still_dark.people_yet_to_capture > 0 && (
              <Text style={styles.caveatLine}>
                • {r.still_dark.people_yet_to_capture} of the {r.captured.people_on_account} people on
                the account have not captured anything yet. Their judgment is still only in their
                heads.
              </Text>
            )}
          </View>
        </View>

        <Text style={styles.footer}>{COPY.footer}</Text>
      </Page>
    </Document>
  );
}
