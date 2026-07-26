// P-8 Phase 1 (Build 3) — Backfill the learning ledger from what is already
// stored, so day one has history instead of an empty table.
//
// Six of the seven signals were ALREADY being written somewhere before this
// build; they just dead-ended in columns nothing read. That means their history
// is recoverable, and recovering it is free evidence for whenever a Phase-2
// reader is built. This script walks those tables and replays each judgment
// into learning_signals with its ORIGINAL timestamp.
//
// ⚠️ SIGNAL 7 (which retrieval result was useful) HAS NO HISTORY TO BACKFILL.
// It was never captured anywhere before this build — that is exactly why it
// needed a new capture control. The summary below says so explicitly rather
// than quietly reporting 0 and letting it read like "none happened."
//
// IDEMPOTENT. Every row is written with a deterministic dedupe_key derived from
// (subject_type, subject_id, signal_type, occurred_at) and upserted against the
// PLAIN unique index (org_id, dedupe_key). Re-running changes nothing.
//
// Repo convention: one-off data ops COPY rather than import from src/ (same as
// scripts/backfill-pattern-embeddings.mjs mirroring buildPatternEmbeddingText).
// scrubFeatures() and backfillDedupeKey() below are verbatim JS mirrors of the
// exports in src/lib/learning-ledger.ts — keep the two in sync if you change
// either. The guardrail matters more here than anywhere: a backfill that
// bypassed scrubFeatures could seed the ledger with person-keyed features
// before a single reader ever exists.
//
// Usage (from the repo root):
//   node scripts/backfill-learning-signals.mjs           # idempotent replay
//   node scripts/backfill-learning-signals.mjs --dry-run # count only, no writes
//   node scripts/backfill-learning-signals.mjs --force   # delete prior backfill
//                                                        # rows first, then replay
//
// --force ONLY deletes rows whose dedupe_key starts with 'backfill:'. Live
// signals written by the app carry a NULL dedupe_key and are never touched.
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";

// ─── env (same .env.local loader as the seed scripts) ───
const envRaw = await readFile(path.join(process.cwd(), ".env.local"), "utf-8");
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const DRY_RUN = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─── verbatim mirror of PERSON_KEY_RE + scrubFeatures (src/lib/learning-ledger.ts) ───
const PERSON_KEY_RE =
  /(^|_)(user|users|person|people|profile|actor|learner|expert|author|manager|owner|requester|email|uid)(_|$)|(^|_)(name|names|display_name|full_name)$/i;

let strippedCount = 0;
function scrubFeatures(features) {
  const clean = {};
  for (const [k, v] of Object.entries(features || {})) {
    if (PERSON_KEY_RE.test(k)) {
      strippedCount++;
      console.warn(`  ⚠️  GUARDRAIL: stripped person-keyed feature "${k}"`);
      continue;
    }
    if (v === undefined) continue;
    clean[k] = v;
  }
  return clean;
}

// ─── verbatim mirror of backfillDedupeKey (src/lib/learning-ledger.ts) ───
function backfillDedupeKey(subjectType, subjectId, signalType, occurredAt) {
  return `backfill:${subjectType}:${subjectId}:${signalType}:${occurredAt}`;
}

function scoreBand(score) {
  if (score >= 85) return "high";
  if (score >= 70) return "mid";
  return "low";
}

const rows = [];
const counts = {};

function push({
  orgId,
  sourceSurface,
  signalType,
  subjectType,
  subjectId,
  verdict,
  features,
  payload,
  actorId,
  actorRole,
  occurredAt,
}) {
  if (!orgId || !subjectId || !occurredAt) return;
  const iso = new Date(occurredAt).toISOString();
  rows.push({
    org_id: orgId,
    scope: "org",
    source_surface: sourceSurface,
    signal_type: signalType,
    subject_type: subjectType,
    subject_id: String(subjectId),
    verdict,
    features: scrubFeatures(features),
    payload: payload || {},
    actor_id: actorId ?? null,
    actor_role: actorRole ?? null,
    consumed_by: [],
    dedupe_key: backfillDedupeKey(subjectType, subjectId, signalType, iso),
    occurred_at: iso,
    written_by: "backfill-learning-signals-v1",
  });
  counts[signalType] = (counts[signalType] || 0) + 1;
}

async function selectAll(table, columns) {
  const { data, error } = await supabase.from(table).select(columns);
  if (error) {
    console.warn(`  ⚠️  could not read ${table}: ${error.message} — skipping`);
    return [];
  }
  return data || [];
}

console.log("\n🕸️  P-8 Phase 1 — backfilling the learning ledger\n");
if (DRY_RUN) console.log("   (--dry-run: counting only, nothing will be written)\n");

// ── Shared lookups ───────────────────────────────────────────────────────────
const prescriptions = await selectAll(
  "prescriptions",
  "id, org_id, detection_id, rung, escalated_from_rung, recurrence, roi_score, capture_first, " +
    "status, snoozed_by, snoozed_at, snoozed_until, delivered_at, efficacy_status, " +
    "efficacy_note, efficacy_checked_at, outcome_confirmed_at, outcome_confirmed_status, " +
    "outcome_confirmed_by, experts"
);
const rxById = new Map(prescriptions.map((r) => [r.id, r]));

const detections = await selectAll("prescription_detections", "id, source_type");
const sourceByDetection = new Map(detections.map((d) => [d.id, d.source_type]));
const sourceTypeFor = (rx) => (rx ? sourceByDetection.get(rx.detection_id) ?? null : null);

const patternRecords = await selectAll(
  "pattern_records",
  "id, org_id, method, trigger_type, situation_type, context_function"
);
const recById = new Map(patternRecords.map((r) => [r.id, r]));

// ── SIGNAL 1 — format choice + override (training_format_outcomes) ───────────
const formatOutcomes = await selectAll(
  "training_format_outcomes",
  "id, org_id, training_request_id, prescription_id, attempt, issue_type, audience_role, " +
    "audience_team, audience_experience, recommended_format, chosen_format, was_override, " +
    "override_reason, agent_rationale, created_at"
);
for (const o of formatOutcomes) {
  push({
    orgId: o.org_id,
    sourceSurface: "training_studio",
    signalType: "format_choice",
    subjectType: "format",
    subjectId: o.chosen_format,
    verdict: o.was_override ? "negative" : "positive",
    features: {
      issue_type: o.issue_type,
      audience_role: o.audience_role,
      audience_team: o.audience_team,
      audience_experience: o.audience_experience,
      format_key: o.chosen_format,
      recommended_format: o.recommended_format,
      was_override: !!o.was_override,
      attempt: o.attempt,
    },
    payload: {
      training_request_id: o.training_request_id,
      prescription_id: o.prescription_id,
      override_reason: o.override_reason,
      agent_rationale: o.agent_rationale ?? [],
      backfilled_from: "training_format_outcomes",
    },
    // The chooser is not recoverable from this table, and that is fine —
    // readers may never key on them anyway.
    actorId: null,
    actorRole: "leader",
    occurredAt: o.created_at,
  });
}

// ── SIGNAL 2 — expert fidelity (prescription_fidelity) ───────────────────────
const fidelity = await selectAll(
  "prescription_fidelity",
  "id, org_id, prescription_id, expert_user_id, record_id, decision, note, decided_at"
);
for (const f of fidelity) {
  const rx = rxById.get(f.prescription_id);
  const rec = recById.get(f.record_id);
  push({
    orgId: f.org_id,
    sourceSurface: "prescription",
    signalType: "expert_fidelity",
    subjectType: "pattern_record",
    subjectId: f.record_id,
    verdict: f.decision === "confirmed" ? "positive" : "negative",
    features: {
      decision: f.decision,
      rung: rx?.rung ?? null,
      source_type: sourceTypeFor(rx),
      method: rec?.method ?? null,
      trigger_type: rec?.trigger_type ?? null,
      situation_type: rec?.situation_type ?? null,
      context_function: rec?.context_function ?? null,
    },
    payload: {
      prescription_id: f.prescription_id,
      note: f.note,
      backfilled_from: "prescription_fidelity",
    },
    actorId: f.expert_user_id,
    actorRole: "expert",
    occurredAt: f.decided_at,
  });
}

// ── SIGNAL 3 — regenerate notes (prescription_trainings) ─────────────────────
// The judgment is about the version that was REJECTED, so each regenerate row
// resolves back to its immediate predecessor.
const trainings = await selectAll(
  "prescription_trainings",
  "id, org_id, prescription_id, version, strategy, rung, format, format_key, regenerate_note, generated_at"
);
const trainingsByRx = new Map();
for (const t of trainings) {
  const list = trainingsByRx.get(t.prescription_id) || [];
  list.push(t);
  trainingsByRx.set(t.prescription_id, list);
}
for (const list of trainingsByRx.values()) list.sort((a, b) => a.version - b.version);
for (const t of trainings) {
  if (t.version <= 1) continue; // v1 is not a rejection of anything
  const siblings = trainingsByRx.get(t.prescription_id) || [];
  const prior = siblings.find((s) => s.version === t.version - 1);
  if (!prior) continue;
  const rx = rxById.get(t.prescription_id);
  push({
    orgId: t.org_id,
    sourceSurface: "prescription",
    signalType: "training_regenerate",
    subjectType: "training",
    subjectId: prior.id,
    verdict: "negative",
    features: {
      rejected_version: prior.version,
      rejected_strategy: prior.strategy,
      replacement_strategy: t.strategy,
      rung: prior.rung,
      format: prior.format,
      format_key: prior.format_key,
      source_type: sourceTypeFor(rx),
      prior_version_count: prior.version,
      had_note: !!t.regenerate_note,
    },
    payload: {
      prescription_id: t.prescription_id,
      new_training_id: t.id,
      new_version: t.version,
      regenerate_note: t.regenerate_note,
      backfilled_from: "prescription_trainings",
    },
    actorId: null,
    actorRole: "leader",
    occurredAt: t.generated_at,
  });
}

// ── SIGNAL 4a — snoozes (prescriptions) ──────────────────────────────────────
for (const rx of prescriptions) {
  if (!rx.snoozed_at) continue;
  const days =
    rx.snoozed_until && rx.snoozed_at
      ? Math.round(
          (new Date(rx.snoozed_until).getTime() - new Date(rx.snoozed_at).getTime()) /
            (24 * 60 * 60 * 1000)
        )
      : null;
  push({
    orgId: rx.org_id,
    sourceSurface: "prescription",
    signalType: "prescription_snooze",
    subjectType: "prescription",
    subjectId: rx.id,
    verdict: "negative",
    features: {
      rung: rx.rung,
      source_type: sourceTypeFor(rx),
      recurrence: rx.recurrence,
      roi_score: rx.roi_score,
      capture_first: !!rx.capture_first,
      snooze_days: days,
      was_re_snooze: null, // not recoverable from a single stored snooze
    },
    payload: { snoozed_until: rx.snoozed_until, backfilled_from: "prescriptions" },
    actorId: rx.snoozed_by ?? null,
    actorRole: "manager",
    occurredAt: rx.snoozed_at,
  });
}

// ── SIGNAL 4b — coaching acknowledge / dismiss (retraining_signals) ──────────
// ⚠️ PRIVACY: learning_signals is org-wide readable; retraining_signals is
// manager-only. NOTHING person-identifying crosses over — no person_id, no
// summary (it contains the person's name), no actor. See the header of
// supabase/p8-learning-ledger.sql.
const coachingSignals = await selectAll(
  "retraining_signals",
  "id, org_id, status, recurrence, evidence_record_ids, detected_at, acknowledged_at"
);
for (const s of coachingSignals) {
  if (s.status === "open" || !s.acknowledged_at) continue;
  const daysOpen = Math.max(
    0,
    Math.round(
      (new Date(s.acknowledged_at).getTime() - new Date(s.detected_at).getTime()) /
        (24 * 60 * 60 * 1000)
    )
  );
  push({
    orgId: s.org_id,
    sourceSurface: "coaching",
    signalType: s.status === "dismissed" ? "coaching_dismiss" : "coaching_acknowledge",
    subjectType: "person_signal",
    subjectId: s.id,
    verdict: s.status === "dismissed" ? "negative" : "positive",
    features: {
      recurrence: s.recurrence,
      evidence_count: (s.evidence_record_ids || []).length,
      days_open: daysOpen,
      prior_status: "open",
    },
    payload: {},
    actorId: null,
    actorRole: "manager",
    occurredAt: s.acknowledged_at,
  });
}

// ── SIGNAL 5 — teach-back scores + what was missed ───────────────────────────
const teachbacks = await selectAll(
  "prescription_teachbacks",
  "id, org_id, prescription_id, training_id, learner_user_id, score, passed, missed, completed_at"
);
const trainingById = new Map(trainings.map((t) => [t.id, t]));
for (const tb of teachbacks) {
  if (!tb.completed_at || tb.score === null || tb.score === undefined) continue;
  const rx = rxById.get(tb.prescription_id);
  const tr = trainingById.get(tb.training_id);
  const missed = Array.isArray(tb.missed) ? tb.missed : [];
  push({
    orgId: tb.org_id,
    sourceSurface: "prescription",
    signalType: "teachback_score",
    subjectType: "training",
    subjectId: tb.training_id,
    verdict: tb.passed ? "positive" : "negative",
    features: {
      passed: !!tb.passed,
      score_band: scoreBand(tb.score),
      rung: tr?.rung ?? rx?.rung ?? null,
      format: tr?.format ?? null,
      format_key: tr?.format_key ?? null,
      strategy: tr?.strategy ?? null,
      training_version: tr?.version ?? null,
      source_type: sourceTypeFor(rx),
      missed_count: missed.length,
    },
    payload: {
      prescription_id: tb.prescription_id,
      teachback_id: tb.id,
      score: tb.score,
      missed,
      backfilled_from: "prescription_teachbacks",
    },
    actorId: tb.learner_user_id,
    actorRole: "learner",
    occurredAt: tb.completed_at,
  });
}

// ── SIGNAL 6 — 6-month outcome check-ins ─────────────────────────────────────
for (const rx of prescriptions) {
  if (!rx.outcome_confirmed_at || !rx.outcome_confirmed_status) continue;
  const months = rx.delivered_at
    ? Math.round(
        (new Date(rx.outcome_confirmed_at).getTime() - new Date(rx.delivered_at).getTime()) /
          (30 * 24 * 60 * 60 * 1000)
      )
    : null;
  push({
    orgId: rx.org_id,
    sourceSurface: "prescription",
    signalType: "outcome_checkin",
    subjectType: "prescription",
    subjectId: rx.id,
    verdict: rx.outcome_confirmed_status === "holding" ? "positive" : "negative",
    features: {
      outcome_status: rx.outcome_confirmed_status,
      rung: rx.rung,
      source_type: sourceTypeFor(rx),
      recurrence: rx.recurrence,
      months_since_delivery: months,
    },
    payload: {
      delivered_at: rx.delivered_at,
      confirmed_at: rx.outcome_confirmed_at,
      backfilled_from: "prescriptions",
    },
    actorId: rx.outcome_confirmed_by ?? null,
    actorRole: "manager",
    occurredAt: rx.outcome_confirmed_at,
  });
}

// ── DETECTED-PATH EFFICACY OUTCOMES ──────────────────────────────────────────
for (const rx of prescriptions) {
  if (rx.efficacy_status !== "effective" && rx.efficacy_status !== "escalated") continue;
  const when = rx.efficacy_checked_at || rx.delivered_at;
  if (!when) continue;
  const landed = rx.efficacy_status === "effective";
  const daysWatched =
    rx.delivered_at && when
      ? Math.round(
          (new Date(when).getTime() - new Date(rx.delivered_at).getTime()) / (24 * 60 * 60 * 1000)
        )
      : null;
  push({
    orgId: rx.org_id,
    sourceSurface: "prescription",
    signalType: "efficacy_outcome",
    subjectType: "prescription",
    subjectId: rx.id,
    verdict: landed ? "positive" : "negative",
    features: {
      outcome: landed ? "effective" : "did_not_land",
      rung: rx.rung,
      escalated_from_rung: rx.escalated_from_rung,
      source_type: sourceTypeFor(rx),
      recurrence: rx.recurrence,
      days_watched: daysWatched,
    },
    payload: { efficacy_note: rx.efficacy_note, backfilled_from: "prescriptions" },
    actorId: null,
    actorRole: "system",
    occurredAt: when,
  });
}

// ── Write ────────────────────────────────────────────────────────────────────
console.log("Signals assembled from existing history:");
for (const [type, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${type}`);
}
console.log(`  ${String(rows.length).padStart(4)}  TOTAL`);
console.log(
  "\n  ⚠️  retrieval_result_used / retrieval_result_opened: 0 — NOT because none\n" +
    "      happened, but because signal 7 was never captured anywhere before this\n" +
    "      build. Its history starts now, from the new /retrieve control.\n"
);
if (strippedCount > 0) {
  console.log(`  ⚠️  guardrail stripped ${strippedCount} person-keyed feature(s) before write.\n`);
}

if (DRY_RUN) {
  console.log("--dry-run: nothing written. Done.\n");
  process.exit(0);
}

if (FORCE) {
  console.log("--force: deleting prior backfill rows (dedupe_key like 'backfill:%')…");
  const { error: delError } = await supabase
    .from("learning_signals")
    .delete()
    .like("dedupe_key", "backfill:%");
  if (delError) {
    console.error(`  ❌ delete failed: ${delError.message}`);
    process.exit(1);
  }
  console.log("  ✓ cleared. Live (null-dedupe_key) signals were not touched.\n");
}

let written = 0;
const CHUNK = 200;
for (let i = 0; i < rows.length; i += CHUNK) {
  const chunk = rows.slice(i, i + CHUNK);
  const { error } = await supabase
    .from("learning_signals")
    .upsert(chunk, { onConflict: "org_id,dedupe_key" });
  if (error) {
    console.error(`  ❌ upsert failed at row ${i}: ${error.message}`);
    process.exit(1);
  }
  written += chunk.length;
  console.log(`  ✓ ${written}/${rows.length}`);
}

// ── Verify + run the audit inline ────────────────────────────────────────────
const { count: total } = await supabase
  .from("learning_signals")
  .select("id", { count: "exact", head: true });
const { count: unconsumed } = await supabase
  .from("learning_signals")
  .select("id", { count: "exact", head: true })
  .eq("consumed_by", "{}");

console.log(`\n✅ Backfill complete. learning_signals now holds ${total ?? "?"} row(s).`);
console.log(
  `\n⭐ THE AUDIT — signals nothing has consumed: ${unconsumed ?? "?"} of ${total ?? "?"}.`
);
console.log(
  "   Expected at the end of P-8 Phase 1: ALL of them. Phase 1 shipped WRITERS ONLY;\n" +
    "   there are no readers yet, by decision. That is the correct result, and it is\n" +
    "   reported rather than hidden — an audit that only ever reports good news is\n" +
    "   not an audit. Full breakdown: scripts/audit-learning-signals.sql\n"
);
