// P-8 Phase 1 — THE LEARNING LEDGER. The single write path into
// `learning_signals`.
//
// ═══════════════════════════════════════════════════════════════════════════
// ⭐⭐⭐ READ THIS BEFORE YOU BUILD A READER ⭐⭐⭐
//
// GUARDRAIL 1 — PERSON-KEYED PRIORS ARE FORBIDDEN AT THE READER LAYER.
//
//   This ledger records WHO judged (actorId / actorRole), because a judgment
//   nobody can attribute cannot be audited or retracted. But a learning system
//   handed actor_id WILL find correlations between individuals and failed
//   training — and surfacing one would be a blameless-doctrine breach on the
//   scale of putting failure records in the Win Column.
//
//   THE LEDGER MAY RECORD ACTORS. READERS MAY NEVER KEY A PRIOR ON ONE.
//
//   `features` is the ONLY column a reader is allowed to generalize over, and
//   it must never contain a person. That is not left to convention:
//   scrubFeatures() below strips person-ish keys and warns loudly, exactly the
//   way aggregateWinColumn() enforces wins-only in code rather than in a doc,
//   and the way Coaching Watch enforces manager-only in RLS rather than in the
//   page. If a future feature genuinely needs a person dimension, the answer
//   is "no" — find the generalizable attribute behind them (their role, their
//   experience level, their team) and key on that.
//
// GUARDRAIL 2 — MINIMUM-N GATE, N ALWAYS SHOWN. No prior may influence a
//   recommendation without displaying its sample size. With 29 records in one
//   demo org, a prior computed from three attempts would be confidently wrong.
//
// GUARDRAIL 3 — EXPLAINABILITY SURVIVES LEARNING. A prior-influenced output
//   must say "partly because this worked here before (N=…)". Explainable-not-
//   black-box is this product's strongest differentiator, and it breaks the
//   moment the system starts learning silently.
// ═══════════════════════════════════════════════════════════════════════════
//
// PHASE 1 IS WRITERS ONLY. Nothing in the app reads this table. No output
// anywhere changes because of it. Capture is time-sensitive (you can never
// retroactively log a judgment you didn't record); learning is not (a reader
// can be built any time over accumulated history). Writers now, readers when
// pilot data exists.
//
// WRITE DISCIPLINE — copied verbatim from logFormatAttempt() in
// src/lib/training-studio.ts: a ledger write MUST NEVER throw into the
// caller's happy path. A failed learning write can never cost a user their
// action. It warns and moves on, every time, without exception.
//
// Client-safe? NO — takes a service-role SupabaseClient. Server only. (It
// imports nothing but the supabase type, so it does not drag in @/lib/claude
// or fs; a client page still must not import it.)
import type { SupabaseClient } from "@supabase/supabase-js";

// ─── The closed vocabularies (mirrored by check constraints in
//     supabase/p8-learning-ledger.sql — change one, change both) ───

export type LearningScope = "org" | "global";

export type LearningSourceSurface =
  | "codify"
  | "retrieve"
  | "conflict"
  | "prescription"
  | "training_studio"
  | "coaching"
  | "win_column";

export type LearningSubjectType =
  | "pattern_record"
  | "prescription"
  | "training"
  | "format"
  | "retrieval_query"
  | "person_signal";

export type LearningVerdict = "positive" | "negative" | "neutral";

/**
 * The seven signals Phase 1 instruments (plus the both-directions companions
 * that keep the ledger from only ever hearing bad news — a ledger of nothing
 * but negatives teaches a pessimistic prior).
 *
 *  1. format_choice            — which format a leader chose, and whether it
 *                                OVERRODE the agent's recommendation
 *  2. expert_fidelity          — "yes, that's how I think" / "not quite".
 *                                The rejection is the highest-value negative
 *                                in the system: an expert saying we
 *                                misrepresented them
 *  3. training_regenerate      — WHY a leader rejected a design
 *  4. prescription_snooze      — "not worth acting on right now"
 *     coaching_dismiss         — a manager judged an early signal not worth
 *                                acting on
 *     coaching_acknowledge     — …and the other direction
 *  5. teachback_score          — the score AND `missed`: the single best
 *                                signal of what did not transfer
 *  6. outcome_checkin          — 6-month holding / no longer holding
 *  7. retrieval_result_used    — explicit "this helped" (the high-quality one)
 *     retrieval_result_opened  — implicit: which result was opened
 *  +  efficacy_outcome         — effective / did_not_land for the DETECTED
 *                                path (the Studio already logged its own via
 *                                training_format_outcomes; the auto-detected
 *                                path did not)
 */
export const LEARNING_SIGNAL_TYPES = [
  "format_choice",
  "expert_fidelity",
  "training_regenerate",
  "prescription_snooze",
  "coaching_dismiss",
  "coaching_acknowledge",
  "teachback_score",
  "outcome_checkin",
  "retrieval_result_used",
  "retrieval_result_opened",
  "efficacy_outcome",
] as const;

export type LearningSignalType = (typeof LEARNING_SIGNAL_TYPES)[number];

export function isLearningSignalType(v: unknown): v is LearningSignalType {
  return typeof v === "string" && (LEARNING_SIGNAL_TYPES as readonly string[]).includes(v);
}

/**
 * The semantic role the actor held IN THIS JUDGMENT — not their profiles.role
 * label. An expert rejecting a fidelity check and a manager snoozing a queue
 * item are different KINDS of evidence even when the same human does both.
 */
export type LearningActorRole =
  | "expert"
  | "manager"
  | "leader"
  | "learner"
  | "member"
  | "system";

export type LearningFeatures = Record<string, string | number | boolean | null>;

export type RecordLearningSignalInput = {
  orgId: string;
  sourceSurface: LearningSourceSurface;
  signalType: LearningSignalType;
  subjectType: LearningSubjectType;
  /** uuid for row-backed subjects; a stable key (e.g. a format_key) otherwise. */
  subjectId: string;
  verdict: LearningVerdict;
  /** ⚠️ The generalizable context ONLY. Never a person — see GUARDRAIL 1. */
  features?: LearningFeatures;
  /** The raw thing being judged: the note, the score, the missed items. */
  payload?: Record<string, unknown>;
  actorId?: string | null;
  actorRole?: LearningActorRole | null;
  /** Defaults to now(). Backdate only when replaying real history. */
  occurredAt?: string | null;
  /**
   * BACKFILL ONLY. Live writers leave this undefined: the ledger is
   * append-only and two genuine judgments must never collide.
   */
  dedupeKey?: string | null;
  /** 'org' always, for now. 'global' is reserved; nothing writes it. */
  scope?: LearningScope;
  writtenBy?: string;
};

// ─── ⭐ GUARDRAIL 1, ENFORCED IN CODE ───────────────────────────────────────
//
// Any feature key that names or identifies a PERSON is stripped before the row
// is written, and the strip is logged. Readers can only key on what is in
// `features`, so a person that never lands there can never become a prior —
// the guardrail is structural, not a promise.
//
// Deliberately a DENYLIST of person-shaped key patterns rather than an
// allowlist of known-good features: an allowlist would silently drop a
// legitimate new dimension the first time someone adds one, which is a bug
// that looks like "the learning just isn't very good."
const PERSON_KEY_RE =
  /(^|_)(user|users|person|people|profile|actor|learner|expert|author|manager|owner|requester|email|uid)(_|$)|(^|_)(name|names|display_name|full_name)$/i;

/**
 * Strip person-identifying keys out of a features object.
 *
 * Exported so the backfill script and any future reader-side test can assert
 * the same rule with the same code. `audience_role`, `audience_team`,
 * `audience_experience`, `issue_type`, `format_key`, `rung`, `method`,
 * `source_type` and `similarity` all pass — they describe a POPULATION or a
 * SHAPE, which is exactly what a prior is allowed to generalize over.
 */
export function scrubFeatures(features: LearningFeatures | undefined): LearningFeatures {
  if (!features) return {};
  const clean: LearningFeatures = {};
  const stripped: string[] = [];
  for (const [k, v] of Object.entries(features)) {
    if (PERSON_KEY_RE.test(k)) {
      stripped.push(k);
      continue;
    }
    if (v === undefined) continue;
    clean[k] = v;
  }
  if (stripped.length > 0) {
    console.warn(
      `[learning-ledger] GUARDRAIL: stripped person-keyed feature(s) before write: ${stripped.join(
        ", "
      )}. Readers may never key a prior on a person — find the generalizable attribute behind them (role, experience, team).`
    );
  }
  return clean;
}

type LedgerRow = {
  org_id: string;
  scope: LearningScope;
  source_surface: LearningSourceSurface;
  signal_type: LearningSignalType;
  subject_type: LearningSubjectType;
  subject_id: string;
  verdict: LearningVerdict;
  features: LearningFeatures;
  payload: Record<string, unknown>;
  actor_id: string | null;
  actor_role: LearningActorRole | null;
  dedupe_key: string | null;
  occurred_at: string;
  written_by: string;
};

function toRow(input: RecordLearningSignalInput): LedgerRow {
  return {
    org_id: input.orgId,
    scope: input.scope ?? "org",
    source_surface: input.sourceSurface,
    signal_type: input.signalType,
    subject_type: input.subjectType,
    subject_id: input.subjectId,
    verdict: input.verdict,
    features: scrubFeatures(input.features),
    payload: input.payload ?? {},
    actor_id: input.actorId ?? null,
    actor_role: input.actorRole ?? null,
    dedupe_key: input.dedupeKey ?? null,
    occurred_at: input.occurredAt ?? new Date().toISOString(),
    written_by: input.writtenBy ?? "learning-ledger-v1",
  };
}

/**
 * Append ONE judgment to the ledger.
 *
 * ⚠️ NEVER THROWS INTO THE CALLER'S HAPPY PATH. A ledger write that fails must
 * warn and move on — it can never cost a user their action. This is the
 * logFormatAttempt() discipline, copied exactly, and it is the whole reason
 * every writer in Phase 1 can be a bare `await` with no try/catch around it at
 * the call site.
 *
 * `service` must be a SERVICE-ROLE client: learning_signals has org-scoped RLS
 * READ and no write policy at all, same lockdown doctrine as
 * prescription_detections.
 */
export async function recordLearningSignal(
  service: SupabaseClient,
  input: RecordLearningSignalInput
): Promise<void> {
  try {
    const row = toRow(input);
    // Live writes carry no dedupe_key, so a plain insert is correct and
    // append-only. Only the backfill upserts (against the PLAIN unique index
    // on (org_id, dedupe_key) — never a partial one; PostgREST cannot infer an
    // ON CONFLICT target from a partial index and every upsert would fail
    // silently behind this very warn).
    const { error } = row.dedupe_key
      ? await service.from("learning_signals").upsert(row, { onConflict: "org_id,dedupe_key" })
      : await service.from("learning_signals").insert(row);
    if (error) {
      console.warn(
        `[learning-ledger] write skipped (${input.signalType} on ${input.subjectType}:${input.subjectId}): ${error.message}`
      );
    }
  } catch (err) {
    console.warn(
      `[learning-ledger] write threw and was swallowed (${input.signalType}): ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}

/**
 * Append MANY judgments in one round trip (the efficacy loop produces a batch).
 * Same never-throws discipline.
 */
export async function recordLearningSignals(
  service: SupabaseClient,
  inputs: RecordLearningSignalInput[]
): Promise<void> {
  if (!inputs || inputs.length === 0) return;
  try {
    const rows = inputs.map(toRow);
    const keyed = rows.filter((r) => r.dedupe_key);
    const unkeyed = rows.filter((r) => !r.dedupe_key);
    if (unkeyed.length > 0) {
      const { error } = await service.from("learning_signals").insert(unkeyed);
      if (error) {
        console.warn(`[learning-ledger] batch write skipped (${unkeyed.length} rows): ${error.message}`);
      }
    }
    if (keyed.length > 0) {
      const { error } = await service
        .from("learning_signals")
        .upsert(keyed, { onConflict: "org_id,dedupe_key" });
      if (error) {
        console.warn(`[learning-ledger] batch upsert skipped (${keyed.length} rows): ${error.message}`);
      }
    }
  } catch (err) {
    console.warn(
      `[learning-ledger] batch write threw and was swallowed: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}

/**
 * The deterministic key the backfill uses, per the handoff:
 * (subject_type, subject_id, signal_type, occurred_at).
 *
 * Exported so the script and any future replay use the SAME derivation — a
 * backfill whose key drifts from the reader's expectation stops being
 * idempotent without anyone noticing.
 */
export function backfillDedupeKey(
  subjectType: LearningSubjectType,
  subjectId: string,
  signalType: LearningSignalType,
  occurredAt: string
): string {
  return `backfill:${subjectType}:${subjectId}:${signalType}:${occurredAt}`;
}

/**
 * Coarse buckets for continuous values. A prior over raw scores needs far more
 * data than a prior over three bands, and the bands are what a human-readable
 * explanation ("teach-backs in this shape usually land in the 70-89 range")
 * would say anyway.
 */
export function scoreBand(score: number): "low" | "mid" | "high" {
  if (score >= 85) return "high";
  if (score >= 70) return "mid";
  return "low";
}

export function similarityBand(similarity: number): "strong" | "good" | "possible" {
  // Matches the /retrieve match labels exactly, so a future explanation can
  // reuse the words the user already saw on the card.
  if (similarity >= 0.82) return "strong";
  if (similarity >= 0.78) return "good";
  return "possible";
}
