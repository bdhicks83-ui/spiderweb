"use client";
// FLOOR GUIDE / PHASE B — the admin review queue.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE ONE THING THIS PAGE MUST GET RIGHT: an administrator has to be willing to
// open it next week.
//
// A review queue is not a hard interface to build. It is a very easy one to
// build badly, and it fails in exactly one way: it fills with things that were
// not worth reading, somebody learns that, and it is never opened again. Every
// real idea after that point is lost — so a noisy queue is worse than no queue,
// not merely less good. That is why passive detection is tuned to stay silent
// and why this page shows the source of every row: "somebody chose to send this"
// and "we thought this looked interesting" deserve different amounts of trust,
// and hiding which is which would spend the first one's credibility on the
// second.
//
// ⭐ THREE ACTIONS, AND ONE OF THEM IS SILENT ON PURPOSE. Promote, send to an
// expert, close. Closing tells the contributor NOTHING — no rejection notice, no
// "reviewed and declined." The confirmation text says so out loud, because an
// admin who assumes the person is being told will hesitate to close anything,
// and a queue nobody closes is a queue nobody trusts either.
//
// Also visible to a non-admin expert, but only for the one candidate an admin
// routed to them. The API enforces that; this page just renders what it gets.
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
  title: "Ideas from the floor",
  subtitle:
    "Your people see things the library doesn't have yet. Nothing here is judgment until you say so.",
  backToApp: "Dashboard",

  sourceExplicit: "Shared directly",
  sourcePassive: "Noticed",
  explicitNote: (name: string) => `${name} chose to send this.`,
  passiveNote: "Surfaced automatically. High confidence only — you won't get flooded.",

  promote: "Make it a Framework",
  promoting: "Writing it up…",
  route: "Send to an expert",
  routing: "Sending…",
  dismiss: "Not this one",
  dismissing: "Closing…",
  chooseExpert: "Who should take this on?",
  chooseExpertPlaceholder: "Pick a person",
  confirmRoute: "Send it",
  cancel: "Cancel",

  statusRouted: (name: string | null) => (name ? `With ${name}` : "With an expert"),
  statusPromoted: "In the library",
  openFramework: "See the framework →",

  empty:
    "Nothing waiting. When someone on the floor says something worth writing down, it lands here.",
  emptyNotAdmin:
    "Nothing's been routed to you. When an admin sends you something from the floor, it'll show up here.",
  loading: "Loading…",
  failed: "Couldn't load the queue just now. Reload and it should come back.",
  needExpert: "Pick who should take this on first.",
};
// ═════════════════════════════════════════════════════════════════════════════

type ProfileLite = { id: string; display_name: string | null; claimed_title: string | null };

type QueueItem = {
  id: string;
  source: "explicit" | "passive";
  surface: string | null;
  raw_input: string;
  context_note: string | null;
  summary: string | null;
  suggested_title: string | null;
  confidence: number | null;
  status: "new" | "reviewing" | "promoted" | "routed" | "dismissed";
  created_at: string;
  promoted_record_id: string | null;
  person: ProfileLite | null;
  routed_to: ProfileLite | null;
  acted_by_name: string | null;
  routed_to_me: boolean;
};

type Payload = {
  can_review: boolean;
  experts: ProfileLite[];
  counts: { waiting: number; explicit: number; routed_to_me: number };
  queue: QueueItem[];
};

export default function InsightsQueuePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [routingId, setRoutingId] = useState<string | null>(null);
  const [chosenExpert, setChosenExpert] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Cache-bust, the P-9 lesson: a freshly written row read back through a
      // cached GET reads as "the write didn't land."
      const res = await fetch(`/api/insights?t=${Date.now()}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) {
        setError(typeof body?.error === "string" ? body.error : COPY.failed);
        setData(null);
        return;
      }
      setError(null);
      setData(body as Payload);
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

  const act = useCallback(
    async (id: string, action: "promote" | "route" | "dismiss", expertId?: string) => {
      if (busyId) return;
      setBusyId(id);
      setNote(null);
      try {
        const res = await fetch(`/api/insights/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, expert_id: expertId ?? null }),
        });
        const body = await res.json();
        if (!res.ok) {
          setError(typeof body?.error === "string" ? body.error : COPY.failed);
        } else {
          setError(null);
          setNote(typeof body?.message === "string" ? body.message : null);
          setRoutingId(null);
          setChosenExpert("");
          await load();
        }
      } catch {
        setError(COPY.failed);
      } finally {
        setBusyId(null);
      }
    },
    [busyId, load]
  );

  if (checking) {
    return (
      <div style={styles.center}>
        <p>{COPY.loading}</p>
      </div>
    );
  }

  const queue = data?.queue ?? [];
  const experts = data?.experts ?? [];
  const canReview = data?.can_review === true;

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

        {note && <p style={styles.noteText}>{note}</p>}
        {error && <p style={styles.errorText}>{error}</p>}
        {loading && <p style={styles.loadingText}>{COPY.loading}</p>}

        {!loading && queue.length === 0 && (
          <div style={styles.emptyCard}>
            <p style={{ margin: 0 }}>{canReview ? COPY.empty : COPY.emptyNotAdmin}</p>
          </div>
        )}

        {queue.map((item) => {
          const explicit = item.source === "explicit";
          const actionable =
            (canReview || item.routed_to_me) &&
            (item.status === "new" || item.status === "reviewing" || item.status === "routed");
          return (
            <div key={item.id} style={explicit ? styles.cardExplicit : styles.cardPassive}>
              <div style={styles.cardTop}>
                <span style={explicit ? styles.chipExplicit : styles.chipPassive}>
                  {explicit ? COPY.sourceExplicit : COPY.sourcePassive}
                </span>
                <span style={styles.personName}>
                  {item.person?.display_name ?? "Someone on the floor"}
                </span>
                {item.person?.claimed_title && (
                  <span style={styles.personaTag}>{item.person.claimed_title}</span>
                )}
                <span style={styles.date}>{new Date(item.created_at).toLocaleDateString()}</span>
              </div>

              {/* Their words, verbatim. An admin judging whether this is real
                  judgment needs the person's own phrasing, not a paraphrase. */}
              <p style={styles.idea}>{item.raw_input}</p>

              {item.summary && <p style={styles.summary}>{item.summary}</p>}
              <p style={styles.sourceNote}>
                {explicit
                  ? COPY.explicitNote(item.person?.display_name ?? "They")
                  : COPY.passiveNote}
              </p>

              {item.status === "promoted" && (
                <div style={styles.settledRow}>
                  <span style={styles.settledChip}>{COPY.statusPromoted}</span>
                  {item.promoted_record_id && (
                    <a href={`/library/${item.promoted_record_id}`} style={styles.link}>
                      {COPY.openFramework}
                    </a>
                  )}
                </div>
              )}
              {item.status === "routed" && !actionable && (
                <div style={styles.settledRow}>
                  <span style={styles.settledChip}>
                    {COPY.statusRouted(item.routed_to?.display_name ?? null)}
                  </span>
                </div>
              )}

              {actionable && routingId !== item.id && (
                <div style={styles.actionRow}>
                  <button
                    type="button"
                    style={styles.primary}
                    disabled={busyId === item.id}
                    onClick={() => act(item.id, "promote")}
                  >
                    {busyId === item.id ? COPY.promoting : COPY.promote}
                  </button>
                  {canReview && (
                    <button
                      type="button"
                      style={styles.secondary}
                      disabled={busyId === item.id}
                      onClick={() => {
                        setRoutingId(item.id);
                        setChosenExpert("");
                      }}
                    >
                      {COPY.route}
                    </button>
                  )}
                  <button
                    type="button"
                    style={styles.textButton}
                    disabled={busyId === item.id}
                    onClick={() => act(item.id, "dismiss")}
                  >
                    {busyId === item.id ? COPY.dismissing : COPY.dismiss}
                  </button>
                </div>
              )}

              {actionable && routingId === item.id && (
                <div style={styles.routeBox}>
                  <label style={styles.label} htmlFor={`expert-${item.id}`}>
                    {COPY.chooseExpert}
                  </label>
                  <select
                    id={`expert-${item.id}`}
                    style={styles.select}
                    value={chosenExpert}
                    onChange={(e) => setChosenExpert(e.target.value)}
                  >
                    <option value="">{COPY.chooseExpertPlaceholder}</option>
                    {experts
                      .filter((e) => e.id !== item.person?.id)
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.display_name ?? "Org member"}
                          {e.claimed_title ? ` — ${e.claimed_title}` : ""}
                        </option>
                      ))}
                  </select>
                  <div style={styles.actionRow}>
                    <button
                      type="button"
                      style={styles.primary}
                      disabled={busyId === item.id || !chosenExpert}
                      onClick={() => {
                        if (!chosenExpert) {
                          setError(COPY.needExpert);
                          return;
                        }
                        act(item.id, "route", chosenExpert);
                      }}
                    >
                      {busyId === item.id ? COPY.routing : COPY.confirmRoute}
                    </button>
                    <button
                      type="button"
                      style={styles.textButton}
                      onClick={() => setRoutingId(null)}
                    >
                      {COPY.cancel}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
// Viridescent tokens only. An explicit share gets the warmer, stronger card
// because somebody chose to send it; a passive candidate gets the plain one. The
// visual difference IS the tiering, and it is the first thing an admin reads.
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
    marginBottom: 18,
  },
  headerLink: { fontSize: "14px", fontWeight: 600, color: "var(--pine)", textDecoration: "none" },
  title: { fontSize: "26px", margin: 0 },
  subtitle: { color: "var(--muted)", fontSize: "14px", margin: "6px 0 22px", lineHeight: 1.55 },
  noteText: { color: "var(--ok-text)", fontSize: "14px", margin: "0 0 14px" },
  errorText: { color: "var(--danger)", fontSize: "14px", margin: "0 0 14px" },
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
  cardExplicit: {
    background: "var(--growth-soft)",
    border: "1px solid var(--new-leaf-light)",
    borderRadius: 14,
    padding: "16px 18px",
    marginBottom: 12,
  },
  cardPassive: {
    background: "var(--white)",
    border: "1px solid var(--line)",
    borderRadius: 14,
    padding: "16px 18px",
    marginBottom: 12,
  },
  cardTop: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    fontSize: "12px",
    color: "var(--muted)",
    marginBottom: 10,
  },
  chipExplicit: {
    fontSize: "11px",
    fontWeight: 700,
    color: "var(--growth-deep)",
    background: "var(--white)",
    border: "1px solid var(--growth)",
    borderRadius: 999,
    padding: "3px 9px",
  },
  chipPassive: {
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--muted)",
    background: "var(--paper-2)",
    border: "1px solid var(--line)",
    borderRadius: 999,
    padding: "3px 9px",
  },
  personName: { fontWeight: 700, color: "var(--pine)", fontSize: "13px" },
  personaTag: {
    background: "var(--paper-2)",
    borderRadius: 999,
    padding: "1px 7px",
    fontSize: "11px",
  },
  date: { marginLeft: "auto" },
  idea: {
    fontSize: "15px",
    color: "var(--pine)",
    lineHeight: 1.6,
    margin: "0 0 10px",
    whiteSpace: "pre-wrap",
  },
  summary: {
    fontSize: "13px",
    color: "var(--pine-soft)",
    lineHeight: 1.55,
    margin: "0 0 8px",
    fontStyle: "italic",
  },
  sourceNote: { fontSize: "12px", color: "var(--muted)", margin: "0 0 4px" },
  settledRow: { display: "flex", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" },
  settledChip: {
    fontSize: "11px",
    fontWeight: 700,
    color: "var(--ok-text)",
    background: "var(--ok-bg)",
    border: "1px solid var(--ok-border)",
    borderRadius: 999,
    padding: "3px 9px",
  },
  actionRow: { display: "flex", alignItems: "center", gap: 14, marginTop: 12, flexWrap: "wrap" },
  routeBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTop: "1px solid var(--line)",
  },
  label: { display: "block", fontSize: "13px", fontWeight: 600, color: "var(--pine)", marginBottom: 6 },
  select: {
    fontSize: "13px",
    fontFamily: "inherit",
    color: "var(--pine)",
    background: "var(--white)",
    border: "1px solid var(--line)",
    borderRadius: 8,
    padding: "7px 10px",
    maxWidth: 320,
  },
  primary: {
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
  secondary: {
    fontSize: "13px",
    fontWeight: 600,
    color: "var(--growth-deep)",
    background: "var(--white)",
    border: "1px solid var(--new-leaf-light)",
    borderRadius: 8,
    padding: "7px 12px",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  textButton: {
    fontSize: "12px",
    fontWeight: 600,
    color: "var(--muted)",
    background: "transparent",
    border: "none",
    padding: 0,
    cursor: "pointer",
    textDecoration: "underline",
    fontFamily: "inherit",
  },
  link: { fontSize: "13px", fontWeight: 600, color: "var(--growth)", textDecoration: "none" },
};
