"use client";
// P-9 Part 4 — MY QUESTIONS. The flywheel made personal.
//
// This is the surface that stops a filled gap from being a black hole to the
// person who hit it. They asked something on a Tuesday, nobody had it, and four
// days later a colleague codified the answer — this is where they find that
// out, and it persists, so they can find it days later without remembering
// where they were when they asked.
//
// ⭐ THE PAYOFF MOMENT: an answered question should make the loop obvious in one
// line — you asked this, nobody had it, now your team does, here's the answer.
// That sentence is the entire product thesis at the scale of one person, so the
// card leads with it rather than burying it under metadata.
//
// PRIVACY: this shows ONLY the caller's own questions (knowledge_gap_askers RLS
// is user_id = auth.uid()). The shared queue at /gaps is the org-wide view, and
// it carries counts, never names.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BrandHeader from "@/components/BrandHeader";

const supabase = createClient();

// ═════════════════════════════════════════════════════════════════════════════
// ⚠️⚠️ DRAFT CUSTOMER-FACING COPY — PENDING BRIAN'S SIGN-OFF (P-9) ⚠️⚠️
// Opportunity framing, Track B register, land the point once.
// ═════════════════════════════════════════════════════════════════════════════
const COPY = {
  title: "Your questions",
  subtitle:
    "Things you asked your team's brain that nobody had codified yet. When someone captures the answer, it shows up here — with their name on it.",
  empty:
    "Nothing here yet. If you ask something your team hasn't codified, you can flag it and we'll bring you the answer when someone fills it in.",
  answeredLead: "You asked this. Nobody had it. Now your team does.",
  waitingOpen: "Still open — nobody has picked this up yet.",
  waitingAnswering: "Someone on your team is capturing the answer now.",
  openFramework: "Read the answer →",
  openTraining: "See the training built from it →",
  answeredBy: (name: string, when: string) => `Answered by ${name} · ${when}`,
  asked: (n: number) => (n === 1 ? "you asked once" : `you asked ${n} times`),
  alsoAsked: (n: number) => (n === 1 ? "only you asked this" : `${n} asks across your team`),
  queueLink: "The team's gaps queue →",
  newBadge: "New answer",
};
// ═════════════════════════════════════════════════════════════════════════════

type MyQuestion = {
  gap_id: string;
  question: string;
  status: "open" | "answering" | "resolved";
  my_asked_count: number;
  org_asked_count: number;
  first_asked_at: string;
  last_asked_at: string;
  unread: boolean;
  answered_at: string | null;
  answered_by_name: string | null;
  framework_id: string | null;
  framework_name: string | null;
  framework_tagline: string | null;
  training_request_id: string | null;
};

export default function MyQuestionsPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<MyQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/gaps/mine");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not load your questions.");
        return;
      }
      setError(null);
      setQuestions((data.questions as MyQuestion[]) || []);
      // Clear the badge AFTER this render's data is in hand, so the person
      // actually sees the "New answer" highlight on the visit that earned it.
      void fetch("/api/gaps/mine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }).catch(() => {});
    } catch {
      setError("Could not load your questions.");
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

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <div style={{ marginBottom: 18 }}>
          <BrandHeader />
        </div>

        <div style={styles.headerRow}>
          <h1 style={styles.title}>💬 {COPY.title}</h1>
          <a href="/gaps" style={styles.newLink}>
            {COPY.queueLink}
          </a>
        </div>
        <p style={styles.subtitle}>{COPY.subtitle}</p>

        {error && <p style={styles.errorText}>{error}</p>}
        {loading && <p style={styles.loadingText}>Loading…</p>}

        {!loading && questions.length === 0 && <div style={styles.emptyCard}>{COPY.empty}</div>}

        {questions.map((q) => {
          const answered = q.status === "resolved" && !!q.framework_id;
          return (
            <div
              key={q.gap_id}
              style={answered ? (q.unread ? styles.answeredCardNew : styles.answeredCard) : styles.waitingCard}
            >
              <div style={styles.cardTop}>
                {q.unread && answered && <span style={styles.newChip}>{COPY.newBadge}</span>}
                <span style={answered ? styles.metaChipOk : styles.metaChip}>
                  {COPY.asked(q.my_asked_count)}
                </span>
                <span style={styles.dateMeta}>{COPY.alsoAsked(q.org_asked_count)}</span>
              </div>

              <p style={styles.question}>&ldquo;{q.question}&rdquo;</p>

              {answered ? (
                <>
                  <p style={styles.payoff}>{COPY.answeredLead}</p>
                  <div style={styles.answerBox}>
                    <div style={styles.frameworkName}>{q.framework_name}</div>
                    {q.framework_tagline && (
                      <p style={styles.frameworkTagline}>{q.framework_tagline}</p>
                    )}
                    <p style={styles.answerMeta}>
                      {COPY.answeredBy(
                        q.answered_by_name || "A teammate",
                        q.answered_at ? new Date(q.answered_at).toLocaleDateString() : ""
                      )}
                    </p>
                    <div style={styles.answerLinks}>
                      <a href={`/library/${q.framework_id}`} style={styles.newLink}>
                        {COPY.openFramework}
                      </a>
                      {q.training_request_id && (
                        <a href={`/training-studio/${q.training_request_id}`} style={styles.newLink}>
                          {COPY.openTraining}
                        </a>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <p style={styles.waitingLine}>
                  {q.status === "answering" ? COPY.waitingAnswering : COPY.waitingOpen}
                </p>
              )}
            </div>
          );
        })}
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
  // Still waiting = amber (attention). Answered = green (it landed).
  waitingCard: {
    background: "var(--warn-bg)",
    border: "1px solid var(--warn-border)",
    borderRadius: 14,
    padding: "16px 18px",
    marginBottom: 12,
  },
  answeredCard: {
    background: "var(--white)",
    border: "1px solid var(--line)",
    borderRadius: 14,
    padding: "16px 18px",
    marginBottom: 12,
  },
  answeredCardNew: {
    background: "var(--white)",
    border: "2px solid var(--growth)",
    borderRadius: 14,
    padding: "15px 17px",
    marginBottom: 12,
  },
  cardTop: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 },
  newChip: {
    fontSize: "11px",
    fontWeight: 700,
    color: "var(--white)",
    background: "var(--growth)",
    border: "1px solid var(--growth)",
    borderRadius: 999,
    padding: "3px 9px",
  },
  metaChip: {
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--warn-text)",
    background: "var(--warn-chip-bg)",
    border: "1px solid var(--warn-border)",
    borderRadius: 999,
    padding: "3px 9px",
  },
  metaChipOk: {
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--growth-deep)",
    background: "var(--growth-soft)",
    border: "1px solid var(--new-leaf-light)",
    borderRadius: 999,
    padding: "3px 9px",
  },
  dateMeta: { fontSize: "11px", color: "var(--muted)" },
  question: { fontSize: "16px", fontWeight: 600, color: "var(--pine)", margin: "0 0 10px", lineHeight: 1.5 },
  payoff: { fontSize: "13px", fontWeight: 700, color: "var(--growth-deep)", margin: "0 0 10px" },
  waitingLine: { fontSize: "13px", color: "var(--warn-text)", margin: 0 },
  answerBox: {
    background: "var(--growth-soft)",
    border: "1px solid var(--new-leaf-light)",
    borderRadius: 10,
    padding: "12px 14px",
  },
  frameworkName: { fontSize: "15px", fontWeight: 700, color: "var(--pine)" },
  frameworkTagline: { fontSize: "13px", color: "var(--pine-soft)", margin: "4px 0 0", lineHeight: 1.45 },
  answerMeta: { fontSize: "12px", color: "var(--muted)", margin: "8px 0 10px" },
  answerLinks: { display: "flex", gap: 16, flexWrap: "wrap" },
};
