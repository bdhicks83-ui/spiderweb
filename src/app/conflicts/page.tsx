"use client";
// P-2 Build 3 — Conflict X-ray review: org-scoped list of conflicts.
// Open conflicts up top with both frameworks named; resolved history below
// (that history is P-4's detection input, so it stays visible, not hidden).
// The "Scan for conflicts" button runs detection on demand for the caller's
// own org only — /api/conflicts/detect reads the org server-side.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

type ConflictSide = {
  id: string;
  name: string | null;
  judgment: string | null;
  author: { display_name: string | null; persona: string | null } | null;
};

type ConflictSummary = {
  id: string;
  status: string;
  detected_at: string;
  territory: string | null;
  rationale: string;
  resolution: string | null;
  resolved_at: string | null;
  a: ConflictSide;
  b: ConflictSide;
};

const RESOLUTION_LABEL: Record<string, string> = {
  sharpen_boundaries: "Sharpened boundaries",
  reconcile: "Reconciled",
  supersede: "Superseded",
  escalate: "Escalated",
};

export default function ConflictsPage() {
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ConflictSummary[]>([]);
  const router = useRouter();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/conflicts");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not load conflicts.");
      } else {
        setError(null);
        setConflicts(data.conflicts || []);
      }
    } catch {
      setError("Could not load conflicts.");
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

  const runScan = async () => {
    setScanning(true);
    setScanMessage(null);
    try {
      const res = await fetch("/api/conflicts/detect", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setScanMessage(data.error || "Scan failed.");
      } else {
        const s = data.summary;
        setScanMessage(
          `${data.message} (${s.scanned} records · ${s.candidates} candidate pairs · ${s.checked} checked)`
        );
        await load();
      }
    } catch {
      setScanMessage("Scan failed.");
    } finally {
      setScanning(false);
    }
  };

  if (loading) {
    return (
      <div style={styles.center}>
        <p>Loading…</p>
      </div>
    );
  }

  const open = conflicts.filter((c) => c.status === "open");
  const resolved = conflicts.filter((c) => c.status === "resolved");

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <div style={styles.headerRow}>
          <h1 style={styles.title}>⚠️ Conflict X-ray</h1>
          <button onClick={runScan} disabled={scanning} style={styles.scanButton}>
            {scanning ? "Scanning…" : "Scan for conflicts"}
          </button>
        </div>
        <p style={styles.subtitle}>
          Where two experts&apos; frameworks claim the same territory with opposing plays.
          Contested frameworks stay live in the library — flagged, never blocked.
        </p>
        <a href="/library" style={styles.backLink}>← Back to library</a>

        {scanMessage && <p style={styles.scanMessage}>{scanMessage}</p>}
        {error && <p style={styles.errorText}>{error}</p>}

        <h2 style={styles.sectionTitle}>Open ({open.length})</h2>
        {open.length === 0 && (
          <p style={styles.empty}>No open conflicts. Run a scan after new frameworks land.</p>
        )}
        {open.map((c) => (
          <a key={c.id} href={`/conflicts/${c.id}`} style={styles.card}>
            <div style={styles.cardVs}>
              <div style={styles.cardSide}>
                <div style={styles.cardFramework}>{c.a.name ?? "(framework)"}</div>
                <div style={styles.cardAuthor}>{c.a.author?.display_name ?? "Org member"}</div>
              </div>
              <div style={styles.vsBubble}>vs</div>
              <div style={{ ...styles.cardSide, textAlign: "right" as const }}>
                <div style={styles.cardFramework}>{c.b.name ?? "(framework)"}</div>
                <div style={styles.cardAuthor}>{c.b.author?.display_name ?? "Org member"}</div>
              </div>
            </div>
            {c.territory && (
              <div style={styles.territory}>Shared territory: {c.territory}</div>
            )}
            <div style={styles.cardMeta}>
              Detected {new Date(c.detected_at).toLocaleDateString()} · open →
            </div>
          </a>
        ))}

        <h2 style={styles.sectionTitle}>Resolved ({resolved.length})</h2>
        {resolved.length === 0 && <p style={styles.empty}>Nothing resolved yet.</p>}
        {resolved.map((c) => (
          <a key={c.id} href={`/conflicts/${c.id}`} style={{ ...styles.card, opacity: 0.75 }}>
            <div style={styles.cardVs}>
              <div style={styles.cardSide}>
                <div style={styles.cardFramework}>{c.a.name ?? "(framework)"}</div>
                <div style={styles.cardAuthor}>{c.a.author?.display_name ?? "Org member"}</div>
              </div>
              <div style={styles.vsBubbleResolved}>✓</div>
              <div style={{ ...styles.cardSide, textAlign: "right" as const }}>
                <div style={styles.cardFramework}>{c.b.name ?? "(framework)"}</div>
                <div style={styles.cardAuthor}>{c.b.author?.display_name ?? "Org member"}</div>
              </div>
            </div>
            <div style={styles.cardMeta}>
              {c.resolution ? RESOLUTION_LABEL[c.resolution] ?? c.resolution : "Resolved"}
              {c.resolved_at ? ` · ${new Date(c.resolved_at).toLocaleDateString()}` : ""}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { minHeight: "100vh", background: "#fafafa", fontFamily: "system-ui, sans-serif" },
  container: { maxWidth: 760, margin: "0 auto", padding: "40px 24px 80px" },
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  title: { fontSize: "26px", margin: 0 },
  subtitle: { color: "#666", fontSize: "14px", margin: "6px 0 10px", lineHeight: 1.5 },
  backLink: { fontSize: "13px", color: "#666", textDecoration: "none" },
  scanButton: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#fff",
    background: "#b45309",
    border: "none",
    borderRadius: 8,
    padding: "8px 14px",
    cursor: "pointer",
  },
  scanMessage: { fontSize: "13px", color: "#166534", margin: "12px 0 0" },
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
  cardVs: { display: "flex", alignItems: "center", gap: 12, marginBottom: 8 },
  cardSide: { flex: 1 },
  cardFramework: { fontSize: "15px", fontWeight: 700 },
  cardAuthor: { fontSize: "12px", color: "#888", marginTop: 2 },
  vsBubble: {
    fontSize: "11px",
    fontWeight: 700,
    color: "#b45309",
    background: "#fffbeb",
    border: "1px solid #fde68a",
    borderRadius: 999,
    padding: "4px 10px",
  },
  vsBubbleResolved: {
    fontSize: "11px",
    fontWeight: 700,
    color: "#166534",
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    borderRadius: 999,
    padding: "4px 10px",
  },
  territory: { fontSize: "13px", color: "#78350f", marginBottom: 6 },
  cardMeta: { fontSize: "12px", color: "#999" },
  center: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "system-ui, sans-serif",
  },
};
