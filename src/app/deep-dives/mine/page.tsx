"use client";
// FLOOR GUIDE / PHASE C — the contributor's answer surface.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE ONE THING THIS PAGE MUST GET RIGHT: THE DISCLOSURE, ABOVE THE BOX,
// BEFORE THEY TYPE (DECISION 1).
//
// This is the only surface in the product where a contributor's words are
// assessed under their name, and it is legitimate ONLY because it says so
// first. The disclosure is load-bearing product, not a legal line: it must be
// impossible to answer without having had it on screen, which is why it is
// rendered INSIDE the answer card, physically above the textarea, always
// expanded, never a tooltip or a link.
//
// ⭐ AND THIS PAGE IS UNMISTAKABLY NOT FLOOR GUIDE (DECISION 2). Different
// route, different header line, and the disclosure says the difference out
// loud. A person who has both surfaces open should never wonder which promise
// applies to the box they are typing in.
//
// ⭐ DECLINE IS ONE CLICK AND LEAVES NOTHING (DECISION 5). No reason field —
// a decline with a required reason is a decline that gets skipped — and the
// confirmation says out loud that nothing was recorded, because the promise
// only works if the person knows it was kept.
// ═══════════════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BrandHeader from "@/components/BrandHeader";

const supabase = createClient();

// ✅ CUSTOMER-FACING COPY APPROVED BY BRIAN — July 29, 2026 (Floor Guide C).
// The disclosure is the single most important string in this phase.
// ═════════════════════════════════════════════════════════════════════════════
const COPY = {
  title: "Deep dives",
  subtitle:
    "Sometimes the person running your account wants to know how the work really gets done — not the manual's version, yours.",
  backToApp: "Dashboard",

  askedBy: (name: string) => `${name} asks:`,

  // ⭐ THE DISCLOSURE. Four facts, in the order they matter to the person:
  // named · compared · manager may see · training may follow · declining is
  // free and silent. Plus the boundary with Floor Guide, said plainly.
  disclosureTitle: "Before you answer — how this one works",
  disclosureBody: (asker: string) =>
    `This is different from asking questions here, and it says so up front. ` +
    `Your answer goes to ${asker} with your name on it, and it gets set next to the team's ` +
    `written playbook. If your way is different, your manager may see that. A difference ` +
    `isn't a mark against you — most of the time it means your training skipped something, ` +
    `and the fix is training, which may be offered to you. And if your way turns out to be ` +
    `better, it can be written up and credited to you, the same way any shared idea is.`,
  disclosureDecline:
    "Don't want to answer? Decline below. Nothing is recorded when you do — no note, no list, nobody told.",

  placeholder:
    "What you actually do, step by step. What you look for, what you'd never skip, and when your way changes…",
  send: "Send my answer",
  sending: "Sending…",
  decline: "I'd rather not answer this one",
  declining: "Taking it off your list…",

  answeredChip: "Answered",
  answeredNote: (when: string) => `You answered this on ${when}. It's with the person who asked.`,

  empty: "Nothing's been asked of you. When someone running the account wants to know how you really do something, it lands here — and you'll always be able to say no.",
  loading: "Loading…",
  failed: "Couldn't load this just now. Reload and it should come back.",
};
// ═════════════════════════════════════════════════════════════════════════════

type Ask = { id: string; topic: string; asked_by: string; created_at: string };
type Answered = { id: string; topic: string; asked_by: string; answered_at: string | null };

type Payload = { open: number; asks: Ask[]; answered: Answered[] };

export default function DeepDivesMinePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Cache-bust — the P-9 lesson: a fresh write read back through a cached
      // GET looks like the write didn't land.
      const res = await fetch(`/api/deep-dives/mine?t=${Date.now()}`, { cache: "no-store" });
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
    async (id: string, action: "answer" | "decline") => {
      if (busyId) return;
      setBusyId(id);
      setNote(null);
      try {
        const res = await fetch(`/api/deep-dives/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            action === "answer" ? { action, answer: drafts[id] ?? "" } : { action }
          ),
        });
        const body = await res.json();
        if (!res.ok) {
          setError(typeof body?.error === "string" ? body.error : COPY.failed);
        } else {
          setError(null);
          setNote(typeof body?.message === "string" ? body.message : null);
          setDrafts((d) => ({ ...d, [id]: "" }));
          await load();
        }
      } catch {
        setError(COPY.failed);
      } finally {
        setBusyId(null);
      }
    },
    [busyId, drafts, load]
  );

  if (checking) {
    return (
      <div style={styles.center}>
        <p>{COPY.loading}</p>
      </div>
    );
  }

  const asks = data?.asks ?? [];
  const answered = data?.answered ?? [];

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

        {!loading && asks.length === 0 && answered.length === 0 && (
          <div style={styles.emptyCard}>
            <p style={{ margin: 0 }}>{COPY.empty}</p>
          </div>
        )}

        {asks.map((ask) => (
          <div key={ask.id} style={styles.card}>
            <p style={styles.askedBy}>{COPY.askedBy(ask.asked_by)}</p>
            <p style={styles.topic}>{ask.topic}</p>

            {/* ⭐ THE DISCLOSURE — above the box, always, in full. */}
            <div style={styles.disclosure}>
              <p style={styles.disclosureTitle}>{COPY.disclosureTitle}</p>
              <p style={styles.disclosureBody}>{COPY.disclosureBody(ask.asked_by)}</p>
              <p style={styles.disclosureBody}>{COPY.disclosureDecline}</p>
            </div>

            <textarea
              style={styles.textarea}
              rows={5}
              placeholder={COPY.placeholder}
              value={drafts[ask.id] ?? ""}
              onChange={(e) => setDrafts((d) => ({ ...d, [ask.id]: e.target.value }))}
            />
            <div style={styles.actionRow}>
              <button
                type="button"
                style={styles.primary}
                disabled={busyId === ask.id || !(drafts[ask.id] ?? "").trim()}
                onClick={() => act(ask.id, "answer")}
              >
                {busyId === ask.id ? COPY.sending : COPY.send}
              </button>
              <button
                type="button"
                style={styles.textButton}
                disabled={busyId === ask.id}
                onClick={() => act(ask.id, "decline")}
              >
                {busyId === ask.id ? COPY.declining : COPY.decline}
              </button>
            </div>
          </div>
        ))}

        {answered.map((a) => (
          <div key={a.id} style={styles.cardDone}>
            <div style={styles.doneTop}>
              <span style={styles.doneChip}>{COPY.answeredChip}</span>
              <span style={styles.askedByInline}>{COPY.askedBy(a.asked_by)}</span>
            </div>
            <p style={styles.topicDone}>{a.topic}</p>
            <p style={styles.doneNote}>
              {COPY.answeredNote(
                a.answered_at ? new Date(a.answered_at).toLocaleDateString() : "—"
              )}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
// Viridescent tokens only. The disclosure box is visually calm (paper-2, pine
// border) — serious, never alarming: amber would read as a warning about the
// PERSON, and the honest register is "here are the rules of this room."
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
  card: {
    background: "var(--white)",
    border: "1px solid var(--line)",
    borderRadius: 14,
    padding: "18px 20px",
    marginBottom: 14,
  },
  cardDone: {
    background: "var(--paper-2)",
    border: "1px solid var(--line)",
    borderRadius: 14,
    padding: "14px 18px",
    marginBottom: 12,
  },
  askedBy: { fontSize: "12px", fontWeight: 700, color: "var(--muted)", margin: "0 0 6px" },
  askedByInline: { fontSize: "12px", fontWeight: 700, color: "var(--muted)" },
  topic: {
    fontSize: "16px",
    fontWeight: 600,
    color: "var(--pine)",
    lineHeight: 1.5,
    margin: "0 0 14px",
  },
  topicDone: {
    fontSize: "14px",
    color: "var(--pine-soft)",
    lineHeight: 1.5,
    margin: "6px 0 6px",
  },
  disclosure: {
    background: "var(--paper-2)",
    border: "1px solid var(--pine-soft)",
    borderRadius: 10,
    padding: "12px 14px",
    marginBottom: 14,
  },
  disclosureTitle: {
    fontSize: "12px",
    fontWeight: 700,
    color: "var(--pine)",
    margin: "0 0 6px",
    letterSpacing: "0.02em",
    textTransform: "uppercase" as const,
  },
  disclosureBody: {
    fontSize: "13px",
    color: "var(--pine)",
    lineHeight: 1.6,
    margin: "0 0 8px",
  },
  textarea: {
    width: "100%",
    boxSizing: "border-box" as const,
    fontSize: "14px",
    fontFamily: "inherit",
    color: "var(--pine)",
    background: "var(--white)",
    border: "1px solid var(--line)",
    borderRadius: 10,
    padding: "10px 12px",
    lineHeight: 1.6,
    resize: "vertical" as const,
  },
  actionRow: { display: "flex", alignItems: "center", gap: 16, marginTop: 12, flexWrap: "wrap" },
  primary: {
    fontSize: "14px",
    fontWeight: 600,
    color: "var(--white)",
    background: "var(--growth)",
    border: "none",
    borderRadius: 8,
    padding: "9px 18px",
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
  doneTop: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  doneChip: {
    fontSize: "11px",
    fontWeight: 700,
    color: "var(--ok-text)",
    background: "var(--ok-bg)",
    border: "1px solid var(--ok-border)",
    borderRadius: 999,
    padding: "3px 9px",
  },
  doneNote: { fontSize: "12px", color: "var(--muted)", margin: 0 },
};
