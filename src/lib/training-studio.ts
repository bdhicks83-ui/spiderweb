// P-7 — On-Demand Training Studio: the server-side plumbing shared by the
// /api/training-studio routes.
//
// The Studio is a NEW FRONT DOOR onto the EXISTING engine, not a second
// engine. Everything here is about wiring a leader-initiated request into
// the P-4A/P-4B machinery so the downstream half is literally the same code:
//
//   • groundingForIssue()  — reuses P-3's embeddings + P-4A's org-pinned
//     search RPC and the SAME 0.75 tuned threshold to find which codified
//     frameworks can honestly ground this training, and therefore WHO the
//     paired experts are. Nothing above threshold ⇒ honest capture-first.
//   • rungForFormat()      — the Studio's formats still map onto the
//     4-rung effort ladder, so a leader request looks like every other
//     prescription to the queue, the ROI rank and the efficacy loop.
//   • the format-outcome log writers — one row per ATTEMPT, stubbed wide for
//     Build 5 (self-learning) and Build 6 (graph feed).
//
// Server-only (pulls @/lib/prescription → @/lib/claude → fs). NEVER import
// this from a client page — import @/lib/training-formats there instead.
import type { SupabaseClient } from "@supabase/supabase-js";
import { embedText } from "@/lib/voyage";
import {
  COVERAGE_SIMILARITY_THRESHOLD,
  PRESCRIPTION_RECORD_COLUMNS,
  formatFrameworksForTraining,
  type PrescriptionSourceRecord,
} from "@/lib/prescription";
import {
  TRAINING_FORMATS,
  type TrainingFormatKey,
} from "@/lib/training-formats";

// How many codified frameworks can ground one on-demand training. Three is
// the same ceiling /retrieve uses — enough for a rich artifact, few enough
// that the grounding stays attributable to named authors.
export const STUDIO_GROUNDING_MATCHES = 3;

// The Studio's formats sit on the same 4-rung effort ladder the rest of the
// engine ranks by, so a leader request is comparable to a detected one.
const FORMAT_RUNG: Record<TrainingFormatKey, number> = {
  job_aid: 1,
  written_framework: 1,
  hands_on_drill: 2,
  teach_back: 2,
  discussion_guide: 3,
  scenario_walkthrough: 3,
};

export function rungForFormat(key: TrainingFormatKey): number {
  return FORMAT_RUNG[key] ?? 2;
}

export type StudioEntity = {
  type: string;
  name: string;
  detail: string | null;
};

/** Plain one-liner for prompts + cards: "die changeover · Press #3". */
export function describeEntities(entities: StudioEntity[]): string {
  if (!entities || entities.length === 0) return "(none named)";
  return entities
    .map((e) => `${e.name}${e.detail ? ` (${e.detail})` : ""} [${e.type}]`)
    .join(" · ");
}

export type StudioGrounding = {
  /** The framework records that will ground generation. */
  records: PrescriptionSourceRecord[];
  /** Paired experts, in prescriptions.experts shape. */
  experts: { user_id: string; record_id: string }[];
  /** Author display names, resolved. */
  authorName: (userId: string) => string;
  /** The full framework surface, formatted for the generation prompt. */
  groundingText: string;
  /** Best similarity seen, for the honest "nothing close" message. */
  topSimilarity: number | null;
  /** True when nothing in the org clears the threshold — capture first. */
  captureFirst: boolean;
  /** Why grounding failed, when it did. */
  note: string | null;
};

/**
 * Find the org's codified material for a leader-described issue.
 *
 * Reuses, verbatim and on purpose:
 *   • embedText(..., inputType: "query") — P-3's query-side embedding
 *   • search_pattern_records_by_query_for_org — P-4A's SECURITY DEFINER,
 *     org-pinned RPC (service-role only; the caller here IS service role)
 *   • COVERAGE_SIMILARITY_THRESHOLD (0.75) — P-3's tuned threshold, not
 *     re-derived
 *
 * Fails HONEST, not open: below threshold means nobody has codified this
 * territory, and the correct product answer is "capture first," never an
 * invented curriculum.
 */
export async function groundingForIssue(
  service: SupabaseClient,
  orgId: string,
  issueQuery: string
): Promise<StudioGrounding> {
  const empty = (note: string): StudioGrounding => ({
    records: [],
    experts: [],
    authorName: () => "an org expert",
    groundingText: "",
    topSimilarity: null,
    captureFirst: true,
    note,
  });

  const embed = await embedText(issueQuery, { inputType: "query" });
  if (!embed.ok) {
    return empty(
      "The library search could not run just now, so this request has no grounding yet — try again in a moment."
    );
  }

  const { data: matchesRaw, error } = await service.rpc(
    "search_pattern_records_by_query_for_org",
    {
      target_org: orgId,
      query_embedding: embed.vector,
      match_count: STUDIO_GROUNDING_MATCHES,
    }
  );
  if (error) {
    return empty(
      "The library search could not run just now, so this request has no grounding yet — try again in a moment."
    );
  }

  const matches = ((matchesRaw as { id: string; similarity: number }[]) || []).filter(
    (m) => m.similarity >= COVERAGE_SIMILARITY_THRESHOLD
  );
  const topAll = ((matchesRaw as { id: string; similarity: number }[]) || [])[0] ?? null;
  if (matches.length === 0) {
    const g = empty(
      topAll
        ? `Nothing codified is close enough to build on (closest match ${Math.round(topAll.similarity * 1000) / 1000}, below the ${COVERAGE_SIMILARITY_THRESHOLD} bar). Capture first: run an elicitation session with whoever handles this well, then come back — the training will be built from their judgment, not from generic advice.`
        : "The library has nothing on this territory yet. Capture first: run an elicitation session with whoever handles this well, then come back."
    );
    g.topSimilarity = topAll?.similarity ?? null;
    return g;
  }

  const ids = matches.map((m) => m.id);
  const { data: recRaw, error: recError } = await service
    .from("pattern_records")
    .select(PRESCRIPTION_RECORD_COLUMNS)
    .eq("org_id", orgId)
    .eq("status", "complete")
    .in("id", ids);
  if (recError) {
    return empty("The matched frameworks could not be loaded — try again in a moment.");
  }
  const records = (recRaw || []) as unknown as PrescriptionSourceRecord[];
  if (records.length === 0) {
    return empty(
      "The matched frameworks could not be loaded — try again in a moment."
    );
  }

  const authorIds = [...new Set(records.map((r) => r.user_id))];
  const nameById = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data: profiles } = await service
      .from("profiles")
      .select("id, display_name")
      .in("id", authorIds);
    for (const p of (profiles || []) as { id: string; display_name: string | null }[]) {
      if (p.display_name) nameById.set(p.id, p.display_name);
    }
  }
  const authorName = (uid: string) => nameById.get(uid) ?? "an org expert";

  // One expert entry per (author, record) — same shape prescriptions.experts
  // carries on the detected path.
  const experts = records.map((r) => ({ user_id: r.user_id, record_id: r.id }));

  return {
    records,
    experts,
    authorName,
    groundingText: formatFrameworksForTraining(records, authorName),
    topSimilarity: matches[0]?.similarity ?? null,
    captureFirst: false,
    note: null,
  };
}

/**
 * A COMPACT grounding view, for the FORMAT AGENT only.
 *
 * Choosing a SHAPE does not need the full framework surface - it needs to
 * know what has been codified and how rich it is. Passing the whole
 * generation-grade text (up to ~24k chars) while ranking all six formats made
 * the recommendation call slow enough to hit the serverless timeout in
 * production: the connection died mid-flight and surfaced to the leader as a
 * network failure, not a clean error. Generation still receives the full
 * surface; only the format CHOICE reads this summary.
 */
export function compactGrounding(g: StudioGrounding): string {
  if (g.captureFirst) {
    return `NOTHING CODIFIED YET on this territory. ${g.note ?? ""}`;
  }
  return g.records
    .map((r, i) => {
      const f = r.framework;
      return [
        `Framework ${i + 1}: ${f?.name ?? "(unnamed)"} - ${f?.tagline ?? ""} (by ${g.authorName(r.user_id)})`,
        `  Signals: ${(f?.signals ?? []).slice(0, 3).join(" | ") || "(none recorded)"}`,
        `  The play, in brief: ${(f?.the_play ?? r.judgment ?? "").slice(0, 280)}`,
        `  Boundaries: ${(f?.boundaries ?? []).slice(0, 2).join(" | ") || "(none recorded)"}`,
      ].join("\n");
    })
    .join("\n\n")
    .slice(0, 4000);
}

/** Short, leader-readable summary of what the training will be built from. */
export function groundingSummary(g: StudioGrounding): string {
  if (g.captureFirst) return g.note ?? "Nothing codified covers this yet.";
  const names = [
    ...new Set(g.records.map((r) => g.authorName(r.user_id))),
  ];
  const titles = g.records
    .map((r) => r.framework?.name)
    .filter((n): n is string => !!n);
  const titlePart = titles.length ? ` — ${titles.map((t) => `"${t}"`).join(", ")}` : "";
  return `Built from ${g.records.length} codified framework${g.records.length === 1 ? "" : "s"} by ${names.join(", ")}${titlePart}.`;
}

// ─── The format-outcome log (Builds 1-4 write it; Build 5 learns from it) ───

export type FormatOutcomeEnhancement = {
  note: string;
  added_by: string;
  added_by_name: string;
  added_at: string;
};

export type LogAttemptInput = {
  orgId: string;
  trainingRequestId: string;
  prescriptionId: string | null;
  trainingId: string | null;
  attempt: number;
  issueType: string | null;
  audienceRole: string | null;
  audienceTeam: string | null;
  audienceExperience: string | null;
  recommendedFormat: string | null;
  chosenFormat: TrainingFormatKey;
  wasOverride: boolean;
  overrideReason: string | null;
  /** The agent's full ranked output for this attempt — Build 5 needs the
   *  reasoning, not just the pick. */
  agentRationale: unknown;
};

/**
 * Record one ATTEMPT on the format-outcome log. Upserts on
 * (training_request_id, attempt) so re-generating the same attempt updates
 * the row rather than doubling it; a NEW format after a miss is a new
 * attempt number, and that pair of rows is the learning signal.
 *
 * Never throws into the caller's happy path — a log write that fails must
 * not lose a leader their generated training. It warns and moves on.
 */
export async function logFormatAttempt(
  service: SupabaseClient,
  input: LogAttemptInput
): Promise<void> {
  const { error } = await service.from("training_format_outcomes").upsert(
    {
      org_id: input.orgId,
      training_request_id: input.trainingRequestId,
      prescription_id: input.prescriptionId,
      training_id: input.trainingId,
      attempt: input.attempt,
      issue_type: input.issueType,
      audience_role: input.audienceRole,
      audience_team: input.audienceTeam,
      audience_experience: input.audienceExperience,
      recommended_format: input.recommendedFormat,
      chosen_format: input.chosenFormat,
      was_override: input.wasOverride,
      override_reason: input.overrideReason,
      agent_rationale: input.agentRationale ?? [],
      outcome: "pending",
    },
    { onConflict: "training_request_id,attempt" }
  );
  if (error) {
    console.warn(`format-outcome log write skipped (attempt ${input.attempt}): ${error.message}`);
  }
}

export type ResolveAttemptInput = {
  trainingRequestId: string;
  attempt: number;
  outcome: "effective" | "did_not_land" | "inconclusive";
  outcomeNote: string;
  evidenceRecordIds?: string[];
  nextFormatRecommended?: string | null;
  nextFormatRationale?: string | null;
};

/** Close out an attempt on the log once the efficacy loop has spoken. */
export async function resolveFormatAttempt(
  service: SupabaseClient,
  input: ResolveAttemptInput
): Promise<void> {
  const { error } = await service
    .from("training_format_outcomes")
    .update({
      outcome: input.outcome,
      outcome_note: input.outcomeNote,
      outcome_evidence_record_ids: input.evidenceRecordIds ?? [],
      next_format_recommended: input.nextFormatRecommended ?? null,
      next_format_rationale: input.nextFormatRationale ?? null,
      resolved_at: new Date().toISOString(),
    })
    .eq("training_request_id", input.trainingRequestId)
    .eq("attempt", input.attempt);
  if (error) {
    console.warn(`format-outcome resolve skipped (attempt ${input.attempt}): ${error.message}`);
  }
}

/** Human-readable label, used in prompts and messages. */
export function formatLabel(key: TrainingFormatKey): string {
  return TRAINING_FORMATS[key].name;
}
