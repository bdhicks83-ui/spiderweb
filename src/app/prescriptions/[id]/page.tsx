"use client";
// P-4A Build 4 — prescription detail: "why does it think that?"
// P-4B — the full lifecycle now lives here too:
//   manager gate (approve / snooze) → expert fidelity check ("yes, that's
//   how I think" / "not quite") → training in 3 audience altitudes with a
//   version history and regenerate-on-request → teach-back (fresh scenario,
//   scored answer) → the efficacy state the loop maintains (watching /
//   escalated / effective) with its own evidence chain.
// Nothing here is opaque; every claim traces to a source record an org
// member can open.
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

type EntityMapEntry = { type: string; name: string; detail: string | null };

type TrainingAltitude = { title: string; body: string };

type Training = {
  id: string;
  version: number;
  strategy: string;
  rung: number;
  format: string;
  title: string;
  altitudes: { floor: TrainingAltitude; supervisor: TrainingAltitude; exec: TrainingAltitude };
  regenerate_note: string | null;
  generated_at: string;
};

type Teachback = {
  id: string;
  training_id: string;
  learner_name: string;
  is_mine: boolean;
  scenario: string;
  question: string;
  answer: string | null;
  score: number | null;
  passed: boolean | null;
  feedback: string | null;
  missed: string[];
  created_at: string;
  completed_at: string | null;
};

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
      profile: { display_name: string | null; persona: string | null; role: string | null } | null;
      fidelity: { decision: string; note: string | null; decided_at: string } | null;
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
    approved_by_name: string | null;
    approved_by_role: string | null;
    approved_at: string | null;
    snoozed_by_name: string | null;
    snoozed_until: string | null;
    delivered_at: string | null;
    efficacy_status: string | null;
    efficacy_checked_at: string | null;
    efficacy_note: string | null;
    escalated_from_rung: number | null;
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
  trainings: Training[];
  teachbacks: Teachback[];
  viewer: { id: string; is_named_expert: boolean };
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
    is_efficacy_evidence: boolean;
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

const ALTITUDES: { key: "floor" | "supervisor" | "exec"; label: string }[] = [
  { key: "floor", label: "🔧 Floor / operator" },
  { key: "supervisor", label: "🧭 Supervisor / lead" },
  { key: "exec", label: "📊 Executive" },
];

const EFFICACY_STYLE: Record<string, { label: string; color: string; bg: string; border: string }> = {
  watching: { label: "👁 Watching", color: "#1e40af", bg: "#eff6ff", border: "#bfdbfe" },
  escalated: { label: "🔺 Escalated", color: "#b91c1c", bg: "#fef2f2", border: "#fecaca" },
  effective: { label: "✅ Effective — proven", color: "#166534", bg: "#f0fdf4", border: "#bbf7d0" },
};

export default function PrescriptionDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Detail | null>(null);

  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [altitude, setAltitude] = useState<"floor" | "supervisor" | "exec">("floor");
  const [versionIdx, setVersionIdx] = useState(0);
  const [fidelityNote, setFidelityNote] = useState("");
  const [showRejectNote, setShowRejectNote] = useState(false);
  const [regenNote, setRegenNote] = useState("");
  const [tbAnswer, setTbAnswer] = useState("");

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

  const call = async (label: string, path: string, body?: unknown) => {
    setBusy(label);
    setMessage(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const out = await res.json();
      setMessage(res.ok ? out.message ?? "Done." : out.error ?? "That didn't work.");
      if (res.ok) {
        setVersionIdx(0);
        await load();
      }
      return res.ok;
    } catch {
      setMessage("That didn't work — try again.");
      return false;
    } finally {
      setBusy(null);
    }
  };

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

  const { prescription: rx, detection, conflict, trainings, teachbacks, viewer, evidence } = data;
  const training = trainings[Math.min(versionIdx, Math.max(0, trainings.length - 1))] ?? null;
  const allConfirmed =
    rx.experts.length > 0 && rx.experts.every((e) => e.fidelity?.decision === "confirmed");
  const anyRejected = rx.experts.some((e) => e.fidelity?.decision === "rejected");
  const myFidelity = rx.experts.find((e) => e.user_id === viewer.id)?.fidelity ?? null;
  const openTeachback = teachbacks.find((t) => t.is_mine && !t.completed_at) ?? null;
  const efficacyStyle = rx.efficacy_status ? EFFICACY_STYLE[rx.efficacy_status] : null;
  const detectionEvidence = evidence.filter((r) => !r.is_efficacy_evidence);
  const efficacyEvidence = evidence.filter((r) => r.is_efficacy_evidence);

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <a href="/prescriptions" style={styles.backLink}>← Back to the queue</a>

        <div style={styles.chipRow}>
          <span style={styles.rungChip}>
            Rung {rx.rung} · {RUNG_LABEL[rx.rung]} ({RUNG_EFFORT[rx.rung]})
            {rx.escalated_from_rung ? ` · escalated from ${rx.escalated_from_rung}` : ""}
          </span>
          {detection && (
            <span style={styles.sourceChip}>
              Source: {SOURCE_LABEL[detection.source_type] ?? detection.source_type}
            </span>
          )}
          <span style={styles.roiChip}>ROI {rx.roi_score}</span>
          <span style={styles.statusChip}>{rx.status}</span>
          {efficacyStyle && (
            <span
              style={{
                ...styles.efficacyChip,
                color: efficacyStyle.color,
                background: efficacyStyle.bg,
                borderColor: efficacyStyle.border,
              }}
            >
              {efficacyStyle.label}
            </span>
          )}
        </div>

        <h1 style={styles.title}>{rx.gap_summary}</h1>

        {message && <p style={styles.message}>{message}</p>}

        {/* ═══ THE MANAGER GATE ═══ */}
        {(rx.status === "open" || rx.status === "snoozed") && (
          <div style={styles.gateBox}>
            <div style={styles.boxLabel}>Manager gate — nothing lands on a team without sign-off</div>
            {rx.status === "snoozed" && rx.snoozed_until && (
              <p style={styles.detailText}>
                😴 Snoozed{rx.snoozed_by_name ? ` by ${rx.snoozed_by_name}` : ""} — wakes{" "}
                {new Date(rx.snoozed_until).toLocaleDateString()}. Snooze defers, never deletes.
              </p>
            )}
            <div style={styles.buttonRow}>
              <button
                style={styles.approveButton}
                disabled={busy !== null}
                onClick={() => call("approve", `/api/prescriptions/${rx.id}/approve`)}
              >
                {busy === "approve" ? "Approving…" : "✓ Approve"}
              </button>
              <button
                style={styles.snoozeButton}
                disabled={busy !== null}
                onClick={() => call("snooze", `/api/prescriptions/${rx.id}/snooze`, { days: 7 })}
              >
                {busy === "snooze" ? "Snoozing…" : "😴 Snooze 7 days"}
              </button>
            </div>
          </div>
        )}
        {rx.approved_by_name && (
          <p style={styles.approvalLine}>
            ✓ Approved by {rx.approved_by_name}
            {rx.approved_by_role === "manager" ? " (manager)" : ""}
            {rx.approved_at ? ` on ${new Date(rx.approved_at).toLocaleDateString()}` : ""}
            {rx.delivered_at
              ? ` · training delivered ${new Date(rx.delivered_at).toLocaleDateString()}`
              : ""}
          </p>
        )}

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
              Nobody in the org has authored on this territory, so no facilitator is invented and
              no training can honestly be generated — and there is no fidelity check, because
              there is nothing authored yet to confirm. This is a codify target: capture the
              knowledge, then prescribe.
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
                      <span style={styles.personaTag}>{e.profile.persona.replace(/_/g, " ")}</span>
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

        {/* ═══ EXPERT FIDELITY CHECK ═══ */}
        {!rx.capture_first && rx.status !== "open" && rx.status !== "snoozed" && (
          <div style={styles.fidelityBox}>
            <div style={styles.boxLabel}>
              Expert fidelity check — nothing ships in an expert&apos;s name without their confirm
            </div>
            {rx.experts.map((e) => (
              <div key={e.user_id} style={styles.fidelityRow}>
                <span style={styles.fidelityName}>{e.profile?.display_name ?? "Org expert"}</span>
                {e.fidelity?.decision === "confirmed" && (
                  <span style={styles.fidelityConfirmed}>✓ &ldquo;Yes, that&apos;s how I think&rdquo;</span>
                )}
                {e.fidelity?.decision === "rejected" && (
                  <span style={styles.fidelityRejected}>
                    ✗ &ldquo;Not quite&rdquo;{e.fidelity.note ? ` — ${e.fidelity.note}` : ""}
                  </span>
                )}
                {!e.fidelity && <span style={styles.fidelityPending}>waiting on their 60-second confirm</span>}
              </div>
            ))}
            {viewer.is_named_expert && rx.status === "approved" && (
              <div style={styles.fidelityActions}>
                <p style={styles.detailText}>
                  {myFidelity
                    ? "You can change your call while the training hasn't shipped:"
                    : "This curriculum would be built from YOUR framework. 60 seconds: is that how you think?"}
                </p>
                <div style={styles.buttonRow}>
                  <button
                    style={styles.approveButton}
                    disabled={busy !== null}
                    onClick={() =>
                      call("fidelity", `/api/prescriptions/${rx.id}/fidelity`, {
                        decision: "confirmed",
                        note: fidelityNote.trim() || undefined,
                      })
                    }
                  >
                    {busy === "fidelity" ? "Saving…" : "✓ Yes, that's how I think"}
                  </button>
                  <button
                    style={styles.rejectButton}
                    disabled={busy !== null}
                    onClick={() => setShowRejectNote((v) => !v)}
                  >
                    ✗ Not quite…
                  </button>
                </div>
                {showRejectNote && (
                  <div style={styles.noteBlock}>
                    <textarea
                      style={styles.textarea}
                      placeholder="What's off? (required — your note goes back with the prescription)"
                      value={fidelityNote}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFidelityNote(e.target.value)}
                      rows={2}
                    />
                    <button
                      style={styles.rejectButton}
                      disabled={busy !== null || !fidelityNote.trim()}
                      onClick={() =>
                        call("fidelity", `/api/prescriptions/${rx.id}/fidelity`, {
                          decision: "rejected",
                          note: fidelityNote.trim(),
                        })
                      }
                    >
                      Send back with note
                    </button>
                  </div>
                )}
              </div>
            )}
            {anyRejected && (
              <p style={styles.rejectedCallout}>
                An authoring expert said &ldquo;not quite&rdquo; — nothing ships in their name. The note
                above goes back with the prescription; regenerating after the framework is
                revised (or re-confirming) reopens the path.
              </p>
            )}
          </div>
        )}

        {/* ═══ GENERATE TRAINING ═══ */}
        {!rx.capture_first && rx.status === "approved" && (
          <div style={styles.generateBox}>
            <div style={styles.boxLabel}>Training generation — 3 audience altitudes</div>
            <p style={styles.detailText}>
              Generates the {RUNG_LABEL[rx.rung].toLowerCase()} in three framings — floor/operator,
              supervisor/lead, and exec — grounded ONLY in the paired expert framework
              {rx.experts.length === 1 ? "" : "s"}. Requires every named expert&apos;s confirm above.
            </p>
            <button
              style={allConfirmed ? styles.generateButton : styles.generateButtonDisabled}
              disabled={busy !== null || !allConfirmed}
              onClick={() => call("training", `/api/prescriptions/${rx.id}/training`)}
            >
              {busy === "training"
                ? "Designing… (this takes ~30s)"
                : allConfirmed
                  ? `⚡ Generate ${RUNG_LABEL[rx.rung]}`
                  : "Waiting on fidelity confirm"}
            </button>
          </div>
        )}

        {/* ═══ THE TRAINING — versions + altitudes ═══ */}
        {training && (
          <div style={styles.trainingBox}>
            <div style={styles.trainingHeader}>
              <div>
                <div style={styles.boxLabel}>
                  {training.format} · strategy: &ldquo;{training.strategy}&rdquo;
                </div>
                <h2 style={styles.trainingTitle}>{training.title}</h2>
              </div>
              {trainings.length > 1 && (
                <div style={styles.versionTabs}>
                  {trainings.map((t, i) => (
                    <button
                      key={t.id}
                      style={i === versionIdx ? styles.versionTabActive : styles.versionTab}
                      onClick={() => setVersionIdx(i)}
                    >
                      v{t.version}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {training.regenerate_note && (
              <p style={styles.detailText}>Redesigned because: {training.regenerate_note}</p>
            )}
            <div style={styles.altitudeTabs}>
              {ALTITUDES.map((a) => (
                <button
                  key={a.key}
                  style={a.key === altitude ? styles.altitudeTabActive : styles.altitudeTab}
                  onClick={() => setAltitude(a.key)}
                >
                  {a.label}
                </button>
              ))}
            </div>
            <div style={styles.altitudeBody}>
              <h3 style={styles.altitudeTitle}>{training.altitudes[altitude].title}</h3>
              <div style={styles.altitudeText}>{training.altitudes[altitude].body}</div>
            </div>

            {/* Regenerate — a curriculum designer on tap, not a template */}
            {(rx.status === "delivered" || rx.status === "closed") && (
              <div style={styles.regenBlock}>
                <div style={styles.sideLabel}>Not the right vehicle? Send it back.</div>
                <textarea
                  style={styles.textarea}
                  placeholder="Optional: what should the redesign do differently? (different format, sequence, framing…)"
                  value={regenNote}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setRegenNote(e.target.value)}
                  rows={2}
                />
                <button
                  style={styles.regenButton}
                  disabled={busy !== null || rx.status === "closed"}
                  onClick={() =>
                    call("regenerate", `/api/prescriptions/${rx.id}/training`, {
                      regenerate: true,
                      note: regenNote.trim() || undefined,
                    })
                  }
                >
                  {busy === "regenerate"
                    ? "Redesigning… (~30s)"
                    : "🔄 Regenerate with a different strategy"}
                </button>
                {rx.status === "closed" && (
                  <p style={styles.detailText}>Closed as effective — no redesign needed.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══ TEACH-BACK ═══ */}
        {training && (rx.status === "delivered" || rx.status === "closed") && (
          <div style={styles.teachbackBox}>
            <div style={styles.boxLabel}>
              Teach-back — a fresh scenario, scored against the framework (retrieval practice)
            </div>
            {!openTeachback && (
              <button
                style={styles.teachbackButton}
                disabled={busy !== null}
                onClick={() =>
                  call("teachback-start", `/api/prescriptions/${rx.id}/teachback`, {
                    action: "start",
                  })
                }
              >
                {busy === "teachback-start" ? "Generating scenario…" : "🎯 Start a teach-back"}
              </button>
            )}
            {openTeachback && (
              <div style={styles.tbOpen}>
                <p style={styles.tbScenario}>{openTeachback.scenario}</p>
                <p style={styles.tbQuestion}>{openTeachback.question}</p>
                <textarea
                  style={styles.textarea}
                  placeholder="In your own words — what would you do, and why?"
                  value={tbAnswer}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTbAnswer(e.target.value)}
                  rows={4}
                />
                <button
                  style={styles.teachbackButton}
                  disabled={busy !== null || !tbAnswer.trim()}
                  onClick={async () => {
                    const ok = await call("teachback-submit", `/api/prescriptions/${rx.id}/teachback`, {
                      action: "submit",
                      teachback_id: openTeachback.id,
                      answer: tbAnswer.trim(),
                    });
                    if (ok) setTbAnswer("");
                  }}
                >
                  {busy === "teachback-submit" ? "Scoring…" : "Submit answer"}
                </button>
              </div>
            )}
            {teachbacks
              .filter((t) => t.completed_at)
              .map((t) => (
                <div key={t.id} style={styles.tbResult}>
                  <div style={styles.tbResultTop}>
                    <span style={t.passed ? styles.tbScorePass : styles.tbScoreFail}>
                      {t.score}/100 {t.passed ? "· passed" : "· below the pass line"}
                    </span>
                    <span style={styles.evidenceMeta}>
                      {t.learner_name} · {new Date(t.completed_at!).toLocaleDateString()}
                    </span>
                  </div>
                  <p style={styles.tbScenarioSmall}>{t.scenario}</p>
                  {t.answer && (
                    <p style={styles.tbAnswer}>
                      <strong>Answer:</strong> {t.answer}
                    </p>
                  )}
                  {t.feedback && (
                    <p style={styles.tbFeedback}>
                      <strong>Feedback:</strong> {t.feedback}
                    </p>
                  )}
                  {t.missed.length > 0 && (
                    <p style={styles.tbMissed}>
                      <strong>The framework also says:</strong> {t.missed.join(" · ")}
                    </p>
                  )}
                </div>
              ))}
          </div>
        )}

        {/* ═══ EFFICACY — the loop that never stops watching ═══ */}
        {rx.efficacy_status && efficacyStyle && (
          <div
            style={{
              ...styles.efficacyBox,
              background: efficacyStyle.bg,
              borderColor: efficacyStyle.border,
            }}
          >
            <div style={{ ...styles.boxLabel, color: efficacyStyle.color }}>
              Efficacy loop — {efficacyStyle.label}
              {rx.efficacy_checked_at
                ? ` (last check ${new Date(rx.efficacy_checked_at).toLocaleDateString()})`
                : ""}
            </div>
            {rx.efficacy_note && <p style={styles.boxText}>{rx.efficacy_note}</p>}
            {rx.efficacy_status === "escalated" && (
              <p style={styles.detailText}>
                The detector found the same signal in records dated after delivery — the
                intervention didn&apos;t transfer. The rung has been bumped; regenerate above to
                redesign at the bigger rung and restart the watch. (Evidence is marked in the
                chain below — records, never people.)
              </p>
            )}
            {rx.efficacy_status === "effective" && (
              <p style={styles.detailText}>
                Kirkpatrick Level 4, measured automatically: the org&apos;s live records went quiet
                on this subject after delivery. This is the proof artifact.
              </p>
            )}
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
          Evidence chain ({detectionEvidence.length} record
          {detectionEvidence.length === 1 ? "" : "s"})
        </h2>
        {detectionEvidence.map((r) => (
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

        {/* Post-delivery records that drove the escalation */}
        {efficacyEvidence.length > 0 && (
          <>
            <h2 style={styles.sectionTitle}>
              Post-delivery recurrence — what drove the escalation ({efficacyEvidence.length})
            </h2>
            {efficacyEvidence.map((r) => (
              <a
                key={r.id}
                href={`/library/${r.id}`}
                style={{ ...styles.evidenceCard, borderColor: "#fecaca", background: "#fffafa" }}
              >
                <div style={styles.evidenceTop}>
                  <span style={styles.evidenceName}>
                    {r.trigger_type ? `${TRIGGER_EMOJI[r.trigger_type] ?? ""} ` : ""}
                    {r.framework_name ?? "(framework pending)"}
                  </span>
                  <span style={styles.evidenceMeta}>
                    {r.author?.display_name ?? "Org member"} ·{" "}
                    {new Date(r.created_at).toLocaleDateString()} · after delivery
                  </span>
                </div>
                {r.trigger_signal && (
                  <p style={styles.evidenceSnippet}>
                    <strong>Signal:</strong> {r.trigger_signal}
                  </p>
                )}
              </a>
            ))}
          </>
        )}

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
  efficacyChip: {
    fontSize: "12px",
    fontWeight: 700,
    border: "1px solid",
    borderRadius: 999,
    padding: "4px 10px",
  },
  title: { fontSize: "22px", margin: "0 0 12px", lineHeight: 1.4 },
  message: {
    fontSize: "13px",
    color: "#166534",
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    borderRadius: 8,
    padding: "8px 12px",
    margin: "0 0 14px",
    lineHeight: 1.5,
  },
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
  buttonRow: { display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" as const },
  gateBox: {
    background: "#fff",
    border: "2px solid #7c3aed",
    borderRadius: 12,
    padding: "14px 16px",
    marginBottom: 14,
  },
  approvalLine: { fontSize: "13px", color: "#166534", margin: "0 0 14px" },
  approveButton: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#fff",
    background: "#16a34a",
    border: "none",
    borderRadius: 8,
    padding: "8px 14px",
    cursor: "pointer",
  },
  snoozeButton: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#57534e",
    background: "#f5f5f4",
    border: "1px solid #e7e5e4",
    borderRadius: 8,
    padding: "8px 14px",
    cursor: "pointer",
  },
  rejectButton: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#b91c1c",
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: 8,
    padding: "8px 14px",
    cursor: "pointer",
  },
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
  fidelityBox: {
    background: "#fff",
    border: "1px solid #e5e5e5",
    borderRadius: 12,
    padding: "14px 16px",
    marginBottom: 14,
  },
  fidelityRow: {
    display: "flex",
    alignItems: "baseline",
    gap: 10,
    flexWrap: "wrap" as const,
    marginBottom: 6,
  },
  fidelityName: { fontSize: "14px", fontWeight: 600 },
  fidelityConfirmed: { fontSize: "13px", color: "#166534", fontWeight: 600 },
  fidelityRejected: { fontSize: "13px", color: "#b91c1c", fontWeight: 600 },
  fidelityPending: { fontSize: "13px", color: "#a16207" },
  fidelityActions: { marginTop: 10, borderTop: "1px solid #f0f0f0", paddingTop: 10 },
  rejectedCallout: {
    fontSize: "13px",
    color: "#b91c1c",
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: 8,
    padding: "8px 12px",
    margin: "10px 0 0",
    lineHeight: 1.5,
  },
  noteBlock: { marginTop: 10, display: "flex", flexDirection: "column" as const, gap: 8 },
  textarea: {
    width: "100%",
    boxSizing: "border-box" as const,
    fontSize: "14px",
    fontFamily: "inherit",
    border: "1px solid #e5e5e5",
    borderRadius: 8,
    padding: "10px 12px",
    resize: "vertical" as const,
  },
  generateBox: {
    background: "#f5f3ff",
    border: "1px solid #ddd6fe",
    borderRadius: 12,
    padding: "14px 16px",
    marginBottom: 14,
  },
  generateButton: {
    fontSize: "14px",
    fontWeight: 700,
    color: "#fff",
    background: "#7c3aed",
    border: "none",
    borderRadius: 8,
    padding: "10px 16px",
    cursor: "pointer",
    marginTop: 10,
  },
  generateButtonDisabled: {
    fontSize: "14px",
    fontWeight: 700,
    color: "#a1a1aa",
    background: "#f4f4f5",
    border: "1px solid #e4e4e7",
    borderRadius: 8,
    padding: "10px 16px",
    cursor: "not-allowed",
    marginTop: 10,
  },
  trainingBox: {
    background: "#fff",
    border: "1px solid #ddd6fe",
    borderRadius: 12,
    padding: "16px 18px",
    marginBottom: 14,
  },
  trainingHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap" as const,
  },
  trainingTitle: { fontSize: "18px", margin: "0 0 8px", lineHeight: 1.35 },
  versionTabs: { display: "flex", gap: 6 },
  versionTab: {
    fontSize: "12px",
    fontWeight: 600,
    color: "#666",
    background: "#f5f5f5",
    border: "1px solid #e5e5e5",
    borderRadius: 999,
    padding: "4px 10px",
    cursor: "pointer",
  },
  versionTabActive: {
    fontSize: "12px",
    fontWeight: 700,
    color: "#fff",
    background: "#7c3aed",
    border: "1px solid #7c3aed",
    borderRadius: 999,
    padding: "4px 10px",
    cursor: "pointer",
  },
  altitudeTabs: { display: "flex", gap: 6, margin: "12px 0", flexWrap: "wrap" as const },
  altitudeTab: {
    fontSize: "13px",
    fontWeight: 600,
    color: "#666",
    background: "#fafafa",
    border: "1px solid #e5e5e5",
    borderRadius: 8,
    padding: "6px 12px",
    cursor: "pointer",
  },
  altitudeTabActive: {
    fontSize: "13px",
    fontWeight: 700,
    color: "#1e40af",
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    borderRadius: 8,
    padding: "6px 12px",
    cursor: "pointer",
  },
  altitudeBody: {
    background: "#fafafa",
    border: "1px solid #f0f0f0",
    borderRadius: 8,
    padding: "14px 16px",
  },
  altitudeTitle: { fontSize: "15px", margin: "0 0 10px" },
  altitudeText: {
    fontSize: "14px",
    lineHeight: 1.6,
    whiteSpace: "pre-wrap" as const,
  },
  regenBlock: {
    marginTop: 14,
    borderTop: "1px solid #f0f0f0",
    paddingTop: 12,
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
  },
  regenButton: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#7c3aed",
    background: "#f5f3ff",
    border: "1px solid #ddd6fe",
    borderRadius: 8,
    padding: "8px 14px",
    cursor: "pointer",
    alignSelf: "flex-start" as const,
  },
  teachbackBox: {
    background: "#fff",
    border: "1px solid #e5e5e5",
    borderRadius: 12,
    padding: "14px 16px",
    marginBottom: 14,
  },
  teachbackButton: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#fff",
    background: "#0891b2",
    border: "none",
    borderRadius: 8,
    padding: "8px 14px",
    cursor: "pointer",
    marginTop: 8,
    alignSelf: "flex-start" as const,
  },
  tbOpen: { display: "flex", flexDirection: "column" as const, gap: 8, marginTop: 8 },
  tbScenario: {
    fontSize: "14px",
    lineHeight: 1.6,
    background: "#ecfeff",
    border: "1px solid #a5f3fc",
    borderRadius: 8,
    padding: "12px 14px",
    margin: 0,
  },
  tbQuestion: { fontSize: "14px", fontWeight: 700, margin: 0 },
  tbResult: {
    borderTop: "1px solid #f0f0f0",
    marginTop: 12,
    paddingTop: 12,
  },
  tbResultTop: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap" as const,
    marginBottom: 6,
  },
  tbScorePass: { fontSize: "14px", fontWeight: 700, color: "#166534" },
  tbScoreFail: { fontSize: "14px", fontWeight: 700, color: "#b45309" },
  tbScenarioSmall: { fontSize: "13px", color: "#666", margin: "0 0 6px", lineHeight: 1.5 },
  tbAnswer: { fontSize: "13px", color: "#444", margin: "0 0 6px", lineHeight: 1.5 },
  tbFeedback: { fontSize: "13px", color: "#166534", margin: "0 0 6px", lineHeight: 1.5 },
  tbMissed: { fontSize: "13px", color: "#a16207", margin: 0, lineHeight: 1.5 },
  efficacyBox: {
    border: "1px solid",
    borderRadius: 12,
    padding: "14px 16px",
    marginBottom: 14,
  },
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
