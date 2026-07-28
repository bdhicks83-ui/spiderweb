"use client";
// P-7 Builds 2-4 — the Training Studio detail surface.
//
// One page, one storyline: here's what you asked · here's the format we'd
// use and WHY (cited) · here's another one if you disagree · here's the
// draft in three altitudes · you approve it, then it goes out · here's
// whether it actually worked, and if it didn't, here's a different shape to
// try.
//
// Doctrine on screen: the agent recommends and the leader decides
// (flag-never-block) · every recommendation shows its reasoning
// (explainable) · nothing deploys without a human approving it · a training
// that misses is a transfer gap, never a person failing (blameless) ·
// scoring and rungs stay under the hood (invisible complexity).
//
// Client-safe imports only — @/lib/training-formats is constants.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BrandHeader from "@/components/BrandHeader";
import { TRAINING_FORMATS, formatName, isTrainingFormatKey } from "@/lib/training-formats";

const supabase = createClient();

type Ranked = {
  format_key: string;
  format_name: string;
  effort: string;
  rank: number;
  is_primary: boolean;
  rationale: string;
  citations: string[];
};

// P-7 Build 5 — the org's format track record, exactly as the API stores it
// on recommendations.track_record (src/lib/format-prior.ts). N always shown.
type TrackRecordEntry = {
  format_key: string;
  attempts: number;
  effective: number;
  did_not_land: number;
  pending: number;
  enhanced_effective: number;
  overridden_away: number;
};

type TrackRecord = {
  scope: "issue_type" | "org_wide";
  issue_type: string | null;
  resolved_total: number;
  maturity: "early" | "established";
  by_format: TrackRecordEntry[];
} | null;

type Recommendations = {
  headline?: string;
  tradeoff?: string | null;
  grounding_caution?: string | null;
  grounding_summary?: string | null;
  capture_first?: boolean;
  why_the_last_one_did_not_land?: string | null;
  not_a_training_problem?: string | null;
  ranked?: Ranked[];
  track_record?: TrackRecord;
} | null;

// ═════════════════════════════════════════════════════════════════════════════
// ⚠️ DRAFT CUSTOMER-FACING COPY — PENDING BRIAN (P-7 Build 5)
// The "what's worked here" line under a format card. Honesty rules baked in:
// the count (N) always shows, an early record says it's too thin to lean on,
// a leader-enhanced outcome is credited out loud, and cross-issue evidence
// says it's cross-issue. Track B register — plain, no plant metaphors.
// ═════════════════════════════════════════════════════════════════════════════
function trackRecordLine(tr: TrackRecord, formatKey: string): string | null {
  if (!tr) return null;
  const r = tr.by_format.find((e) => e.format_key === formatKey);
  if (!r) return null;
  const resolved = r.effective + r.did_not_land;
  if (resolved === 0 && r.pending === 0) return null;
  const scope = tr.scope === "issue_type" ? "on this kind of issue" : "across all issues here";
  const parts: string[] = [];
  if (resolved > 0) {
    parts.push(`landed ${r.effective} of ${resolved} ${scope}`);
    if (r.enhanced_effective > 0) {
      parts.push(
        `${r.enhanced_effective} of those ${r.enhanced_effective === 1 ? "was" : "were"} leader-improved`
      );
    }
  }
  if (r.pending > 0) parts.push(`${r.pending} still under watch`);
  if (r.overridden_away > 0) {
    parts.push(`leaders picked differently ${r.overridden_away}× when it was recommended`);
  }
  const thin = tr.maturity === "early" && resolved > 0 ? " — early evidence, too few to lean on" : "";
  return `What's worked here: ${parts.join(" · ")} (N=${resolved})${thin}.`;
}

type Altitude = { title: string; body: string };

type Training = {
  id: string;
  version: number;
  strategy: string;
  format: string;
  format_key: string | null;
  title: string;
  altitudes: { floor?: Altitude; supervisor?: Altitude; exec?: Altitude } | null;
  generated_at: string;
};

type Attempt = {
  attempt: number;
  chosen_format: string;
  recommended_format: string | null;
  was_override: boolean;
  override_reason: string | null;
  outcome: string;
  outcome_note: string | null;
  next_format_recommended: string | null;
  next_format_rationale: string | null;
  enhancements: { note: string; added_by_name?: string; added_at?: string }[] | null;
  created_at: string;
  // P-7 Build 6 — set when this attempt's winning artifact codified into the
  // knowledge graph (a retrievable library record).
  graph_node_id?: string | null;
  graph_synced_at?: string | null;
};

type Detail = {
  can_act: boolean;
  request: {
    id: string;
    issue_text: string;
    issue_restated: string | null;
    issue_type: string | null;
    understanding_note: string | null;
    subject_entities: { type: string; name: string; detail: string | null }[];
    audience_summary: string;
    recommendations: Recommendations;
    recommended_format: string | null;
    chosen_format: string | null;
    format_overridden: boolean;
    override_reason: string | null;
    status: string;
    attempt_count: number;
    created_at: string;
    deployed_at: string | null;
    requested_by_name: string;
    approved_by_name: string | null;
    approved_at: string | null;
  };
  prescription: {
    efficacy_status: string | null;
    efficacy_note: string | null;
    delivered_at: string | null;
    capture_first: boolean;
  } | null;
  trainings: Training[];
  attempts: Attempt[];
};

const ISSUE_TYPE_LABEL: Record<string, string> = {
  definition_mismatch: "Two groups mean different things",
  procedural_skill: "The doing is inconsistent",
  judgment_gap: "The call is going wrong, not the step",
  cross_functional_seam: "It breaks at the handoff",
  recurring_error: "A known fix isn't reaching people",
  rare_high_stakes: "Rare, and expensive when it's wrong",
  onboarding_gap: "No path to the standard for new people",
};

const ALTITUDES: { key: "floor" | "supervisor" | "exec"; label: string }[] = [
  { key: "floor", label: "On the floor" },
  { key: "supervisor", label: "Supervisor" },
  { key: "exec", label: "Executive" },
];

export default function TrainingStudioDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const [id, setId] = useState<string | null>(null);
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [altitude, setAltitude] = useState<"floor" | "supervisor" | "exec">("floor");
  const [enhancement, setEnhancement] = useState("");
  const [genStep, setGenStep] = useState<string | null>(null);

  useEffect(() => {
    params.then((p) => setId(p.id));
  }, [params]);

  const load = useCallback(async (rid: string) => {
    try {
      const res = await fetch(`/api/training-studio/${rid}`);
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Could not load this request.");
      } else {
        setError(null);
        setData(body as Detail);
        setPicked((prev) => prev ?? body?.request?.recommended_format ?? null);
      }
    } catch {
      setError("Could not load this request.");
    } finally {
      setLoading(false);
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
      await load(id);
    })();
  }, [id, router, load]);

  const post = async (path: string, label: string, body?: unknown) => {
    if (!id || busy) return;
    setBusy(label);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/training-studio/${id}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "That didn't go through.");
      } else {
        setMessage(json.message ?? null);
        await load(id);
      }
    } catch {
      setError("That didn't go through.");
    } finally {
      setBusy(null);
    }
  };

  // Generation runs as THREE requests, not one. Vercel kills an invocation at
  // 60s and writing all three audience altitudes in a single model call ran
  // right into that wall — the connection died and read to the leader as a
  // network failure. The floor version carries the substance; the other two
  // re-frame it. Sequential, visible, and each one comfortably inside the cap.
  const generateAll = async () => {
    if (!id || busy) return;
    setBusy("generate");
    setMessage(null);
    setError(null);
    const steps: { altitude: string; label: string }[] = [
      { altitude: "floor", label: "Writing the floor version…" },
      { altitude: "supervisor", label: "Framing it for supervisors…" },
      { altitude: "exec", label: "Framing it for the exec…" },
    ];
    try {
      for (const step of steps) {
        setGenStep(step.label);
        const res = await fetch(`/api/training-studio/${id}/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ altitude: step.altitude }),
        });
        const json = await res.json();
        if (!res.ok) {
          // Whatever was written already is kept — the leader retries from
          // where it stopped rather than starting over.
          setError(json.error || "That didn't go through.");
          break;
        }
        setMessage(json.message ?? null);
      }
    } catch {
      setError("That didn't go through.");
    } finally {
      setGenStep(null);
      setBusy(null);
      await load(id);
    }
  };

  if (loading) {
    return (
      <div style={styles.center}>
        <p>Loading…</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div style={styles.center}>
        <p>{error ?? "Not found."}</p>
      </div>
    );
  }

  const r = data.request;
  const rec = r.recommendations;
  const ranked = (rec?.ranked ?? []).slice().sort((a, b) => a.rank - b.rank);
  const primary = ranked.find((x) => x.is_primary) ?? ranked[0] ?? null;
  const alternatives = ranked.filter((x) => x !== primary);
  const training = data.trainings[0] ?? null;
  const currentAltitude = training?.altitudes?.[altitude] ?? null;
  const efficacy = data.prescription?.efficacy_status ?? null;
  const isOverride = !!(picked && r.recommended_format && picked !== r.recommended_format);
  const currentAttempt = data.attempts.find((a) => a.attempt === r.attempt_count) ?? null;

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <div style={{ marginBottom: 18 }}>
          <BrandHeader />
        </div>
        <a href="/training-studio" style={styles.backLink}>
          ← Training Studio
        </a>

        {/* ── The ask ───────────────────────────────────────────────── */}
        <h1 style={styles.title}>{r.issue_restated || r.issue_text}</h1>
        <div style={styles.metaRow}>
          <span style={styles.metaChip}>For {r.audience_summary}</span>
          {r.issue_type && (
            <span style={styles.metaChip}>
              {ISSUE_TYPE_LABEL[r.issue_type] ?? r.issue_type}
            </span>
          )}
          {r.attempt_count > 1 && (
            <span style={styles.attemptChip}>attempt {r.attempt_count}</span>
          )}
        </div>
        <div style={styles.quoteCard}>
          <span style={styles.quoteLabel}>
            {r.requested_by_name} raised it as:
          </span>
          <p style={styles.quoteText}>&ldquo;{r.issue_text}&rdquo;</p>
          {r.understanding_note && (
            <p style={styles.quoteNote}>Read as: {r.understanding_note}</p>
          )}
          {r.subject_entities?.length > 0 && (
            <p style={styles.quoteNote}>
              Watching for:{" "}
              {r.subject_entities.map((e) => e.name).join(" · ")}
            </p>
          )}
        </div>

        {message && <p style={styles.successText}>{message}</p>}
        {error && <p style={styles.errorText}>{error}</p>}

        {/* ── Build 2: the recommendation ───────────────────────────── */}
        {rec?.why_the_last_one_did_not_land && (
          <div style={styles.readaptCard}>
            <span style={styles.readaptLabel}>It didn&apos;t land</span>
            <p style={styles.readaptText}>{rec.why_the_last_one_did_not_land}</p>
            {rec.not_a_training_problem && (
              <p style={styles.cautionText}>
                Worth naming: {rec.not_a_training_problem}
              </p>
            )}
          </div>
        )}

        {primary && !r.chosen_format && (
          <>
            <h2 style={styles.sectionTitle}>The format we&apos;d use</h2>
            {rec?.headline && <p style={styles.headline}>{rec.headline}</p>}

            <button
              type="button"
              onClick={() => setPicked(primary.format_key)}
              style={{
                ...styles.formatOption,
                ...(picked === primary.format_key ? styles.formatOptionOn : {}),
              }}
            >
              <div style={styles.formatOptionTop}>
                <span style={styles.formatOptionName}>{primary.format_name}</span>
                <span style={styles.formatOptionEffort}>{primary.effort}</span>
                <span style={styles.recommendedChip}>recommended</span>
              </div>
              <p style={styles.formatOptionWhy}>{primary.rationale}</p>
              {primary.citations.length > 0 && (
                <p style={styles.citations}>
                  Grounded in: {primary.citations.join(" · ")}
                </p>
              )}
              {/* P-7 Build 5 — the org's own evidence, N always shown */}
              {trackRecordLine(rec?.track_record ?? null, primary.format_key) && (
                <p style={styles.trackRecordLine}>
                  {trackRecordLine(rec?.track_record ?? null, primary.format_key)}
                </p>
              )}
            </button>

            {rec?.tradeoff && (
              <p style={styles.tradeoff}>What it gives up: {rec.tradeoff}</p>
            )}
            {rec?.grounding_summary && (
              <p style={styles.groundingLine}>{rec.grounding_summary}</p>
            )}
            {rec?.grounding_caution && (
              <p style={styles.cautionText}>{rec.grounding_caution}</p>
            )}

            {alternatives.length > 0 && (
              <>
                <h2 style={styles.sectionTitle}>Or choose a different shape</h2>
                {alternatives.map((alt) => (
                  <button
                    key={alt.format_key}
                    type="button"
                    onClick={() => setPicked(alt.format_key)}
                    style={{
                      ...styles.formatOptionSmall,
                      ...(picked === alt.format_key ? styles.formatOptionOn : {}),
                    }}
                  >
                    <div style={styles.formatOptionTop}>
                      <span style={styles.formatOptionNameSmall}>{alt.format_name}</span>
                      <span style={styles.formatOptionEffort}>{alt.effort}</span>
                    </div>
                    <p style={styles.formatOptionWhySmall}>{alt.rationale}</p>
                    {alt.citations.length > 0 && (
                      <p style={styles.citations}>Grounded in: {alt.citations.join(" · ")}</p>
                    )}
                    {/* P-7 Build 5 — the org's own evidence, N always shown */}
                    {trackRecordLine(rec?.track_record ?? null, alt.format_key) && (
                      <p style={styles.trackRecordLine}>
                        {trackRecordLine(rec?.track_record ?? null, alt.format_key)}
                      </p>
                    )}
                  </button>
                ))}
              </>
            )}

            {data.can_act && (
              <div style={styles.chooseBar}>
                {isOverride && (
                  <input
                    style={styles.input}
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="Why this one instead? (optional — it helps the system learn)"
                  />
                )}
                <button
                  type="button"
                  style={styles.primaryButton}
                  disabled={!picked || busy !== null}
                  onClick={() =>
                    post("/format", "format", {
                      format_key: picked,
                      override_reason: overrideReason || null,
                    })
                  }
                >
                  {busy === "format"
                    ? "Setting the format…"
                    : picked
                      ? `Use the ${formatName(picked).toLowerCase()}`
                      : "Pick a format"}
                </button>
                <button
                  type="button"
                  style={styles.ghostButton}
                  disabled={busy !== null}
                  onClick={() => post("/recommend", "recommend")}
                >
                  {busy === "recommend" ? "Rethinking…" : "Recommend again"}
                </button>
              </div>
            )}
          </>
        )}

        {!primary && data.can_act && (
          <div style={styles.chooseBar}>
            <button
              type="button"
              style={styles.primaryButton}
              disabled={busy !== null}
              onClick={() => post("/recommend", "recommend")}
            >
              {busy === "recommend" ? "Choosing the format…" : "Recommend a format"}
            </button>
          </div>
        )}

        {/* ── Build 3: chosen + generate ────────────────────────────── */}
        {r.chosen_format && (
          <>
            <h2 style={styles.sectionTitle}>The format</h2>
            <div style={styles.chosenCard}>
              <div style={styles.formatOptionTop}>
                <span style={styles.formatOptionName}>{formatName(r.chosen_format)}</span>
                {isTrainingFormatKey(r.chosen_format) && (
                  <span style={styles.formatOptionEffort}>
                    {TRAINING_FORMATS[r.chosen_format].effort}
                  </span>
                )}
                {r.format_overridden ? (
                  <span style={styles.overrideChip}>your call</span>
                ) : (
                  <span style={styles.recommendedChip}>as recommended</span>
                )}
              </div>
              {isTrainingFormatKey(r.chosen_format) && (
                <p style={styles.formatOptionWhy}>
                  {TRAINING_FORMATS[r.chosen_format].oneLiner}
                </p>
              )}
              {r.format_overridden && r.override_reason && (
                <p style={styles.quoteNote}>Your reason: {r.override_reason}</p>
              )}
            </div>

            {!training && data.can_act && (
              <button
                type="button"
                style={styles.primaryButton}
                disabled={busy !== null}
                onClick={generateAll}
              >
                {busy === "generate" ? (genStep ?? "Writing it…") : "Build the training"}
              </button>
            )}
          </>
        )}

        {/* ── The artifact ──────────────────────────────────────────── */}
        {training && (
          <>
            <h2 style={styles.sectionTitle}>
              The training — v{training.version} · {training.format}
            </h2>
            <p style={styles.strategyLine}>
              {training.title} — approach: {training.strategy}
            </p>
            <div style={styles.tabRow}>
              {ALTITUDES.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => setAltitude(a.key)}
                  style={{
                    ...styles.tab,
                    ...(altitude === a.key ? styles.tabOn : {}),
                  }}
                >
                  {a.label}
                </button>
              ))}
            </div>
            <div style={styles.artifactCard}>
              {currentAltitude ? (
                <>
                  <h3 style={styles.artifactTitle}>{currentAltitude.title}</h3>
                  <pre style={styles.artifactBody}>{currentAltitude.body}</pre>
                </>
              ) : (
                <p style={styles.empty}>Not written yet — this altitude comes after the floor version.</p>
              )}
            </div>

            {genStep && <p style={styles.strategyLine}>{genStep}</p>}

            {r.status === "generated" && data.can_act && (
              <div style={styles.approveBar}>
                <p style={styles.approveText}>
                  Nothing has gone out yet. Read it, then approve it — that&apos;s the
                  gate.
                </p>
                <div style={styles.chooseBar}>
                  <button
                    type="button"
                    style={styles.primaryButton}
                    disabled={busy !== null}
                    onClick={() => post("/approve", "approve")}
                  >
                    {busy === "approve" ? "Approving…" : "✓ Approve and send it out"}
                  </button>
                  <button
                    type="button"
                    style={styles.ghostButton}
                    disabled={busy !== null}
                    onClick={generateAll}
                  >
                    {busy === "generate" ? (genStep ?? "Rewriting…") : "Write it again"}
                  </button>
                </div>
              </div>
            )}

            {data.trainings.length > 1 && (
              <p style={styles.versionLine}>
                {data.trainings.length} versions kept —{" "}
                {data.trainings
                  .map((t) => `v${t.version} ${t.format_key ? formatName(t.format_key) : t.format}`)
                  .join(" · ")}
                . Nothing is overwritten.
              </p>
            )}
          </>
        )}

        {/* ── Build 4: did it land? ─────────────────────────────────── */}
        {r.status === "deployed" && (
          <>
            <h2 style={styles.sectionTitle}>Did it land?</h2>
            <div style={styles.watchCard}>
              <p style={styles.watchText}>
                {data.prescription?.efficacy_note ??
                  "Out and being watched. If the same problem shows up again, that's the answer."}
              </p>
              {r.approved_by_name && (
                <p style={styles.quoteNote}>
                  Approved by {r.approved_by_name}
                  {r.approved_at ? ` · ${new Date(r.approved_at).toLocaleDateString()}` : ""}
                </p>
              )}
              {efficacy === "escalated" && (
                <p style={styles.blamelessNote}>
                  A miss here is the format not reaching people — not the people. The
                  next attempt changes the shape, not the volume.
                </p>
              )}
              {data.can_act && (
                <button
                  type="button"
                  style={styles.secondaryButton}
                  disabled={busy !== null}
                  onClick={() => post("/efficacy", "efficacy")}
                >
                  {busy === "efficacy" ? "Checking…" : "Check whether it landed"}
                </button>
              )}
            </div>

            {/* Manual enhancements — effectiveness modifiers */}
            {data.can_act && (
              <div style={styles.enhanceCard}>
                <span style={styles.enhanceLabel}>Changed something yourself?</span>
                <p style={styles.enhanceHint}>
                  Anything you added to make it work better — so when the result comes
                  in, your change is part of the record.
                </p>
                <div style={styles.chooseBar}>
                  <input
                    style={styles.input}
                    value={enhancement}
                    onChange={(e) => setEnhancement(e.target.value)}
                    placeholder="Added a real defective part to the drill"
                  />
                  <button
                    type="button"
                    style={styles.secondaryButton}
                    disabled={busy !== null || enhancement.trim().length < 3}
                    onClick={async () => {
                      await post("/enhance", "enhance", { note: enhancement });
                      setEnhancement("");
                    }}
                  >
                    {busy === "enhance" ? "Logging…" : "Log it"}
                  </button>
                </div>
                {(currentAttempt?.enhancements || []).map((e, i) => (
                  <p key={i} style={styles.enhanceItem}>
                    — {e.note}
                    {e.added_by_name ? ` (${e.added_by_name})` : ""}
                  </p>
                ))}
              </div>
            )}
          </>
        )}

        {r.status === "closed" && (
          <div style={styles.provenCard}>
            <span style={styles.provenLabel}>✅ It held</span>
            <p style={styles.watchText}>
              {data.prescription?.efficacy_note ??
                "No repeat of the problem across the watch window."}
            </p>
            {/* P-7 Build 6 — the loop, closed and visible: what worked is now
                a first-class library record retrieval can surface. */}
            {data.attempts.some((a) => a.graph_node_id) && (
              <p style={styles.watchText}>
                What worked is codified into your team&apos;s library —{" "}
                <a
                  href={`/library/${data.attempts.find((a) => a.graph_node_id)?.graph_node_id}`}
                  style={styles.codifiedLink}
                >
                  open the framework →
                </a>
              </p>
            )}
          </div>
        )}

        {/* ── What's been tried ─────────────────────────────────────── */}
        {data.attempts.length > 0 && (
          <>
            <h2 style={styles.sectionTitle}>What&apos;s been tried</h2>
            {data.attempts.map((a) => (
              <div key={a.attempt} style={styles.attemptCard}>
                <div style={styles.formatOptionTop}>
                  <span style={styles.attemptChip}>attempt {a.attempt}</span>
                  <span style={styles.formatChip}>{formatName(a.chosen_format)}</span>
                  {a.was_override && <span style={styles.overrideChip}>your call</span>}
                  <span style={styles.outcomeChip}>
                    {a.outcome === "pending"
                      ? "still watching"
                      : a.outcome === "effective"
                        ? "it held"
                        : a.outcome === "did_not_land"
                          ? "didn't land"
                          : "inconclusive"}
                  </span>
                </div>
                {a.outcome_note && <p style={styles.quoteNote}>{a.outcome_note}</p>}
                {a.next_format_rationale && (
                  <p style={styles.quoteNote}>
                    Next: {a.next_format_recommended ? formatName(a.next_format_recommended) : "—"} —{" "}
                    {a.next_format_rationale}
                  </p>
                )}
                {(a.enhancements || []).length > 0 && (
                  <p style={styles.quoteNote}>
                    Leader changes: {(a.enhancements || []).map((e) => e.note).join(" · ")}
                  </p>
                )}
              </div>
            ))}
          </>
        )}
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
  backLink: { fontSize: "13px", color: "var(--muted)", textDecoration: "none", fontWeight: 600 },
  title: { fontSize: "24px", margin: "10px 0 8px", lineHeight: 1.35 },
  metaRow: { display: "flex", gap: 8, flexWrap: "wrap" as const, marginBottom: 14 },
  metaChip: {
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--pine-soft)",
    background: "var(--paper-2)",
    border: "1px solid var(--line)",
    borderRadius: 999,
    padding: "3px 9px",
  },
  attemptChip: {
    fontSize: "11px",
    fontWeight: 700,
    color: "var(--warn-text)",
    background: "var(--warn-chip-bg)",
    border: "1px solid var(--warn-border)",
    borderRadius: 999,
    padding: "3px 9px",
  },
  quoteCard: {
    background: "var(--paper-2)",
    border: "1px solid var(--line)",
    borderRadius: 12,
    padding: "14px 16px",
  },
  quoteLabel: { fontSize: "11px", fontWeight: 700, letterSpacing: "0.03em", color: "var(--muted)", textTransform: "uppercase" as const },
  quoteText: { fontSize: "14px", color: "var(--pine)", margin: "6px 0 0", lineHeight: 1.55, fontStyle: "italic" as const },
  quoteNote: { fontSize: "12px", color: "var(--muted)", margin: "8px 0 0", lineHeight: 1.5 },
  successText: { fontSize: "13px", color: "var(--ok-text)", margin: "14px 0 0" },
  errorText: { fontSize: "14px", color: "var(--danger)", margin: "14px 0 0" },
  sectionTitle: {
    fontSize: "13px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    color: "var(--muted)",
    margin: "30px 0 10px",
  },
  headline: { fontSize: "16px", fontWeight: 600, margin: "0 0 12px", lineHeight: 1.5 },
  formatOption: {
    display: "block",
    width: "100%",
    textAlign: "left" as const,
    background: "var(--white)",
    border: "2px solid var(--line)",
    borderRadius: 12,
    padding: "16px 18px",
    marginBottom: 10,
    cursor: "pointer",
    fontFamily: "var(--font-sans)",
  },
  formatOptionSmall: {
    display: "block",
    width: "100%",
    textAlign: "left" as const,
    background: "var(--white)",
    border: "2px solid var(--line)",
    borderRadius: 12,
    padding: "12px 16px",
    marginBottom: 8,
    cursor: "pointer",
    fontFamily: "var(--font-sans)",
  },
  formatOptionOn: { borderColor: "var(--growth)", background: "var(--growth-soft)" },
  formatOptionTop: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap" as const,
    marginBottom: 6,
  },
  formatOptionName: { fontSize: "16px", fontWeight: 700, color: "var(--pine)" },
  formatOptionNameSmall: { fontSize: "14px", fontWeight: 700, color: "var(--pine)" },
  formatOptionEffort: { fontSize: "12px", color: "var(--muted)" },
  formatOptionWhy: { fontSize: "14px", color: "var(--pine-soft)", margin: 0, lineHeight: 1.55 },
  formatOptionWhySmall: { fontSize: "13px", color: "var(--pine-soft)", margin: 0, lineHeight: 1.5 },
  recommendedChip: {
    fontSize: "11px",
    fontWeight: 700,
    color: "var(--growth-deep)",
    background: "var(--growth-soft)",
    border: "1px solid var(--growth)",
    borderRadius: 999,
    padding: "3px 9px",
  },
  overrideChip: {
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--pine-soft)",
    background: "var(--paper-2)",
    border: "1px solid var(--line)",
    borderRadius: 999,
    padding: "3px 9px",
  },
  formatChip: {
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--growth-deep)",
    background: "var(--growth-soft)",
    border: "1px solid var(--new-leaf-light)",
    borderRadius: 999,
    padding: "3px 9px",
  },
  outcomeChip: {
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--pine-soft)",
    background: "var(--white)",
    border: "1px solid var(--line)",
    borderRadius: 999,
    padding: "3px 9px",
  },
  citations: { fontSize: "12px", color: "var(--muted)", margin: "8px 0 0", lineHeight: 1.5 },
  // P-7 Build 5 — the org's own track record under a format card. Quiet green,
  // same register as the effectiveness evidence on /retrieve.
  trackRecordLine: {
    fontSize: "12px",
    color: "var(--growth-deep)",
    margin: "8px 0 0",
    lineHeight: 1.5,
    fontWeight: 600,
  },
  tradeoff: { fontSize: "13px", color: "var(--pine-soft)", margin: "4px 0 0", lineHeight: 1.5 },
  groundingLine: { fontSize: "12px", color: "var(--muted)", margin: "8px 0 0", lineHeight: 1.5 },
  cautionText: {
    fontSize: "13px",
    color: "var(--warn-text)",
    background: "var(--warn-bg)",
    border: "1px solid var(--warn-border)",
    borderRadius: 10,
    padding: "10px 12px",
    margin: "10px 0 0",
    lineHeight: 1.5,
  },
  chooseBar: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap" as const,
    alignItems: "center",
    marginTop: 14,
  },
  input: {
    flex: "1 1 280px",
    boxSizing: "border-box" as const,
    padding: "10px 12px",
    fontSize: "14px",
    fontFamily: "var(--font-sans)",
    color: "var(--pine)",
    background: "var(--paper)",
    border: "1px solid var(--line)",
    borderRadius: 10,
  },
  primaryButton: {
    fontSize: "14px",
    fontWeight: 600,
    color: "var(--white)",
    background: "var(--growth)",
    border: "none",
    borderRadius: 8,
    padding: "10px 18px",
    cursor: "pointer",
  },
  secondaryButton: {
    fontSize: "13px",
    fontWeight: 600,
    color: "var(--growth-deep)",
    background: "var(--growth-soft)",
    border: "1px solid var(--new-leaf-light)",
    borderRadius: 8,
    padding: "9px 15px",
    cursor: "pointer",
  },
  ghostButton: {
    fontSize: "13px",
    fontWeight: 600,
    color: "var(--pine-soft)",
    background: "var(--paper-2)",
    border: "1px solid var(--line)",
    borderRadius: 8,
    padding: "9px 15px",
    cursor: "pointer",
  },
  chosenCard: {
    background: "var(--white)",
    border: "1px solid var(--growth)",
    borderRadius: 12,
    padding: "16px 18px",
    marginBottom: 12,
  },
  strategyLine: { fontSize: "14px", color: "var(--pine-soft)", margin: "0 0 12px", lineHeight: 1.5 },
  tabRow: { display: "flex", gap: 8, flexWrap: "wrap" as const, marginBottom: 10 },
  tab: {
    fontSize: "13px",
    fontWeight: 600,
    color: "var(--pine-soft)",
    background: "var(--paper-2)",
    border: "1px solid var(--line)",
    borderRadius: 999,
    padding: "7px 14px",
    cursor: "pointer",
  },
  tabOn: {
    color: "var(--growth-deep)",
    background: "var(--growth-soft)",
    borderColor: "var(--growth)",
  },
  artifactCard: {
    background: "var(--white)",
    border: "1px solid var(--line)",
    borderRadius: 12,
    padding: "18px 20px",
  },
  artifactTitle: { fontSize: "17px", margin: "0 0 10px" },
  artifactBody: {
    fontFamily: "var(--font-sans)",
    fontSize: "14px",
    color: "var(--pine-soft)",
    lineHeight: 1.65,
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
    margin: 0,
  },
  approveBar: {
    marginTop: 14,
    background: "var(--warn-bg)",
    border: "1px solid var(--warn-border)",
    borderRadius: 12,
    padding: "14px 16px",
  },
  approveText: { fontSize: "13px", color: "var(--warn-text)", margin: 0, lineHeight: 1.5 },
  versionLine: { fontSize: "12px", color: "var(--muted)", margin: "12px 0 0", lineHeight: 1.5 },
  watchCard: {
    background: "var(--white)",
    border: "1px solid var(--growth)",
    borderRadius: 12,
    padding: "16px 18px",
  },
  watchText: { fontSize: "14px", color: "var(--pine-soft)", margin: "0 0 10px", lineHeight: 1.55 },
  blamelessNote: { fontSize: "12px", color: "var(--muted)", margin: "0 0 10px", lineHeight: 1.5 },
  readaptCard: {
    background: "var(--danger-bg)",
    border: "1px solid var(--danger-border)",
    borderRadius: 12,
    padding: "14px 16px",
    marginTop: 18,
  },
  readaptLabel: {
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.03em",
    textTransform: "uppercase" as const,
    color: "var(--danger)",
  },
  readaptText: { fontSize: "14px", color: "var(--pine)", margin: "6px 0 0", lineHeight: 1.55 },
  enhanceCard: {
    marginTop: 12,
    background: "var(--paper-2)",
    border: "1px solid var(--line)",
    borderRadius: 12,
    padding: "14px 16px",
  },
  enhanceLabel: { fontSize: "14px", fontWeight: 700, color: "var(--pine)" },
  enhanceHint: { fontSize: "12px", color: "var(--muted)", margin: "4px 0 0", lineHeight: 1.5 },
  enhanceItem: { fontSize: "13px", color: "var(--pine-soft)", margin: "8px 0 0" },
  provenCard: {
    marginTop: 20,
    background: "var(--ok-bg)",
    border: "1px solid var(--ok-border)",
    borderRadius: 12,
    padding: "16px 18px",
  },
  provenLabel: { fontSize: "13px", fontWeight: 700, color: "var(--ok-text)" },
  codifiedLink: { color: "var(--growth)", fontWeight: 600, textDecoration: "none" },
  attemptCard: {
    background: "var(--white)",
    border: "1px solid var(--line)",
    borderRadius: 12,
    padding: "14px 16px",
    marginBottom: 10,
  },
  empty: { color: "var(--muted)", fontSize: "14px" },
};
