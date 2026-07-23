"use client";
// P-4A Build 4 — prescription detail: "why does it think that?"
// The full chain, top to bottom: the gap → the rung + its one-line rationale
// → the pairing (or the honest capture-first callout) → the detection that
// fired → every evidence record, linked back to the library → the conflict
// row when the source is the X-ray → the rank math. Nothing here is opaque;
// every claim traces to a source record an org member can open.
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

type EntityMapEntry = { type: string; name: string; detail: string | null };

type Detail = {
  prescription: {
    id: string;
    rung: number;
    rung_rationale: string;
    gap_summary: string;
    capture_first: boolean;
    experts: {
      user_id: string;
      record_id: string;
      profile: { display_name: string | null; persona: string | null } | null;
    }[];
    audience: string;
    audience_entities: EntityMapEntry[];
    pairing_summary: string;
    recurrence: number;
    severity: number;
    roi_score: number;
    rank_rationale: string;
    status: string;
    triaged_by: string;
    created_at: string;
  };
  detection: {
    id: string;
    source_type: string;
    subject_entities: EntityMapEntry[];
    summary: string;
    detail: string | null;
    recurrence: number;
    detected_at: string;
    detected_by: string;
  } | null;
  conflict: {
    id: string;
    status: string;
    territory: string | null;
    rationale: string;
    resolution: string | null;
    resolution_note: string | null;
    detected_at: string;
  } | null;
  evidence: {
    id: string;
    created_at: string;
    trigger_type: string | null;
    method: string | null;
    framework_name: string | null;
    framework_tagline: string | null;
    context_summary: string | null;
    trigger_signal: string | null;
    judgment: string | null;
    entity_map: EntityMapEntry[];
    author: { display_name: string | null; persona: string | null } | null;
    is_mine: boolean;
  }[];
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
  4: "multi-session program",
};

const SOURCE_LABEL: Record<string, string> = {
  conflict: "Conflict X-ray",
  coverage_gap: "Coverage gap",
  entity_signal: "Entity signal",
};

const TRIGGER_EMOJI: Record<string, string> = {
  broke: "\u{1F4A5}",
  win: "\u{1F3C6}",
  concern: "\u{26A0}\u{FE0F}",
  friction: "\u{1F501}",
  judgment: "\u{1F9E0}",
};

export default function PrescriptionDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Detail | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/prescriptions/${id}`);
      const body = await res.json();
      if (!res.ok) {
        setError(
          res.status === 404
            ? "Not found — you may not have access to this prescription."
            : body.error
        );
      } else {
        setData(body);
      }
    } catch {
      setError("Could not load this prescription.");
    } finally {
      setLoading(false);
    }
  }, [id]);

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

  if (loading) {
    return (
      <div style={styles.center}>
        <p>Loading…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={styles.center}>
        <p style={styles.errorText}>{error || "Not found."}</p>
        <a href="/prescriptions" style={styles.backLink}>← Back to the queue</a>
      </div>
    );
  }

  const { prescription: rx, detection, conflict, evidence } = data;

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <a href="/prescriptions" style={styles.backLink}>← Back to the queue</a>

        <div style={styles.chipRow}>
          <span style={styles.rungChip}>
            Rung {rx.rung} · {RUNG_LABEL[rx.rung]} ({RUNG_EFFORT[rx.rung]})
          </span>
          {detection && (
            <span style={styles.sourceChip}>
              Source: {SOURCE_LABEL[detection.source_type] ?? detection.source_type}
            </span>
          )}
          <span style={styles.roiChip}>ROI {rx.roi_score}</span>
          <span style={styles.statusChip}>{rx.status}</span>
        </div>

        <h1 style={styles.title}>{rx.gap_summary}</h1>

        {/* WHY THIS RUNG — the stored one-liner, verbatim */}
        <div style={styles.rationaleBox}>
          <div style={styles.boxLabel}>Why this rung ({rx.triaged_by})</div>
          <p style={styles.boxText}>{rx.rung_rationale}</p>
        </div>

        {/* THE PAIRING — or the honest capture-first case */}
        {rx.capture_first ? (
          <div style={styles.captureBox}>
            <div style={styles.captureLabel}>📝 Capture first — no expert to pair</div>
            <p style={styles.boxText}>{rx.pairing_summary}</p>
            <p style={styles.captureFootnote}>
              Nobody in the org has authored on this territory, so no facilitator is
              invented. This is a codify target: capture the knowledge, then prescribe.
            </p>
          </div>
        ) : (
          <div style={styles.pairingBox}>
            <div style={styles.pairingLabel}>The pairing</div>
            <p style={styles.boxText}>{rx.pairing_summary}</p>
            <div style={styles.pairingSides}>
              <div style={styles.pairingSide}>
                <div style={styles.sideLabel}>Who has it</div>
                {rx.experts.map((e) => (
                  <a key={e.record_id} href={`/library/${e.record_id}`} style={styles.expertLink}>
                    {e.profile?.display_name ?? "Org expert"}
                    {e.profile?.persona && (
                      <span style={styles.personaTag}>
                        {e.profile.persona.replace(/_/g, " ")}
                      </span>
                    )}
                  </a>
                ))}
              </div>
              <div style={styles.pairingSide}>
                <div style={styles.sideLabel}>Who needs it</div>
                <p style={styles.audienceText}>{rx.audience}</p>
              </div>
            </div>
          </div>
        )}

        {/* THE DETECTION — what fired, verbatim */}
        {detection && (
          <div style={styles.detectionBox}>
            <div style={styles.boxLabel}>
              What was detected ({detection.detected_by},{" "}
              {new Date(detection.detected_at).toLocaleDateString()})
            </div>
            <p style={styles.boxText}>{detection.summary}</p>
            {detection.detail && <p style={styles.detailText}>{detection.detail}</p>}
            {detection.subject_entities.length > 0 && (
              <div style={styles.entityRow}>
                {detection.subject_entities.map((e, i) => (
                  <span key={i} style={styles.entityChip}>
                    {e.name} <span style={styles.entityType}>({e.type.replace(/_/g, " ")})</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* THE CONFLICT — when the source is the X-ray */}
        {conflict && (
          <div style={styles.conflictBox}>
            <div style={styles.boxLabel}>
              From the Conflict X-ray ·{" "}
              <a href={`/conflicts/${conflict.id}`} style={styles.conflictLink}>
                open the conflict →
              </a>
            </div>
            {conflict.territory && (
              <p style={styles.boxText}>Shared territory: {conflict.territory}</p>
            )}
            <p style={styles.detailText}>{conflict.rationale}</p>
            <p style={styles.detailText}>
              Status: {conflict.status}
              {conflict.resolution ? ` (${conflict.resolution})` : ""}
            </p>
          </div>
        )}

        {/* THE EVIDENCE CHAIN — every source record, linked */}
        <h2 style={styles.sectionTitle}>
          Evidence chain ({evidence.length} record{evidence.length === 1 ? "" : "s"})
        </h2>
        {evidence.map((r) => (
          <a key={r.id} href={`/library/${r.id}`} style={styles.evidenceCard}>
            <div style={styles.evidenceTop}>
              <span style={styles.evidenceName}>
                {r.trigger_type ? `${TRIGGER_EMOJI[r.trigger_type] ?? ""} ` : ""}
                {r.framework_name ?? "(framework pending)"}
              </span>
              <span style={styles.evidenceMeta}>
                {r.author?.display_name ?? "Org member"} ·{" "}
                {new Date(r.created_at).toLocaleDateString()}
              </span>
            </div>
            {r.framework_tagline && <p style={styles.evidenceTagline}>{r.framework_tagline}</p>}
            {r.trigger_signal && (
              <p style={styles.evidenceSnippet}>
                <strong>Signal:</strong> {r.trigger_signal}
              </p>
            )}
            {r.judgment && (
              <p style={styles.evidenceSnippet}>
                <strong>The play:</strong> {r.judgment}
              </p>
            )}
          </a>
        ))}

        {/* THE RANK MATH */}
        <div style={styles.rankBox}>
          <div style={styles.boxLabel}>Why it ranks where it does</div>
          <p style={styles.boxText}>{rx.rank_rationale}</p>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { minHeight: "100vh", background: "#fafafa", fontFamily: "system-ui, sans-serif" },
  container: { maxWidth: 820, margin: "0 auto", padding: "32px 24px 80px" },
  backLink: { fontSize: "13px", color: "#666", textDecoration: "none" },
  chipRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap" as const,
    margin: "16px 0 10px",
  },
  rungChip: {
    fontSize: "12px",
    fontWeight: 700,
    color: "#1e40af",
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    borderRadius: 999,
    padding: "4px 10px",
  },
  sourceChip: {
    fontSize: "12px",
    color: "#666",
    background: "#f5f5f5",
    border: "1px solid #e5e5e5",
    borderRadius: 999,
    padding: "4px 10px",
  },
  roiChip: {
    fontSize: "12px",
    fontWeight: 700,
    color: "#7c3aed",
    background: "#f5f3ff",
    border: "1px solid #ddd6fe",
    borderRadius: 999,
    padding: "4px 10px",
  },
  statusChip: {
    fontSize: "12px",
    color: "#666",
    background: "#f5f5f5",
    borderRadius: 999,
    padding: "4px 10px",
    textTransform: "capitalize" as const,
  },
  title: { fontSize: "22px", margin: "0 0 16px", lineHeight: 1.4 },
  boxLabel: {
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "#888",
    fontWeight: 700,
    marginBottom: 6,
  },
  boxText: { fontSize: "14px", margin: 0, lineHeight: 1.55 },
  detailText: { fontSize: "13px", color: "#666", margin: "8px 0 0", lineHeight: 1.5 },
  rationaleBox: {
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    borderRadius: 12,
    padding: "14px 16px",
    marginBottom: 14,
  },
  pairingBox: {
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    borderRadius: 12,
    padding: "14px 16px",
    marginBottom: 14,
  },
  pairingLabel: {
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "#166534",
    fontWeight: 700,
    marginBottom: 6,
  },
  pairingSides: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
    marginTop: 12,
  },
  pairingSide: {
    background: "#fff",
    border: "1px solid #dcfce7",
    borderRadius: 8,
    padding: "10px 12px",
  },
  sideLabel: {
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "#888",
    marginBottom: 6,
  },
  expertLink: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: "14px",
    fontWeight: 600,
    color: "#166534",
    textDecoration: "none",
    marginBottom: 4,
  },
  personaTag: {
    background: "#f5f5f5",
    borderRadius: 999,
    padding: "1px 7px",
    fontSize: "11px",
    fontWeight: 400,
    color: "#666",
    textTransform: "capitalize" as const,
  },
  audienceText: { fontSize: "14px", fontWeight: 600, margin: 0 },
  captureBox: {
    background: "#fffbeb",
    border: "1px solid #fde68a",
    borderRadius: 12,
    padding: "14px 16px",
    marginBottom: 14,
  },
  captureLabel: {
    fontSize: "12px",
    fontWeight: 700,
    color: "#b45309",
    marginBottom: 6,
  },
  captureFootnote: { fontSize: "12px", color: "#92400e", margin: "8px 0 0", lineHeight: 1.5 },
  detectionBox: {
    background: "#fff",
    border: "1px solid #e5e5e5",
    borderRadius: 12,
    padding: "14px 16px",
    marginBottom: 14,
  },
  entityRow: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap" as const,
    marginTop: 10,
  },
  entityChip: {
    fontSize: "12px",
    background: "#f5f5f5",
    border: "1px solid #e5e5e5",
    borderRadius: 999,
    padding: "3px 9px",
  },
  entityType: { color: "#999" },
  conflictBox: {
    background: "#fffbeb",
    border: "1px solid #fde68a",
    borderRadius: 12,
    padding: "14px 16px",
    marginBottom: 14,
  },
  conflictLink: { color: "#b45309", textDecoration: "none", fontWeight: 600 },
  sectionTitle: {
    fontSize: "13px",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "#888",
    margin: "24px 0 10px",
  },
  evidenceCard: {
    display: "block",
    background: "#fff",
    border: "1px solid #e5e5e5",
    borderRadius: 12,
    padding: "14px 16px",
    textDecoration: "none",
    color: "inherit",
    marginBottom: 10,
  },
  evidenceTop: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap" as const,
    marginBottom: 4,
  },
  evidenceName: { fontSize: "15px", fontWeight: 700 },
  evidenceMeta: { fontSize: "12px", color: "#888" },
  evidenceTagline: { fontSize: "13px", color: "#555", margin: "0 0 8px", lineHeight: 1.4 },
  evidenceSnippet: { fontSize: "13px", color: "#444", margin: "4px 0 0", lineHeight: 1.5 },
  rankBox: {
    background: "#f5f3ff",
    border: "1px solid #ddd6fe",
    borderRadius: 12,
    padding: "14px 16px",
    marginTop: 18,
  },
  errorText: { color: "#ef4444" },
  center: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column" as const,
    gap: 12,
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "system-ui, sans-serif",
  },
};
