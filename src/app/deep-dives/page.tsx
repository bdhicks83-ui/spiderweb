"use client";
// FLOOR GUIDE / PHASE C — the deep-dive review surface.
//
// ═══════════════════════════════════════════════════════════════════════════
// WHO SEES WHAT (all decided by RLS; this page renders what it gets):
//   · an org admin — every ask, every answer, the create form
//   · a manager — the answers their reports gave (DECISION 1) and the asks
//     those answers belong to; no create form
//   · everybody else — nothing (their surface is /deep-dives/mine)
//
// ⭐ THE TWO LENSES, SIDE BY SIDE (DECISION 4). Every answer renders both
// readings at once: against-the-playbook (does the floor need teaching?) and
// worth-teaching (does the floor have something to teach?). The same words
// can honestly be both, and the human reading the card decides — the page
// never picks a winner.
//
// ⭐ THE AGGREGATE IS THIN-DATA GUARDED (DECISION 6). Below three diverging
// answers the block says "early signal" in so many words. Two people doing it
// differently is a coincidence, and a coincidence rendered as a chart is how
// this screen becomes noise.
//
// ⭐ WHO HASN'T ANSWERED IS NEVER SHOWN (DECISION 5). The card says how many
// people were asked (frozen at send) and shows the answers that came. There
// is no pending list, no chase view, and a decline is structurally
// indistinguishable from not-yet — the API doesn't return it because the data
// doesn't hold it.
// ═══════════════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BrandHeader from "@/components/BrandHeader";

const supabase = createClient();

// ✅ CUSTOMER-FACING COPY APPROVED BY BRIAN — July 29, 2026 (Floor Guide C).
// The divergence lines must read "our training missed this," never "this
// person is wrong" — that rule is the feature.
// ═════════════════════════════════════════════════════════════════════════════
const COPY = {
  title: "Deep dives",
  subtitle:
    "Ask the people doing the work how they actually do it. Every answer is read two ways — does the training need fixing, or does the playbook have something to learn?",
  backToApp: "Dashboard",

  // ── create form ──
  formTitle: "Ask a deep dive",
  formSub:
    "They see who's asking, who can read the answer, and that declining is silent — before they type. That honesty is why the answers are worth having.",
  topicLabel: "What do you want to know?",
  topicPlaceholder: "e.g. How do you decide the line can release the first run after a profile changeover?",
  anchorLabel: "Compare answers against (optional)",
  anchorNone: "No framework — just collect how people do it",
  targetsLabel: "Who to ask",
  noContributors:
    "Nobody's on a contributor seat yet — deep dives go to contributors. Add people in your account settings.",
  send: "Send the ask",
  sending: "Sending…",

  // ── the ask card ──
  askedBy: (name: string | null) => (name ? `Asked by ${name}` : "Asked"),
  sentTo: (n: number) => (n === 1 ? "asked 1 person" : `asked ${n} people`),
  anchoredTo: (name: string) => `against "${name}"`,
  noResponsesYet: "No answers yet. People answer these on their own time — that's part of the deal.",

  // ── the finding block (thin-data guarded) ──
  findingHeadline: (d: number, n: number) =>
    `${d} of ${n} answers diverge from the playbook the same way. That many people doing it differently isn't ${d} people getting it wrong — it's onboarding not teaching it.`,
  earlyHeadline: (d: number, n: number) =>
    `Early signal — ${d} of ${n} answer${n === 1 ? "" : "s"} diverge${d === 1 ? "s" : ""} so far. Too few to call it systemic yet; worth watching, not acting on.`,

  // ── lens 1: against the playbook ──
  lens1Title: "Against the playbook",
  aligned: (name: string | null) => (name ? `Matches "${name}".` : "Matches the playbook."),
  diverges: (name: string | null) =>
    name ? `Does it differently than "${name}".` : "Does it differently than the playbook.",
  divergesFrame:
    "Read this as a training gap first — the playbook exists, and it didn't reach them.",
  noBasisCompared:
    "Couldn't be compared — the answer and the playbook aren't about the same call.",
  noBasisNoAnchor: "Nothing codified was attached to this ask, so there's nothing to compare against.",
  unread: "The comparison didn't run — the answer is here, unread. It'll still be here if you re-open this later.",

  // ── lens 2: worth teaching ──
  lens2Title: "Worth teaching?",
  candidateYes: "This answer looks like something the library doesn't have.",
  candidateOpen: "In your ideas queue →",
  candidatePromoted: "It became a framework →",
  candidateNo: "Nothing here the library's missing — no idea was escalated.",

  // ── actions ──
  routeTraining: "Route to training",
  routingTraining: "Opening in the Training Studio…",
  inTraining: "In the Training Studio →",

  empty:
    "No deep dives yet. Ask one when you want to know how the work really gets done — the first honest answer is usually worth the whole feature.",
  emptyManager:
    "Nothing here yet. When someone who reports to you answers a deep dive, you'll see it on this page.",
  loading: "Loading…",
  failed: "Couldn't load deep dives just now. Reload and it should come back.",
};
// ═════════════════════════════════════════════════════════════════════════════

type ProfileLite = { id: string; display_name: string | null; claimed_title: string | null };

type ResponseView = {
  id: string;
  person: ProfileLite | null;
  answer: string;
  divergence: "aligned" | "diverges" | "no_basis" | null;
  divergence_note: string | null;
  compared_record_id: string | null;
  candidate_insight_id: string | null;
  candidate_status: string | null;
  training_request_id: string | null;
  created_at: string;
};

type RequestView = {
  id: string;
  topic: string;
  status: string;
  created_at: string;
  sent_to_count: number;
  asked_by: string | null;
  anchor: { id: string; name: string } | null;
  responses: ResponseView[];
  finding: { responses: number; diverging: number; maturity: "finding" | "early" | null };
};

type Payload = {
  can_ask: boolean;
  contributors: ProfileLite[];
  frameworks: { id: string; name: string }[];
  requests: RequestView[];
};

export default function DeepDivesPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // create form
  const [topic, setTopic] = useState("");
  const [anchorId, setAnchorId] = useState("");
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/deep-dives?t=${Date.now()}`, { cache: "no-store" });
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

  const send = useCallback(async () => {
    if (sending) return;
    setSending(true);
    setNote(null);
    try {
      const res = await fetch("/api/deep-dives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          anchor_record_id: anchorId || null,
          target_ids: Object.keys(picked).filter((id) => picked[id]),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(typeof body?.error === "string" ? body.error : COPY.failed);
      } else {
        setError(null);
        setNote(typeof body?.message === "string" ? body.message : null);
        setTopic("");
        setAnchorId("");
        setPicked({});
        await load();
      }
    } catch {
      setError(COPY.failed);
    } finally {
      setSending(false);
    }
  }, [sending, topic, anchorId, picked, load]);

  const routeToTraining = useCallback(
    async (responseId: string) => {
      if (busyId) return;
      setBusyId(responseId);
      setNote(null);
      try {
        const res = await fetch(`/api/deep-dives/responses/${responseId}/training`, {
          method: "POST",
        });
        const body = await res.json();
        if (!res.ok) {
          setError(typeof body?.error === "string" ? body.error : COPY.failed);
        } else {
          setError(null);
          setNote(typeof body?.message === "string" ? body.message : null);
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

  const requests = data?.requests ?? [];
  const canAsk = data?.can_ask === true;
  const contributors = data?.contributors ?? [];
  const frameworks = data?.frameworks ?? [];
  const pickedCount = Object.keys(picked).filter((id) => picked[id]).length;

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

        {/* ─── The create form (admins only — can_ask mirrors is_org_admin,
            and the API re-checks; a form is not a gate) ─── */}
        {canAsk && (
          <div style={styles.formCard}>
            <h2 style={styles.formTitle}>{COPY.formTitle}</h2>
            <p style={styles.formSub}>{COPY.formSub}</p>

            <label style={styles.label} htmlFor="dd-topic">
              {COPY.topicLabel}
            </label>
            <textarea
              id="dd-topic"
              style={styles.textarea}
              rows={2}
              placeholder={COPY.topicPlaceholder}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />

            <label style={styles.label} htmlFor="dd-anchor">
              {COPY.anchorLabel}
            </label>
            <select
              id="dd-anchor"
              style={styles.select}
              value={anchorId}
              onChange={(e) => setAnchorId(e.target.value)}
            >
              <option value="">{COPY.anchorNone}</option>
              {frameworks.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>

            <span style={styles.label}>{COPY.targetsLabel}</span>
            {contributors.length === 0 && <p style={styles.formSub}>{COPY.noContributors}</p>}
            <div style={styles.targetGrid}>
              {contributors.map((c) => (
                <label key={c.id} style={styles.targetItem}>
                  <input
                    type="checkbox"
                    checked={!!picked[c.id]}
                    onChange={(e) => setPicked((p) => ({ ...p, [c.id]: e.target.checked }))}
                  />
                  <span>
                    {c.display_name ?? "Unnamed seat"}
                    {c.claimed_title ? (
                      <span style={styles.targetTitle}> — {c.claimed_title}</span>
                    ) : null}
                  </span>
                </label>
              ))}
            </div>

            <div style={styles.actionRow}>
              <button
                type="button"
                style={styles.primary}
                disabled={sending || topic.trim().length < 12 || pickedCount === 0}
                onClick={send}
              >
                {sending ? COPY.sending : COPY.send}
              </button>
            </div>
          </div>
        )}

        {!loading && requests.length === 0 && (
          <div style={styles.emptyCard}>
            <p style={{ margin: 0 }}>{canAsk ? COPY.empty : COPY.emptyManager}</p>
          </div>
        )}

        {requests.map((r) => (
          <div key={r.id} style={styles.askCard}>
            <div style={styles.askTop}>
              <span style={styles.askedBy}>{COPY.askedBy(r.asked_by)}</span>
              <span style={styles.meta}>{COPY.sentTo(r.sent_to_count)}</span>
              {r.anchor && <span style={styles.anchorChip}>{COPY.anchoredTo(r.anchor.name)}</span>}
              <span style={styles.date}>{new Date(r.created_at).toLocaleDateString()}</span>
            </div>
            <p style={styles.topic}>{r.topic}</p>

            {/* ─── The finding — thin-data guarded, counts only ─── */}
            {r.finding.maturity === "finding" && (
              <div style={styles.findingBlock}>
                🎯 {COPY.findingHeadline(r.finding.diverging, r.finding.responses)}
              </div>
            )}
            {r.finding.maturity === "early" && (
              <div style={styles.earlyBlock}>
                {COPY.earlyHeadline(r.finding.diverging, r.finding.responses)}
              </div>
            )}

            {r.responses.length === 0 && <p style={styles.noResponses}>{COPY.noResponsesYet}</p>}

            {r.responses.map((resp) => (
              <div key={resp.id} style={styles.responseCard}>
                <div style={styles.respTop}>
                  <span style={styles.personName}>
                    {resp.person?.display_name ?? "Someone on a contributor seat"}
                  </span>
                  {resp.person?.claimed_title && (
                    <span style={styles.personaTag}>{resp.person.claimed_title}</span>
                  )}
                  <span style={styles.date}>{new Date(resp.created_at).toLocaleDateString()}</span>
                </div>

                {/* Their words, verbatim — both lenses are readings OF this. */}
                <p style={styles.answer}>{resp.answer}</p>

                {/* ⭐ THE TWO LENSES, SIDE BY SIDE */}
                <div style={styles.lensRow}>
                  <div style={styles.lens}>
                    <p style={styles.lensTitle}>{COPY.lens1Title}</p>
                    {resp.divergence === "aligned" && (
                      <p style={styles.lensBodyOk}>{COPY.aligned(r.anchor?.name ?? null)}</p>
                    )}
                    {resp.divergence === "diverges" && (
                      <>
                        <p style={styles.lensBodyWarn}>{COPY.diverges(r.anchor?.name ?? null)}</p>
                        {resp.divergence_note && (
                          <p style={styles.lensDetail}>{resp.divergence_note}</p>
                        )}
                        <p style={styles.lensFrame}>{COPY.divergesFrame}</p>
                      </>
                    )}
                    {resp.divergence === "no_basis" && (
                      <p style={styles.lensBodyMuted}>
                        {resp.compared_record_id ? COPY.noBasisCompared : COPY.noBasisNoAnchor}
                      </p>
                    )}
                    {resp.divergence === null && (
                      <p style={styles.lensBodyMuted}>{COPY.unread}</p>
                    )}
                  </div>

                  <div style={styles.lens}>
                    <p style={styles.lensTitle}>{COPY.lens2Title}</p>
                    {resp.candidate_insight_id ? (
                      <>
                        <p style={styles.lensBodyOk}>{COPY.candidateYes}</p>
                        <a href="/insights" style={styles.link}>
                          {resp.candidate_status === "promoted"
                            ? COPY.candidatePromoted
                            : COPY.candidateOpen}
                        </a>
                      </>
                    ) : (
                      <p style={styles.lensBodyMuted}>{COPY.candidateNo}</p>
                    )}
                  </div>
                </div>

                {/* Training routing — only a diverging answer has a gap to route. */}
                {resp.divergence === "diverges" && (
                  <div style={styles.actionRow}>
                    {resp.training_request_id ? (
                      <a
                        href={`/training-studio/${resp.training_request_id}`}
                        style={styles.link}
                      >
                        {COPY.inTraining}
                      </a>
                    ) : (
                      <button
                        type="button"
                        style={styles.secondary}
                        disabled={busyId === resp.id}
                        onClick={() => routeToTraining(resp.id)}
                      >
                        {busyId === resp.id ? COPY.routingTraining : COPY.routeTraining}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
// Viridescent tokens only. Divergence renders in the amber family — attention,
// never error-red (the P-5 semantic-color rule): a training gap is a thing to
// look at, not a thing that went wrong.
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
  formCard: {
    background: "var(--white)",
    border: "1px solid var(--line)",
    borderRadius: 14,
    padding: "18px 20px",
    marginBottom: 20,
  },
  formTitle: { fontSize: "18px", margin: "0 0 4px" },
  formSub: { fontSize: "13px", color: "var(--muted)", lineHeight: 1.55, margin: "0 0 14px" },
  label: {
    display: "block",
    fontSize: "13px",
    fontWeight: 600,
    color: "var(--pine)",
    margin: "12px 0 6px",
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
  select: {
    fontSize: "13px",
    fontFamily: "inherit",
    color: "var(--pine)",
    background: "var(--white)",
    border: "1px solid var(--line)",
    borderRadius: 8,
    padding: "7px 10px",
    maxWidth: 420,
    display: "block",
  },
  targetGrid: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
    maxHeight: 200,
    overflowY: "auto" as const,
    border: "1px solid var(--line)",
    borderRadius: 10,
    padding: "10px 12px",
  },
  targetItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: "13px",
    color: "var(--pine)",
  },
  targetTitle: { color: "var(--muted)" },
  askCard: {
    background: "var(--white)",
    border: "1px solid var(--line)",
    borderRadius: 14,
    padding: "18px 20px",
    marginBottom: 16,
  },
  askTop: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    fontSize: "12px",
    color: "var(--muted)",
    marginBottom: 8,
  },
  askedBy: { fontWeight: 700, color: "var(--pine)", fontSize: "12px" },
  meta: { fontSize: "12px" },
  anchorChip: {
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--growth-deep)",
    background: "var(--growth-soft)",
    border: "1px solid var(--new-leaf-light)",
    borderRadius: 999,
    padding: "2px 8px",
  },
  date: { marginLeft: "auto" },
  topic: { fontSize: "16px", fontWeight: 600, color: "var(--pine)", lineHeight: 1.5, margin: "0 0 12px" },
  findingBlock: {
    background: "var(--warn-bg)",
    border: "1px solid var(--warn-border)",
    color: "var(--warn-text)",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: "13px",
    fontWeight: 600,
    lineHeight: 1.55,
    marginBottom: 12,
  },
  earlyBlock: {
    background: "var(--paper-2)",
    border: "1px solid var(--line)",
    color: "var(--pine-soft)",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: "13px",
    lineHeight: 1.55,
    marginBottom: 12,
  },
  noResponses: { fontSize: "13px", color: "var(--muted)", margin: "4px 0 0", fontStyle: "italic" },
  responseCard: {
    background: "var(--paper)",
    border: "1px solid var(--line)",
    borderRadius: 12,
    padding: "14px 16px",
    marginTop: 10,
  },
  respTop: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    fontSize: "12px",
    color: "var(--muted)",
    marginBottom: 8,
  },
  personName: { fontWeight: 700, color: "var(--pine)", fontSize: "13px" },
  personaTag: { background: "var(--paper-2)", borderRadius: 999, padding: "1px 7px", fontSize: "11px" },
  answer: {
    fontSize: "14px",
    color: "var(--pine)",
    lineHeight: 1.6,
    margin: "0 0 12px",
    whiteSpace: "pre-wrap" as const,
  },
  lensRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  lens: {
    background: "var(--white)",
    border: "1px solid var(--line)",
    borderRadius: 10,
    padding: "10px 12px",
  },
  lensTitle: {
    fontSize: "11px",
    fontWeight: 700,
    color: "var(--muted)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    margin: "0 0 6px",
  },
  lensBodyOk: { fontSize: "13px", fontWeight: 600, color: "var(--ok-text)", margin: "0 0 6px", lineHeight: 1.5 },
  lensBodyWarn: { fontSize: "13px", fontWeight: 600, color: "var(--warn-text)", margin: "0 0 6px", lineHeight: 1.5 },
  lensBodyMuted: { fontSize: "13px", color: "var(--muted)", margin: 0, lineHeight: 1.5 },
  lensDetail: { fontSize: "13px", color: "var(--pine)", margin: "0 0 6px", lineHeight: 1.55 },
  lensFrame: { fontSize: "12px", color: "var(--muted)", margin: 0, fontStyle: "italic" as const },
  actionRow: { display: "flex", alignItems: "center", gap: 14, marginTop: 12, flexWrap: "wrap" },
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
  link: { fontSize: "13px", fontWeight: 600, color: "var(--growth)", textDecoration: "none" },
};
