"use client";
// FLOOR GUIDE / PHASE B — what became of the things you shared. POSITIVE-ONLY.
//
// ═══════════════════════════════════════════════════════════════════════════
// ⭐ THERE IS NO REJECTION STATE ON THIS PAGE AND THERE IS NO CODE HERE THAT
// HIDES ONE.
//
// The read policy on candidate_insights excludes dismissed rows from the person
// who surfaced them (supabase/floorguide-b-emergent-insight.sql, DECISION 1). So
// this page cannot render a dismissal even if somebody later adds a status chip
// for one. That is the correct place for the rule: a filter in this file would be
// one refactor away from being forgotten, and the failure would be silent and
// personal — somebody learning months later that their idea was turned down.
//
// The product reason, plainly: the second a person finds out an idea of theirs
// was declined, they stop offering them. There are maybe three people on any
// floor who will volunteer what they know unprompted, and this feature exists
// entirely to hear from them.
//
// WHAT THIS PAGE IS FOR EMOTIONALLY: the payoff. Somebody offered something and
// found out it mattered. The promoted state is the loudest thing on the screen
// and it names the expert who took it on, because "an expert put their name next
// to your idea" is the recognition — not the row in a table.
// ═══════════════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BrandHeader from "@/components/BrandHeader";

const supabase = createClient();

// ⚠️⚠️ DRAFT CUSTOMER-FACING COPY — PENDING BRIAN'S SIGN-OFF (Floor Guide B).
// Full draft set in claude/COPY-DRAFT-floorguide-phaseB.md.
// ═════════════════════════════════════════════════════════════════════════════
const COPY = {
  title: "Things you've shared",
  subtitle: "What you told your team, and where it got to.",
  backToApp: "Dashboard",

  // The bigger moment. Deliberately about reach, not about status: the reward is
  // that other people get your thinking, not that a record changed state.
  promotedTitle: "That's in the playbook now.",
  promotedBody: (framework: string, expert: string | null) =>
    expert
      ? `"${framework}" — surfaced by you, codified with ${expert}. Anybody on your team who asks about this now gets your thinking.`
      : `"${framework}" — surfaced by you. Anybody on your team who asks about this now gets your thinking.`,
  openFramework: "See it →",

  routedTitle: (expert: string | null) =>
    expert ? `${expert} is taking a look at your idea.` : "An expert is taking a look at your idea.",
  routedBody: "It's going into the library properly. Your name stays on it.",

  noticedTitle: "Your idea's with your leadership team.",
  noticedBody: "Someone reads every one of these.",

  spottedTitle: "You spotted something.",
  spottedBody:
    "Something you said reads like real judgment — a way of working the library doesn't have yet. It's in front of your leadership team now.",

  empty:
    "Nothing here yet. When you tell your team how you do something, it'll show up here — and you'll see where it goes.",
  loading: "Loading…",
  failed: "Couldn't load that just now. Reload and it should come back.",
};
// ═════════════════════════════════════════════════════════════════════════════

type Idea = {
  id: string;
  created_at: string;
  source: "explicit" | "passive";
  status: "new" | "reviewing" | "promoted" | "routed" | "dismissed";
  raw_input: string;
  summary: string | null;
  unread: boolean;
  framework: { name: string | null; tagline: string | null } | null;
  record_id: string | null;
  codified_with: string | null;
  routed_to: string | null;
};

export default function MyIdeasPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(true);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/insights/mine?t=${Date.now()}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) {
        setError(typeof body?.error === "string" ? body.error : COPY.failed);
        return;
      }
      setError(null);
      setIdeas(Array.isArray(body?.ideas) ? (body.ideas as Idea[]) : []);
      // Opening the page IS reading it. Fire-and-forget: a failed read receipt
      // just means the badge stays lit, which is harmless.
      fetch("/api/insights/mine", { method: "POST" }).catch(() => {});
    } catch {
      setError(COPY.failed);
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
        <p>{COPY.loading}</p>
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <div style={styles.headerRow}>
          <BrandHeader />
          <a href="/dashboard" style={styles.headerLink}>
            {COPY.backToApp}
          </a>
        </div>

        <h1 style={styles.title}>{COPY.title}</h1>
        <p style={styles.subtitle}>{COPY.subtitle}</p>

        {error && <p style={styles.errorText}>{error}</p>}
        {loading && <p style={styles.loadingText}>{COPY.loading}</p>}

        {!loading && ideas.length === 0 && !error && (
          <div style={styles.emptyCard}>
            <p style={{ margin: 0 }}>{COPY.empty}</p>
          </div>
        )}

        {ideas.map((idea) => {
          const promoted = idea.status === "promoted";
          const routed = idea.status === "routed";
          const name = idea.framework?.name ?? COPY.promotedTitle;
          return (
            <div key={idea.id} style={promoted ? styles.cardWin : styles.card}>
              {promoted ? (
                <>
                  <div style={styles.winTitle}>{COPY.promotedTitle}</div>
                  <p style={styles.winBody}>{COPY.promotedBody(name, idea.codified_with)}</p>
                  {idea.record_id && (
                    <a href={`/library/${idea.record_id}`} style={styles.link}>
                      {COPY.openFramework}
                    </a>
                  )}
                </>
              ) : routed ? (
                <>
                  <div style={styles.cardTitle}>{COPY.routedTitle(idea.routed_to)}</div>
                  <p style={styles.cardBody}>{COPY.routedBody}</p>
                </>
              ) : (
                <>
                  <div style={styles.cardTitle}>
                    {idea.source === "passive" ? COPY.spottedTitle : COPY.noticedTitle}
                  </div>
                  <p style={styles.cardBody}>
                    {idea.source === "passive" ? COPY.spottedBody : COPY.noticedBody}
                  </p>
                </>
              )}

              {/* Their own words, kept next to the outcome. Somebody looking at
                  a promotion months later should be able to see what they said. */}
              <p style={styles.quote}>“{idea.summary ?? idea.raw_input}”</p>
              <div style={styles.metaRow}>
                <span>{new Date(idea.created_at).toLocaleDateString()}</span>
                {idea.unread && <span style={styles.newChip}>New</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
// Viridescent tokens only. The promoted card is the ONLY loud thing on the page
// — deeper green, heavier title — because it is the one moment worth celebrating
// and nothing should compete with it.
const styles: Record<string, React.CSSProperties> = {
  wrapper: { minHeight: "100vh", fontFamily: "var(--font-sans)" },
  container: { maxWidth: 720, margin: "0 auto", padding: "40px 24px 80px" },
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
    marginBottom: 18,
  },
  headerLink: { fontSize: "14px", fontWeight: 600, color: "var(--pine)", textDecoration: "none" },
  title: { fontSize: "26px", margin: 0 },
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
  card: {
    background: "var(--white)",
    border: "1px solid var(--line)",
    borderRadius: 14,
    padding: "16px 18px",
    marginBottom: 12,
  },
  cardWin: {
    background: "var(--growth-soft)",
    border: "1px solid var(--growth)",
    borderRadius: 14,
    padding: "18px 20px",
    marginBottom: 12,
  },
  cardTitle: {
    fontFamily: "var(--font-serif)",
    fontSize: "17px",
    color: "var(--pine)",
    marginBottom: 6,
  },
  winTitle: {
    fontFamily: "var(--font-serif)",
    fontSize: "20px",
    color: "var(--growth-deep)",
    marginBottom: 8,
  },
  cardBody: { fontSize: "14px", color: "var(--pine-soft)", lineHeight: 1.6, margin: "0 0 10px" },
  winBody: { fontSize: "15px", color: "var(--pine)", lineHeight: 1.6, margin: "0 0 10px" },
  quote: {
    fontSize: "13px",
    color: "var(--muted)",
    fontStyle: "italic",
    lineHeight: 1.55,
    margin: "10px 0 0",
    paddingTop: 10,
    borderTop: "1px solid var(--line)",
  },
  metaRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: "12px",
    color: "var(--muted)",
    marginTop: 8,
  },
  newChip: {
    fontSize: "11px",
    fontWeight: 700,
    color: "var(--growth-deep)",
    background: "var(--new-leaf-light)",
    border: "1px solid var(--new-leaf)",
    borderRadius: 999,
    padding: "2px 8px",
  },
  link: { fontSize: "13px", fontWeight: 600, color: "var(--growth)", textDecoration: "none" },
};
