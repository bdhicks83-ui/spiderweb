// Phase 7 — Unified risk score.
//
// Design (signed off 2026-07-08):
//   • ONE risk score per user, not three disconnected triggers. Each fired
//     signal ADDS its weight to a single number that DECAYS over time when the
//     user stays clean.
//   • Signals & weights: voice_mismatch +1, huge_upload +2, background_mismatch +3.
//   • Bands (surface only — NEVER auto-block): >=3 amber, >=6 red.
//   • risk_factors (jsonb) is the source of truth; risk_score is a derived cache
//     (sum of decayed, non-dismissed weights). The admin surface (#4, not built
//     yet) recomputes live on read.
//
// Everything here is best-effort: a failing check fires nothing and never
// blocks extraction or approval.
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkBackgroundMatch } from "@/lib/claude";
import { checkVoiceMismatch } from "@/lib/voice";

export type RiskSignalType = "voice_mismatch" | "huge_upload" | "background_mismatch";

export const RISK_WEIGHTS: Record<RiskSignalType, number> = {
  voice_mismatch: 1,
  huge_upload: 2,
  background_mismatch: 3,
};

// A factor's weight decays linearly to zero over this many days. A clean user
// therefore drifts back to green on their own.
export const RISK_DECAY_DAYS = 30;
export const RISK_AMBER = 3;
export const RISK_RED = 6;
export type RiskBand = "green" | "amber" | "red";

export type RiskFactor = {
  type: RiskSignalType;
  source_id: string | null;
  weight: number;
  reason: string | null;
  confidence?: "low" | "medium" | "high";
  created_at: string;
  dismissed_at?: string | null;
};

// ── huge_upload tuning ──
const HUGE_MIN_HISTORY = 5; // need at least this many prior sized uploads
const HUGE_MULTIPLIER = 3; // fire when > 3× the user's median upload size
const HUGE_MIN_CHARS = 500; // guard: never fire on a tiny absolute size
// ── background_mismatch tuning ──
const MIN_BACKGROUND_SAMPLES = 5; // need an established corpus to judge against
const MAX_BACKGROUND_SAMPLES = 40;
const MAX_BACKGROUND_CHARS = 12000;

// ── pure scoring ──────────────────────────────────────────────────────────

// A factor's current, decayed contribution. Dismissed factors count for zero.
function liveWeight(f: RiskFactor, nowMs: number): number {
  if (f.dismissed_at) return 0;
  const ageDays = (nowMs - new Date(f.created_at).getTime()) / 86_400_000;
  const remaining = Math.max(0, 1 - ageDays / RISK_DECAY_DAYS);
  return f.weight * remaining;
}

export function computeRiskScore(
  factors: RiskFactor[],
  nowMs: number = Date.now()
): number {
  const sum = factors.reduce((acc, f) => acc + liveWeight(f, nowMs), 0);
  return Math.round(sum * 10) / 10;
}

export function riskBand(score: number): RiskBand {
  if (score >= RISK_RED) return "red";
  if (score >= RISK_AMBER) return "amber";
  return "green";
}

// ── persistence ───────────────────────────────────────────────────────────

// Append newly-fired factors to the user's risk_factors log and refresh the
// cached risk_score. Upserts only the risk columns, so it never clobbers the
// credibility columns on the shared row. Best-effort.
export async function addRiskFactors(
  service: SupabaseClient,
  userId: string,
  newFactors: RiskFactor[]
): Promise<void> {
  if (newFactors.length === 0) return;
  const { data } = await service
    .from("credibility_scores")
    .select("risk_factors")
    .eq("user_id", userId)
    .maybeSingle();
  const existing =
    ((data as { risk_factors: RiskFactor[] | null } | null)?.risk_factors) || [];
  const merged = [...existing, ...newFactors];
  await service.from("credibility_scores").upsert({
    user_id: userId,
    risk_factors: merged,
    risk_score: computeRiskScore(merged),
    last_risk_calculated_at: new Date().toISOString(),
  });
}

// ── individual signal checks ─────────────────────────────────────────────

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// huge_upload (+2): this upload is far larger than the user's normal upload.
// Needs >= HUGE_MIN_HISTORY prior sized uploads before it can fire.
export async function checkHugeUpload(
  service: SupabaseClient,
  userId: string,
  thisLength: number,
  sourceId: string
): Promise<RiskFactor | null> {
  try {
    if (thisLength < HUGE_MIN_CHARS) return null;
    const { data } = await service
      .from("sources")
      .select("id, content_length")
      .eq("user_id", userId)
      .not("content_length", "is", null)
      .neq("id", sourceId);
    const priorLengths = ((data as { content_length: number }[] | null) || [])
      .map((r) => r.content_length)
      .filter((n) => typeof n === "number");
    if (priorLengths.length < HUGE_MIN_HISTORY) return null;

    const baseline = median(priorLengths);
    if (baseline <= 0 || thisLength <= baseline * HUGE_MULTIPLIER) return null;

    return {
      type: "huge_upload",
      source_id: sourceId,
      weight: RISK_WEIGHTS.huge_upload,
      reason: `Upload is ${Math.round(
        thisLength / baseline
      )}× the user's typical size (${thisLength} vs ~${Math.round(baseline)} chars).`,
      created_at: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// background_mismatch (+3): the new upload asserts a background that clearly
// contradicts the user's established one. One Claude call, fail-open, fires
// ONLY on matches:false + confidence:high.
export async function checkBackgroundMismatch(
  service: SupabaseClient,
  userId: string,
  text: string,
  sourceId: string
): Promise<RiskFactor | null> {
  try {
    const { data } = await service
      .from("insights")
      .select("content")
      .eq("user_id", userId)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(MAX_BACKGROUND_SAMPLES);
    const contents = ((data as { content: string }[] | null) || [])
      .map((r) => r.content)
      .filter((c) => c?.trim());
    if (contents.length < MIN_BACKGROUND_SAMPLES) return null;

    const background = contents
      .map((c, i) => `${i + 1}. ${c}`)
      .join("\n")
      .slice(0, MAX_BACKGROUND_CHARS);

    const judgement = await checkBackgroundMatch(background, text.slice(0, 8000));
    if (!judgement) return null; // fail-open
    if (judgement.matches || judgement.confidence !== "high") return null;

    return {
      type: "background_mismatch",
      source_id: sourceId,
      weight: RISK_WEIGHTS.background_mismatch,
      reason: judgement.reason,
      confidence: judgement.confidence,
      created_at: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// ── orchestration ─────────────────────────────────────────────────────────

// Run all per-upload risk signals for one freshly-extracted "own" source and
// persist whatever fired. Fully fail-open: any error yields no signal and never
// propagates back into the extraction job.
export async function evaluateUploadRisk(
  service: SupabaseClient,
  userId: string,
  sourceId: string,
  text: string,
  contentLength: number
): Promise<{ fired: RiskSignalType[] }> {
  const fired: RiskFactor[] = [];
  try {
    const [huge, voice, background] = await Promise.all([
      checkHugeUpload(service, userId, contentLength, sourceId),
      checkVoiceMismatch(service, userId, text),
      checkBackgroundMismatch(service, userId, text, sourceId),
    ]);

    if (huge) fired.push(huge);
    // voice-mismatch (+1): fires on any clear style mismatch, regardless of
    // confidence (it's the lowest-weight signal and decays fast).
    if (voice && !voice.matches) {
      fired.push({
        type: "voice_mismatch",
        source_id: sourceId,
        weight: RISK_WEIGHTS.voice_mismatch,
        reason: voice.reason,
        confidence: voice.confidence,
        created_at: new Date().toISOString(),
      });
    }
    if (background) fired.push(background);

    await addRiskFactors(service, userId, fired);
  } catch {
    // swallow — risk monitoring must never break extraction
  }
  return { fired: fired.map((f) => f.type) };
}
