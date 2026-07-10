// Phase 8 (Block 1) — per-INSIGHT credibility scoring.
//
// Two permanent, NON-decaying scores per approved insight:
//   • quality_score (0–100)      — LOCKS at verification, never recalculated.
//   • corroboration_score (0–100)— starts at a base, ONLY ever increases
//                                   (each citation/usage hit adds a step).
// The combined score maps to a status badge (Emerging/Rising/Verified/Elite).
//
// Insights flagged needs_explanation (Block 2) that haven't cleared the
// belief-revision depth gate are NOT eligible — they get no score/badge until
// explained.
import type { SupabaseClient } from "@supabase/supabase-js";

// Trust tiers on a 1–4 scale — the "source-type weighting" input.
const TIER_WEIGHT: Record<string, number> = {
  casual_note: 1,
  ai_inferred: 2,
  strategic_doc: 3,
  validated_assessment: 4,
};
const TIER_MAX = 4;

// How many corroborating connections earn full triangulation credit.
const TRIANGULATION_TARGET = 3;

// Corroboration is additive-only: a base at first scoring, +step per citation.
export const CORROBORATION_BASE = 20;
export const CORROBORATION_STEP = 6;
export const CORROBORATION_MAX = 100;

// Quality component weights.
const W_SOURCE = 0.45;
const W_TRIANGULATION = 0.3;
const W_EVIDENCE = 0.25;

export type Badge = "Emerging" | "Rising" | "Verified" | "Elite";

export function badgeForScore(combined: number): Badge {
  if (combined >= 85) return "Elite";
  if (combined >= 65) return "Verified";
  if (combined >= 40) return "Rising";
  return "Emerging";
}

// Combined score: quality-led, corroboration a lighter additive lift.
export function combinedScore(quality: number, corroboration: number): number {
  return Math.round(
    Math.max(0, Math.min(100, quality * 0.7 + corroboration * 0.3))
  );
}

type QualityInputs = {
  tier: string;
  connectionCount: number;
  evidenceType: string | null;
  hasLinkedCase: boolean; // principle backed by ≥1 case
  caseComplete: boolean; // case has S/A/O/L filled
};

export function qualityScore(i: QualityInputs): number {
  const source = ((TIER_WEIGHT[i.tier] ?? 1) / TIER_MAX) * 100;
  const triangulation =
    (Math.min(i.connectionCount, TRIANGULATION_TARGET) / TRIANGULATION_TARGET) *
    100;
  const evidence =
    i.evidenceType === "case"
      ? i.caseComplete
        ? 100
        : 40
      : i.hasLinkedCase
        ? 100
        : 40;
  return Math.round(
    Math.max(
      0,
      Math.min(100, W_SOURCE * source + W_TRIANGULATION * triangulation + W_EVIDENCE * evidence)
    )
  );
}

// An insight is eligible for scoring unless it's an unexplained (or shallowly
// explained) contradiction.
function isEligible(row: {
  needs_explanation: boolean | null;
  revision_depth_ok: boolean | null;
}): boolean {
  if (!row.needs_explanation) return true;
  return row.revision_depth_ok === true;
}

type InsightRow = {
  id: string;
  user_id: string;
  source_id: string;
  evidence_type: string | null;
  related_insight_id: string | null;
  situation: string | null;
  action: string | null;
  outcome: string | null;
  lesson: string | null;
  quality_score: number | null;
  corroboration_score: number | null;
  scored_at: string | null;
  needs_explanation: boolean | null;
  revision_depth_ok: boolean | null;
};

// Score every APPROVED insight for a user (or all users when userId is null).
// quality_score LOCKS once (scored_at) and is never rewritten; badge/combined
// are refreshed each run so a corroboration change is reflected. Returns the
// number of insights scored/updated.
export async function backfillScores(
  service: SupabaseClient,
  userId: string | null
): Promise<number> {
  let q = service
    .from("insights")
    .select(
      "id, user_id, source_id, evidence_type, related_insight_id, situation, action, outcome, lesson, quality_score, corroboration_score, scored_at, needs_explanation, revision_depth_ok"
    )
    .eq("status", "approved");
  if (userId) q = q.eq("user_id", userId);
  const { data } = await q;
  const insights = (data as InsightRow[] | null) || [];
  if (insights.length === 0) return 0;

  // Source trust tiers.
  const sourceIds = [...new Set(insights.map((i) => i.source_id).filter(Boolean))];
  const tierBySource = new Map<string, string>();
  if (sourceIds.length > 0) {
    const { data: sources } = await service
      .from("sources")
      .select("id, trust_tier")
      .in("id", sourceIds);
    for (const s of (sources as { id: string; trust_tier: string | null }[] | null) || []) {
      tierBySource.set(s.id, s.trust_tier || "casual_note");
    }
  }

  // Triangulation: connection counts per insight (either side of the edge).
  const connCount = new Map<string, number>();
  {
    const ids = insights.map((i) => i.id);
    const { data: conns } = await service
      .from("connections")
      .select("insight_a_id, insight_b_id")
      .or(`insight_a_id.in.(${ids.join(",")}),insight_b_id.in.(${ids.join(",")})`);
    for (const c of (conns as { insight_a_id: string; insight_b_id: string }[] | null) || []) {
      connCount.set(c.insight_a_id, (connCount.get(c.insight_a_id) || 0) + 1);
      connCount.set(c.insight_b_id, (connCount.get(c.insight_b_id) || 0) + 1);
    }
  }

  // Principles that have ≥1 case linked to them.
  const principlesWithCase = new Set<string>();
  for (const i of insights) {
    if (i.evidence_type === "case" && i.related_insight_id) {
      principlesWithCase.add(i.related_insight_id);
    }
  }

  let updated = 0;
  for (const i of insights) {
    if (!isEligible(i)) {
      // Not eligible — make sure it carries no score/badge.
      if (i.quality_score !== null || i.scored_at !== null) {
        await service
          .from("insights")
          .update({ quality_score: null, credibility_badge: null, scored_at: null })
          .eq("id", i.id);
        updated++;
      }
      continue;
    }

    const caseComplete =
      i.evidence_type === "case" &&
      !!(i.situation || i.action || i.outcome || i.lesson);
    const quality =
      i.scored_at && i.quality_score !== null
        ? i.quality_score // locked — never recompute
        : qualityScore({
            tier: tierBySource.get(i.source_id) || "casual_note",
            connectionCount: connCount.get(i.id) || 0,
            evidenceType: i.evidence_type,
            hasLinkedCase: principlesWithCase.has(i.id),
            caseComplete,
          });

    const corroboration = Math.max(
      i.corroboration_score ?? 0,
      CORROBORATION_BASE
    );
    const badge = badgeForScore(combinedScore(quality, corroboration));

    await service
      .from("insights")
      .update({
        quality_score: quality,
        corroboration_score: corroboration,
        credibility_badge: badge,
        scored_at: i.scored_at || new Date().toISOString(),
      })
      .eq("id", i.id);
    updated++;
  }
  return updated;
}

// Lock the quality score for a single insight at verification time. Called from
// the approval path (service role). Skips ineligible (unexplained-contradiction)
// insights. Idempotent: quality never rewrites once scored_at is set.
export async function scoreInsightAtApproval(
  service: SupabaseClient,
  insightId: string
): Promise<void> {
  const { data } = await service
    .from("insights")
    .select(
      "id, user_id, source_id, evidence_type, related_insight_id, situation, action, outcome, lesson, quality_score, corroboration_score, scored_at, needs_explanation, revision_depth_ok"
    )
    .eq("id", insightId)
    .single();
  const row = data as InsightRow | null;
  if (!row) return;
  if (!isEligible(row)) return; // stays unscored until explained
  if (row.scored_at && row.quality_score !== null) return; // already locked

  const { data: sourceData } = await service
    .from("sources")
    .select("trust_tier")
    .eq("id", row.source_id)
    .maybeSingle();
  const tier = (sourceData as { trust_tier: string | null } | null)?.trust_tier || "casual_note";

  const { count: connectionCount } = await service
    .from("connections")
    .select("id", { count: "exact", head: true })
    .or(`insight_a_id.eq.${insightId},insight_b_id.eq.${insightId}`);

  const { count: linkedCases } = await service
    .from("insights")
    .select("id", { count: "exact", head: true })
    .eq("related_insight_id", insightId)
    .eq("evidence_type", "case");

  const caseComplete =
    row.evidence_type === "case" &&
    !!(row.situation || row.action || row.outcome || row.lesson);

  const quality = qualityScore({
    tier,
    connectionCount: connectionCount || 0,
    evidenceType: row.evidence_type,
    hasLinkedCase: (linkedCases || 0) > 0,
    caseComplete,
  });
  const corroboration = Math.max(row.corroboration_score ?? 0, CORROBORATION_BASE);
  const badge = badgeForScore(combinedScore(quality, corroboration));

  await service
    .from("insights")
    .update({
      quality_score: quality,
      corroboration_score: corroboration,
      credibility_badge: badge,
      scored_at: new Date().toISOString(),
    })
    .eq("id", insightId);
}

// Corroboration hit — a scored insight was cited/used. Additive only; refreshes
// the badge to reflect the higher combined score. Ineligible/unscored insights
// are skipped (nothing to corroborate yet).
export async function bumpCorroboration(
  service: SupabaseClient,
  insightIds: string[]
): Promise<void> {
  if (insightIds.length === 0) return;
  const { data } = await service
    .from("insights")
    .select("id, quality_score, corroboration_score, corroboration_count, scored_at")
    .in("id", insightIds);
  const rows =
    (data as
      | {
          id: string;
          quality_score: number | null;
          corroboration_score: number | null;
          corroboration_count: number | null;
          scored_at: string | null;
        }[]
      | null) || [];
  for (const r of rows) {
    if (r.quality_score === null || !r.scored_at) continue; // unscored — skip
    const corroboration = Math.min(
      CORROBORATION_MAX,
      (r.corroboration_score ?? CORROBORATION_BASE) + CORROBORATION_STEP
    );
    if (corroboration === r.corroboration_score) continue; // already capped
    const badge = badgeForScore(combinedScore(r.quality_score, corroboration));
    await service
      .from("insights")
      .update({
        corroboration_score: corroboration,
        corroboration_count: (r.corroboration_count ?? 0) + 1,
        credibility_badge: badge,
      })
      .eq("id", r.id);
  }
}
