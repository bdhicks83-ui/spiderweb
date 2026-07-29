"use client";
// TIER 1 / BUILD 2 — "ASKED OF YOU." The assignee's whole experience.
//
// One list: what your team has asked you to write down, what you've already
// captured through a campaign, and what you passed on and why.
//
// What is NOT here is as deliberate as what is: no roster, no "3 of 15 done,"
// no comparison to anybody else. The RLS policy on capture_requests makes that
// structural rather than something this page has to remember not to render —
// see the read-boundary note in supabase/t1b2-capture-campaign.sql.
//
// Client-safe imports only — @/lib/capture-campaign is server-only.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BrandHeader from "@/components/BrandHeader";

const supabase = createClient();

// ═════════════════════════════════════════════════════════════════════════════
// ⚠️⚠️ DRAFT CUSTOMER-FACING COPY — PENDING BRIAN'S SIGN-OFF (T1B2) ⚠️⚠️
//
// THE THING TO GET RIGHT: an ask is a colleague wanting your judgment, never a
// ticket assigned to you and never a compliance task. Nothing here may read as
// "you are behind." Passing on one is a legitimate, useful answer and the copy
// has to make that obvious or nobody will ever use it and the routing signal
// disappears. Track B register — plain language, no Vine metaphors, no "SOP."
// ═════════════════════════════════════════════════════════════════════════════
const COPY = {
  title: "Asked of you",
  subtitle:
    "Things your team has asked you to write down — usually because somebody went looking for it and it wasn't there.",
  empty:
    "Nothing right now. When someone asks you to capture something, it shows up here.",
  noOrg: "Once you're part of an organization, what your team asks of you shows up here.",
  demand: (n: number) =>
    n === 1 ? "1 person hit this and found nothing" : `${n} people hit this and found nothing`,
  askedBy: (who: string) => `asked by ${who}`,
  capture: "Capture this",
  continue: "Pick this back up",
  pass: "Not me",
  passTitle: "Who should this go to, or why doesn't it apply?",
  passPlaceholder: "e.g. Dana owns the release call now — she'd have the real answer.",
  passSubmit: "Send that back",
  passCancel: "Cancel",
  passedNote: (reason: string) => `You passed on this: “${reason}”`,
  undoPass: "Actually, I'll take it",
  capturedNote: "Captured",
  openFramework: "Open the framework →",
  linkInstead: "Link something I already captured",
  linkAction: "Link it",
  statusOpen: "not started",
  statusStarted: "in progress",
  statusCaptured: "captured",
  statusDeclined: "passed on",
  doneTitle: "Already captured",
  showDone: "Show what you've captured",
  hideDone: "Hide what you've captured",
};
// ═════════════════════════════════════════════════════════════════════════════

type Ask = {
  id: string;
  campaign_id: string;
  campaign_name: string;
  campaign_purpose: string | null;
  asked_by: string;
  prompt: string;
  source: "manual" | "gap";
  gap_asked_count: number | null;
  status: "open" | "started" | "captured" | "declined";
  decline_reason: string | null;
  record_id: string | null;
  framework_name: string | null;
  created_at: string;
};

type MyFramework = { id: string; name: string };

const CHIP: Record<Ask["status"], { label: string; color: string; bg: string; border: string }> = {
  open: {
    label: COPY.statusOpen,
    color: "var(--warn-strong)",
    bg: "var(--warn-bg)",
    border: "var(--warn-border)",
  },
  started: {
    label: COPY.statusStarted,
    color: "var(--growth-deep)",
    bg: "var(--white)",
    border: "var(--growth)",
  },
  captured: {
    label: COPY.statusCaptured,
    color: "var(--ok-text)",
    bg: "var(--ok-bg)",
    border: "var(--ok-border)",
  },
  declined: {
    label: COPY.statusDeclined,
    color: "var(--muted)",
    bg: "var(--paper-2)",
    border: "var(--line)",
  },
};

export default function RequestsPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(true);
  const [asks, setAsks] = useState<Ask[]>([]);
  const [hasOrg, setHasOrg] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const [passingId, setPassingId] = useState<string | null>(null);
  const [passReason, setPassReason] = useState("");

  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [myFrameworks, setMyFrameworks] = useState<MyFramework[] | null>(null);
  const [chosenRecord, setChosenRecord] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Cache-bust: the P-9 read-freshness lesson. A just-written status read
      // back through a cached GET looks exactly like a write that didn't land.
      const res = await fetch(`/api/requests/mine?t=${Date.now()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not load your asks.");
        return;
      }
      setError(null);
      setHasOrg(data.org !== false);
      setAsks((data.requests as Ask[]) || []);
    } catch {
      setError("Could not load your asks.");
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

  async function act(ask: Ask, action: string, extra: Record<string, unknown> = {}) {
    if (busy) return null;
    setBusy(ask.id);
    setError(null);
    try {
      const res = await fetch(`/api/requests/${ask.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not do that.");
        return null;
      }
      return data;
    } catch {
      setError("Could not do that.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function startCapture(ask: Ask) {
    // Claim first so the campaign shows somebody is on it even if the
    // interview takes a while. A failed claim never blocks the capture — the
    // ask simply stays open and the reconciler has nothing to match.
    await act(ask, "start");
    router.push(`/codify?request=${ask.id}`);
  }

  async function submitPass(ask: Ask) {
    if (!passReason.trim()) return;
    const ok = await act(ask, "decline", { reason: passReason });
    if (ok) {
      setPassingId(null);
      setPassReason("");
      await load();
    }
  }

  async function openLinker(askId: string) {
    setLinkingId(askId);
    setChosenRecord("");
    if (myFrameworks) return;
    try {
      const res = await fetch("/api/library");
      const data = await res.json();
      const rows =
        (data.records as { id: string; is_mine: boolean; framework: { name?: string } | null }[]) || [];
      setMyFrameworks(
        rows.filter((r) => r.is_mine && r.framework).map((r) => ({ id: r.id, name: r.framework?.name || "(framework)" }))
      );
    } catch {
      setMyFrameworks([]);
    }
  }

  async function linkFramework(ask: Ask) {
    if (!chosenRecord) return;
    const ok = await act(ask, "link", { record_id: chosenRecord });
    if (ok) {
      setLinkingId(null);
      await load();
    }
  }

  if (checking) {
    return (
      <div style={styles.center}>
        <p>Loading…</p>
      </div>
    );
  }

  const live = asks.filter((a) => a.status === "open" || a.status === "started");
  const passed = asks.filter((a) => a.status === "declined");
  const done = asks.filter((a) => a.status === "captured");

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <div style={{ marginBottom: 18 }}>
          <BrandHeader />
        </div>

        <div style={styles.headerRow}>
          <h1 style={styles.title}>📝 {COPY.title}</h1>
          <a href="/dashboard" style={styles.headerLink}>
            ← Dashboard
          </a>
        </div>
        <p style={styles.subtitle}>{COPY.subtitle}</p>

        {error && <div style={styles.errorBanner}>{error}</div>}
        {!hasOrg && <div style={styles.emptyCard}>{COPY.noOrg}</div>}
        {hasOrg && loading && <p style={styles.help}>Loading…</p>}
        {hasOrg && !loading && live.length === 0 && passed.length === 0 && (
          <div style={styles.emptyCard}>{COPY.empty}</div>
        )}

        {live.map((a) => {
          const chip = CHIP[a.status];
          return (
            <div key={a.id} style={styles.card}>
              <div style={styles.cardTop}>
                <span style={{ ...styles.chip, color: chip.color, background: chip.bg, borderColor: chip.border }}>
                  {chip.label}
                </span>
                <span style={styles.campaignChip}>{a.campaign_name}</span>
                {a.source === "gap" && a.gap_asked_count ? (
                  <span style={styles.demandChip}>{COPY.demand(a.gap_asked_count)}</span>
                ) : null}
                <span style={styles.meta}>{COPY.askedBy(a.asked_by)}</span>
              </div>

              <p style={styles.prompt}>&ldquo;{a.prompt}&rdquo;</p>
              {a.campaign_purpose && <p style={styles.purpose}>{a.campaign_purpose}</p>}

              <div style={styles.actionRow}>
                <button
                  type="button"
                  style={styles.primaryButton}
                  disabled={busy === a.id}
                  onClick={() => startCapture(a)}
                >
                  {a.status === "started" ? COPY.continue : COPY.capture}
                </button>

                {passingId === a.id ? null : (
                  <button
                    type="button"
                    style={styles.textButton}
                    onClick={() => {
                      setPassingId(a.id);
                      setPassReason("");
                    }}
                  >
                    {COPY.pass}
                  </button>
                )}

                {linkingId === a.id ? (
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
                      disabled={!chosenRecord || busy === a.id}
                      onClick={() => linkFramework(a)}
                    >
                      {COPY.linkAction}
                    </button>
                    <button type="button" style={styles.textButton} onClick={() => setLinkingId(null)}>
                      {COPY.passCancel}
                    </button>
                  </span>
                ) : (
                  <button type="button" style={styles.textButton} onClick={() => openLinker(a.id)}>
                    {COPY.linkInstead}
                  </button>
                )}
              </div>

              {passingId === a.id && (
                <div style={styles.passBox}>
                  <p style={styles.passTitle}>{COPY.passTitle}</p>
                  <textarea
                    style={styles.textarea}
                    rows={2}
                    value={passReason}
                    placeholder={COPY.passPlaceholder}
                    onChange={(e) => setPassReason(e.target.value)}
                  />
                  <div style={styles.actionRow}>
                    <button
                      type="button"
                      style={styles.secondaryButton}
                      disabled={!passReason.trim() || busy === a.id}
                      onClick={() => submitPass(a)}
                    >
                      {COPY.passSubmit}
                    </button>
                    <button type="button" style={styles.textButton} onClick={() => setPassingId(null)}>
                      {COPY.passCancel}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {passed.map((a) => (
          <div key={a.id} style={styles.passedCard}>
            <div style={styles.cardTop}>
              <span style={{ ...styles.chip, color: CHIP.declined.color, background: CHIP.declined.bg, borderColor: CHIP.declined.border }}>
                {CHIP.declined.label}
              </span>
              <span style={styles.campaignChip}>{a.campaign_name}</span>
            </div>
            <p style={styles.promptMuted}>&ldquo;{a.prompt}&rdquo;</p>
            {a.decline_reason && <p style={styles.passedReason}>{COPY.passedNote(a.decline_reason)}</p>}
            <div style={styles.actionRow}>
              <button
                type="button"
                style={styles.smallButton}
                disabled={busy === a.id}
                onClick={async () => {
                  const ok = await act(a, "reopen");
                  if (ok) await load();
                }}
              >
                {COPY.undoPass}
              </button>
            </div>
          </div>
        ))}

        {done.length > 0 && (
          <button type="button" style={styles.toggleButton} onClick={() => setShowDone((v) => !v)}>
            {showDone ? COPY.hideDone : `${COPY.showDone} (${done.length})`}
          </button>
        )}

        {showDone &&
          done.map((a) => (
            <div key={a.id} style={styles.doneCard}>
              <div style={styles.cardTop}>
                <span style={{ ...styles.chip, color: CHIP.captured.color, background: CHIP.captured.bg, borderColor: CHIP.captured.border }}>
                  {CHIP.captured.label}
                </span>
                <span style={styles.campaignChip}>{a.campaign_name}</span>
              </div>
              <p style={styles.promptMuted}>&ldquo;{a.prompt}&rdquo;</p>
              {a.record_id && (
                <a href={`/library/${a.record_id}`} style={styles.newLink}>
                  {a.framework_name ? `${a.framework_name} — ` : ""}
                  {COPY.openFramework}
                </a>
              )}
            </div>
          ))}
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
  },
  title: { fontSize: "26px", margin: 0 },
  headerLink: { fontSize: "14px", fontWeight: 600, color: "var(--muted)", textDecoration: "none" },
  subtitle: { color: "var(--muted)", fontSize: "14px", margin: "6px 0 22px", lineHeight: 1.55 },
  help: { fontSize: "13px", color: "var(--muted)" },
  errorBanner: {
    background: "var(--danger-bg)",
    border: "1px solid var(--danger-border)",
    color: "var(--danger)",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: "13px",
    marginBottom: 14,
  },
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
    background: "var(--warn-bg)",
    border: "1px solid var(--warn-border)",
    borderRadius: 14,
    padding: "16px 18px",
    marginBottom: 12,
  },
  passedCard: {
    background: "var(--paper-2)",
    border: "1px solid var(--line)",
    borderRadius: 14,
    padding: "16px 18px",
    marginBottom: 12,
  },
  doneCard: {
    background: "var(--white)",
    border: "1px solid var(--line)",
    borderRadius: 14,
    padding: "16px 18px",
    marginBottom: 12,
  },
  cardTop: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 },
  chip: { fontSize: "11px", fontWeight: 700, border: "1px solid", borderRadius: 999, padding: "3px 9px" },
  campaignChip: {
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--muted)",
    background: "var(--white)",
    border: "1px solid var(--line)",
    borderRadius: 999,
    padding: "3px 9px",
  },
  demandChip: {
    fontSize: "11px",
    fontWeight: 700,
    color: "var(--growth-deep)",
    background: "var(--growth-soft)",
    border: "1px solid var(--new-leaf-light)",
    borderRadius: 999,
    padding: "3px 9px",
  },
  meta: { fontSize: "11px", color: "var(--muted)" },
  prompt: { fontSize: "16px", fontWeight: 600, color: "var(--pine)", margin: "0 0 10px", lineHeight: 1.5 },
  promptMuted: { fontSize: "15px", fontWeight: 600, color: "var(--pine-soft)", margin: "0 0 8px", lineHeight: 1.5 },
  purpose: { fontSize: "13px", color: "var(--warn-text)", margin: "0 0 10px", lineHeight: 1.55, fontStyle: "italic" },
  passedReason: { fontSize: "13px", color: "var(--muted)", margin: "0 0 8px", lineHeight: 1.55 },
  actionRow: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 4 },
  passBox: {
    marginTop: 12,
    background: "var(--white)",
    border: "1px solid var(--line)",
    borderRadius: 10,
    padding: "12px 14px",
  },
  passTitle: { fontSize: "13px", fontWeight: 600, color: "var(--pine)", margin: "0 0 8px" },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    padding: "9px 11px",
    fontSize: "14px",
    borderRadius: 8,
    border: "1px solid var(--line)",
    fontFamily: "inherit",
    color: "var(--pine)",
    resize: "vertical",
  },
  primaryButton: {
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
  smallButton: {
    fontSize: "12px",
    fontWeight: 600,
    color: "var(--growth-deep)",
    background: "var(--growth-soft)",
    border: "1px solid var(--new-leaf-light)",
    borderRadius: 8,
    padding: "6px 12px",
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
  toggleButton: {
    marginTop: 14,
    marginBottom: 14,
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
  newLink: { fontSize: "14px", fontWeight: 600, color: "var(--growth)", textDecoration: "none" },
};
