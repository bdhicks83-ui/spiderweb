// Phase 5 (Step 7) — Expert Credibility Score.
// Pure-ish computation over a user's approved insights + their sources'
// trust tiers + unresolved contradictions. Four 0–100 component metrics
// rolled into one 0–100 overall score (equal weight to start — tunable).
import type { SupabaseClient } from "@supabase/supabase-js";

// Trust tiers on a 1–4 scale (casual note … validated assessment).
const TIER_WEIGHT: Record<string, number> = {
  casual_note: 1,
  ai_inferred: 2,
  strategic_doc: 3,
  validated_assessment: 4,
};
const TIER_COUNT = 4; // number of distinct tiers, for the diversity metric

export type CredibilityBreakdown = {
  overall_score: number;
  source_diversity_pct: number;
  high_confidence_pct: number;
  applied_evidence_ratio: number;
  avg_trust_tier: number;
  approved_insight_count: number;
};

type InsightRow = {
  id: string;
  evidence_type: string | null;
  related_insight_id: string | null;
  source_id: string;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export async function computeCredibility(
  service: SupabaseClient,
  userId: string
): Promise<CredibilityBreakdown> {
  const { data: insightsData } = await service
    .from("insights")
    .select("id, evidence_type, related_insight_id, source_id")
    .eq("user_id", userId)
    .eq("status", "approved");
  const insights = (insightsData as InsightRow[] | null) || [];

  const { data: sourcesData } = await service
    .from("sources")
    .select("id, trust_tier")
    .eq("user_id", userId);
  const tierBySource = new Map<string, string>(
    ((sourcesData as { id: string; trust_tier: string | null }[] | null) || []).map((s) => [
      s.id,
      s.trust_tier || "casual_note",
    ])
  );

  const { data: contra } = await service
    .from("contradiction_events")
    .select("new_insight_id")
    .eq("user_id", userId)
    .eq("resolved", false);
  const unresolved = new Set(
    ((contra as { new_insight_id: string | null }[] | null) || [])
      .map((c) => c.new_insight_id)
      .filter((x): x is string => !!x)
  );

  const total = insights.length;
  if (total === 0) {
    return {
      overall_score: 0,
      source_diversity_pct: 0,
      high_confidence_pct: 0,
      applied_evidence_ratio: 0,
      avg_trust_tier: 0,
      approved_insight_count: 0,
    };
  }

  const principles = insights.filter((i) => i.evidence_type !== "case");
  const cases = insights.filter((i) => i.evidence_type === "case");
  const linkedPrincipleIds = new Set(
    cases.map((c) => c.related_insight_id).filter((x): x is string => !!x)
  );

  // 1. applied_evidence_ratio — principles backed by ≥1 linked case.
  const applied_evidence_ratio = principles.length
    ? (principles.filter((p) => linkedPrincipleIds.has(p.id)).length / principles.length) * 100
    : 0;

  // 2. source_diversity_pct — how many of the 4 trust tiers are represented
  //    among the sources backing approved insights.
  const tiersUsed = new Set(
    insights.map((i) => tierBySource.get(i.source_id) || "casual_note")
  );
  const source_diversity_pct = (tiersUsed.size / TIER_COUNT) * 100;

  // 3. avg_trust_tier — mean tier weight across approved insights, on 0–100.
  const avgWeight =
    insights.reduce(
      (sum, i) => sum + (TIER_WEIGHT[tierBySource.get(i.source_id) || "casual_note"] || 1),
      0
    ) / total;
  const avg_trust_tier = (avgWeight / TIER_COUNT) * 100;

  // 4. high_confidence_pct — approved insights with no unresolved contradiction.
  const high_confidence_pct =
    (insights.filter((i) => !unresolved.has(i.id)).length / total) * 100;

  const overall_score = Math.round(
    (source_diversity_pct + high_confidence_pct + applied_evidence_ratio + avg_trust_tier) / 4
  );

  return {
    overall_score,
    source_diversity_pct: round1(source_diversity_pct),
    high_confidence_pct: round1(high_confidence_pct),
    applied_evidence_ratio: round1(applied_evidence_ratio),
    avg_trust_tier: round1(avg_trust_tier),
    approved_insight_count: total,
  };
}

// Compute + persist to credibility_scores (one row per user).
export async function computeAndStoreCredibility(
  service: SupabaseClient,
  userId: string
): Promise<CredibilityBreakdown> {
  const b = await computeCredibility(service, userId);
  await service.from("credibility_scores").upsert({
    user_id: userId,
    overall_score: b.overall_score,
    source_diversity_pct: b.source_diversity_pct,
    high_confidence_pct: b.high_confidence_pct,
    applied_evidence_ratio: b.applied_evidence_ratio,
    avg_trust_tier: b.avg_trust_tier,
    last_calculated_at: new Date().toISOString(),
  });
  return b;
}
