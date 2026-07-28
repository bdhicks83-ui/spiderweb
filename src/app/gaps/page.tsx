"use client";
// P-9 Part 3 — THE SHARED GAPS QUEUE.
//
// Every question this org asked that nothing could answer, visible to EVERY
// user in the org. There is deliberately NO routing and NO assignment in v1:
// anyone can pick any gap up. Routing implies the system knows who the right
// expert is, and inventing that on day one would be a confident guess dressed
// as intelligence. Demand first; matching later, if the pilot asks for it.
//
// The list is ordered by DEMAND (asked_count desc), so the questions the org
// keeps hitting rise to the top on their own.
//
// Client-safe imports only — @/lib/knowledge-gaps is server-only (it reaches
// Voyage and expects a service-role client). Everything this page needs comes
// over /api/gaps.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BrandHeader from "@/components/BrandHeader";

const supabase = createClient();

// ═════════════════════════════════════════════════════════════════════════════
// ⚠️⚠️ DRAFT CUSTOMER-FACING COPY — PENDING BRIAN'S SIGN-OFF (P-9) ⚠️⚠️
//
// THE ONE THING TO GET RIGHT: a gap is an OPPORTUNITY, never a failure. Nothing
// on this page may read as "the search didn't work" or "your library is
// incomplete." The frame is: someone asked, the answer exists in a person's
// head, and capturing it is worth doing. Track B register — plain language, no
// Vine/plant metaphors, no "SOP", no AI-product framing. Land it once.
// ═════════════════════════════════════════════════════════════════════════════
const COPY = {
  title: "Gaps worth filling",
  subtitle:
    "Questions your team asked that nobody has codified yet. Each one is judgment that lives in someone's head and nowhere else — and for most of them, somebody here already knows the answer.",
  empty:
    "Nothing open right now. When someone asks your team's brain something it can't answer, it lands here.",
  emptyResolved: "Nothing has been filled yet.",
  noOrg:
    "The gaps queue is a team surface — once you're part of an org, the questions your team can't answer show up here.",
  asked: (n: number) => (n === 1 ? "asked once" : `asked ${n} times`),
  statusOpen: "open",
  statusAnswering: "someone's on it",
  statusResolved: "filled",
  fill: "Fill this gap",
  continueFill: "Continue filling this",
  someoneOn: (name: string) => `${name} is filling this`,
  linkInstead: "Link a framework I already captured",
  linkAction: "Link it",
  linkCancel: "Cancel",
  filledBy: (name: string) => `Filled by ${name}`,
  openFramework: "Open the framework →",
  createTraining: "Turn it into training →",
  showResolved: "Show filled gaps",
  hideResolved: "Hide filled gaps",
  myQuestions: "Your questions →",
  reopenedNote:
    "This was filled once and came back — the framework that answered it isn't reaching people. Worth a look.",
};
// ═════════════════════════════════════════════════════════════════════════════

type Gap = {
  id: string;
  question: string;
  status: "open" | "answering" | "resolved";
  asked_count: number;
  first_asked_at: string;
  last_asked_at: string;
  claimed_by_name: string | null;
  claimed_at: string | null;
  claimed_by_me: boolean;
  resolved_by_name: string | null;
  resolved_at: string | null;
  resolved_record_id: string | null;
  resolved_framework_name: string | null;
};

type MyFramework = { id: string; name: string };

const STATUS_CHIP: Record<Gap["status"], { label: string; color: string; bg: string; border: string }> = {
  // Amber for anything still open — attention, NOT error. Green fill only once
  // it is actually filled, same fill-vs-outline doctrine as the rest of the app.
  open: {
    label: COPY.statusOpen,
    color: "var(--warn-strong)",
    bg: "var(--warn-bg)",
    border: "var(--warn-border)",
  },
  answering: {
    label: COPY.statusAnswering,
    color: "var(--growth-deep)",
    bg: "var(--white)",
    border: "var(--growth)",
  },
  resolved: {
    label: COPY.statusResolved,
    color: "var(--ok-text)",
    bg: "var(--ok-bg)",
    border: "var(--ok-border)",
  },
};

export default function GapsPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(true);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [hasOrg, setHasOrg] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // The manual override for the reconciler (see reconcileAnsweringGaps): when
  // someone captured the framework in a different session than the one the
  // claim expected, they point at it by hand.
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [myFrameworks, setMyFrameworks] = useState<MyFramework[] | null>(null);
  const [chosenRecord, setChosenRecord] = useState("");

  const load = useCallback(async (withResolved: boolean) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/gaps${withResolved ? "?include=resolved" : ""}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not load the queue.");
        return;
      }
      setError(null);
      setHasOrg(data.org !== false);
      setGaps((data.gaps as Gap[]) || []);
    } catch {
      setError("Could not load the queue.");
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
      await load(false);
    })();
  }, [router, load]);

  async function claimAndAnswer(gap: Gap) {
    if (busyId) return;
    setBusyId(gap.id);
    try {
      // Claim first so the queue shows someone is on it even if the person
      // takes a while inside the interview.
      await fetch(`/api/gaps/${gap.id}/claim`, { method: "POST" });
    } catch {
      // A failed claim is not worth blocking the capture — the gap simply
      // stays 'open' and the reconciler has nothing to match. Go anyway.
    }
    router.push(`/codify?gap=${gap.id}`);
  }

  async function openLinker(gapId: string) {
    setLinkingId(gapId);
    setChosenRecord("");
    if (myFrameworks) return;
    try {
      const res = await fetch("/api/library");
      const data = await res.json();
      const rows = (data.records as { id: string; is_mine: boolean; framework: { name?: string } | null }[]) || [];
      setMyFrameworks(
        rows
          .filter((r) => r.is_mine && r.framework)
          .map((r) => ({ id: r.id, name: r.framework?.name || "(framework)" }))
      );
    } catch {
      setMyFrameworks([]);
    }
  }

  async function linkFramework(gapId: string) {
    if (!chosenRecord || busyId) return;
    setBusyId(gapId);
    try {
      const res = await fetch(`/api/gaps/${gapId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ record_id: chosenRecord }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not link that framework.");
      } else {
        setLinkingId(null);
        await load(showResolved);
      }
    } catch {
      setError("Could not link that framework.");
    } finally {
      setBusyId(null);
    }
  }

  if (checking) {
    return (
      <div style={styles.center}>
        <p>Loading…</p>
      </div>
    );
  }

  const open = gaps.filter((g) => g.status !== "resolved");
  const resolved = gaps.filter((g) => g.status === "resolved");

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <div style={{ marginBottom: 18 }}>
          <BrandHeader />
        </div>

        <div style={styles.headerRow}>
          <h1 style={styles.title}>🧩 {COPY.title}</h1>
          <div style={styles.headerLinks}>
            <a href="/gaps/mine" style={styles.headerLink}>
              {COPY.myQuestions}
            </a>
            <a href="/retrieve" style={styles.newLink}>
              🔍 Ask your team&apos;s brain
            </a>
          </div>
        </div>
        <p style={styles.subtitle}>{COPY.subtitle}</p>

        {error && <p style={styles.errorText}>{error}</p>}

        {!hasOrg && <div style={styles.emptyCard}>{COPY.noOrg}</div>}

        {hasOrg && loading && <p style={styles.loadingText}>Loading the queue…</p>}

        {hasOrg && !loading && open.length === 0 && (
          <div style={styles.emptyCard}>{COPY.empty}</div>
        )}

        {open.map((g) => {
          const chip = STATUS_CHIP[g.status];
          return (
            <div key={g.id} style={styles.card}>
              <div style={styles.cardTop}>
                <span
                  style={{ ...styles.chip, color: chip.color, background: chip.bg, borderColor: chip.border }}
                >
                  {chip.label}
                </span>
                <span style={styles.askedChip}>{COPY.asked(g.asked_count)}</span>
                <span style={styles.dateMeta}>
                  first asked {new Date(g.first_asked_at).toLocaleDateString()}
                </span>
              </div>

              <p style={styles.question}>&ldquo;{g.question}&rdquo;</p>

              {g.resolved_record_id && g.status !== "resolved" && (
                <p style={styles.reopened}>{COPY.reopenedNote}</p>
              )}

              <div style={styles.actionRow}>
                {g.status === "answering" && !g.claimed_by_me ? (
                  <span style={styles.someoneOn}>
                    {COPY.someoneOn(g.claimed_by_name || "A teammate")}
                  </span>
                ) : (
                  <button
                    type="button"
                    style={styles.fillButton}
                    disabled={busyId === g.id}
                    onClick={() => claimAndAnswer(g)}
                  >
                    {g.claimed_by_me ? COPY.continueFill : COPY.fill}
                  </button>
                )}

                {linkingId === g.id ? (
                  <span style={styles.linkRow}>
                    <select
                      style={styles.select}
                      value={chosenRecord}
                      onChange={(e) => setChosenRecord(e.target.value)}
                    >
                      <option value="">Choose one of your frameworks…</option>
                      {(myFrameworks || []).map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      style={styles.secondaryButton}
                      disabled={!chosenRecord || busyId === g.id}
                      onClick={() => linkFramework(g.id)}
                    >
                      {COPY.linkAction}
                    </button>
                    <button type="button" style={styles.textButton} onClick={() => setLinkingId(null)}>
                      {COPY.linkCancel}
                    </button>
                  </span>
                ) : (
                  <button type="button" style={styles.textButton} onClick={() => openLinker(g.id)}>
                    {COPY.linkInstead}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {hasOrg && (
          <button
            type="button"
            style={styles.toggleButton}
            onClick={async () => {
              const next = !showResolved;
              setShowResolved(next);
              await load(next);
            }}
          >
            {showResolved ? COPY.hideResolved : COPY.showResolved}
          </button>
        )}

        {showResolved && (
          <>
            {resolved.length === 0 && <p style={styles.loadingText}>{COPY.emptyResolved}</p>}
            {resolved.map((g) => (
              <div key={g.id} style={styles.resolvedCard}>
                <div style={styles.cardTop}>
                  <span
                    style={{
                      ...styles.chip,
                      color: STATUS_CHIP.resolved.color,
                      background: STATUS_CHIP.resolved.bg,
                      borderColor: STATUS_CHIP.resolved.border,
                    }}
                  >
                    {STATUS_CHIP.resolved.label}
                  </span>
                  <span style={styles.askedChip}>{COPY.asked(g.asked_count)}</span>
                </div>
                <p style={styles.question}>&ldquo;{g.question}&rdquo;</p>
                <p style={styles.resolvedMeta}>
                  {COPY.filledBy(g.resolved_by_name || "A teammate")}
                  {g.resolved_framework_name ? ` · ${g.resolved_framework_name}` : ""}
                </p>
                <div style={styles.answerLinks}>
                  {g.resolved_record_id && (
                    <a href={`/library/${g.resolved_record_id}`} style={styles.newLink}>
                      {COPY.openFramework}
                    </a>
                  )}
                  {/* The optional second step: judgment first, delivery second. */}
                  <a href={`/training-studio?gap=${g.id}`} style={styles.newLink}>
                    {COPY.createTraining}
                  </a>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { minHeight: "100vh", fontFamily: "var(--font-sans)" },
  container: { maxWidth: 760, margin: "0 auto", padding: "40px 24px 80px" },
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
    marginBottom: 4,
  },
  title: { fontSize: "26px", margin: 0 },
  headerLinks: { display: "flex", alignItems: "center", gap: 16 },
  headerLink: { fontSize: "14px", fontWeight: 600, color: "var(--pine)", textDecoration: "none" },
  newLink: { fontSize: "14px", fontWeight: 600, color: "var(--growth)", textDecoration: "none" },
  subtitle: { color: "var(--muted)", fontSize: "14px", margin: "6px 0 22px", lineHeight: 1.55 },
  errorText: { color: "var(--danger)", fontSize: "14px" },
  loadingText: { color: "var(--muted)", fontSize: "14px" },
  emptyCard: {
    background: "var(--white)",
    border: "1px dashed var(--line)",
    borderRadius: 14,
    padding: "28px 24px",
    fontSize: "14px",
    color: "var(--pine-soft)",
    lineHeight: 1.6,
  },
  // Amber card body: this is an open piece of work, and it should read as one.
  card: {
    background: "var(--warn-bg)",
    border: "1px solid var(--warn-border)",
    borderRadius: 14,
    padding: "16px 18px",
    marginBottom: 12,
  },
  resolvedCard: {
    background: "var(--white)",
    border: "1px solid var(--line)",
    borderRadius: 14,
    padding: "16px 18px",
    marginBottom: 12,
  },
  cardTop: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 },
  chip: { fontSize: "11px", fontWeight: 700, border: "1px solid", borderRadius: 999, padding: "3px 9px" },
  askedChip: {
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--warn-text)",
    background: "var(--warn-chip-bg)",
    border: "1px solid var(--warn-border)",
    borderRadius: 999,
    padding: "3px 9px",
  },
  dateMeta: { fontSize: "11px", color: "var(--muted)" },
  question: { fontSize: "16px", fontWeight: 600, color: "var(--pine)", margin: "0 0 10px", lineHeight: 1.5 },
  reopened: { fontSize: "12px", color: "var(--warn-strong)", margin: "0 0 10px", lineHeight: 1.5 },
  actionRow: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  fillButton: {
    fontSize: "14px",
    fontWeight: 600,
    color: "var(--white)",
    background: "var(--growth)",
    border: "none",
    borderRadius: 8,
    padding: "8px 16px",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  secondaryButton: {
    fontSize: "13px",
    fontWeight: 600,
    color: "var(--growth-deep)",
    background: "var(--growth-soft)",
    border: "1px solid var(--new-leaf-light)",
    borderRadius: 8,
    padding: "7px 12px",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  textButton: {
    fontSize: "12px",
    fontWeight: 600,
    color: "var(--warn-text)",
    background: "transparent",
    border: "none",
    padding: 0,
    cursor: "pointer",
    textDecoration: "underline",
    fontFamily: "inherit",
  },
  linkRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  select: {
    fontSize: "13px",
    fontFamily: "inherit",
    color: "var(--pine)",
    background: "var(--white)",
    border: "1px solid var(--line)",
    borderRadius: 8,
    padding: "7px 10px",
    maxWidth: 260,
  },
  someoneOn: { fontSize: "13px", fontWeight: 600, color: "var(--growth-deep)" },
  resolvedMeta: { fontSize: "12px", color: "var(--muted)", margin: "0 0 8px" },
  answerLinks: { display: "flex", gap: 18, flexWrap: "wrap" },
  toggleButton: {
    marginTop: 14,
    fontSize: "13px",
    fontWeight: 600,
    color: "var(--muted)",
    background: "transparent",
    border: "none",
    padding: 0,
    cursor: "pointer",
    textDecoration: "underline",
    fontFamily: "inherit",
  },
};
