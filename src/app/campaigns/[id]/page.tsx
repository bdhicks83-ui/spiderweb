"use client";
// TIER 1 / BUILD 2 — one campaign: how it's going.
//
// ⚠️ WHAT THIS PAGE SHOWS DEPENDS ON WHO OPENS IT, AND THAT IS ENFORCED BY RLS
// RATHER THAN BY THIS COMPONENT. The capture_requests policy lets three
// readers see a row: the person asked, their direct manager, and an org admin.
// So a peer who follows a link here sees the campaign and their own ask; a
// manager sees their reports'; an admin sees the roster. The page renders
// whatever came back and never tries to decide that for itself — a client-side
// "hide the roster if…" is one refactor away from leaking it.
//
// The reason the roster is protected at all: "asked 4 things, captured none" is
// a person-level negative signal, and this product does not put those on
// peer-visible surfaces (P-6, and the P-9 gap row that carries a count and
// never a name). A capture campaign must not become a leaderboard.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BrandHeader from "@/components/BrandHeader";

const supabase = createClient();

// ═════════════════════════════════════════════════════════════════════════════
// ⚠️⚠️ DRAFT CUSTOMER-FACING COPY — PENDING BRIAN'S SIGN-OFF (T1B2) ⚠️⚠️
// Nothing here may read as a scoreboard. "Not started" is neutral; "passed on"
// is an ANSWER and gets shown with its reason, because the reason is the most
// useful thing on this page.
// ═════════════════════════════════════════════════════════════════════════════
const COPY = {
  back: "← All campaigns",
  progress: (c: number, a: number) => `${c} of ${a} captured`,
  peopleLine: (pc: number, p: number) =>
    `${pc} of ${p} ${p === 1 ? "person has" : "people have"} captured something`,
  declined: (n: number) => (n === 1 ? "1 passed on" : `${n} passed on`),
  close: "Close this campaign",
  reopen: "Reopen it",
  closedNote:
    "Closed. Nothing was deleted — every ask keeps its answer, and what got captured stays in the library.",
  confirmClose:
    "Close this campaign? It stops appearing as active. Every ask keeps its answer and nothing is deleted.",
  statusOpen: "not started",
  statusStarted: "in progress",
  statusCaptured: "captured",
  statusDeclined: "passed on",
  fromGap: "from the gaps queue",
  openFramework: "Open the framework →",
  yours: "this one's yours",
  captureMine: "Capture this",
  emptyRoster:
    "You can see your own ask on this campaign. The full list is visible to the person's manager and to account admins.",
  declineLead: "Passed on:",
  // ⚠️ Shown whenever the list below is shorter than the campaign. The totals
  // above are always the real ones — this line stops somebody reading a
  // partial roster as the whole campaign.
  partialRoster: (shown: number, total: number) =>
    `The totals above cover all ${total} asks. You're seeing the ${shown} you can — your own, and your direct reports'.`,
};
// ═════════════════════════════════════════════════════════════════════════════

type Ask = {
  id: string;
  person_id: string;
  person_name: string;
  person_title: string | null;
  prompt: string;
  source: "manual" | "gap";
  status: "open" | "started" | "captured" | "declined";
  decline_reason: string | null;
  record_id: string | null;
  framework_name: string | null;
  is_mine: boolean;
  captured_at: string | null;
};

type Detail = {
  campaign: {
    id: string;
    name: string;
    purpose: string | null;
    status: "open" | "closed";
    due_on: string | null;
    owner_name: string;
    owned_by_me: boolean;
  };
  can_manage: boolean;
  roster_is_partial: boolean;
  roster_shown: number;
  roster_total: number;
  progress: {
    asks: number;
    captured: number;
    declined: number;
    started: number;
    open: number;
    percent: number;
    people: number;
    people_captured: number;
  };
  requests: Ask[];
};

const CHIP: Record<Ask["status"], { label: string; color: string; bg: string; border: string }> = {
  open: { label: COPY.statusOpen, color: "var(--muted)", bg: "var(--paper-2)", border: "var(--line)" },
  started: { label: COPY.statusStarted, color: "var(--growth-deep)", bg: "var(--white)", border: "var(--growth)" },
  captured: { label: COPY.statusCaptured, color: "var(--ok-text)", bg: "var(--ok-bg)", border: "var(--ok-border)" },
  declined: { label: COPY.statusDeclined, color: "var(--warn-text)", bg: "var(--warn-bg)", border: "var(--warn-border)" },
};

export default function CampaignDetailPage() {
  const router = useRouter();
  const [id, setId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Read the id from the path rather than useParams so this stays a plain
    // client component with no Suspense boundary — same reasoning as the two
    // banners.
    const parts = window.location.pathname.split("/").filter(Boolean);
    setId(decodeURIComponent(parts[parts.length - 1] ?? ""));
  }, []);

  const load = useCallback(async (campaignId: string) => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}?t=${Date.now()}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Could not load that campaign.");
        return;
      }
      setError(null);
      setData(body as Detail);
    } catch {
      setError("Could not load that campaign.");
    }
  }, []);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      setChecking(false);
      await load(id);
    })();
  }, [id, router, load]);

  async function setStatus(next: "open" | "closed") {
    if (!id || busy) return;
    if (next === "closed" && !window.confirm(COPY.confirmClose)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const body = await res.json();
      if (!res.ok) setError(body.error || "Could not change that.");
      else await load(id);
    } catch {
      setError("Could not change that.");
    } finally {
      setBusy(false);
    }
  }

  if (checking || !data) {
    return (
      <div style={styles.center}>
        <p>{error ?? "Loading…"}</p>
      </div>
    );
  }

  const { campaign, progress, requests, can_manage } = data;
  const answerable = progress.asks - progress.declined;

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <div style={{ marginBottom: 18 }}>
          <BrandHeader />
        </div>

        <a href="/campaigns" style={styles.headerLink}>
          {COPY.back}
        </a>

        <h1 style={styles.title}>{campaign.name}</h1>
        <p style={styles.meta}>
          {campaign.owner_name}
          {campaign.due_on ? ` · target ${campaign.due_on}` : ""}
        </p>
        {campaign.purpose && <p style={styles.purpose}>{campaign.purpose}</p>}

        {error && <div style={styles.errorBanner}>{error}</div>}
        {campaign.status === "closed" && <div style={styles.noticeBanner}>{COPY.closedNote}</div>}

        <div style={styles.card}>
          <div style={styles.barTrack}>
            <div style={{ ...styles.barFill, width: `${progress.percent}%` }} />
          </div>
          <p style={styles.progressLine}>
            <strong>{COPY.progress(progress.captured, answerable)}</strong>
            {progress.declined > 0 ? ` · ${COPY.declined(progress.declined)}` : ""}
          </p>
          <p style={styles.progressSub}>{COPY.peopleLine(progress.people_captured, progress.people)}</p>

          {can_manage && (
            <div style={styles.actionRow}>
              {campaign.status === "open" ? (
                <button type="button" style={styles.dangerButton} disabled={busy} onClick={() => setStatus("closed")}>
                  {COPY.close}
                </button>
              ) : (
                <button type="button" style={styles.smallButton} disabled={busy} onClick={() => setStatus("open")}>
                  {COPY.reopen}
                </button>
              )}
            </div>
          )}
        </div>

        {data.roster_is_partial && (
          <p style={styles.partialNote}>{COPY.partialRoster(data.roster_shown, data.roster_total)}</p>
        )}

        {requests.length <= 1 && !can_manage && <div style={styles.emptyCard}>{COPY.emptyRoster}</div>}

        {requests.map((r) => {
          const chip = CHIP[r.status];
          return (
            <div key={r.id} style={styles.ask}>
              <div style={styles.cardTop}>
                <span style={{ ...styles.chip, color: chip.color, background: chip.bg, borderColor: chip.border }}>
                  {chip.label}
                </span>
                <span style={styles.personName}>{r.person_name}</span>
                {r.person_title && <span style={styles.metaSm}>{r.person_title}</span>}
                {r.source === "gap" && <span style={styles.fromGapChip}>{COPY.fromGap}</span>}
                {r.is_mine && <span style={styles.yoursChip}>{COPY.yours}</span>}
              </div>
              <p style={styles.prompt}>&ldquo;{r.prompt}&rdquo;</p>

              {r.status === "declined" && r.decline_reason && (
                <p style={styles.declineReason}>
                  {COPY.declineLead} {r.decline_reason}
                </p>
              )}

              {r.status === "captured" && r.record_id && (
                <a href={`/library/${r.record_id}`} style={styles.newLink}>
                  {r.framework_name ? `${r.framework_name} — ` : ""}
                  {COPY.openFramework}
                </a>
              )}

              {r.is_mine && (r.status === "open" || r.status === "started") && (
                <a href="/requests" style={styles.newLink}>
                  {COPY.captureMine} →
                </a>
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
  container: { maxWidth: 780, margin: "0 auto", padding: "40px 24px 80px" },
  center: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-sans)",
  },
  headerLink: { fontSize: "13px", fontWeight: 600, color: "var(--muted)", textDecoration: "none" },
  title: { fontSize: "26px", margin: "10px 0 4px" },
  meta: { fontSize: "12px", color: "var(--muted)", margin: "0 0 10px" },
  metaSm: { fontSize: "11px", color: "var(--muted)" },
  purpose: { fontSize: "14px", color: "var(--pine-soft)", margin: "0 0 20px", lineHeight: 1.6 },
  errorBanner: {
    background: "var(--danger-bg)",
    border: "1px solid var(--danger-border)",
    color: "var(--danger)",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: "13px",
    marginBottom: 14,
  },
  noticeBanner: {
    background: "var(--paper-2)",
    border: "1px solid var(--line)",
    color: "var(--muted)",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: "13px",
    marginBottom: 14,
    lineHeight: 1.5,
  },
  card: {
    background: "var(--white)",
    border: "1px solid var(--line)",
    borderRadius: 14,
    padding: "18px 20px 20px",
    marginBottom: 18,
  },
  emptyCard: {
    background: "var(--white)",
    border: "1px dashed var(--line)",
    borderRadius: 14,
    padding: "20px 22px",
    fontSize: "13px",
    color: "var(--pine-soft)",
    lineHeight: 1.6,
    marginBottom: 14,
  },
  barTrack: { height: 8, borderRadius: 999, background: "var(--paper-2)", overflow: "hidden", marginBottom: 10 },
  barFill: { height: "100%", background: "var(--growth)", borderRadius: 999 },
  progressLine: { fontSize: "14px", color: "var(--pine)", margin: "0 0 4px" },
  progressSub: { fontSize: "12px", color: "var(--muted)", margin: "0 0 12px" },
  partialNote: {
    fontSize: "12px",
    color: "var(--muted)",
    lineHeight: 1.55,
    margin: "0 0 12px",
    fontStyle: "italic",
  },
  actionRow: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  ask: {
    background: "var(--white)",
    border: "1px solid var(--line)",
    borderRadius: 14,
    padding: "14px 18px 16px",
    marginBottom: 10,
  },
  cardTop: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 },
  chip: { fontSize: "11px", fontWeight: 700, border: "1px solid", borderRadius: 999, padding: "3px 9px" },
  personName: { fontSize: "14px", fontWeight: 700, color: "var(--pine)" },
  fromGapChip: {
    fontSize: "10px",
    fontWeight: 700,
    color: "var(--growth-deep)",
    background: "var(--growth-soft)",
    border: "1px solid var(--new-leaf-light)",
    borderRadius: 999,
    padding: "2px 7px",
  },
  yoursChip: {
    fontSize: "10px",
    fontWeight: 700,
    color: "var(--warn-text)",
    background: "var(--warn-chip-bg)",
    border: "1px solid var(--warn-border)",
    borderRadius: 999,
    padding: "2px 7px",
  },
  prompt: { fontSize: "14px", color: "var(--pine)", margin: "0 0 8px", lineHeight: 1.55 },
  declineReason: { fontSize: "13px", color: "var(--warn-text)", margin: "0 0 6px", lineHeight: 1.55 },
  newLink: { fontSize: "13px", fontWeight: 600, color: "var(--growth)", textDecoration: "none" },
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
  dangerButton: {
    fontSize: "12px",
    fontWeight: 600,
    color: "var(--danger)",
    background: "var(--danger-bg)",
    border: "1px solid var(--danger-border)",
    borderRadius: 8,
    padding: "6px 12px",
    cursor: "pointer",
    fontFamily: "inherit",
  },
};
