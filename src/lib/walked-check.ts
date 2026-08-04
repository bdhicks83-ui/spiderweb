// "Already Walked" (2026-08-04) — capture-time duplicate + conflict check.
//
// While an expert captures their judgment, notice — early, silently, and
// without ever blocking — whether (1) a framework already covers this ground
// (near-duplicate: tell them BEFORE they spend 15 minutes) or (2) their
// position conflicts with an existing framework (let them FINISH — a captured
// conflict is an asset — then open the conflict at completion).
//
// Doctrine (all standing rules, none new):
// - Runs exactly ONCE per capture session, server-side, right after the
//   FIRST rung's answer folds. The pattern_records.walked_check column is
//   both the result and the "already ran" latch. Skipped entirely on
//   /codify?gap= entry (retrieval already failed at 0.75 for that gap — a
//   >=0.90 duplicate is near-impossible; the interrupt would be noise).
// - BONUS path. Raw capture = baseline and fails loudly; this check fails
//   logged+dropped at every rung — embedding, RPC, record read, model call.
//   The capture proceeds as if the feature doesn't exist.
// - No new thresholds. 0.75 = relevance (P-3, measured live) and 0.90 =
//   "same thing" (P-9 gap de-dupe) — reused verbatim, nothing invented.
// - Search goes through the user-scoped SECURITY INVOKER RPC
//   (search_pattern_records_by_query) so the capturing user's RLS scopes it
//   — own records + org complete records, never cross-org. NOT the org
//   SECURITY DEFINER RPC (that one is for service-role paths only).
// - Session text embeds as a QUERY (documents embed as documents — the
//   standing pattern_records rule).
import type { SupabaseClient } from "@supabase/supabase-js";
import { embedText } from "@/lib/voyage";
import {
  classifyWalkedDirection,
  lastWalkedCheckDiagnostic,
  type WalkedDirection,
} from "@/lib/claude";
import {
  CONFLICT_RECORD_COLUMNS,
  formatRecordForConflict,
  type ConflictCandidateRecord,
} from "@/lib/conflict";
import type { PatternFields } from "@/lib/elicitation";

// Reused measured bars — see src/app/api/retrieve/route.ts (0.75, tuned
// live) and src/lib/knowledge-gaps.ts GAP_DEDUPE_COSINE (0.90: "same
// question" vs "relevant"). Fix the QUERY, never these bars.
export const WALKED_RELEVANT_COSINE = 0.75;
export const WALKED_DUPLICATE_COSINE = 0.9;

export type WalkedCheckStatus =
  | "clear" // check ran, nothing at or above 0.75 — the expert never knows
  | "duplicate" // >=0.90, or the model says same_call → soft card
  | "conflict" // model says opposing_call → one-line heads-up, act at completion
  | "skipped" // deliberately not run (gap entry)
  | "error"; // a rung failed — logged + dropped, capture untouched

export type WalkedCheck = {
  status: WalkedCheckStatus;
  checked_at: string;
  similarity?: number;
  match_record_id?: string;
  match_title?: string;
  match_author?: string;
  match_author_id?: string;
  direction?: WalkedDirection;
  territory?: string;
  reason?: string;
  skip_reason?: string;
  diagnostic?: string;
  // Written later by POST /api/codify/walked when the expert acts on the card.
  acted?: "viewed" | "kept_going";
};

export function isWalkedCheck(v: unknown): v is WalkedCheck {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as { status?: unknown }).status === "string"
  );
}

// The accumulated situation text: the expert's first answer in their own
// vocabulary (retrieval queries are raw words — same reason /retrieve embeds
// what the person typed), plus the folded context_summary when it adds
// anything the answer doesn't already say.
export function buildWalkedQueryText(
  firstAnswer: string,
  fields: PatternFields
): string {
  const answer = firstAnswer.trim();
  const summary = (fields.context_summary ?? "").trim();
  if (!summary || answer.toLowerCase().includes(summary.toLowerCase())) {
    return answer;
  }
  return [answer, summary].join("\n\n");
}

function formatCaptureForClassifier(
  firstAnswer: string,
  fields: PatternFields
): string {
  const lines = [
    `The expert's first answer (their own words): ${firstAnswer.trim()}`,
    fields.context_summary ? `Context so far: ${fields.context_summary}` : null,
    fields.situation_type ? `Situation type: ${fields.situation_type}` : null,
    fields.trigger_signal ? `Trigger/signal: ${fields.trigger_signal}` : null,
    fields.judgment ? `Stated approach so far: ${fields.judgment}` : null,
  ];
  return lines.filter((l): l is string => l !== null).join("\n");
}

// Run the one check. NEVER throws — every failure comes back as
// { status: "error", diagnostic } for the caller to log and drop.
export async function runWalkedCheck(
  supabase: SupabaseClient,
  args: { selfRecordId: string; firstAnswer: string; fields: PatternFields }
): Promise<WalkedCheck> {
  const checkedAt = new Date().toISOString();
  try {
    const queryText = buildWalkedQueryText(args.firstAnswer, args.fields);
    if (!queryText) {
      return { status: "error", checked_at: checkedAt, diagnostic: "empty situation text" };
    }

    // 1. Embed the situation as a QUERY.
    const embed = await embedText(queryText, { inputType: "query" });
    if (!embed.ok) {
      return {
        status: "error",
        checked_at: checkedAt,
        diagnostic: `embedding failed (status=${embed.status ?? "?"}, rateLimited=${
          embed.rateLimited ?? false
        }): ${embed.error}`,
      };
    }

    // 2. User-scoped SECURITY INVOKER search — the caller's RLS scopes it.
    const { data: matchesRaw, error: rpcError } = await supabase.rpc(
      "search_pattern_records_by_query",
      { query_embedding: embed.vector, match_count: 5 }
    );
    if (rpcError) {
      return {
        status: "error",
        checked_at: checkedAt,
        diagnostic: `search RPC failed: ${rpcError.message}`,
      };
    }
    const matches = (Array.isArray(matchesRaw) ? matchesRaw : []).filter(
      (m): m is { id: string; similarity: number } =>
        typeof m === "object" &&
        m !== null &&
        typeof (m as { id?: unknown }).id === "string" &&
        typeof (m as { similarity?: unknown }).similarity === "number"
    );
    const top = matches.find((m) => m.id !== args.selfRecordId) ?? null;
    if (!top || top.similarity < WALKED_RELEVANT_COSINE) {
      // Below the relevance bar: nothing happens, the expert never knows.
      return {
        status: "clear",
        checked_at: checkedAt,
        similarity: top?.similarity,
      };
    }

    // 3. Load the neighbor (session client — RLS keeps this org-correct) and
    //    its author name for the card copy.
    const { data: matchRaw, error: matchError } = await supabase
      .from("pattern_records")
      .select(CONFLICT_RECORD_COLUMNS)
      .eq("id", top.id)
      .maybeSingle();
    if (matchError || !matchRaw) {
      return {
        status: "error",
        checked_at: checkedAt,
        similarity: top.similarity,
        diagnostic: `neighbor record ${top.id} unreadable: ${
          matchError?.message ?? "no row (RLS gap?)"
        }`,
      };
    }
    const match = matchRaw as unknown as ConflictCandidateRecord;
    const { data: authorProfile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", match.user_id)
      .maybeSingle();
    const base = {
      checked_at: checkedAt,
      similarity: top.similarity,
      match_record_id: match.id,
      match_title:
        match.framework?.name ?? match.situation_type ?? "an existing framework",
      match_author: authorProfile?.display_name ?? "A colleague",
      match_author_id: match.user_id,
    };

    // 4. >=0.90 → near-duplicate candidate, no model call needed.
    if (top.similarity >= WALKED_DUPLICATE_COSINE) {
      return { status: "duplicate", ...base };
    }

    // 5. 0.75–0.90 → relevant neighbor: ONE model call classifies direction.
    //    Single attempt, fail open — a model hiccup means the check quietly
    //    drops, never a spurious interrupt.
    const judgement = await classifyWalkedDirection(
      formatCaptureForClassifier(args.firstAnswer, args.fields),
      formatRecordForConflict(match)
    );
    if (!judgement) {
      return {
        status: "error",
        ...base,
        diagnostic: `direction check failed open: ${
          lastWalkedCheckDiagnostic ?? "(no diagnostic recorded)"
        }`,
      };
    }
    if (judgement.direction === "same_call") {
      return {
        status: "duplicate",
        ...base,
        direction: judgement.direction,
        territory: judgement.territory ?? undefined,
        reason: judgement.reason ?? undefined,
      };
    }
    if (judgement.direction === "opposing_call") {
      return {
        status: "conflict",
        ...base,
        direction: judgement.direction,
        territory: judgement.territory ?? undefined,
        reason: judgement.reason ?? undefined,
      };
    }
    return {
      status: "clear",
      ...base,
      direction: judgement.direction,
    };
  } catch (e) {
    return {
      status: "error",
      checked_at: checkedAt,
      diagnostic: `threw: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
