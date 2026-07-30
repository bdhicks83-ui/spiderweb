// FLOOR GUIDE / PHASE B — the data layer for emergent insight.
//
// ⛔ SERVER-ONLY BY CONVENTION, and deliberately NOT server-only by dependency:
// this file imports the Supabase types and nothing else. It does NOT import
// @/lib/claude, so it drags in no `fs` and a client page that imports a type
// from here will still build. The model calls live in the routes that need them
// (detectCandidateInsight, draftSurfacedInsight in @/lib/claude), because the
// moment this file imports claude.ts it becomes untouchable from the client and
// the next person finds that out through a build error.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE THREE IDEAS IN THIS FILE
//
// 1. TIERING. An explicit share ALWAYS queues — somebody chose to spend their
//    own effort telling us, and re-judging that with a model would be insulting
//    and would also throw away the strongest signal in the system. Passive
//    detection queues only at high confidence. Both facts are recorded on the
//    row (`source`) because an admin weighs them differently.
//
// 2. POSITIVE-ONLY. The contributor is told when they're noticed and when they
//    are promoted. They are NEVER told about a dismissal. The rule is enforced
//    in RLS (see the migration, DECISION 1) — the functions here rely on that
//    rather than re-implementing it, so a forgotten filter cannot leak.
//
// 3. HUMAN-IN-THE-LOOP, IN THAT ORDER. stampActed() must run BEFORE the
//    pattern_records insert, because the DB trigger refuses surfaced-by credit
//    on a candidate nobody has acted on. That ordering also fails in the right
//    direction: a crash between the two leaves an acted-on candidate with no
//    framework (visible, re-promotable) instead of a framework nobody approved.
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from "@supabase/supabase-js";

export type CandidateSource = "explicit" | "passive";
export type CandidateStatus = "new" | "reviewing" | "promoted" | "routed" | "dismissed";

/** The surfaces a candidate can come from. `floor_guide` is only ever paired
 *  with source='explicit' — see PASSIVE_SURFACES below for why. */
export type CandidateSurface = "floor_guide" | "retrieve" | "ask";

/**
 * ⭐⭐ THE PRIVACY LINE OF PHASE B, AND IT IS A SHORT LIST ON PURPOSE.
 *
 * Passive detection may run on these surfaces and NO others. Floor Guide is
 * absent, and its absence is the whole decision:
 *
 * Phase A put a promise on the Floor Guide screen — "what you ask here isn't
 * reported to your manager and isn't kept against your name" — and made it true
 * by performing no person-level write on that path. A passive candidate_insight
 * is a named, org-admin-readable row about something a person said. Writing one
 * from Floor Guide would make that sentence false while it was still on screen.
 *
 * So on Floor Guide the detector still RUNS, and when it clears the bar the
 * person is INVITED to share it themselves. Nothing is written until they click.
 * The floor knowledge still gets heard; the promise stays true; and the person
 * keeps the choice, which is the more respectful design anyway.
 *
 * ⚠️ If you add a surface here, you are asserting that surface makes no privacy
 * promise. Check the copy on it before you do.
 */
export const PASSIVE_SURFACES: readonly CandidateSurface[] = ["retrieve", "ask"];

export function passiveAllowedOn(surface: unknown): boolean {
  return (
    typeof surface === "string" &&
    (PASSIVE_SURFACES as readonly string[]).includes(surface)
  );
}

export function isCandidateSurface(v: unknown): v is CandidateSurface {
  return v === "floor_guide" || v === "retrieve" || v === "ask";
}

export const EXPLICIT_DETECTOR = "contributor-explicit-v1";
export const PASSIVE_DETECTOR = "candidate-insight-detect-v1";

export const CANDIDATE_COLUMNS =
  "id, org_id, user_id, source, surface, raw_input, context_note, summary, " +
  "suggested_title, confidence, detector, status, routed_to_user_id, routed_at, " +
  "acted_by, acted_at, promoted_record_id, notified_at, seen_at, created_at, updated_at";

export type CandidateRow = {
  id: string;
  org_id: string;
  user_id: string;
  source: CandidateSource;
  surface: string | null;
  raw_input: string;
  context_note: string | null;
  summary: string | null;
  suggested_title: string | null;
  confidence: number | null;
  detector: string | null;
  status: CandidateStatus;
  routed_to_user_id: string | null;
  routed_at: string | null;
  acted_by: string | null;
  acted_at: string | null;
  promoted_record_id: string | null;
  notified_at: string | null;
  seen_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * The de-dupe key. Same normalisation shape as normalizeGapQuestion (P-9):
 * lowercase, collapse whitespace, drop trailing punctuation. It is a KEY, not a
 * comparison — two people describing the same practice in different words are
 * two candidates, and an admin reading both is the point, not a bug.
 */
export function normalizeCandidateInput(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,;:!?]+$/g, "")
    .trim()
    .slice(0, 2000);
}

export type CreateCandidateInput = {
  orgId: string;
  userId: string;
  source: CandidateSource;
  surface: CandidateSurface | null;
  rawInput: string;
  contextNote?: string | null;
  summary?: string | null;
  suggestedTitle?: string | null;
  confidence?: number | null;
  detector: string;
};

export type CreateCandidateResult =
  | { ok: true; candidate: CandidateRow; created: boolean }
  | { ok: false; error: string };

/**
 * Create a candidate, or quietly return the existing one.
 *
 * Needs a SERVICE-ROLE client: there is no insert policy on candidate_insights
 * for session clients, on purpose — the route decides what a candidate is, not
 * whatever PostgREST is willing to accept from a browser.
 *
 * `notified_at` is stamped at creation for BOTH paths, because both are good
 * news: "you shared it and a person will read it" and "you said something that
 * looked like real judgment." `seen_at` stays null so the badge lights.
 *
 * ⚠️ The upsert targets candidate_insights_dedupe_idx, which is a PLAIN unique
 * index and must stay plain (the P-7 PostgREST trap: onConflict against a
 * partial index cannot be inferred and fails SILENTLY).
 */
export async function createCandidateInsight(
  service: SupabaseClient,
  input: CreateCandidateInput
): Promise<CreateCandidateResult> {
  const raw = input.rawInput.trim();
  if (!raw) return { ok: false, error: "Nothing to share." };
  const inputNorm = normalizeCandidateInput(raw);
  const nowIso = new Date().toISOString();

  // Look first, so a repeat is reported as a repeat rather than silently
  // re-stamping somebody's notification for an idea they already shared.
  const { data: existingRaw } = await service
    .from("candidate_insights")
    .select(CANDIDATE_COLUMNS)
    .eq("org_id", input.orgId)
    .eq("user_id", input.userId)
    .eq("input_norm", inputNorm)
    .maybeSingle();
  const existing = (existingRaw ?? null) as unknown as CandidateRow | null;
  if (existing) return { ok: true, candidate: existing, created: false };

  const { data, error } = await service
    .from("candidate_insights")
    .insert({
      org_id: input.orgId,
      user_id: input.userId,
      source: input.source,
      surface: input.surface,
      raw_input: raw.slice(0, 4000),
      context_note: input.contextNote?.trim()?.slice(0, 1000) ?? null,
      summary: input.summary?.trim()?.slice(0, 400) ?? null,
      suggested_title: input.suggestedTitle?.trim()?.slice(0, 120) ?? null,
      confidence: input.confidence ?? null,
      detector: input.detector,
      status: "new",
      notified_at: nowIso,
      input_norm: inputNorm,
    })
    .select(CANDIDATE_COLUMNS)
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not save that." };
  }
  return { ok: true, candidate: data as unknown as CandidateRow, created: true };
}

export type ActionKind = "promote" | "route" | "dismiss";

export function isActionKind(v: unknown): v is ActionKind {
  return v === "promote" || v === "route" || v === "dismiss";
}

const STATUS_FOR_ACTION: Record<ActionKind, CandidateStatus> = {
  promote: "promoted",
  route: "routed",
  dismiss: "dismissed",
};

export type StampResult =
  | { ok: true; candidate: CandidateRow; alreadyActed: boolean }
  | { ok: false; error: string; status: number };

/**
 * ⭐ THE HUMAN ACTION. Stamps who decided and what they decided.
 *
 * MUST run before any pattern_records insert that carries surfaced-by credit —
 * the DB trigger reads this row and refuses the framework otherwise. That is
 * not an inconvenience to route around; it is the integrity rule doing its job.
 *
 * The notification rules differ by action and this is the positive-only policy
 * in code:
 *   promote / route  → re-stamp notified_at, clear seen_at. The badge lights a
 *                      second time, because this is the moment worth telling
 *                      somebody about.
 *   dismiss          → notified_at is CLEARED. RLS already hides a dismissed row
 *                      from the person, and clearing the stamp means an
 *                      un-dismissal later cannot resurrect a stale "you spotted
 *                      something" from months ago.
 */
export async function stampActed(
  service: SupabaseClient,
  args: {
    candidateId: string;
    orgId: string;
    action: ActionKind;
    actorId: string;
    routedToUserId?: string | null;
  }
): Promise<StampResult> {
  const { data: currentRaw, error: readError } = await service
    .from("candidate_insights")
    .select(CANDIDATE_COLUMNS)
    .eq("id", args.candidateId)
    .eq("org_id", args.orgId)
    .maybeSingle();
  if (readError) return { ok: false, error: readError.message, status: 500 };
  const current = (currentRaw ?? null) as unknown as CandidateRow | null;
  if (!current) return { ok: false, error: "That idea is no longer here.", status: 404 };

  // Idempotence: a double-click must not re-run a promotion and create a second
  // framework. 'reviewing' is not terminal, so it falls through.
  if (current.status === "promoted" || current.status === "dismissed") {
    return { ok: true, candidate: current, alreadyActed: true };
  }
  if (current.status === "routed" && args.action === "route") {
    return { ok: true, candidate: current, alreadyActed: true };
  }

  const nowIso = new Date().toISOString();
  const nextStatus = STATUS_FOR_ACTION[args.action];
  const patch: Record<string, unknown> = {
    status: nextStatus,
    acted_by: args.actorId,
    acted_at: nowIso,
  };
  if (args.action === "route") {
    patch.routed_to_user_id = args.routedToUserId ?? null;
    patch.routed_at = nowIso;
  }
  if (args.action === "dismiss") {
    patch.notified_at = null;
    patch.seen_at = null;
  } else {
    patch.notified_at = nowIso;
    patch.seen_at = null;
  }

  const { data, error } = await service
    .from("candidate_insights")
    .update(patch)
    .eq("id", args.candidateId)
    .eq("org_id", args.orgId)
    .select(CANDIDATE_COLUMNS)
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not record that.", status: 500 };
  }
  return { ok: true, candidate: data as unknown as CandidateRow, alreadyActed: false };
}

/**
 * Put the candidate back if the framework it was promoted into never landed.
 *
 * Called only on the failure path of a promotion. Without it a drafting flake
 * would leave a candidate marked 'promoted' with no framework — invisible to the
 * queue and impossible for the admin to retry, which is the worst of the
 * available failure modes.
 */
export async function revertAction(
  service: SupabaseClient,
  candidateId: string
): Promise<void> {
  const { error } = await service
    .from("candidate_insights")
    .update({
      status: "new",
      acted_by: null,
      acted_at: null,
      routed_to_user_id: null,
      routed_at: null,
      promoted_record_id: null,
    })
    .eq("id", candidateId);
  if (error) {
    console.error(
      `[candidate-insights] revert failed for ${candidateId} — it is stranded as acted-on ` +
        `with no framework and needs a manual status reset: ${error.message}`
    );
  }
}

export async function setPromotedRecord(
  service: SupabaseClient,
  args: { candidateId: string; recordId: string }
): Promise<void> {
  const { error } = await service
    .from("candidate_insights")
    .update({ promoted_record_id: args.recordId })
    .eq("id", args.candidateId);
  if (error) {
    // The framework exists and carries the credit; only the back-link is missing.
    // Log, never fail the request — the admin's action succeeded.
    console.error(`[candidate-insights] back-link failed for ${args.candidateId}: ${error.message}`);
  }
}

/** Mark the contributor's positive signals read. Service-role: there is no
 *  update policy for session clients, and user_id comes from the session — never
 *  from a request body. */
export async function markCandidatesSeen(
  service: SupabaseClient,
  args: { userId: string; candidateId?: string | null }
): Promise<number> {
  let q = service
    .from("candidate_insights")
    .update({ seen_at: new Date().toISOString() })
    .eq("user_id", args.userId)
    .is("seen_at", null)
    .not("notified_at", "is", null)
    // Belt and braces over the RLS rule: nothing about a dismissal is ever
    // touched on the contributor's behalf, so a future policy change cannot
    // turn this into a read receipt for bad news.
    .neq("status", "dismissed");
  if (args.candidateId) q = q.eq("id", args.candidateId);
  const { data, error } = await q.select("id");
  if (error) return 0;
  return (data ?? []).length;
}

/**
 * The vocabulary both model calls need: what this org has already written down.
 *
 * Used by the detector to answer "is this already covered?" and by the drafter to
 * write in the team's own words. Titles and taglines only — the full text of forty
 * frameworks would blow the context and add nothing the comparison needs.
 */
export function vocabularyFromFrameworks(
  rows: { framework: { name?: unknown; tagline?: unknown } | null }[]
): string[] {
  const out: string[] = [];
  for (const r of rows) {
    const name = typeof r.framework?.name === "string" ? r.framework.name.trim() : "";
    if (!name) continue;
    const tagline = typeof r.framework?.tagline === "string" ? r.framework.tagline.trim() : "";
    out.push(tagline ? `${name} — ${tagline}` : name);
  }
  return out.slice(0, 60);
}

/**
 * ⭐ WIN COLUMN CREDIT, WITH NO WIN COLUMN CODE.
 *
 * The Win Column is derived at read time from pattern_records where
 * trigger_type = 'win', by walking entity_map for `role_person` entries. So a
 * promoted framework credits the contributor by simply BEING a win that names
 * them — no new table, no new writer, no change to win-column.ts.
 *
 * That is not a trick. It is what the Win Column has always meant: people other
 * people named as the reason something went right. Somebody whose idea became the
 * team's playbook is exactly that.
 *
 * The credit entry is added HERE rather than by the model, because a credit line
 * that depends on a language model remembering to include it is not a promise.
 */
export function withContributorCredit(
  entities: { type: string; name: string; detail: string | null }[],
  contributorName: string
): { type: string; name: string; detail: string | null }[] {
  const name = contributorName.trim() || "A contributor";
  const already = entities.some(
    (e) => e.type === "role_person" && e.name.trim().toLowerCase() === name.toLowerCase()
  );
  const credit = {
    type: "role_person",
    name,
    // ⚠️ Reads on the Win Column card. Draft copy, pending Brian.
    detail: "Surfaced this from the floor.",
  };
  // Credit first: entity_map has a display order in some surfaces and the person
  // whose idea this was should not be below a laminator.
  return already ? entities : [credit, ...entities];
}

/**
 * The provenance blob. Mirrors graph-codify.ts's `codified_from` shape so the
 * two ways a framework can be born from something other than an interview look
 * the same to anything that reads it later.
 *
 * ⚠️ codified_from.candidate_insight_id is LOAD-BEARING: the DB trigger reads it
 * to prove a human acted. Renaming this key breaks every promotion.
 */
export function buildCodifiedFrom(args: {
  candidateId: string;
  source: CandidateSource;
  surface: string | null;
  confidence: number | null;
  detector: string | null;
  surfacedByUserId: string;
  surfacedByName: string;
  promotedByUserId: string;
  promotedByName: string;
  routedToUserId?: string | null;
  rawInput: string;
}): Record<string, unknown> {
  return {
    kind: "candidate_insight",
    candidate_insight_id: args.candidateId,
    source: args.source,
    surface: args.surface,
    confidence: args.confidence,
    detector: args.detector,
    surfaced_by: { user_id: args.surfacedByUserId, name: args.surfacedByName },
    codified_with: { user_id: args.promotedByUserId, name: args.promotedByName },
    routed_to_user_id: args.routedToUserId ?? null,
    // Their words, kept verbatim next to the framework they became. If anybody
    // ever asks "is this really what they said," the answer is in the row.
    raw_input: args.rawInput.slice(0, 4000),
    codified_at: new Date().toISOString(),
  };
}
