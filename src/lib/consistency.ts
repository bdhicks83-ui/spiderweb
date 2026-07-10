// Phase 8 (Block 2) — NON-BLOCKING consistency detection.
//
// Runs server-side on the approval path (not before it). The insight is
// already approved; if it directly contradicts an established same-topic
// pattern we flag needs_explanation on it — we never block. Fails open: any
// hiccup leaves the insight un-flagged (treated as consistent).
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkConsistency } from "@/lib/claude";

// Only insights this topically close count as "same topic" worth checking.
const TOPIC_FLOOR = 0.55;
const MATCH_COUNT = 8;

export type ContradictionFinding = {
  contradicts: boolean;
  contradictedInsightId: string | null;
  pattern: string | null;
};

const NONE: ContradictionFinding = {
  contradicts: false,
  contradictedInsightId: null,
  pattern: null,
};

// Detect whether `content` (already embedded as `embeddingString`) contradicts
// one of the user's approved insights. `service` is a service-role client.
export async function detectContradiction(
  service: SupabaseClient,
  userId: string,
  insightId: string,
  content: string,
  embeddingString: string
): Promise<ContradictionFinding> {
  try {
    const { data: matches, error } = await service.rpc(
      "search_insights_by_query",
      { query_embedding: embeddingString, p_user_id: userId, match_count: MATCH_COUNT }
    );
    if (error) return NONE;

    type M = { id: string; content: string; similarity: number };
    const candidates = ((matches as M[]) || []).filter(
      (m) => m.id !== insightId && m.similarity >= TOPIC_FLOOR
    );
    if (candidates.length === 0) return NONE;

    const result = await checkConsistency(
      content,
      candidates.map((c) => c.content)
    );
    if (!result || !result.contradicts) return NONE;

    const contradicted =
      result.contradictedIndex != null
        ? candidates[result.contradictedIndex - 1]
        : candidates[0];

    return {
      contradicts: true,
      contradictedInsightId: contradicted?.id ?? null,
      pattern: result.existingPattern,
    };
  } catch {
    return NONE; // fail open — never let a flaky check disrupt approval
  }
}
