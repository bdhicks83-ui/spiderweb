// FLOOR GUIDE / PHASE C — the data layer for admin-requested deep dives.
//
// ⛔ SERVER-ONLY BY CONVENTION, and deliberately NOT server-only by dependency:
// this file imports the Supabase types and nothing else — no @/lib/claude, no
// fs. The model calls (assessDivergence, detectCandidateInsight) live in the
// routes that need them, same boundary as @/lib/candidate-insights.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE THREE IDEAS IN THIS FILE
//
// 1. ⭐ A DEEP DIVE IS THE DISCLOSED EXCEPTION, AND IT LIVES NOWHERE NEAR
//    FLOOR GUIDE. Everything else the contributor tier does protects one
//    sentence — "nobody's grading you." A deep dive is grading, on purpose,
//    said out loud before the person types (DECISION 1). The two promises
//    never share a screen, a route, or a write path: this module is imported
//    ONLY by /api/deep-dives routes, and nothing here is reachable from a
//    Floor Guide request. scripts/verify-floor-guide-c.mjs proves that
//    behaviourally, not just by reading.
//
// 2. ⭐ A RESPONSE IS INPUT, NEVER JUDGMENT. The Phase A trigger stands
//    untouched. A deep-dive answer that deserves to be canon goes through
//    Phase B's promote path — candidate_insights → a human → an expert-owned
//    framework. There is no second door in this phase; this table stores an
//    answer and two READINGS of it, and a human decides what either means.
//
// 3. ⭐ A DECLINE LEAVES NOTHING. The target list is live; declining removes
//    your id and writes no row, no timestamp, no reason. The admin surface
//    shows the ask and the answers — never who hasn't answered. See
//    DECISION 5 in supabase/floorguide-c-deep-dives.sql.
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from "@supabase/supabase-js";

export type DeepDiveStatus = "open" | "closed";
export type DivergenceVerdictValue = "aligned" | "diverges" | "no_basis";

export const REQUEST_COLUMNS =
  "id, org_id, created_by, topic, anchor_record_id, targets, sent_to_count, " +
  "status, created_at, updated_at";

export type DeepDiveRequestRow = {
  id: string;
  org_id: string;
  created_by: string;
  topic: string;
  anchor_record_id: string | null;
  targets: string[];
  sent_to_count: number;
  status: DeepDiveStatus;
  created_at: string;
  updated_at: string;
};

export const RESPONSE_COLUMNS =
  "id, org_id, request_id, user_id, answer, divergence, divergence_note, " +
  "compared_record_id, divergence_detector, candidate_insight_id, " +
  "training_request_id, created_at, updated_at";

export type DeepDiveResponseRow = {
  id: string;
  org_id: string;
  request_id: string;
  user_id: string;
  answer: string;
  divergence: DivergenceVerdictValue | null;
  divergence_note: string | null;
  compared_record_id: string | null;
  divergence_detector: string | null;
  candidate_insight_id: string | null;
  training_request_id: string | null;
  created_at: string;
  updated_at: string;
};

export const DIVERGENCE_DETECTOR = "deep-dive-divergence-v1";

/** The shortest answer worth assessing — same floor as Phase B's explicit
 *  share. Below this there is nothing for either lens to read. */
export const MIN_ANSWER_CHARS = 40;

/** The most people one ask can target. An ask sent to the whole plant is a
 *  survey, and surveys get survey answers. */
export const MAX_TARGETS = 50;

/**
 * ⭐ THE THIN-DATA BAR — reuse of the P-7 Build 5 lesson, not a new number.
 *
 * The aggregate is the buyer-facing payoff ("here is where your onboarding is
 * actually broken") and it will be tempting to show it at n = 2. Two people
 * diverging on the same thing is a coincidence; presenting a coincidence as a
 * finding is how the first screen an admin sees becomes noise. 3 mirrors
 * PRIOR_MIN_RESOLVED (format-prior.ts) and PROVEN_MIN_EVIDENCE
 * (retrieval-effectiveness.ts) — the product's one conservatism constant,
 * stated three times. Change all three deliberately or none.
 */
export const DEEP_DIVE_FINDING_MIN = 3;

export type DeepDiveFinding = {
  responses: number;
  diverging: number;
  /** 'finding' at >= DEEP_DIVE_FINDING_MIN diverging answers, else 'early'
   *  (>=1 diverging), else null — nothing to say. */
  maturity: "finding" | "early" | null;
};

/**
 * The aggregate for one ask, honestly labelled.
 *
 * Counts only — this function never sees a name, which is the same shape as
 * the P-9 gap rule (the org-wide row carries a COUNT, never a NAME). The
 * per-person rows exist and are manager/admin-visible per DECISION 1; the
 * AGGREGATE is the thing that must read as "our training missed this," and a
 * training finding with a list of names attached reads as a ranking no matter
 * what the headline says.
 */
export function deepDiveFinding(
  responses: { divergence: string | null }[]
): DeepDiveFinding {
  const total = responses.length;
  const diverging = responses.filter((r) => r.divergence === "diverges").length;
  return {
    responses: total,
    diverging,
    maturity:
      diverging >= DEEP_DIVE_FINDING_MIN ? "finding" : diverging >= 1 ? "early" : null,
  };
}

/**
 * The issue text a routed divergence hands the Training Studio.
 *
 * Composed in CODE, not by a model, for the same reason withContributorCredit
 * is: the framing rule — "our training missed this," never "this person is
 * wrong" — is a promise, and a promise that depends on a language model
 * remembering it is not one. The person's name deliberately does not appear:
 * the Studio grounds and generates from the GAP, and the audience is a role,
 * not an individual.
 */
export function composeTrainingIssue(args: {
  topic: string;
  frameworkName: string | null;
  divergenceNote: string | null;
  finding: DeepDiveFinding;
}): string {
  const canon = args.frameworkName
    ? `The team's codified answer ("${args.frameworkName}") covers this, so the judgment exists — it just isn't reaching people.`
    : `Nothing codified was anchored to the ask, so start from what the answers describe.`;
  const spread =
    args.finding.maturity === "finding"
      ? `${args.finding.diverging} of ${args.finding.responses} answers diverge the same way — this reads as systemic, not individual.`
      : `So far ${args.finding.diverging} of ${args.finding.responses} answer(s) diverge — early signal, sized accordingly.`;
  const gap = args.divergenceNote
    ? `The specific difference: ${args.divergenceNote}`
    : `The specific difference was not captured by the reading — read the answers on the deep dive before generating.`;
  return (
    `A deep dive asked the floor how they actually handle: "${args.topic}". ` +
    `${gap} ${spread} ${canon} ` +
    `This came from asking people how they really work — treat it as a training gap the onboarding missed, not a correction of any one person.`
  ).slice(0, 1800);
}

/**
 * Remove one person from an ask's live target list.
 *
 * Used by BOTH answer and decline, which is load-bearing: the array ends up
 * identical either way, so nothing that can read the request can tell a
 * decline from an answer except by the presence of a response the person
 * chose to give. Read-modify-write on the service client; the only writer of
 * any given element is that element's own person, so the race window is
 * theoretical.
 */
export async function removeTarget(
  service: SupabaseClient,
  args: { requestId: string; userId: string }
): Promise<void> {
  const { data } = await service
    .from("deep_dive_requests")
    .select("targets")
    .eq("id", args.requestId)
    .maybeSingle();
  const targets = ((data as { targets: string[] } | null)?.targets ?? []).filter(
    (t) => t !== args.userId
  );
  const { error } = await service
    .from("deep_dive_requests")
    .update({ targets })
    .eq("id", args.requestId);
  if (error) {
    // The ask will still show for them next visit — annoying, never harmful.
    // Logged without the person id: a decline that leaves a name in a log is
    // a record of the decline (see DECISION 5).
    console.error(`[deep-dive] target removal failed on ${args.requestId}: ${error.message}`);
  }
}

/**
 * The compact canon text the divergence reading compares an answer against.
 *
 * Built from the anchor record's own fields, verbatim — the reading must
 * never be handed a paraphrase of the playbook, or "diverges from the
 * playbook" quietly becomes "diverges from a model's memory of it."
 */
export function canonTextFromRecord(record: {
  judgment?: unknown;
  rationale?: unknown;
  boundaries?: unknown;
  framework?: {
    name?: unknown;
    the_play?: unknown;
    signals?: unknown;
    when_to_apply?: unknown;
    boundaries?: unknown;
  } | null;
}): string {
  const s = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
  const list = (v: unknown): string =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).join(" · ")
      : s(v);
  const fw = record.framework ?? null;
  const parts = [
    fw?.the_play ? `THE PLAY: ${s(fw.the_play)}` : "",
    fw?.signals ? `SIGNALS: ${list(fw.signals)}` : "",
    fw?.when_to_apply ? `WHEN IT APPLIES: ${list(fw.when_to_apply)}` : "",
    fw?.boundaries ? `BOUNDARIES: ${list(fw.boundaries)}` : "",
    record.judgment ? `THE JUDGMENT, AS CAPTURED: ${s(record.judgment)}` : "",
    record.rationale ? `WHY: ${s(record.rationale)}` : "",
    record.boundaries && !fw?.boundaries ? `LIMITS: ${s(record.boundaries)}` : "",
  ].filter(Boolean);
  return parts.join("\n").slice(0, 6000);
}
