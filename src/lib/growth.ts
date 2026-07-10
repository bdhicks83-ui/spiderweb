// Phase 8 (Block 5) — Longitudinal Growth Score.
//
// One snapshot per expert per month, combining the per-insight scores with two
// portfolio signals (insight depth, applied-case ratio) into a single headline
// "growth_value" (0–100). Snapshots accumulate so the dashboard can draw a
// simple trend line ("your Spiderweb's value has grown X% over N months").
//
// Locked design: NO recency-decay. This reads the current permanent scores and
// records where they stand this month — it never down-weights older insights.
import type { SupabaseClient } from "@supabase/supabase-js";
import { combinedScore } from "@/lib/insight-score";

// Content length (chars) that earns full "depth" credit.
const DEPTH_TARGET_CHARS = 400;

// Headline composite weights: credibility-led, with depth and applied evidence.
const W_COMBINED = 0.5;
const W_DEPTH = 0.25;
const W_CASE = 0.25;

export type GrowthSnapshot = {
  snapshot_month: string;
  quality_avg: number;
  corroboration_avg: number;
  combined_avg: number;
  insight_depth: number;
  case_evidence_ratio: number;
  growth_value: number;
  approved_count: number;
};

function firstOfMonthUTC(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

const avg = (xs: number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

type Row = {
  id: string;
  content: string | null;
  evidence_type: string | null;
  related_insight_id: string | null;
  quality_score: number | null;
  corroboration_score: number | null;
};

// Compute and UPSERT the current month's snapshot for one expert. Returns the
// snapshot (or null when the expert has no scored insights yet).
export async function computeGrowthSnapshot(
  service: SupabaseClient,
  userId: string
): Promise<GrowthSnapshot | null> {
  const { data } = await service
    .from("insights")
    .select("id, content, evidence_type, related_insight_id, quality_score, corroboration_score")
    .eq("user_id", userId)
    .eq("status", "approved");
  const rows = (data as Row[] | null) || [];
  if (rows.length === 0) return null;

  const scored = rows.filter((r) => r.quality_score !== null);
  if (scored.length === 0) return null;

  const qualities = scored.map((r) => r.quality_score as number);
  const corroborations = scored.map((r) => r.corroboration_score ?? 0);
  const combineds = scored.map((r) =>
    combinedScore(r.quality_score as number, r.corroboration_score ?? 0)
  );

  const quality_avg = Math.round(avg(qualities));
  const corroboration_avg = Math.round(avg(corroborations));
  const combined_avg = Math.round(avg(combineds));

  // Depth: average content length, normalised against the target.
  const insight_depth = Math.round(
    avg(
      scored.map((r) =>
        Math.min(100, ((r.content?.length ?? 0) / DEPTH_TARGET_CHARS) * 100)
      )
    )
  );

  // Applied-evidence ratio: share of PRINCIPLES that have ≥1 case linked to them.
  const principles = rows.filter((r) => r.evidence_type !== "case");
  const casedPrincipleIds = new Set(
    rows
      .filter((r) => r.evidence_type === "case" && r.related_insight_id)
      .map((r) => r.related_insight_id as string)
  );
  const case_evidence_ratio =
    principles.length === 0
      ? 0
      : Math.round(
          (principles.filter((p) => casedPrincipleIds.has(p.id)).length /
            principles.length) *
            100
        );

  const growth_value = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        W_COMBINED * combined_avg + W_DEPTH * insight_depth + W_CASE * case_evidence_ratio
      )
    )
  );

  const snapshot_month = firstOfMonthUTC();
  const snapshot: GrowthSnapshot = {
    snapshot_month,
    quality_avg,
    corroboration_avg,
    combined_avg,
    insight_depth,
    case_evidence_ratio,
    growth_value,
    approved_count: rows.length,
  };

  await service
    .from("growth_snapshots")
    .upsert({ user_id: userId, ...snapshot }, { onConflict: "user_id,snapshot_month" });

  return snapshot;
}
