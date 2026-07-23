"use client";
// P-2 Build 3 — Conflict review: one conflict, both frameworks side by
// side, the detector's rationale verbatim, and the four resolution options
// (sharpen boundaries · reconcile · supersede · escalate).
//
// Resolving clears the contested badge on both frameworks. The three
// framework-changing options run through the belief-revision-style depth
// gate server-side — a shallow note is logged but the conflict stays open,
// with the gate's guidance shown here. Who resolved it and how is recorded
// (P-4 detection history).
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

type EntityMapEntry = { type: string; name: string; detail: string | null };

type SideRecord = {
  id: string;
  user_id: string;
  created_at: string;
  trigger_type: string | null;
  method: string | null;
  context_summary: string | null;
  trigger_signal: string | null;
  signal_detail: string | null;
  judgment: string | null;
  rationale: string | null;
  boundaries: string | null;
  entity_map: EntityMapEntry[];
  framework: { name: string; tagline: string; the_play: string; boundaries: string[] } | null;
  is_mine: boolean;
  author: { display_name: string | null; persona: string | null } | null;
} | null;

type ConflictDetail = {
  id: string;
  status: string;
  detected_at: string;
  detected_by: string;
  territory: string | null;
  rationale: string;
  resolution: string | null;
  resolution_note: string | null;
  resolution_depth_ok: boolean | null;
  superseding_record_id: string | null;
  resolved_at: string | null;
  resolver: { display_name: string | null } | null;
  a: SideRecord;
  b: SideRecord;
};

const OPTIONS: {
  id: string;
  label: string;
  description: string;
}[] = [
  {
    id: "sharpen_boundaries",
    label: "Sharpen boundaries",
    description:
      "Both frameworks are right — in different territory. Sharpen each one's boundaries so they no longer claim the same ground.",
  },
  {
    id: "reconcile",
    label: "Reconcile",
    description:
      "The two plays can be unified into one coherent piece of guidance that honors both experts' judgment.",
  },
  {
    id: "supersede",
    label: "Supersede",
    description:
      "One framework carries this territory going forward; the other yields on this ground.",
  },
  {
    id: "escalate",
    label: "Escalate",
    description:
      "This collision needs a human owner (plant leadership, quality council). Record who owns the call and hand it off.",
  },
];

const RESOLUTION_LABEL: Record<string, string> = {
  sharpen_boundaries: "Sharpened boundaries",
  reconcile: "Reconciled",
  supersede: "Superseded",
  escalate: "Escalated",
};

export default function ConflictDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ConflictDetail | null>(null);

  const [resolution, setResolution] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [superseding, setSuperseding] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [gateMessage, setGateMessage] = useState<string | null>(null);
  const [gateNote, setGateNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/conflicts/${id}`);
      const data = await res.json();
      if (!res.ok) {
        setError(res.status === 404 ? "Not found — you may not have access to this conflict." : data.error);
      } else {
        setConflict(data.conflict);
      }
    } catch {
      setError("Could not load this conflict.");
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

  const submit = async () => {
    if (!resolution || !note.trim()) return;
    setSubmitting(true);
    setGateMessage(null);
    setGateNote(null);
    try {
      const res = await fetch(`/api/conflicts/${id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resolution,
          note: note.trim(),
          superseding_record_id: resolution === "supersede" ? superseding : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGateMessage(data.error || "Could not resolve.");
      } else {
        setGateMessage(data.message);
        setGateNote(data.note ?? null);
        if (data.resolved) {
          await load(); // re-render as resolved
        }
      }
    } catch {
      setGateMessage("Could not resolve.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={styles.center}>
        <p>Loading…</p>
      </div>
    );
  }

  if (error || !conflict) {
    return (
      <div style={styles.center}>
        <p style={styles.errorText}>{error || "Not found."}</p>
        <a href="/conflicts" style={styles.backLink}>← Back to conflicts</a>
      </div>
    );
  }

  const isOpen = conflict.status === "open";
  const canSubmit =
    !!resolution &&
    !!note.trim() &&
    (resolution !== "supersede" || !!superseding) &&
    !submitting;

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <a href="/conflicts" style={styles.backLink}>← Back to conflicts</a>

        <h1 style={styles.title}>
          {isOpen ? "⚠️ Open conflict" : "✓ Resolved conflict"}
        </h1>
        {conflict.territory && (
          <p style={styles.territory}>Shared territory: {conflict.territory}</p>
        )}

        <div style={styles.rationaleBox}>
          <div style={styles.rationaleLabel}>
            Why the detector flagged this ({conflict.detected_by},{" "}
            {new Date(conflict.detected_at).toLocaleDateString()})
          </div>
          <p style={styles.rationaleText}>{conflict.rationale}</p>
        </div>

        <div style={styles.sideBySide}>
          <SidePanel record={conflict.a} highlight={conflict.superseding_record_id === conflict.a?.id} />
          <SidePanel record={conflict.b} highlight={conflict.superseding_record_id === conflict.b?.id} />
        </div>

        {!isOpen && (
          <div style={styles.resolvedBox}>
            <div style={styles.resolvedTitle}>
              {conflict.resolution ? RESOLUTION_LABEL[conflict.resolution] ?? conflict.resolution : "Resolved"}
              {" · "}
              {conflict.resolver?.display_name ?? "an org member"}
              {conflict.resolved_at ? ` · ${new Date(conflict.resolved_at).toLocaleDateString()}` : ""}
            </div>
            {conflict.resolution === "supersede" && conflict.superseding_record_id && (
              <p style={styles.resolvedNote}>
                The highlighted framework carries this territory going forward.
              </p>
            )}
            {conflict.resolution_note && (
              <p style={styles.resolvedNote}>{conflict.resolution_note}</p>
            )}
            <p style={styles.resolvedFootnote}>
              The contested badge is cleared on both frameworks. This resolution is
              recorded as detection history for the Prescription Engine.
            </p>
          </div>
        )}

        {isOpen && (
          <div style={styles.resolveBox}>
            <h2 style={styles.resolveTitle}>Resolve this conflict</h2>
            <p style={styles.resolveSubtitle}>
              Both frameworks stay live and retrievable until — and after — resolution.
              Resolving records the call and clears the contested badge.
            </p>

            {OPTIONS.map((o) => (
              <label key={o.id} style={styles.option}>
                <input
                  type="radio"
                  name="resolution"
                  checked={resolution === o.id}
                  onChange={() => setResolution(o.id)}
                  style={styles.radio}
                />
                <span>
                  <span style={styles.optionLabel}>{o.label}</span>
                  <span style={styles.optionDescription}> — {o.description}</span>
                </span>
              </label>
            ))}

            {resolution === "supersede" && (
              <div style={styles.supersedePick}>
                <div style={styles.supersedeLabel}>Which framework carries the territory?</div>
                {[conflict.a, conflict.b].map(
                  (r) =>
                    r && (
                      <label key={r.id} style={styles.option}>
                        <input
                          type="radio"
                          name="superseding"
                          checked={superseding === r.id}
                          onChange={() => setSuperseding(r.id)}
                          style={styles.radio}
                        />
                        <span style={styles.optionLabel}>
                          {r.framework?.name ?? "(framework)"} — {r.author?.display_name ?? "Org member"}
                        </span>
                      </label>
                    )
                )}
              </div>
            )}

            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                resolution === "escalate"
                  ? "Who owns this call now, and what do they need to decide?"
                  : "Name what each framework prescribes, the concrete condition that divides (or settles) them, what the org's guidance now is, and why."
              }
              style={styles.textarea}
              rows={5}
            />

            {gateMessage && (
              <div style={styles.gateBox}>
                <p style={styles.gateMessage}>{gateMessage}</p>
                {gateNote && <p style={styles.gateNote}>{gateNote}</p>}
              </div>
            )}

            <button onClick={submit} disabled={!canSubmit} style={{
              ...styles.submitButton,
              opacity: canSubmit ? 1 : 0.5,
              cursor: canSubmit ? "pointer" : "default",
            }}>
              {submitting ? "Resolving…" : "Resolve"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SidePanel({ record, highlight }: { record: SideRecord; highlight: boolean }) {
  if (!record) {
    return (
      <div style={styles.panel}>
        <p style={styles.panelMissing}>Record unavailable.</p>
      </div>
    );
  }
  const f = record.framework;
  return (
    <div style={{ ...styles.panel, ...(highlight ? styles.panelHighlight : {}) }}>
      <div style={styles.panelAuthor}>
        {record.author?.display_name ?? "Org member"}
        {record.author?.persona && (
          <span style={styles.personaTag}>{record.author.persona.replace(/_/g, " ")}</span>
        )}
      </div>
      <h3 style={styles.panelTitle}>
        <a href={`/library/${record.id}`} style={styles.panelTitleLink}>
          {f?.name ?? "(framework pending)"}
        </a>
      </h3>
      {f?.tagline && <p style={styles.panelTagline}>{f.tagline}</p>}

      <div style={styles.panelSection}>
        <div style={styles.panelLabel}>The play</div>
        <p style={styles.panelText}>{f?.the_play ?? record.judgment ?? "—"}</p>
      </div>
      <div style={styles.panelSection}>
        <div style={styles.panelLabel}>Boundaries</div>
        {f?.boundaries && f.boundaries.length > 0 ? (
          <ul style={styles.panelList}>
            {f.boundaries.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        ) : (
          <p style={styles.panelText}>{record.boundaries ?? "—"}</p>
        )}
      </div>
      <div style={styles.panelSection}>
        <div style={styles.panelLabel}>Captured</div>
        <p style={styles.panelText}>
          {new Date(record.created_at).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { minHeight: "100vh", background: "#fafafa", fontFamily: "system-ui, sans-serif" },
  container: { maxWidth: 880, margin: "0 auto", padding: "32px 24px 80px" },
  backLink: { fontSize: "13px", color: "#666", textDecoration: "none" },
  title: { fontSize: "26px", margin: "14px 0 4px" },
  territory: { fontSize: "14px", color: "#78350f", margin: "0 0 16px" },
  rationaleBox: {
    background: "#fffbeb",
    border: "1px solid #fde68a",
    borderRadius: 12,
    padding: "14px 16px",
    marginBottom: 20,
  },
  rationaleLabel: {
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "#b45309",
    fontWeight: 700,
    marginBottom: 6,
  },
  rationaleText: { fontSize: "14px", color: "#78350f", margin: 0, lineHeight: 1.55 },
  sideBySide: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
    gap: 16,
    marginBottom: 24,
  },
  panel: {
    background: "#fff",
    border: "1px solid #e5e5e5",
    borderRadius: 12,
    padding: "18px",
  },
  panelHighlight: { border: "2px solid #166534" },
  panelMissing: { color: "#888", fontSize: "14px" },
  panelAuthor: {
    fontSize: "13px",
    fontWeight: 700,
    color: "#111",
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  personaTag: {
    background: "#f5f5f5",
    borderRadius: 999,
    padding: "1px 7px",
    fontSize: "11px",
    fontWeight: 400,
    color: "#666",
    textTransform: "capitalize",
  },
  panelTitle: { fontSize: "17px", margin: "0 0 4px" },
  panelTitleLink: { color: "inherit", textDecoration: "none" },
  panelTagline: { fontSize: "13px", color: "#555", margin: "0 0 12px", lineHeight: 1.4 },
  panelSection: { marginBottom: 12 },
  panelLabel: {
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "#888",
    marginBottom: 4,
  },
  panelText: { fontSize: "14px", margin: 0, lineHeight: 1.5 },
  panelList: { margin: 0, paddingLeft: 18, fontSize: "14px", lineHeight: 1.5 },
  resolvedBox: {
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    borderRadius: 12,
    padding: "16px 18px",
  },
  resolvedTitle: { fontSize: "15px", fontWeight: 700, color: "#166534", marginBottom: 8 },
  resolvedNote: { fontSize: "14px", color: "#14532d", margin: "0 0 8px", lineHeight: 1.55 },
  resolvedFootnote: { fontSize: "12px", color: "#4d7c5f", margin: 0 },
  resolveBox: {
    background: "#fff",
    border: "1px solid #e5e5e5",
    borderRadius: 12,
    padding: "18px",
  },
  resolveTitle: { fontSize: "17px", margin: "0 0 4px" },
  resolveSubtitle: { fontSize: "13px", color: "#666", margin: "0 0 14px", lineHeight: 1.5 },
  option: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    padding: "8px 0",
    cursor: "pointer",
    fontSize: "14px",
    lineHeight: 1.45,
  },
  radio: { marginTop: 3 },
  optionLabel: { fontWeight: 700 },
  optionDescription: { color: "#555" },
  supersedePick: {
    background: "#fafafa",
    border: "1px solid #eee",
    borderRadius: 8,
    padding: "10px 14px",
    margin: "6px 0 10px",
  },
  supersedeLabel: { fontSize: "13px", fontWeight: 600, marginBottom: 4 },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    fontFamily: "inherit",
    fontSize: "14px",
    lineHeight: 1.5,
    padding: "10px 12px",
    border: "1px solid #ddd",
    borderRadius: 8,
    marginTop: 10,
    resize: "vertical",
  },
  gateBox: {
    background: "#fffbeb",
    border: "1px solid #fde68a",
    borderRadius: 8,
    padding: "10px 14px",
    marginTop: 12,
  },
  gateMessage: { fontSize: "13px", color: "#78350f", margin: 0, lineHeight: 1.5 },
  gateNote: { fontSize: "13px", color: "#b45309", margin: "6px 0 0", fontStyle: "italic" },
  submitButton: {
    marginTop: 14,
    fontSize: "14px",
    fontWeight: 600,
    color: "#fff",
    background: "#b45309",
    border: "none",
    borderRadius: 8,
    padding: "10px 18px",
  },
  errorText: { color: "#ef4444" },
  center: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "system-ui, sans-serif",
  },
};
