"use client";
// THE EXPOSURE ENGINE — the page.
//
// Two stacked blocks, in this order:
//   1. ⚠️ Walking risk      — where irreplaceable judgment sits in few heads.
//   2. 🔔 Framework warnings — where the org's OWN captured judgment says
//                              trouble is coming.
//
// ═══════════════════════════════════════════════════════════════════════════
// ⭐ THE RULE THAT GOVERNS EVERY STRING ON THIS PAGE
//
// A PERSON IS NEVER A LIABILITY HERE. Dana Whitfield is the HOLDER of scarce
// value — the sentence is always about COVERAGE ("nobody else has captured on
// this"), never about her. There is no copy path on this page that says or
// implies anything negative about a named person, and Coaching Watch data does
// not reach this file at all.
//
// SECOND RULE: every row ends in ONE action. Exposure is a to-do list, not a
// wall of anxiety. "Close this" opens a pre-filled targeted capture ask through
// the existing campaigns flow.
//
// THIRD RULE: the empty state is GOOD NEWS and reads like it.
//
// Exposure is NOT exported to PDF and does NOT appear on /readout. The readout
// leaves the building; this does not.
// ═══════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BrandHeader from "@/components/BrandHeader";

const supabase = createClient();

// ═════════════════════════════════════════════════════════════════════════════
// ⚠️⚠️ DRAFT CUSTOMER-FACING COPY — PENDING BRIAN'S SIGN-OFF ⚠️⚠️
// Collected verbatim in claude_COPY-DRAFT-exposure-and-ledger.md.
//
// Voice rules: opportunity framing never loss framing · land the emotional
// punch ONCE, never repeat · recognition over gatekeeping · short rhythmic
// sentences · always gender-neutral.
//
// ✅ NAME APPROVED 2026-08-06: "What's at risk". (Flagged at the time that it
// leans loss framing where the house voice prefers opportunity framing — Brian
// chose it anyway, deliberately. Do not quietly soften it back.)
// ═════════════════════════════════════════════════════════════════════════════
const COPY = {
  title: "What's at risk",
  subtitle:
    "Where your team's judgment is concentrated, and what your own captured frameworks are telling you to watch. Built live from your records. It stays in the building.",

  notViewer: "This is for managers, executives, and account admins.",
  noOrg: "Once you're part of an organization, this shows up here.",
  loading: "Working it out…",

  // ─── Block 1 ───
  b1: "Walking risk",
  b1lead:
    "Judgment that lives in very few heads, ranked by how deep it runs and how often people reach for it. A name here means one thing: this person knows something the team would have to learn again.",
  b1empty:
    "No concentration risk above the line. Every topic your team has written down has more than one person behind it, or nobody is depending on it yet. That's a good place to be.",
  b1emptyNoRecords:
    "Nothing captured yet, so there's nothing to concentrate. The first framework someone writes down is where this page starts.",
  showAll: (n: number) => `Show all ${n}`,
  showFewer: "Show fewer",

  // Row sentence, assembled from parts. Never a negative about a person.
  rowSource: (of: number, total: number, name: string, years: number | null) =>
    total === 1
      ? `The only answer on this comes from ${name}${years ? ` (${years} years)` : ""}.`
      : `${of} of ${total} answers come from ${name}${years ? ` (${years} years)` : ""}.`,
  rowSolo: "Nobody else has captured on this.",
  rowSecond: (n: number, people: number) =>
    `${n} other ${n === 1 ? "answer" : "answers"} from ${people} ${
      people === 1 ? "person" : "people"
    }.`,
  rowDemand: (n: number) => `Asked ${n} ${n === 1 ? "time" : "times"} in 90 days.`,
  rowNoDemand: "Nobody has searched for this in the last 90 days.",
  close: "Close this",
  closeHelp: "Opens a capture ask you can send to whoever else should know it.",
  openLibrary: "See what's captured",

  // ─── Block 2 ───
  b2: "Your own frameworks are warning you",
  b2lead:
    "Somebody on your team wrote down that one thing leads to another. The first thing is showing up again. This is your judgment talking, not ours.",
  b2empty:
    "Nothing your captured frameworks predict is showing up right now. Quiet is the right answer here.",
  b2unavailable:
    "Framework warnings aren't switched on for this account yet, so this section can't tell you whether anything is quiet or not.",
  warningLine: (a: string, c: string) => ({ a, c }),
  warningMentions: (n: number) => `${n} recent captures mention it.`,
  warningSource: (author: string, framework: string, when: string | null) =>
    `Source: ${author}, “${framework}”${when ? `, ${when}` : ""}.`,
  seeFramework: "See the framework",

  // ─── Caveats ───
  limits: "What this page can't see",
  limitsLead:
    "Read this before you act on anything above. It's the honest description of the edges.",
  limitTruncated: (n: number) =>
    `Only your ${n} most recent captures are grouped into topics here. Anything older than that is not on this page.`,
  limitUnembedded: (n: number) =>
    `${n} captured ${n === 1 ? "framework hasn't" : "frameworks haven't"} been indexed yet, so ${
      n === 1 ? "it isn't" : "they aren't"
    } grouped into any topic above.`,
  limitDemand:
    "Search counts are a floor. Opening a result is optional to record, so real demand is at least this high and probably higher.",
  limitPeople:
    "Years of experience is self-reported. Where a person hasn't filled it in, this page ranks them neutrally and says nothing about their experience.",
  limitNoCoaching:
    "Nothing on this page comes from coaching or performance data. Concentration is a fact about coverage, never about a person.",
  limitWarnings:
    "Framework warnings only fire on judgment somebody stated outright. Anything the model merely inferred is stored and never shown.",
};
// ═════════════════════════════════════════════════════════════════════════════

type Holder = {
  person_id: string;
  name: string;
  title: string | null;
  patterns: number;
  years_experience: number | null;
};

type RiskRow = {
  cluster_key: string;
  label: string;
  label_from_framework: boolean;
  pattern_count: number;
  contributor_count: number;
  top_contributor: Holder;
  second_source_depth: number;
  concentration: number;
  retrievals_90d: number;
  retrievals_useful_90d: number;
  score: number;
  record_ids: string[];
};

type Warning = {
  antecedent: string;
  consequent: string;
  recent_mentions: number;
  source_record_id: string;
  source_framework: string;
  source_author: string;
  source_captured_at: string | null;
};

type Payload = {
  walking_risk: {
    rows: RiskRow[];
    total_rows: number;
    records_considered: number;
    unembedded: number;
    truncated: boolean;
    max_records: number;
    window_days: number;
  };
  warnings: { rows: Warning[]; available: boolean; links_considered: number };
  page_rows: number;
};

// The pre-filled targeted capture ask. Routes into the EXISTING capture_requests
// flow (campaigns → asks), never a parallel mechanism: the campaign form opens
// with the name and the question already written, and the manager picks who.
function closeUrl(row: RiskRow): string {
  const name = `Second source: ${row.label}`;
  const prompt =
    `How do you decide this — ${row.label}? Walk through what you look at, ` +
    `the call you make, and when you'd make a different one.`;
  const purpose =
    `${row.top_contributor.name} is the only person who has captured on this, and it's been ` +
    `asked ${row.retrievals_90d} ${row.retrievals_90d === 1 ? "time" : "times"} in 90 days. ` +
    `A second answer makes it the team's, not one person's.`;
  const qs = new URLSearchParams({
    new: "1",
    name,
    prompt,
    purpose,
  });
  return `/campaigns?${qs.toString()}`;
}

function fmtMonth(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default function ExposurePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Payload | null>(null);
  const [gateError, setGateError] = useState<{ message: string; code?: string } | null>(null);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/exposure?t=${Date.now()}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) {
        setGateError({ message: body.error || "Could not build this page.", code: body.code });
        setData(null);
        return;
      }
      setGateError(null);
      setData(body as Payload);
    } catch {
      setGateError({ message: "Could not build this page." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      setChecking(false);
      await load();
    })();
  }, [router, load]);

  if (checking) {
    return (
      <div style={styles.center}>
        <p>Loading…</p>
      </div>
    );
  }

  if (!loading && gateError) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.container}>
          <div style={{ marginBottom: 18 }}>
            <BrandHeader />
          </div>
          <h1 style={styles.title}>{COPY.title}</h1>
          {/* ⭐ ONLY A REAL GATE SHOWS GATE COPY. Rendering the permission
              line for a 500 tells an org admin their access is wrong and sends
              them to support about the one thing that is not broken. */}
          <div style={styles.emptyCard}>
            {gateError.code === "NO_ORG"
              ? COPY.noOrg
              : gateError.code === "NOT_VIEWER"
                ? COPY.notViewer
                : gateError.message}
          </div>
          <a href="/dashboard" style={styles.backLink}>
            ← Back to dashboard
          </a>
        </div>
      </div>
    );
  }

  const wr = data?.walking_risk ?? null;
  const pageRows = data?.page_rows ?? 12;
  const allRows = wr?.rows ?? [];
  const shown = expanded ? allRows : allRows.slice(0, pageRows);
  const warnings = data?.warnings ?? null;

  // ⭐ CAVEATS DERIVE FROM THE SAME EXPRESSIONS THAT DECIDE WHAT RENDERS.
  // Each line below is guarded by the very condition that puts the thing it
  // describes on the page — the standing fix for "the total below is a minimum"
  // appearing with no total below.
  const limits: string[] = [];
  if (wr?.truncated) limits.push(COPY.limitTruncated(wr.max_records));
  if (wr && wr.unembedded > 0) limits.push(COPY.limitUnembedded(wr.unembedded));
  if (allRows.some((r) => r.retrievals_90d > 0)) limits.push(COPY.limitDemand);
  if (allRows.some((r) => r.top_contributor.years_experience === null))
    limits.push(COPY.limitPeople);
  if (allRows.length > 0) limits.push(COPY.limitNoCoaching);
  if (warnings?.available) limits.push(COPY.limitWarnings);

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <div style={{ marginBottom: 18 }}>
          <BrandHeader />
        </div>

        <div style={styles.headerRow}>
          <h1 style={styles.title}>⚠️ {COPY.title}</h1>
          <a href="/dashboard" style={styles.headerLink}>
            ← Dashboard
          </a>
        </div>
        <p style={styles.subtitle}>{COPY.subtitle}</p>

        {loading && <p style={styles.help}>{COPY.loading}</p>}

        {data && (
          <>
            {/* ═══ BLOCK 1 — WALKING RISK ═══ */}
            <div style={styles.card}>
              <h2 style={styles.h2}>⚠️ {COPY.b1}</h2>
              <p style={styles.lead}>{COPY.b1lead}</p>

              {allRows.length === 0 ? (
                <div style={styles.goodNews}>
                  {wr && wr.records_considered === 0 ? COPY.b1emptyNoRecords : COPY.b1empty}
                </div>
              ) : (
                <>
                  {shown.map((row) => (
                    <RiskRowView key={row.cluster_key} row={row} />
                  ))}
                  {allRows.length > pageRows && (
                    <button
                      type="button"
                      style={styles.moreButton}
                      onClick={() => setExpanded((e) => !e)}
                    >
                      {expanded ? COPY.showFewer : COPY.showAll(allRows.length)}
                    </button>
                  )}
                </>
              )}
            </div>

            {/* ═══ BLOCK 2 — FRAMEWORK WARNINGS ═══ */}
            <div style={styles.card}>
              <h2 style={styles.h2}>🔔 {COPY.b2}</h2>
              <p style={styles.lead}>{COPY.b2lead}</p>

              {!warnings?.available ? (
                <div style={styles.neutralNote}>{COPY.b2unavailable}</div>
              ) : warnings.rows.length === 0 ? (
                <div style={styles.goodNews}>{COPY.b2empty}</div>
              ) : (
                warnings.rows.map((w, i) => (
                  <div key={`${w.source_record_id}:${i}`} style={styles.warnRow}>
                    <p style={styles.warnLine}>
                      Your captured judgment says <strong>{w.antecedent}</strong> precedes{" "}
                      <strong>{w.consequent}</strong>.
                    </p>
                    <p style={styles.warnMentions}>{COPY.warningMentions(w.recent_mentions)}</p>
                    {/* ⭐ EVERY WARNING NAMES AND LINKS ITS SOURCE. An unsourced
                        warning is a guess and never renders — the API only
                        returns rows that carry one. */}
                    <p style={styles.warnSource}>
                      {COPY.warningSource(
                        w.source_author,
                        w.source_framework,
                        fmtMonth(w.source_captured_at)
                      )}
                    </p>
                    <a href={`/library/${w.source_record_id}`} style={styles.warnLink}>
                      {COPY.seeFramework} →
                    </a>
                  </div>
                ))
              )}
            </div>

            {/* ═══ LIMITS ═══ */}
            {limits.length > 0 && (
              <div style={styles.darkCard}>
                <h2 style={styles.h2}>{COPY.limits}</h2>
                <p style={styles.lead}>{COPY.limitsLead}</p>
                {limits.map((l, i) => (
                  <p key={i} style={styles.caveatLine}>
                    • {l}
                  </p>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function RiskRowView({ row }: { row: RiskRow }) {
  const t = row.top_contributor;
  return (
    <div style={styles.riskRow}>
      <div style={styles.riskTop}>
        <span style={styles.riskLabel}>{row.label}</span>
        <span style={styles.riskScore}>{Math.round(row.score)}</span>
      </div>
      <p style={styles.riskSentence}>
        {COPY.rowSource(t.patterns, row.pattern_count, t.name, t.years_experience)}{" "}
        {row.second_source_depth === 0
          ? COPY.rowSolo
          : COPY.rowSecond(row.second_source_depth, Math.max(1, row.contributor_count - 1))}{" "}
        {row.retrievals_90d > 0 ? COPY.rowDemand(row.retrievals_90d) : COPY.rowNoDemand}
      </p>
      <div style={styles.riskActions}>
        {/* ⭐ ONE action button per row. Always. */}
        <a href={closeUrl(row)} style={styles.closeButton}>
          {COPY.close} →
        </a>
        <a href={`/library/${row.cluster_key}`} style={styles.secondaryLink}>
          {COPY.openLibrary}
        </a>
        <span style={styles.closeHelp}>{COPY.closeHelp}</span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { minHeight: "100vh", fontFamily: "var(--font-sans)" },
  container: { maxWidth: 860, margin: "0 auto", padding: "40px 24px 80px" },
  center: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-sans)",
  },
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  title: { fontSize: "26px", margin: 0 },
  headerLink: { fontSize: "14px", fontWeight: 600, color: "var(--muted)", textDecoration: "none" },
  subtitle: { color: "var(--muted)", fontSize: "14px", margin: "6px 0 18px", lineHeight: 1.55 },
  card: {
    background: "var(--white)",
    border: "1px solid var(--line)",
    borderRadius: 14,
    padding: "20px 22px 22px",
    marginBottom: 16,
  },
  darkCard: {
    background: "var(--warn-bg)",
    border: "1px solid var(--warn-border)",
    borderRadius: 14,
    padding: "20px 22px 22px",
    marginBottom: 16,
  },
  emptyCard: {
    background: "var(--white)",
    border: "1px dashed var(--line)",
    borderRadius: 14,
    padding: "26px 24px",
    fontSize: "14px",
    color: "var(--pine-soft)",
    lineHeight: 1.6,
    marginBottom: 16,
  },
  h2: { fontSize: "17px", margin: "0 0 6px" },
  lead: { fontSize: "13px", color: "var(--muted)", margin: "0 0 16px", lineHeight: 1.6 },
  help: { fontSize: "13px", color: "var(--muted)" },
  goodNews: {
    background: "var(--ok-bg)",
    border: "1px solid var(--ok-border)",
    color: "var(--ok-text)",
    borderRadius: 10,
    padding: "14px 16px",
    fontSize: "13.5px",
    lineHeight: 1.6,
  },
  neutralNote: {
    background: "var(--paper-2)",
    border: "1px solid var(--line)",
    color: "var(--pine-soft)",
    borderRadius: 10,
    padding: "14px 16px",
    fontSize: "13.5px",
    lineHeight: 1.6,
  },
  riskRow: {
    borderTop: "1px solid var(--line)",
    padding: "14px 0 12px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  riskTop: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  riskLabel: { fontSize: "15px", fontWeight: 700, color: "var(--pine)" },
  riskScore: {
    fontSize: "12px",
    fontWeight: 700,
    color: "var(--warn-text)",
    background: "var(--warn-bg)",
    border: "1px solid var(--warn-border)",
    borderRadius: 9999,
    padding: "2px 10px",
  },
  riskSentence: { fontSize: "13.5px", color: "var(--pine-soft)", margin: 0, lineHeight: 1.6 },
  riskActions: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 4 },
  closeButton: {
    fontSize: "13px",
    fontWeight: 600,
    color: "var(--white)",
    background: "var(--growth)",
    borderRadius: 8,
    padding: "8px 14px",
    textDecoration: "none",
    whiteSpace: "nowrap",
  },
  secondaryLink: { fontSize: "13px", fontWeight: 600, color: "var(--growth)", textDecoration: "none" },
  closeHelp: { fontSize: "11.5px", color: "var(--muted)" },
  moreButton: {
    marginTop: 12,
    fontSize: "13px",
    fontWeight: 600,
    color: "var(--pine)",
    background: "var(--white)",
    border: "1px solid var(--line)",
    borderRadius: 8,
    padding: "8px 14px",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  warnRow: {
    borderTop: "1px solid var(--line)",
    padding: "14px 0 12px",
    display: "flex",
    flexDirection: "column",
    gap: 5,
  },
  warnLine: { fontSize: "14px", color: "var(--pine)", margin: 0, lineHeight: 1.6 },
  warnMentions: { fontSize: "13px", color: "var(--pine-soft)", margin: 0 },
  warnSource: { fontSize: "12px", color: "var(--muted)", margin: 0, fontStyle: "italic" },
  warnLink: { fontSize: "13px", fontWeight: 600, color: "var(--growth)", textDecoration: "none" },
  caveatLine: { fontSize: "12.5px", color: "var(--warn-text)", margin: "0 0 6px", lineHeight: 1.55 },
  backLink: { fontSize: "13px", color: "var(--muted)", textDecoration: "none" },
};
