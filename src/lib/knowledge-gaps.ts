// P-9 — KNOWLEDGE GAPS. The single write path for the demand side of the
// flywheel.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE IDEA IN ONE LINE: an unanswered question is a precise, timestamped,
// self-phrased signal of missing expertise — and until this build it was
// thrown away every single time.
//
// /retrieve has always ended a below-threshold search with an honest empty
// state. Honest, and a dead end. This module turns that moment into a durable
// row an org can see, count, pick up, and fill — and then closes the loop back
// to the person who asked.
// ═══════════════════════════════════════════════════════════════════════════
//
// DOCTRINE (all four are load-bearing, none is decoration):
//
//   1. ⭐ A HUMAN FILLS THE GAP. Nothing in this file generates a framework to
//      fill a gap the system itself discovered. That would be the product
//      fabricating expertise, which is the one thing it exists not to do — the
//      entire pitch is that the judgment comes from PEOPLE and carries their
//      name. The system may notice, count, route attention, and get out of the
//      way. It may not answer.
//
//   2. OPPORTUNITY, NEVER FAILURE. Every string this feature surfaces frames a
//      gap as worth filling, not as a search that failed. Amber (attention),
//      never red (error) — consistent with contested badges and Coaching Watch.
//
//   3. THE ORG-WIDE ROW CARRIES A COUNT, NEVER A NAME. knowledge_gaps is
//      readable by the whole org; knowledge_gap_askers is readable only by its
//      own asker. A peer can see THAT a question was asked six times. A peer
//      can never see WHO kept asking. (The P-8 lesson: check the read boundary
//      of the destination table before putting anything on a cross-surface
//      write.)
//
//   5. ⭐ FLOOR GUIDE (Phase A) — A GAP MAY CARRY A COUNT WITH NO ASKER AT ALL.
//      A gap flagged from Floor Guide is written with NO asker row and NO actor
//      on its ledger signal. The org still learns that its onboarding has a hole
//      here — which is coverage information, about the org, not about a person —
//      but nothing records that THIS new hire asked THIS question. The cost is
//      real and accepted: that person gets no /gaps/mine payoff row when it is
//      filled. Recognition is worth less than the promise that made them
//      willing to ask in the first place.
//
//      Suppression happens HERE, at the write, not in a reader. A row written
//      and filtered later is a row the next feature will happily surface.
//
//   4. NEVER THROWS INTO THE CALLER'S HAPPY PATH for anything advisory — the
//      ledger write, the notification stamp, the reconciler. A learning or
//      housekeeping failure can never cost a user their action. Same discipline
//      as recordLearningSignal() and logFormatAttempt(). The one exception is
//      the gap write itself, which the caller explicitly asked for and which
//      therefore reports its own failure honestly.
//
// Server-only: it reads VOYAGE_API_KEY through @/lib/voyage and expects a
// SERVICE-ROLE client. It imports nothing that pulls @/lib/claude (and so no
// fs), but a CLIENT PAGE MUST STILL NOT IMPORT IT.
import type { SupabaseClient } from "@supabase/supabase-js";
import { embedText } from "@/lib/voyage";
import { embedPatternRecord } from "@/lib/pattern-embedding";
import { recordLearningSignal } from "@/lib/learning-ledger";

// ─── The de-dupe threshold ──────────────────────────────────────────────────
//
// ⚠️ THIS IS NOT THE RETRIEVAL THRESHOLD AND MUST NOT BE CONFUSED WITH IT.
// 0.75 (src/app/api/retrieve/route.ts) answers "is this framework RELEVANT to
// this situation?" — a generous bar, because a related framework still helps.
// 0.90 here answers "is this the SAME QUESTION?" — a near-paraphrase bar.
//
// The asymmetry is deliberate and the direction of the error matters: merging
// two genuinely different unanswered questions destroys a demand signal that
// cannot be recovered, while failing to merge two near-duplicates merely makes
// the queue look untidy. When in doubt, do not merge.
//
// Exact normalized-text match is tried FIRST and does most of the work; this is
// the fallback for "same question, different wording." Mirrored as the default
// in find_similar_knowledge_gap() in supabase/p9-knowledge-gaps.sql.
export const GAP_DEDUPE_COSINE = 0.9;

// A claim that produces no framework inside this window goes back on the shelf,
// so one person opening "answer it now" and wandering off cannot park a gap
// forever. There is no assignment/routing in v1 — this is the only thing
// standing in for it, and it is deliberately dumb.
export const CLAIM_STALE_HOURS = 24;

export type GapStatus = "open" | "answering" | "resolved";

export type KnowledgeGapRow = {
  id: string;
  org_id: string;
  question_text: string;
  question_norm: string;
  status: GapStatus;
  asked_count: number;
  first_asked_at: string;
  last_asked_at: string;
  top_similarity: number | null;
  claimed_by: string | null;
  claimed_at: string | null;
  claimed_record_id: string | null;
  resolved_record_id: string | null;
  resolved_training_request_id: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
};

export const GAP_COLUMNS =
  "id, org_id, question_text, question_norm, status, asked_count, " +
  "first_asked_at, last_asked_at, top_similarity, claimed_by, claimed_at, " +
  "claimed_record_id, resolved_record_id, resolved_training_request_id, " +
  "resolved_by, resolved_at, created_at";

/**
 * The cheap, deterministic half of the de-dupe: lowercase, strip punctuation,
 * collapse whitespace. Mirrored by knowledge_gaps.question_norm in
 * supabase/p9-knowledge-gaps.sql — change one, change both.
 *
 * Deliberately NOT stemming or stop-word removal. Aggressive normalization
 * collapses questions that a human would call different ("should we release
 * before inspection" vs "should we release after inspection"), and a wrongly
 * merged gap is unrecoverable.
 */
export function normalizeGapQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1000);
}

export type FlagGapResult =
  | {
      ok: true;
      gapId: string;
      question: string;
      askedCount: number;
      /** true when this question had never been asked before in this org */
      created: boolean;
      /** true when an already-RESOLVED gap had to be reopened (see below) */
      reopened: boolean;
      /** 'exact' | 'semantic' | null — how it de-duped, for the write-up */
      matchedBy: "exact" | "semantic" | null;
      /**
       * FALSE when the asker was deliberately NOT recorded because this came in
       * from Floor Guide. Reported rather than assumed: the caller needs to know
       * not to promise a payoff notification that will never arrive.
       */
      askerRecorded: boolean;
    }
  | { ok: false; error: string };

type FlagGapInput = {
  orgId: string;
  userId: string;
  questionText: string;
  /** The best near-miss similarity from the search that produced this gap. */
  topSimilarity?: number | null;
  /**
   * ⭐ FLOOR GUIDE MODE. TRUE means: record the GAP, record NO PERSON.
   *
   * The caller must derive this SERVER-SIDE from the asker's own
   * profiles.floor_guide_active (resolveFloorGuideMode in
   * src/lib/floor-guide.ts) — never straight off a request body.
   */
  floorGuide?: boolean;
};

/**
 * Record that somebody asked a question the org could not answer.
 *
 * De-dupe order: exact normalized text → semantic (>= GAP_DEDUPE_COSINE) → new
 * row. Either way the asker is recorded, so a gap asked by four people notifies
 * four people when it is filled.
 *
 * REOPENING: if the matching row is already RESOLVED and the question STILL
 * came back as a gap, that is a real diagnostic, not a nuisance — it means the
 * framework that supposedly filled it is not actually retrievable (an embedding
 * that never landed is the usual cause). The row is reopened, its resolution
 * history is KEPT, and the reopen is logged loudly.
 */
export async function flagKnowledgeGap(
  service: SupabaseClient,
  input: FlagGapInput
): Promise<FlagGapResult> {
  const question = input.questionText.trim().slice(0, 2000);
  if (!question) return { ok: false, error: "Question text is required" };
  const norm = normalizeGapQuestion(question);
  if (!norm) return { ok: false, error: "Question text is required" };

  const nowIso = new Date().toISOString();
  const topSimilarity =
    typeof input.topSimilarity === "number" && Number.isFinite(input.topSimilarity)
      ? Math.round(input.topSimilarity * 1000) / 1000
      : null;

  // ── 1. Exact normalized match (any status — the unique index spans all of
  //    them, so a resolved twin must be found here rather than collided with).
  const { data: exactRaw, error: exactError } = await service
    .from("knowledge_gaps")
    .select(GAP_COLUMNS)
    .eq("org_id", input.orgId)
    .eq("question_norm", norm)
    .maybeSingle();
  if (exactError) {
    return { ok: false, error: `Could not check existing gaps: ${exactError.message}` };
  }
  let existing = (exactRaw as unknown as KnowledgeGapRow | null) ?? null;
  let matchedBy: "exact" | "semantic" | null = existing ? "exact" : null;

  // ── 2. Embed. Needed either to store on a new row or to find a semantic
  //    twin. An embed failure is NOT fatal: a gap with no vector still de-dupes
  //    on exact text and is still a real, countable, fillable gap. Losing the
  //    capture entirely would be far worse than losing the fuzzy de-dupe.
  let vector: string | null = null;
  if (!existing) {
    const embed = await embedText(question, { inputType: "query" });
    if (embed.ok) {
      vector = embed.vector;
    } else {
      console.warn(
        `[knowledge-gaps] question embed failed (${embed.error}) — the gap is still recorded, ` +
          `but it can only de-dupe on exact text until it is re-embedded.`
      );
    }

    // ── 3. Semantic twin, only if we have a vector to compare with.
    if (vector) {
      const { data: simRaw, error: simError } = await service.rpc(
        "find_similar_knowledge_gap",
        { p_org_id: input.orgId, p_embedding: vector, p_threshold: GAP_DEDUPE_COSINE }
      );
      if (simError) {
        console.warn(`[knowledge-gaps] semantic de-dupe skipped: ${simError.message}`);
      } else {
        const hit = ((simRaw ?? []) as { id?: unknown }[])[0];
        if (hit && typeof hit.id === "string") {
          const { data: twinRaw } = await service
            .from("knowledge_gaps")
            .select(GAP_COLUMNS)
            .eq("id", hit.id)
            .maybeSingle();
          existing = (twinRaw as unknown as KnowledgeGapRow | null) ?? null;
          if (existing) matchedBy = "semantic";
        }
      }
    }
  }

  let gapId: string;
  let askedCount: number;
  let created = false;
  let reopened = false;

  if (existing) {
    askedCount = (existing.asked_count ?? 1) + 1;
    reopened = existing.status === "resolved";
    if (reopened) {
      console.warn(
        `[knowledge-gaps] gap ${existing.id} was RESOLVED and came back as a gap. The framework ` +
          `that filled it (${existing.resolved_record_id ?? "unknown"}) is not retrieving — check its ` +
          `embedding with verify-p3.mjs and backfill-pattern-embeddings.mjs.`
      );
    }
    const patch: Record<string, unknown> = {
      asked_count: askedCount,
      last_asked_at: nowIso,
      updated_at: nowIso,
    };
    if (reopened) {
      // Reopen, but KEEP resolved_* as history — "this was answered once and
      // the answer isn't reaching people" is the useful shape of this row.
      patch.status = "open";
      patch.claimed_by = null;
      patch.claimed_at = null;
      patch.claimed_record_id = null;
    }
    const { error: updateError } = await service
      .from("knowledge_gaps")
      .update(patch)
      .eq("id", existing.id);
    if (updateError) {
      return { ok: false, error: `Could not record the gap: ${updateError.message}` };
    }
    gapId = existing.id;
  } else {
    const { data: insRaw, error: insError } = await service
      .from("knowledge_gaps")
      .insert({
        org_id: input.orgId,
        question_text: question,
        question_norm: norm,
        question_embedding: vector,
        status: "open",
        asked_count: 1,
        first_asked_at: nowIso,
        last_asked_at: nowIso,
        top_similarity: topSimilarity,
      })
      .select("id")
      .single();
    if (insError || !insRaw) {
      return { ok: false, error: `Could not record the gap: ${insError?.message ?? "no row returned"}` };
    }
    gapId = (insRaw as { id: string }).id;
    askedCount = 1;
    created = true;
  }

  // ── 4. The asker. Advisory: a failure here costs the person their
  //    notification, not their gap, so it warns rather than failing the call.
  //
  //    ⭐ FLOOR GUIDE: SKIPPED ENTIRELY. This is the row that makes a gap
  //    person-attributable — it is what /gaps/mine reads and what would let a
  //    future reader answer "who kept asking about this." A Floor Guide gap has
  //    no such row, so the answer is structurally unavailable rather than
  //    merely unrendered.
  const floorGuide = input.floorGuide === true;
  if (floorGuide) {
    console.log(
      "[floor-guide] suppressed knowledge_gap_askers row on gaps — Floor Guide is private " +
        "by design (no person-level write). The gap itself was still recorded. Not an error."
    );
  } else {
    await upsertAsker(service, { gapId, orgId: input.orgId, userId: input.userId, nowIso });
  }

  // ── 5. Part 5 — the ledger. Demand-side intelligence: what this org keeps
  //    asking and cannot answer. Never throws (recordLearningSignal swallows).
  await recordLearningSignal(service, {
    orgId: input.orgId,
    sourceSurface: "retrieve",
    signalType: "knowledge_gap_opened",
    subjectType: "retrieval_query",
    subjectId: gapId,
    // Negative evidence ABOUT RETRIEVAL COVERAGE — the brain was asked and had
    // nothing. Never about a person.
    verdict: "negative",
    features: {
      top_similarity: topSimilarity,
      asked_count: askedCount,
      is_repeat: !created,
      matched_by: matchedBy,
      reopened,
      question_chars: question.length,
      // A SHAPE, not a person: "this org's onboarding has an uncovered question
      // here" is exactly the generalizable dimension a reader is allowed to key
      // on, and it is the single most useful thing Phase A produces for the
      // buyer. It survives scrubFeatures() because it names no one.
      via_floor_guide: floorGuide,
    },
    payload: { question },
    // ⭐ FLOOR GUIDE: NO ACTOR. learning_signals is ORG-WIDE readable, so an
    // actor_id here plus the question in the payload is a durable, peer-visible
    // record of what a specific new hire did not know. That is precisely the
    // thing Floor Guide promises does not exist. The signal still lands — the
    // org keeps its coverage intelligence — it just has nobody's name on it.
    actorId: floorGuide ? null : input.userId,
    actorRole: floorGuide ? null : "member",
    writtenBy: "knowledge-gaps-v1",
  });

  return {
    ok: true,
    gapId,
    question,
    askedCount,
    created,
    reopened,
    matchedBy,
    askerRecorded: !floorGuide,
  };
}

async function upsertAsker(
  service: SupabaseClient,
  args: { gapId: string; orgId: string; userId: string; nowIso: string }
): Promise<void> {
  try {
    const { data: existing } = await service
      .from("knowledge_gap_askers")
      .select("id, asked_count")
      .eq("gap_id", args.gapId)
      .eq("user_id", args.userId)
      .maybeSingle();
    if (existing) {
      const row = existing as unknown as { id: string; asked_count: number };
      const { error } = await service
        .from("knowledge_gap_askers")
        .update({ asked_count: (row.asked_count ?? 1) + 1, last_asked_at: args.nowIso })
        .eq("id", row.id);
      if (error) console.warn(`[knowledge-gaps] asker update skipped: ${error.message}`);
      return;
    }
    const { error } = await service.from("knowledge_gap_askers").insert({
      gap_id: args.gapId,
      org_id: args.orgId,
      user_id: args.userId,
      asked_count: 1,
      first_asked_at: args.nowIso,
      last_asked_at: args.nowIso,
    });
    if (error) console.warn(`[knowledge-gaps] asker insert skipped: ${error.message}`);
  } catch (err) {
    console.warn(
      `[knowledge-gaps] asker write threw and was swallowed: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}

/** Somebody picked this gap up. No assignment logic — this is a soft claim. */
export async function claimGap(
  service: SupabaseClient,
  args: { gapId: string; orgId: string; userId: string }
): Promise<{ ok: true; gap: KnowledgeGapRow } | { ok: false; error: string; status: number }> {
  const { data: raw, error } = await service
    .from("knowledge_gaps")
    .select(GAP_COLUMNS)
    .eq("id", args.gapId)
    .eq("org_id", args.orgId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message, status: 500 };
  const gap = (raw as unknown as KnowledgeGapRow | null) ?? null;
  if (!gap) return { ok: false, error: "Gap not found", status: 404 };
  if (gap.status === "resolved") {
    return { ok: true, gap };
  }
  const nowIso = new Date().toISOString();
  const { data: updRaw, error: updError } = await service
    .from("knowledge_gaps")
    .update({
      status: "answering",
      claimed_by: args.userId,
      claimed_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", gap.id)
    .select(GAP_COLUMNS)
    .single();
  if (updError || !updRaw) {
    return { ok: false, error: updError?.message ?? "Could not claim the gap", status: 500 };
  }
  return { ok: true, gap: updRaw as unknown as KnowledgeGapRow };
}

export type ResolveGapResult =
  | {
      ok: true;
      gap: KnowledgeGapRow;
      alreadyResolved: boolean;
      embedded: boolean;
      askersNotified: number;
      note: string;
    }
  | { ok: false; error: string; status: number };

/**
 * A codified framework now covers this gap.
 *
 * The record must be COMPLETE, carry a framework artifact, and belong to the
 * same org — a gap "filled" by an in-progress session would be a lie the queue
 * then tells everyone.
 *
 * ⚠️ EMBEDDING RUNS AFTER THE WRITE, ALWAYS. A framework that fills a gap but
 * never gets a vector is invisible to the very query that created the gap — the
 * loop would look closed and would not be. The reseed step is historically
 * unreliable (see MASTER-STATE), so this embeds explicitly and REPORTS the
 * result honestly rather than assuming.
 */
export async function resolveGapWithRecord(
  service: SupabaseClient,
  args: {
    gapId: string;
    orgId: string;
    recordId: string;
    userId: string;
    trainingRequestId?: string | null;
  }
): Promise<ResolveGapResult> {
  const { data: gapRaw, error: gapError } = await service
    .from("knowledge_gaps")
    .select(GAP_COLUMNS)
    .eq("id", args.gapId)
    .eq("org_id", args.orgId)
    .maybeSingle();
  if (gapError) return { ok: false, error: gapError.message, status: 500 };
  const gap = (gapRaw as unknown as KnowledgeGapRow | null) ?? null;
  if (!gap) return { ok: false, error: "Gap not found", status: 404 };
  if (gap.status === "resolved") {
    return {
      ok: true,
      gap,
      alreadyResolved: true,
      embedded: true,
      askersNotified: 0,
      note: "This gap was already filled.",
    };
  }

  const { data: recRaw, error: recError } = await service
    .from("pattern_records")
    .select("id, org_id, status, framework, embedded_at, user_id")
    .eq("id", args.recordId)
    .maybeSingle();
  if (recError) return { ok: false, error: recError.message, status: 500 };
  const record = recRaw as unknown as {
    id: string;
    org_id: string | null;
    status: string | null;
    framework: unknown;
    embedded_at: string | null;
    user_id: string;
  } | null;
  if (!record) return { ok: false, error: "Framework not found", status: 404 };
  if (record.org_id !== args.orgId) {
    return { ok: false, error: "That framework belongs to a different org", status: 403 };
  }
  if (record.status !== "complete" || !record.framework) {
    return {
      ok: false,
      error: "That capture session isn't finished yet — finish it and the gap closes with it.",
      status: 409,
    };
  }

  // ── The embedding, explicitly. Reported honestly either way.
  let embedded = !!record.embedded_at;
  if (!embedded) {
    const embed = await embedPatternRecord(service, record.id);
    embedded = embed.ok;
    if (!embed.ok) {
      console.warn(
        `[knowledge-gaps] embed failed for the framework filling gap ${gap.id}: ${embed.error} — ` +
          `run backfill-pattern-embeddings.mjs then verify-p3.mjs, or the gap will re-open on the next ask.`
      );
    }
  }

  const nowIso = new Date().toISOString();
  const { data: updRaw, error: updError } = await service
    .from("knowledge_gaps")
    .update({
      status: "resolved",
      resolved_record_id: record.id,
      resolved_training_request_id: args.trainingRequestId ?? gap.resolved_training_request_id ?? null,
      resolved_by: args.userId,
      resolved_at: nowIso,
      claimed_record_id: gap.claimed_record_id ?? record.id,
      updated_at: nowIso,
    })
    .eq("id", gap.id)
    .select(GAP_COLUMNS)
    .single();
  if (updError || !updRaw) {
    return { ok: false, error: updError?.message ?? "Could not close the gap", status: 500 };
  }
  const resolved = updRaw as unknown as KnowledgeGapRow;

  // ── Part 4: tell the people who asked. Advisory — never fails the fill.
  const askersNotified = await notifyAskers(service, gap.id, nowIso);

  // ── Part 5: the other half of the ledger entry.
  const daysOpen = Math.max(
    0,
    Math.round(
      (new Date(nowIso).getTime() - new Date(gap.first_asked_at).getTime()) / 86_400_000
    )
  );
  await recordLearningSignal(service, {
    orgId: args.orgId,
    sourceSurface: "codify",
    signalType: "knowledge_gap_filled",
    subjectType: "retrieval_query",
    subjectId: gap.id,
    verdict: "positive",
    features: {
      asked_count: gap.asked_count,
      days_open: daysOpen,
      askers_notified: askersNotified,
      had_training: !!(args.trainingRequestId ?? gap.resolved_training_request_id),
      embedded,
    },
    payload: { question: gap.question_text, record_id: record.id },
    actorId: args.userId,
    actorRole: "expert",
    writtenBy: "knowledge-gaps-v1",
  });

  return {
    ok: true,
    gap: resolved,
    alreadyResolved: false,
    embedded,
    askersNotified,
    note: embedded
      ? "Filled, embedded, and retrievable — the same question now returns this framework."
      : "Filled, but the embedding write failed. Run backfill-pattern-embeddings.mjs then verify-p3.mjs, or this question will still come back as a gap.",
  };
}

async function notifyAskers(
  service: SupabaseClient,
  gapId: string,
  nowIso: string
): Promise<number> {
  try {
    const { data, error } = await service
      .from("knowledge_gap_askers")
      .update({ notified_at: nowIso })
      .eq("gap_id", gapId)
      .is("notified_at", null)
      .select("id");
    if (error) {
      console.warn(`[knowledge-gaps] asker notification skipped: ${error.message}`);
      return 0;
    }
    return ((data ?? []) as { id: string }[]).length;
  } catch (err) {
    console.warn(
      `[knowledge-gaps] asker notification threw and was swallowed: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return 0;
  }
}

/**
 * Attach an on-demand training request to a gap, AFTER the framework already
 * filled it.
 *
 * The order matters and is deliberate: a gap is closed by CODIFIED JUDGMENT,
 * never by a training artifact. Training is the optional second step — the same
 * judgment reshaped for the people who need to absorb it — and it is recorded
 * here so the original asker gets pointed at both.
 *
 * Advisory: never fails the caller's action.
 */
export async function attachTrainingToGap(
  service: SupabaseClient,
  args: { gapId: string; orgId: string; trainingRequestId: string }
): Promise<boolean> {
  try {
    const { error } = await service
      .from("knowledge_gaps")
      .update({
        resolved_training_request_id: args.trainingRequestId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", args.gapId)
      .eq("org_id", args.orgId);
    if (error) {
      console.warn(`[knowledge-gaps] training attach skipped: ${error.message}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(
      `[knowledge-gaps] training attach threw and was swallowed: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return false;
  }
}

export type ReconcileSummary = { resolved: number; released: number };

/**
 * ⭐ THE SELF-HEAL. Run on every read of the queue.
 *
 * WHY THIS EXISTS INSTEAD OF A HOOK IN THE CODIFY PIPELINE: "answer it now"
 * hands the person off to /codify, which is a multi-turn interview they may
 * finish minutes later, in another tab, or after a refresh. A client-side
 * "now mark it resolved" call is exactly the kind of close-the-loop step that
 * silently doesn't happen — the tab gets closed, and the queue lies. Deriving
 * the link at READ time from state that is already durable (a claim, and a
 * completed framework by that claimer after that claim) cannot be missed.
 *
 * It also releases stale claims, so a gap someone opened and abandoned goes
 * back on the shelf rather than sitting in 'answering' forever.
 *
 * ⚠️ THE KNOWN IMPRECISION, STATED PLAINLY: if the claimer codifies something
 * UNRELATED between claiming and finishing, the reconciler links the wrong
 * framework. At pilot scale that is a rounding error (you clicked "answer it
 * now" and then captured a framework — that IS the answer), and the explicit
 * "link a different framework" action on the gap page is the manual override.
 * If it ever bites at scale, the fix is a similarity check between the gap
 * question and the new record, not a client-side callback.
 *
 * Never throws — a reconciler failure must not take down the queue.
 */
export async function reconcileAnsweringGaps(
  service: SupabaseClient,
  orgId: string
): Promise<ReconcileSummary> {
  const summary: ReconcileSummary = { resolved: 0, released: 0 };
  try {
    const { data: raw, error } = await service
      .from("knowledge_gaps")
      .select(GAP_COLUMNS)
      .eq("org_id", orgId)
      .eq("status", "answering");
    if (error) {
      console.warn(`[knowledge-gaps] reconcile skipped: ${error.message}`);
      return summary;
    }
    const gaps = (raw ?? []) as unknown as KnowledgeGapRow[];
    const nowMs = Date.now();

    for (const gap of gaps) {
      if (!gap.claimed_by || !gap.claimed_at) continue;

      // (a) An explicitly linked record that is now finished.
      let recordId: string | null = null;
      if (gap.claimed_record_id) {
        const { data: recRaw } = await service
          .from("pattern_records")
          .select("id, status, framework")
          .eq("id", gap.claimed_record_id)
          .maybeSingle();
        const rec = recRaw as unknown as { id: string; status: string | null; framework: unknown } | null;
        if (rec && rec.status === "complete" && rec.framework) recordId = rec.id;
      }

      // (b) Otherwise: the newest framework this claimer completed since they
      //     claimed it.
      if (!recordId) {
        const { data: candRaw } = await service
          .from("pattern_records")
          .select("id, framework, created_at")
          .eq("org_id", orgId)
          .eq("user_id", gap.claimed_by)
          .eq("status", "complete")
          .gte("created_at", gap.claimed_at)
          .order("created_at", { ascending: false })
          .limit(1);
        const cand = ((candRaw ?? []) as unknown as { id: string; framework: unknown }[])[0];
        if (cand && cand.framework) recordId = cand.id;
      }

      if (recordId) {
        const res = await resolveGapWithRecord(service, {
          gapId: gap.id,
          orgId,
          recordId,
          userId: gap.claimed_by,
        });
        if (res.ok && !res.alreadyResolved) summary.resolved++;
        continue;
      }

      // (c) Stale claim → back on the shelf.
      const ageHours = (nowMs - new Date(gap.claimed_at).getTime()) / 3_600_000;
      if (ageHours >= CLAIM_STALE_HOURS) {
        const { error: relError } = await service
          .from("knowledge_gaps")
          .update({
            status: "open",
            claimed_by: null,
            claimed_at: null,
            claimed_record_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", gap.id);
        if (!relError) summary.released++;
      }
    }
  } catch (err) {
    console.warn(
      `[knowledge-gaps] reconcile threw and was swallowed: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
  return summary;
}
