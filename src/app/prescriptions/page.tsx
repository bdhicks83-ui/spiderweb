"use client";
// P-4A Build 4 — the ROI-ranked prescription queue.
// P-4B Build 1 — the manager gate lives here: one-click approve / snooze on
// every open row, an "Approved / in-flight" section for rows past the gate,
// snoozed rows dropping out until their wake date (defers, never deletes),
// and the efficacy state (watching / escalated / effective) surfaced on
// every delivered row. "Check efficacy" re-runs the post-delivery watch for
// the caller's own org.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

type QueueRow = {
  id: string;
  source_type: string | null;
  evidence_count: number;
  rung: number;
  rung_rationale: string;
  gap_summary: string;
  expert_names: string[];
  capture_first: boolean;
  audience: string;
  pairing_summary: string;
  recurrence: number;
  severity: number;
  roi_score: number;
  rank_rationale: string;
  status: string;
  created_at: string;
  approved_by_name: string | null;
  approved_at: string | null;
  snoozed_until: string | null;
  delivered_at: string | null;
  efficacy_status: string | null;
  efficacy_note: string | null;
  escalated_from_rung: number | null;
};

const RUNG_LABEL: Record<number, string> = {
  1: "Clarification card",
  2: "Micro-training",
  3: "Designed session",
  4: "Full curriculum",
};

const RUNG_EFFORT: Record<number, string> = {
  1: "2-min read",
  2: "15-min session",
  3: "facilitated session",
  4: "multi-session",
};

const SOURCE_LABEL: Record<string, string> = {
  conflict: "⚠️ Conflict X-ray",
  coverage_gap: "🕳️ Coverage gap",
  entity_signal: "📈 Entity signal",
};

const EFFICACY_CHIP: Record<string, { label: string; color: string; bg: string; border: string }> = {
  watching: { label: "👁 watching", color: "#1e40af", bg: "#eff6ff", border: "#bfdbfe" },
  escalated: { label: "🔺 escalated", color: "#b91c1c", bg: "#fef2f2", border: "#fecaca" },
  effective: { label: "✅ effective — proven", color: "#166534", bg: "#f0fdf4", border: "#bbf7d0" },
};

export default function PrescriptionsPage() {
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [checkingEfficacy, setCheckingEfficacy] = useState(false);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<QueueRow[]>([]);
  const router = useRouter();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/prescriptions");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not load the prescription queue.");
      } else {
        setError(null);
        setRows(data.prescriptions || []);
      }
    } catch {
      setError("Could not load the prescription queue.");
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
      await load();
    })();
  }, [router, load]);

  const runDetection = async () => {
    setRunning(true);
    setRunMessage(null);
    try {
      const res = await fetch("/api/prescriptions/detect", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setRunMessage(data.error || "Detection failed.");
      } else {
        const s = data.summary;
        setRunMessage(
          s
            ? `${data.message} (${s.records} records · ${s.candidates} detections · ${s.triaged} triaged${s.triageFailed ? ` · ${s.triageFailed} triage skipped` : ""}${s.suppressed ? ` · ${s.suppressed} suppressed as duplicates` : ""})`
            : data.message
        );
        await load();
      }
    } catch {
      setRunMessage("Detection failed.");
    } finally {
      setRunning(false);
    }
  };

  const checkEfficacy = async () => {
    setCheckingEfficacy(true);
    setRunMessage(null);
    try {
      const res = await fetch("/api/prescriptions/efficacy", { method: "POST" });
      const data = await res.json();
      setRunMessage(res.ok ? data.message : data.error || "Efficacy check failed.");
      if (res.ok) await load();
    } catch {
      setRunMessage("Efficacy check failed.");
    } finally {
      setCheckingEfficacy(false);
    }
  };

  const act = async (id: string, kind: "approve" | "snooze") => {
    setActingOn(id);
    setRunMessage(null);
    try {
      const res = await fetch(`/api/prescriptions/${id}/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: kind === "snooze" ? JSON.stringify({ days: 7 }) : "{}",
      });
      const data = await res.json();
      setRunMessage(res.ok ? data.message : data.error || `${kind} failed.`);
      if (res.ok) await load();
    } catch {
      setRunMessage(`${kind} failed.`);
    } finally {
      setActingOn(null);
    }
  };

  if (loading) {
    return (
      <div style={styles.center}>
        <p>Loading…</p>
      </div>
    );
  }

  const open = rows.filter((r) => r.status === "open");
  const inFlight = rows.filter((r) => r.status === "approved" || r.status === "delivered");
  const snoozed = rows.filter((r) => r.status === "snoozed");
  const closed = rows.filter((r) => r.status === "closed");

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <div style={styles.headerRow}>
          <h1 style={styles.title}>💊 Prescription Queue</h1>
          <div style={styles.headerButtons}>
            <button
              onClick={checkEfficacy}
              disabled={checkingEfficacy}
              style={styles.efficacyButton}
            >
              {checkingEfficacy ? "Checking…" : "Check efficacy"}
            </button>
            <button onClick={runDetection} disabled={running} style={styles.runButton}>
              {running ? "Detecting…" : "Run detection"}
            </button>
          </div>
        </div>
        <p style={styles.subtitle}>
          The brain&apos;s prescriptions, ranked by recurrence × severity. Approve or snooze
          each open one; delivered ones stay under the efficacy loop&apos;s watch — recurrence
          auto-escalates, quiet gets proven effective.
        </p>
        <a href="/library" style={styles.backLink}>← Back to library</a>

        {runMessage && <p style={styles.runMessage}>{runMessage}</p>}
        {error && <p style={styles.errorText}>{error}</p>}

        <h2 style={styles.sectionTitle}>Open — awaiting the manager gate ({open.length})</h2>
        {open.length === 0 && (
          <p style={styles.empty}>
            No open prescriptions. Run detection after new frameworks or conflicts land.
          </p>
        )}
        {open.map((r, i) => (
          <a key={r.id} href={`/prescriptions/${r.id}`} style={styles.card}>
            <div style={styles.cardTop}>
              <span style={styles.rank}>#{i + 1}</span>
              <span style={styles.roi}>ROI {r.roi_score}</span>
              <span style={styles.rungChip}>
                Rung {r.rung} · {RUNG_LABEL[r.rung]} ({RUNG_EFFORT[r.rung]})
              </span>
              {r.source_type && (
                <span style={styles.sourceChip}>{SOURCE_LABEL[r.source_type] ?? r.source_type}</span>
              )}
              {r.capture_first && <span style={styles.captureChip}>📝 Capture first</span>}
            </div>
            <p style={styles.gap}>{r.gap_summary}</p>
            <p style={styles.pairing}>{r.pairing_summary}</p>
            <div style={styles.cardActions}>
              <button
                style={styles.approveButton}
                disabled={actingOn === r.id}
                onClick={(e: React.MouseEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                  act(r.id, "approve");
                }}
              >
                ✓ Approve
              </button>
              <button
                style={styles.snoozeButton}
                disabled={actingOn === r.id}
                onClick={(e: React.MouseEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                  act(r.id, "snooze");
                }}
              >
                😴 Snooze 7d
              </button>
              <span style={styles.cardMeta}>
                {r.rank_rationale} · {r.evidence_count} evidence record
                {r.evidence_count === 1 ? "" : "s"} →
              </span>
            </div>
          </a>
        ))}

        {inFlight.length > 0 && (
          <>
            <h2 style={styles.sectionTitle}>Approved / in-flight ({inFlight.length})</h2>
            {inFlight.map((r) => {
              const chip = r.efficacy_status ? EFFICACY_CHIP[r.efficacy_status] : null;
              return (
                <a key={r.id} href={`/prescriptions/${r.id}`} style={styles.card}>
                  <div style={styles.cardTop}>
                    <span style={styles.rungChip}>
                      Rung {r.rung} · {RUNG_LABEL[r.rung]}
                      {r.escalated_from_rung ? ` (escalated from ${r.escalated_from_rung})` : ""}
                    </span>
                    <span style={styles.statusChip}>{r.status}</span>
                    {chip && (
                      <span
                        style={{
                          ...styles.efficacyChip,
                          color: chip.color,
                          background: chip.bg,
                          borderColor: chip.border,
                        }}
                      >
                        {chip.label}
                      </span>
                    )}
                    {r.capture_first && <span style={styles.captureChip}>📝 Capture first</span>}
                  </div>
                  <p style={styles.gap}>{r.gap_summary}</p>
                  {r.approved_by_name && (
                    <p style={styles.approvalMeta}>
                      Approved by {r.approved_by_name}
                      {r.approved_at ? ` · ${new Date(r.approved_at).toLocaleDateString()}` : ""}
                      {r.delivered_at
                        ? ` · delivered ${new Date(r.delivered_at).toLocaleDateString()}`
                        : ""}
                    </p>
                  )}
                  {r.efficacy_note && <p style={styles.efficacyNote}>{r.efficacy_note}</p>}
                </a>
              );
            })}
          </>
        )}

        {closed.length > 0 && (
          <>
            <h2 style={styles.sectionTitle}>Proven effective — closed ({closed.length})</h2>
            {closed.map((r) => (
              <a
                key={r.id}
                href={`/prescriptions/${r.id}`}
                style={{ ...styles.card, borderColor: "#bbf7d0", background: "#f6fef8" }}
              >
                <div style={styles.cardTop}>
                  <span
                    style={{
                      ...styles.efficacyChip,
                      color: "#166534",
                      background: "#f0fdf4",
                      borderColor: "#bbf7d0",
                    }}
                  >
                    ✅ effective — proven
                  </span>
                  <span style={styles.rungChip}>
                    Rung {r.rung} · {RUNG_LABEL[r.rung]}
                  </span>
                </div>
                <p style={styles.gap}>{r.gap_summary}</p>
                {r.efficacy_note && <p style={styles.efficacyNote}>{r.efficacy_note}</p>}
              </a>
            ))}
          </>
        )}

        {snoozed.length > 0 && (
          <p style={styles.snoozedLine}>
            😴 {snoozed.length} snoozed — wakes{" "}
            {snoozed
              .map((r) =>
                r.snoozed_until ? new Date(r.snoozed_until).toLocaleDateString() : "soon"
              )
              .join(" · ")}
            . Snooze defers, never deletes.
          </p>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { minHeight: "100vh", background: "#fafafa", fontFamily: "system-ui, sans-serif" },
  container: { maxWidth: 820, margin: "0 auto", padding: "40px 24px 80px" },
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  headerButtons: { display: "flex", gap: 8 },
  title: { fontSize: "26px", margin: 0 },
  subtitle: { color: "#666", fontSize: "14px", margin: "6px 0 10px", lineHeight: 1.5 },
  backLink: { fontSize: "13px", color: "#666", textDecoration: "none" },
  runButton: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#fff",
    background: "#7c3aed",
    border: "none",
    borderRadius: 8,
    padding: "8px 14px",
    cursor: "pointer",
  },
  efficacyButton: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#7c3aed",
    background: "#f5f3ff",
    border: "1px solid #ddd6fe",
    borderRadius: 8,
    padding: "8px 14px",
    cursor: "pointer",
  },
  runMessage: { fontSize: "13px", color: "#166534", margin: "12px 0 0" },
  errorText: { color: "#ef4444", fontSize: "14px" },
  sectionTitle: {
    fontSize: "13px",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "#888",
    margin: "28px 0 10px",
  },
  empty: { color: "#888", fontSize: "14px" },
  card: {
    display: "block",
    background: "#fff",
    border: "1px solid #e5e5e5",
    borderRadius: 12,
    padding: "16px 18px",
    textDecoration: "none",
    color: "inherit",
    marginBottom: 12,
  },
  cardTop: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap" as const,
    marginBottom: 8,
  },
  cardActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap" as const,
    marginTop: 4,
  },
  approveButton: {
    fontSize: "13px",
    fontWeight: 600,
    color: "#fff",
    background: "#16a34a",
    border: "none",
    borderRadius: 8,
    padding: "6px 12px",
    cursor: "pointer",
  },
  snoozeButton: {
    fontSize: "13px",
    fontWeight: 600,
    color: "#57534e",
    background: "#f5f5f4",
    border: "1px solid #e7e5e4",
    borderRadius: 8,
    padding: "6px 12px",
    cursor: "pointer",
  },
  rank: { fontSize: "13px", fontWeight: 700, color: "#7c3aed" },
  roi: {
    fontSize: "11px",
    fontWeight: 700,
    color: "#7c3aed",
    background: "#f5f3ff",
    border: "1px solid #ddd6fe",
    borderRadius: 999,
    padding: "3px 9px",
  },
  rungChip: {
    fontSize: "11px",
    fontWeight: 600,
    color: "#1e40af",
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    borderRadius: 999,
    padding: "3px 9px",
  },
  sourceChip: {
    fontSize: "11px",
    color: "#666",
    background: "#f5f5f5",
    border: "1px solid #e5e5e5",
    borderRadius: 999,
    padding: "3px 9px",
  },
  captureChip: {
    fontSize: "11px",
    fontWeight: 600,
    color: "#b45309",
    background: "#fffbeb",
    border: "1px solid #fde68a",
    borderRadius: 999,
    padding: "3px 9px",
  },
  statusChip: {
    fontSize: "11px",
    color: "#666",
    background: "#f5f5f5",
    borderRadius: 999,
    padding: "3px 9px",
    textTransform: "capitalize" as const,
  },
  efficacyChip: {
    fontSize: "11px",
    fontWeight: 700,
    border: "1px solid",
    borderRadius: 999,
    padding: "3px 9px",
  },
  gap: { fontSize: "15px", fontWeight: 600, margin: "0 0 6px", lineHeight: 1.45 },
  pairing: { fontSize: "13px", color: "#555", margin: "0 0 8px", lineHeight: 1.5 },
  approvalMeta: { fontSize: "12px", color: "#888", margin: "0 0 4px" },
  efficacyNote: { fontSize: "12px", color: "#666", margin: 0, lineHeight: 1.5 },
  cardMeta: { fontSize: "12px", color: "#999" },
  snoozedLine: { fontSize: "13px", color: "#888", marginTop: 24, lineHeight: 1.5 },
  center: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "system-ui, sans-serif",
  },
};
