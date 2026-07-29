"use client";
// TIER 1 / BUILD 3 — THE VALUE READOUT.
//
// The page a champion opens the week before the renewal conversation, and the
// button that gives them the two pages they forward.
//
// Everything here is computed live from the org's own rows — no stored metrics,
// no new tables. See src/lib/value-readout.ts for the three rules the whole
// feature obeys: no invented dollars, no person-level negative, and say out
// loud how thin the data is.
//
// Client-safe imports only — @/lib/value-readout and @/lib/readout-pdf are
// server-only.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BrandHeader from "@/components/BrandHeader";

const supabase = createClient();

// ═════════════════════════════════════════════════════════════════════════════
// ⚠️⚠️ DRAFT CUSTOMER-FACING COPY — PENDING BRIAN'S SIGN-OFF (T1B3) ⚠️⚠️
//
// ⭐ HIGHEST-STAKES COPY IN THE PRODUCT: this is read by the budget holder, not
// the user. Two hard rules —
//   1. NO DOLLAR FIGURE, EVER. Not a saving, not a valuation, not a
//      "conservatively." Anchor on replacement cost (years of judgment, sourced
//      to named people) and let the reader run their own number. A computed
//      dollar makes this a document that gets checked, and it only has to be
//      caught once.
//   2. THE CAVEATS ARE THE CREDIBILITY, not fine print. A readout that admits
//      what it cannot see is a readout the reader believes about what it can.
// ═════════════════════════════════════════════════════════════════════════════
const COPY = {
  title: "What your team wrote down",
  subtitle:
    "Built from your own records, live. Nothing on this page is estimated, modeled, or extrapolated — and where the evidence is thin, it says so.",
  notViewer: "The readout is for managers and account admins.",
  noOrg: "Once you're part of an organization, its readout shows up here.",
  download: "Download the two-page version",
  building: "Building it…",
  rangeAll: "Everything so far",
  rangeLabel: "Counting from",

  s1: "What is now written down",
  s1lead:
    "Judgment that existed only in someone's head, and now exists in your library — attributed, searchable, and yours.",
  anchorLead: (partial: boolean) =>
    partial ? "At least this much experience is now on the record" : "Experience now on the record",
  anchorTail:
    "That's the replacement cost you were carrying without a copy. What it's worth to you is your number to run — we don't estimate it.",

  s2: "What people asked for",
  s2lead: "Every question someone brought to the library, and whether the answer was there.",

  s3: "Where it changed what someone did",
  s3lead:
    "The hardest thing to claim, so it's the most guarded number here — confirmed outcomes only, never activity.",

  s4: "Disagreements you didn't know you had",
  s4lead:
    "Two experienced people giving opposite guidance on the same situation. Nobody was hiding it; nothing had ever put the two answers side by side.",

  s5: "What you asked for, and what came back",

  s6: "What this readout can't see",
  s6lead:
    "Read this first if you're deciding anything. It's the shortest honest description of the limits of everything above.",

  early: "Early signal — too few observations to call this a pattern yet.",
  none: "Nothing recorded in this period.",
  proven: "Enough observations to describe this as a pattern.",
};
// ═════════════════════════════════════════════════════════════════════════════

type Contributor = {
  person_id: string;
  name: string;
  title: string | null;
  frameworks: number;
  years_experience: number | null;
};

type Readout = {
  org_name: string;
  period: { since: string | null; until: string };
  captured: {
    frameworks: number;
    contributors: Contributor[];
    people_on_account: number;
    years_of_judgment: number | null;
    years_is_partial: boolean;
    methods_used: number;
  };
  demand: {
    questions_asked: number;
    gaps_opened: number;
    gaps_filled: number;
    gaps_open_now: number;
    unanswered_asks: number;
    top_open: { question: string; asked_count: number }[];
    evidence: string;
  };
  applied: {
    retrieval_marked_useful: number;
    prescriptions_delivered: number;
    prescriptions_effective: number;
    prescriptions_escalated: number;
    training_generated: number;
    evidence: string;
    thin: boolean;
  };
  contested: {
    surfaced: number;
    resolved: number;
    open: number;
    examples: { a: string; b: string; status: string }[];
  };
  campaigns: {
    run: number;
    asks_sent: number;
    asks_captured: number;
    asks_declined: number;
    asks_outstanding: number;
  };
  still_dark: { people_yet_to_capture: number; gaps_unfilled: number; notes: string[] };
};

function Stat({ n, label }: { n: number | string; label: string }) {
  return (
    <div style={styles.stat}>
      <div style={styles.statNum}>{n}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

export default function ReadoutPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Readout | null>(null);
  const [gateError, setGateError] = useState<{ message: string; code?: string } | null>(null);
  const [since, setSince] = useState("");
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async (from: string) => {
    setLoading(true);
    try {
      const qs = from ? `?since=${from}&t=${Date.now()}` : `?t=${Date.now()}`;
      const res = await fetch(`/api/readout${qs}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) {
        setGateError({ message: body.error || "Could not build the readout.", code: body.code });
        setData(null);
        return;
      }
      setGateError(null);
      setData(body.readout as Readout);
    } catch {
      setGateError({ message: "Could not build the readout." });
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
      await load("");
    })();
  }, [router, load]);

  function download() {
    setDownloading(true);
    const qs = since ? `?since=${since}` : "";
    // A plain navigation rather than fetch+blob: the browser handles the
    // Content-Disposition download natively, and a failed PDF then shows the
    // route's own JSON error instead of failing silently behind a spinner.
    window.location.href = `/api/readout/pdf${qs}`;
    setTimeout(() => setDownloading(false), 2500);
  }

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
          <div style={styles.emptyCard}>
            {gateError.code === "NO_ORG" ? COPY.noOrg : COPY.notViewer}
          </div>
          <a href="/dashboard" style={styles.backLink}>
            ← Back to dashboard
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <div style={{ marginBottom: 18 }}>
          <BrandHeader />
        </div>

        <div style={styles.headerRow}>
          <h1 style={styles.title}>📊 {COPY.title}</h1>
          <a href="/dashboard" style={styles.headerLink}>
            ← Dashboard
          </a>
        </div>
        <p style={styles.subtitle}>{COPY.subtitle}</p>

        <div style={styles.controls}>
          <label style={styles.rangeLabel}>
            {COPY.rangeLabel}
            <input
              style={styles.input}
              type="date"
              value={since}
              onChange={(e) => {
                setSince(e.target.value);
                load(e.target.value);
              }}
            />
          </label>
          <span style={styles.rangeNote}>{since ? "" : COPY.rangeAll}</span>
          <button type="button" style={styles.primaryButton} disabled={downloading} onClick={download}>
            {downloading ? COPY.building : `⬇ ${COPY.download}`}
          </button>
        </div>

        {loading && <p style={styles.help}>Building it…</p>}

        {data && (
          <>
            <p style={styles.orgLine}>{data.org_name}</p>

            {/* ─── 1 ─── */}
            <div style={styles.card}>
              <h2 style={styles.h2}>{COPY.s1}</h2>
              <p style={styles.lead}>{COPY.s1lead}</p>

              {data.captured.years_of_judgment !== null &&
                data.captured.contributors.length > 0 && (
                <div style={styles.anchor}>
                  <div style={styles.anchorNum}>
                    {data.captured.years_is_partial ? "≥" : ""}
                    {data.captured.years_of_judgment} years
                  </div>
                  <div style={styles.anchorLead}>
                    {COPY.anchorLead(data.captured.years_is_partial)} — across{" "}
                    {data.captured.contributors.length}{" "}
                    {data.captured.contributors.length === 1 ? "person" : "people"}.
                  </div>
                  <div style={styles.anchorTail}>{COPY.anchorTail}</div>
                </div>
              )}

              <div style={styles.statRow}>
                <Stat n={data.captured.frameworks} label="frameworks captured" />
                <Stat n={data.captured.contributors.length} label="people contributed" />
                <Stat n={data.captured.methods_used} label="elicitation methods used" />
                <Stat n={data.captured.people_on_account} label="people on the account" />
              </div>

              {data.captured.contributors.map((p) => (
                <div key={p.person_id} style={styles.contribRow}>
                  <span style={styles.contribName}>{p.name}</span>
                  <span style={styles.contribTitle}>{p.title ?? ""}</span>
                  <span style={styles.contribNum}>{p.frameworks}</span>
                </div>
              ))}
            </div>

            {/* ─── 2 ─── */}
            <div style={styles.card}>
              <h2 style={styles.h2}>{COPY.s2}</h2>
              <p style={styles.lead}>{COPY.s2lead}</p>
              <div style={styles.statRow}>
                <Stat n={data.demand.questions_asked} label="questions brought to the library" />
                <Stat n={data.demand.gaps_filled} label="unanswered questions since answered" />
                <Stat n={data.demand.gaps_open_now} label="still with no captured answer" />
                <Stat n={data.demand.unanswered_asks} label="times someone hit one and found nothing" />
              </div>
              {data.demand.top_open.map((g, i) => (
                <p key={i} style={styles.bullet}>
                  &ldquo;{g.question}&rdquo; — asked {g.asked_count}×, still open
                </p>
              ))}
            </div>

            {/* ─── 3 ─── */}
            <div style={styles.card}>
              <h2 style={styles.h2}>{COPY.s3}</h2>
              <p style={styles.lead}>{COPY.s3lead}</p>
              <div style={styles.statRow}>
                <Stat n={data.applied.retrieval_marked_useful} label="times a retrieved framework was marked useful" />
                <Stat n={data.applied.prescriptions_effective} label="interventions the problem stopped recurring after" />
                <Stat n={data.applied.prescriptions_escalated} label="that didn't land and were redesigned" />
                <Stat n={data.applied.training_generated} label="training pieces built from your own experts" />
              </div>
              {data.applied.thin && (
                <div style={styles.caveat}>
                  {data.applied.evidence === "none" ? COPY.none : COPY.early}
                </div>
              )}
            </div>

            {/* ─── 4 ─── */}
            <div style={styles.card}>
              <h2 style={styles.h2}>{COPY.s4}</h2>
              <p style={styles.lead}>{COPY.s4lead}</p>
              <div style={styles.statRow}>
                <Stat n={data.contested.surfaced} label="contested calls surfaced" />
                <Stat n={data.contested.resolved} label="settled on the record" />
                <Stat n={data.contested.open} label="still open, both sides visible" />
              </div>
              {data.contested.examples.map((e, i) => (
                <p key={i} style={styles.bullet}>
                  &ldquo;{e.a}&rdquo; vs &ldquo;{e.b}&rdquo; — {e.status}
                </p>
              ))}
            </div>

            {/* ─── 5 ─── */}
            {data.campaigns.run > 0 && (
              <div style={styles.card}>
                <h2 style={styles.h2}>{COPY.s5}</h2>
                <div style={styles.statRow}>
                  <Stat n={data.campaigns.asks_sent} label="specific questions put to specific people" />
                  <Stat n={data.campaigns.asks_captured} label="answered with a captured framework" />
                  <Stat n={data.campaigns.asks_declined} label="redirected to someone better placed" />
                  <Stat n={data.campaigns.asks_outstanding} label="still outstanding" />
                </div>
              </div>
            )}

            {/* ─── 6 ─── */}
            <div style={styles.darkCard}>
              <h2 style={styles.h2}>{COPY.s6}</h2>
              <p style={styles.lead}>{COPY.s6lead}</p>
              {data.still_dark.notes.map((n, i) => (
                <p key={i} style={styles.caveatLine}>
                  • {n}
                </p>
              ))}
              {data.still_dark.people_yet_to_capture > 0 && (
                <p style={styles.caveatLine}>
                  • {data.still_dark.people_yet_to_capture} of the {data.captured.people_on_account}{" "}
                  people on the account haven&apos;t captured anything yet. Their judgment is still
                  only in their heads.
                </p>
              )}
            </div>
          </>
        )}
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
  orgLine: { fontSize: "15px", fontWeight: 700, color: "var(--pine)", margin: "0 0 14px" },
  controls: {
    display: "flex",
    alignItems: "flex-end",
    gap: 14,
    flexWrap: "wrap",
    marginBottom: 20,
  },
  rangeLabel: {
    display: "flex",
    flexDirection: "column",
    gap: 5,
    fontSize: "12px",
    fontWeight: 600,
    color: "var(--pine-soft)",
  },
  rangeNote: { fontSize: "12px", color: "var(--muted)", paddingBottom: 10 },
  input: {
    padding: "9px 11px",
    fontSize: "14px",
    borderRadius: 8,
    border: "1px solid var(--line)",
    fontFamily: "inherit",
    color: "var(--pine)",
    background: "var(--white)",
  },
  primaryButton: {
    fontSize: "14px",
    fontWeight: 600,
    color: "var(--white)",
    background: "var(--growth)",
    border: "none",
    borderRadius: 8,
    padding: "10px 18px",
    cursor: "pointer",
    fontFamily: "inherit",
  },
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
  anchor: {
    background: "var(--growth-soft)",
    borderLeft: "3px solid var(--growth)",
    borderRadius: 8,
    padding: "16px 18px",
    marginBottom: 18,
  },
  anchorNum: { fontSize: "30px", fontWeight: 700, color: "var(--pine)", fontFamily: "var(--font-serif)" },
  anchorLead: { fontSize: "13px", color: "var(--growth-deep)", fontWeight: 600, marginTop: 4 },
  anchorTail: { fontSize: "12px", color: "var(--muted)", marginTop: 8, lineHeight: 1.55 },
  statRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 14,
    marginBottom: 14,
  },
  stat: {},
  statNum: { fontSize: "26px", fontWeight: 700, color: "var(--pine)", fontFamily: "var(--font-serif)" },
  statLabel: { fontSize: "11px", color: "var(--muted)", lineHeight: 1.4, marginTop: 2 },
  contribRow: {
    display: "flex",
    gap: 12,
    alignItems: "baseline",
    borderTop: "1px solid var(--line)",
    padding: "7px 0",
  },
  contribName: { fontSize: "13px", fontWeight: 700, color: "var(--pine)", flex: "0 0 160px" },
  contribTitle: { fontSize: "12px", color: "var(--muted)", flex: 1 },
  contribNum: { fontSize: "13px", fontWeight: 700, color: "var(--pine)" },
  bullet: { fontSize: "12px", color: "var(--pine-soft)", margin: "0 0 5px", lineHeight: 1.55 },
  caveat: {
    background: "var(--warn-bg)",
    border: "1px solid var(--warn-border)",
    color: "var(--warn-text)",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: "12px",
    lineHeight: 1.5,
  },
  caveatLine: { fontSize: "12.5px", color: "var(--warn-text)", margin: "0 0 6px", lineHeight: 1.55 },
  backLink: { fontSize: "13px", color: "var(--muted)", textDecoration: "none" },
};
