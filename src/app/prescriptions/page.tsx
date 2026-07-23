"use client";
// P-4A Build 4 — the ROI-ranked prescription queue.
// Org-scoped list of open prescriptions, ranked recurrence × severity —
// a prioritized list, never a firehose. Each row: the gap, the evidence
// behind it, the proposed rung, the pairing, and the rank rationale.
// "Run detection" re-runs the engine for the caller's own org only.
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

export default function PrescriptionsPage() {
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
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

  if (loading) {
    return (
      <div style={styles.center}>
        <p>Loading…</p>
      </div>
    );
  }

  const open = rows.filter((r) => r.status === "open");
  const other = rows.filter((r) => r.status !== "open");

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <div style={styles.headerRow}>
          <h1 style={styles.title}>💊 Prescription Queue</h1>
          <button onClick={runDetection} disabled={running} style={styles.runButton}>
            {running ? "Detecting…" : "Run detection"}
          </button>
        </div>
        <p style={styles.subtitle}>
          The brain&apos;s open prescriptions, ranked by recurrence × severity. Each one
          traces back to the records that caused it — click through for the full evidence
          chain.
        </p>
        <a href="/library" style={styles.backLink}>← Back to library</a>

        {runMessage && <p style={styles.runMessage}>{runMessage}</p>}
        {error && <p style={styles.errorText}>{error}</p>}

        <h2 style={styles.sectionTitle}>Open ({open.length})</h2>
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
            <div style={styles.cardMeta}>
              {r.rank_rationale} · {r.evidence_count} evidence record
              {r.evidence_count === 1 ? "" : "s"} →
            </div>
          </a>
        ))}

        {other.length > 0 && (
          <>
            <h2 style={styles.sectionTitle}>In flight ({other.length})</h2>
            {other.map((r) => (
              <a
                key={r.id}
                href={`/prescriptions/${r.id}`}
                style={{ ...styles.card, opacity: 0.7 }}
              >
                <div style={styles.cardTop}>
                  <span style={styles.rungChip}>
                    Rung {r.rung} · {RUNG_LABEL[r.rung]}
                  </span>
                  <span style={styles.statusChip}>{r.status}</span>
                </div>
                <p style={styles.gap}>{r.gap_summary}</p>
              </a>
            ))}
          </>
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
  gap: { fontSize: "15px", fontWeight: 600, margin: "0 0 6px", lineHeight: 1.45 },
  pairing: { fontSize: "13px", color: "#555", margin: "0 0 8px", lineHeight: 1.5 },
  cardMeta: { fontSize: "12px", color: "#999" },
  center: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "system-ui, sans-serif",
  },
};
