"use client";
// P-7 Build 1 — the On-Demand Training Studio: the leader-initiated front
// door. A manager describes a live issue in plain language, names the
// audience, and the engine takes it from there.
//
// This is the "I need this now" path. The Prescription Queue is the other
// door — the same engine, triggered by detection instead of by a person.
//
// Client-safe imports only: @/lib/training-formats is constants (no fs, no
// @/lib/claude) — the logged gotcha about client pages pulling server-only
// libs.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BrandHeader from "@/components/BrandHeader";
import {
  AUDIENCE_EXPERIENCE_LABEL,
  TRAINING_FORMATS,
  formatName,
  type AudienceExperience,
} from "@/lib/training-formats";

const supabase = createClient();

type StudioRow = {
  id: string;
  issue_text: string;
  issue_restated: string | null;
  issue_type: string | null;
  audience_summary: string;
  recommended_format: string | null;
  chosen_format: string | null;
  format_overridden: boolean;
  status: string;
  attempt_count: number;
  created_at: string;
  deployed_at: string | null;
  requested_by_name: string;
  efficacy_status: string | null;
  efficacy_note: string | null;
};

const STATUS_CHIP: Record<string, { label: string; color: string; bg: string; border: string }> = {
  new: { label: "reading the issue", color: "var(--ink-soft)", bg: "var(--paper-2)", border: "var(--line)" },
  recommended: { label: "format recommended", color: "var(--accent-deep)", bg: "var(--accent-soft)", border: "var(--leaf-light)" },
  generated: { label: "draft ready for you", color: "var(--warn-text)", bg: "var(--warn-bg)", border: "var(--warn-border)" },
  deployed: { label: "out and watched", color: "var(--accent-deep)", bg: "var(--white)", border: "var(--accent)" },
  closed: { label: "proven", color: "var(--ok-text)", bg: "var(--ok-bg)", border: "var(--ok-border)" },
};

const EFFICACY_CHIP: Record<string, { label: string; color: string; bg: string; border: string }> = {
  watching: { label: "👁 watching", color: "var(--accent-deep)", bg: "var(--white)", border: "var(--accent)" },
  escalated: { label: "🔺 didn't land — new format suggested", color: "var(--danger)", bg: "var(--danger-bg)", border: "var(--danger-border)" },
  effective: { label: "✅ it held", color: "var(--ok-text)", bg: "var(--ok-bg)", border: "var(--ok-border)" },
};

const EXPERIENCE_OPTIONS: AudienceExperience[] = ["new", "experienced", "mixed"];

export default function TrainingStudioPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [canCreate, setCanCreate] = useState(false);
  const [rows, setRows] = useState<StudioRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [issueText, setIssueText] = useState("");
  const [role, setRole] = useState("");
  const [team, setTeam] = useState("");
  const [experience, setExperience] = useState<AudienceExperience | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/training-studio");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not load the studio.");
      } else {
        setError(null);
        setRows(data.requests || []);
        setCanCreate(data.can_create === true);
      }
    } catch {
      setError("Could not load the studio.");
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

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    setStep("Reading the issue…");
    try {
      const res = await fetch("/api/training-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issue_text: issueText,
          audience_role: role,
          audience_team: team,
          audience_experience: experience || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not open the request.");
        setStep(null);
        setSubmitting(false);
        return;
      }
      // Straight into the Format Agent — two reasoning-heavy calls are kept
      // in separate requests so neither one runs long enough to time out.
      setStep("Choosing the format…");
      await fetch(`/api/training-studio/${data.id}/recommend`, { method: "POST" });
      router.push(`/training-studio/${data.id}`);
    } catch {
      setError("Could not open the request.");
      setStep(null);
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

  const canSubmit =
    issueText.trim().length >= 20 && (role.trim() || team.trim()) && !submitting;

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <div style={{ marginBottom: 18 }}>
          <BrandHeader />
        </div>

        <div style={styles.headerRow}>
          <h1 style={styles.title}>✨ Training Studio</h1>
          <a href="/prescriptions" style={styles.backLink}>
            💊 Prescription Queue →
          </a>
        </div>
        <p style={styles.subtitle}>
          Something is going wrong right now and the team needs to be brought up to speed.
          Describe it the way you&apos;d say it out loud, name who it&apos;s for, and the
          system recommends the shape the training should take — and tells you why.
        </p>

        {error && <p style={styles.errorText}>{error}</p>}

        {canCreate ? (
          <div style={styles.formCard}>
            <h2 style={styles.formTitle}>Create training</h2>

            <label style={styles.label} htmlFor="issue">
              What&apos;s going wrong?
            </label>
            <textarea
              id="issue"
              style={styles.textarea}
              value={issueText}
              onChange={(e) => setIssueText(e.target.value)}
              placeholder="Second shift keeps missing the first-piece check after a die changeover — three scrapped runs this month, and the day shift never has the problem."
              rows={4}
            />
            <p style={styles.hint}>
              Concrete beats polished. What broke, where, and how often.
            </p>

            <div style={styles.fieldRow}>
              <div style={styles.field}>
                <label style={styles.label} htmlFor="role">
                  Role
                </label>
                <input
                  id="role"
                  style={styles.input}
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="Press operators"
                />
              </div>
              <div style={styles.field}>
                <label style={styles.label} htmlFor="team">
                  Team
                </label>
                <input
                  id="team"
                  style={styles.input}
                  value={team}
                  onChange={(e) => setTeam(e.target.value)}
                  placeholder="Second shift"
                />
              </div>
            </div>

            <label style={styles.label}>Experience level</label>
            <div style={styles.chipRow}>
              {EXPERIENCE_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setExperience(experience === opt ? "" : opt)}
                  style={{
                    ...styles.choiceChip,
                    ...(experience === opt ? styles.choiceChipOn : {}),
                  }}
                >
                  {AUDIENCE_EXPERIENCE_LABEL[opt]}
                </button>
              ))}
            </div>

            <button
              type="button"
              style={{ ...styles.primaryButton, opacity: canSubmit ? 1 : 0.55 }}
              disabled={!canSubmit}
              onClick={submit}
            >
              {submitting ? (step ?? "Working…") : "Recommend a format"}
            </button>
            {submitting && step && <p style={styles.stepLine}>{step}</p>}
          </div>
        ) : (
          <div style={styles.gateCard}>
            <p style={styles.gateText}>
              Creating training is a manager action — a leader creates training for their own
              reports and teams. Anything already created for your org is below.
            </p>
          </div>
        )}

        <h2 style={styles.sectionTitle}>Requests ({rows.length})</h2>
        {rows.length === 0 && (
          <p style={styles.empty}>Nothing here yet. The first one starts above.</p>
        )}
        {rows.map((r) => {
          const chip = STATUS_CHIP[r.status];
          const eff = r.efficacy_status ? EFFICACY_CHIP[r.efficacy_status] : null;
          return (
            <a key={r.id} href={`/training-studio/${r.id}`} style={styles.card}>
              <div style={styles.cardTop}>
                {chip && (
                  <span
                    style={{
                      ...styles.chip,
                      color: chip.color,
                      background: chip.bg,
                      borderColor: chip.border,
                    }}
                  >
                    {chip.label}
                  </span>
                )}
                {eff && (
                  <span
                    style={{
                      ...styles.chip,
                      color: eff.color,
                      background: eff.bg,
                      borderColor: eff.border,
                    }}
                  >
                    {eff.label}
                  </span>
                )}
                {r.chosen_format && (
                  <span style={styles.formatChip}>{formatName(r.chosen_format)}</span>
                )}
                {r.format_overridden && (
                  <span style={styles.overrideChip}>your call, not the recommendation</span>
                )}
                {r.attempt_count > 1 && (
                  <span style={styles.attemptChip}>attempt {r.attempt_count}</span>
                )}
              </div>
              <p style={styles.cardIssue}>{r.issue_restated || r.issue_text}</p>
              <p style={styles.cardMeta}>
                For {r.audience_summary} · raised by {r.requested_by_name} ·{" "}
                {new Date(r.created_at).toLocaleDateString()}
              </p>
              {r.efficacy_note && <p style={styles.cardNote}>{r.efficacy_note}</p>}
            </a>
          );
        })}

        <h2 style={styles.sectionTitle}>The formats it chooses from</h2>
        <div style={styles.formatGrid}>
          {Object.values(TRAINING_FORMATS).map((f) => (
            <div key={f.key} style={styles.formatCard}>
              <span style={styles.formatCardName}>{f.name}</span>
              <span style={styles.formatCardEffort}>{f.effort}</span>
              <p style={styles.formatCardLine}>{f.oneLiner}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { minHeight: "100vh", fontFamily: "var(--font-sans)" },
  container: { maxWidth: 820, margin: "0 auto", padding: "40px 24px 80px" },
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
    flexWrap: "wrap" as const,
  },
  title: { fontSize: "26px", margin: 0 },
  backLink: { fontSize: "13px", color: "var(--muted)", textDecoration: "none", fontWeight: 600 },
  subtitle: { color: "var(--muted)", fontSize: "14px", margin: "8px 0 20px", lineHeight: 1.6 },
  errorText: { color: "var(--danger)", fontSize: "14px" },
  formCard: {
    background: "var(--white)",
    border: "1px solid var(--line)",
    borderRadius: 14,
    padding: "22px 24px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
  },
  formTitle: { fontSize: "18px", margin: "0 0 6px" },
  label: {
    fontSize: "12px",
    fontWeight: 700,
    letterSpacing: "0.03em",
    textTransform: "uppercase" as const,
    color: "var(--muted)",
    marginTop: 6,
  },
  textarea: {
    width: "100%",
    boxSizing: "border-box" as const,
    padding: "12px 14px",
    fontSize: "15px",
    fontFamily: "var(--font-sans)",
    color: "var(--ink)",
    background: "var(--paper)",
    border: "1px solid var(--line)",
    borderRadius: 10,
    lineHeight: 1.5,
    resize: "vertical" as const,
  },
  hint: { fontSize: "12px", color: "var(--muted)", margin: "2px 0 6px" },
  fieldRow: { display: "flex", gap: 12, flexWrap: "wrap" as const },
  field: { flex: "1 1 220px", display: "flex", flexDirection: "column" as const, gap: 4 },
  input: {
    width: "100%",
    boxSizing: "border-box" as const,
    padding: "10px 12px",
    fontSize: "14px",
    fontFamily: "var(--font-sans)",
    color: "var(--ink)",
    background: "var(--paper)",
    border: "1px solid var(--line)",
    borderRadius: 10,
  },
  chipRow: { display: "flex", gap: 8, flexWrap: "wrap" as const, marginBottom: 6 },
  choiceChip: {
    fontSize: "13px",
    fontWeight: 600,
    color: "var(--ink-soft)",
    background: "var(--paper-2)",
    border: "1px solid var(--line)",
    borderRadius: 999,
    padding: "7px 14px",
    cursor: "pointer",
  },
  choiceChipOn: {
    color: "var(--accent-deep)",
    background: "var(--accent-soft)",
    borderColor: "var(--accent)",
  },
  primaryButton: {
    marginTop: 10,
    alignSelf: "flex-start" as const,
    fontSize: "14px",
    fontWeight: 600,
    color: "var(--white)",
    background: "var(--accent)",
    border: "none",
    borderRadius: 8,
    padding: "10px 18px",
    cursor: "pointer",
  },
  stepLine: { fontSize: "13px", color: "var(--muted)", margin: "6px 0 0" },
  gateCard: {
    background: "var(--paper-2)",
    border: "1px solid var(--line)",
    borderRadius: 14,
    padding: "18px 20px",
  },
  gateText: { fontSize: "14px", color: "var(--ink-soft)", margin: 0, lineHeight: 1.6 },
  sectionTitle: {
    fontSize: "13px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    color: "var(--muted)",
    margin: "32px 0 10px",
  },
  empty: { color: "var(--muted)", fontSize: "14px" },
  card: {
    display: "block",
    background: "var(--white)",
    border: "1px solid var(--line)",
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
  chip: {
    fontSize: "11px",
    fontWeight: 700,
    border: "1px solid",
    borderRadius: 999,
    padding: "3px 9px",
  },
  formatChip: {
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--accent-deep)",
    background: "var(--accent-soft)",
    border: "1px solid var(--leaf-light)",
    borderRadius: 999,
    padding: "3px 9px",
  },
  overrideChip: {
    fontSize: "11px",
    color: "var(--ink-soft)",
    background: "var(--paper-2)",
    border: "1px solid var(--line)",
    borderRadius: 999,
    padding: "3px 9px",
  },
  attemptChip: {
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--warn-text)",
    background: "var(--warn-chip-bg)",
    border: "1px solid var(--warn-border)",
    borderRadius: 999,
    padding: "3px 9px",
  },
  cardIssue: { fontSize: "15px", fontWeight: 600, margin: "0 0 6px", lineHeight: 1.45 },
  cardMeta: { fontSize: "12px", color: "var(--muted)", margin: 0 },
  cardNote: { fontSize: "12px", color: "var(--muted)", margin: "6px 0 0", lineHeight: 1.5 },
  formatGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))",
    gap: 10,
  },
  formatCard: {
    background: "var(--paper-2)",
    border: "1px solid var(--line)",
    borderRadius: 12,
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 2,
  },
  formatCardName: { fontSize: "14px", fontWeight: 700, color: "var(--ink)" },
  formatCardEffort: { fontSize: "11px", color: "var(--muted)" },
  formatCardLine: { fontSize: "12px", color: "var(--ink-soft)", margin: "4px 0 0", lineHeight: 1.5 },
};
