// P-8 Phase 1 — ⭐ SIGNAL 7 of 7: WHICH RETRIEVAL RESULT WAS ACTUALLY USEFUL.
//
// POST { record_id, kind: 'opened' | 'helped', query?, similarity?, rank?,
//        result_count? }
//
// THIS IS THE ONE SIGNAL THAT DID NOT EXIST ANYWHERE. The other six were
// already being written to some column and merely dead-ended; this one was
// never captured at all. /retrieve has been ranking frameworks by cosine
// similarity and nobody has ever told it whether the top result was the one
// the person actually used. Semantic similarity is a proxy for usefulness, and
// it is the only proxy the retrieval path has ever had.
//
// TWO GRADES OF EVIDENCE, both captured, deliberately not merged:
//   • 'opened'  — IMPLICIT. Cheap, plentiful, weak: opening a framework may
//                 mean it helped, or merely that the title looked promising.
//                 verdict 'neutral' — it is behaviour, not a judgment.
//   • 'helped'  — EXPLICIT. Rare, deliberate, strong: a person went out of
//                 their way to say this answered their question.
//                 verdict 'positive'.
// A reader that cannot tell these apart would drown the strong signal in the
// weak one, so they are separate signal_types and will stay that way.
//
// APPEND-ONLY, INCLUDING REPEATS. Clicking the same card twice writes two
// rows. That is correct for an append-only ledger — the second click really did
// happen — and de-duplication is a READER's decision (count distinct subjects,
// or window by session), not something to bake irreversibly into capture.
//
// ─────────────────────────────────────────────────────────────────────────────
// ⭐⭐ FLOOR GUIDE PHASE A (2026-07-29) — THIS IS THE PRIVACY-CRITICAL WRITER.
//
// This route is the ONE person-level write the retrieval path performs. Every
// row it writes carries actor_id (the asker) and, in payload.query, the exact
// words they typed. learning_signals is ORG-WIDE readable. So on the /retrieve
// surface these rows are the product's best training data — and on the Floor
// Guide surface the very same row is a durable, peer-visible record of what the
// new person did not know. Identical write, opposite meaning.
//
// SO: on a Floor-Guide-confirmed call, NOTHING IS WRITTEN. Not written-then-
// filtered, not written-with-a-null-actor. There is no row.
//
// Why not just null the actor here, the way the gap signal does? Because a gap
// signal describes the ORG ("we have no coverage on this question") and stays
// useful anonymous. This signal describes a PERSON'S JUDGMENT of a result —
// strip the actor and nothing meaningful is left, so an anonymised row would be
// ledger noise bought at the cost of pretending we captured something.
//
// The response still says { success: true }, per the P-8 rule that a telemetry
// control can never fail in a user's face. `suppressed: true` rides along for
// the privacy proof — nothing in the UI reads it, and a suppressed write must
// never look in a log like a writer that quietly died.
// ─────────────────────────────────────────────────────────────────────────────
//
// AUTHORIZATION IS THE READ. The record is loaded through the SESSION client,
// so "org library read" RLS decides whether this caller may signal about it. A
// record they cannot see cannot be signalled about, and org_id comes off the
// row rather than from the request body — a client-supplied org_id would be a
// forgeable ledger.
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { recordLearningSignal, similarityBand } from "@/lib/learning-ledger";
import { emitValueEvent, valueDedupeKey } from "@/lib/value-ledger";
import { logSuppressed, resolveFloorGuideMode } from "@/lib/floor-guide";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RecordRow = {
  id: string;
  org_id: string | null;
  method: string | null;
  trigger_type: string | null;
  situation_type: string | null;
  context_function: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const recordId = typeof body?.record_id === "string" ? body.record_id : "";
    const kind = body?.kind === "helped" ? "helped" : body?.kind === "opened" ? "opened" : null;
    if (!UUID_RE.test(recordId) || !kind) {
      return NextResponse.json(
        { error: "record_id (uuid) and kind ('opened' | 'helped') are required" },
        { status: 400 }
      );
    }
    const query = typeof body?.query === "string" ? body.query.slice(0, 2000) : null;
    const similarity =
      typeof body?.similarity === "number" && Number.isFinite(body.similarity)
        ? Math.max(0, Math.min(1, body.similarity))
        : null;
    const rank = typeof body?.rank === "number" && Number.isFinite(body.rank) ? body.rank : null;
    const resultCount =
      typeof body?.result_count === "number" && Number.isFinite(body.result_count)
        ? body.result_count
        : null;

    const supabase = await createSessionClient();

    // Identity AND privacy mode from one read. See resolveFloorGuideMode() —
    // the flag is a request from the surface, AND-ed with the server's own
    // profiles.floor_guide_active. A client cannot fake its way into either
    // state.
    const mode = await resolveFloorGuideMode(supabase, body?.floor_guide);
    if (!mode) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }
    const { viewer, floorGuide } = mode;

    // ⭐ THE SUPPRESSION. Before the record read, before the service client is
    // constructed, before anything can be written. There is no path from here
    // to an insert.
    if (floorGuide) {
      logSuppressed("retrieve/signal", `learning_signals (${kind})`);
      return NextResponse.json({ success: true, suppressed: true });
    }

    // THE AUTHORIZATION + the feature context, in one read the caller's own RLS
    // scopes. No org_id is ever taken from the request body.
    const { data: recRaw } = await supabase
      .from("pattern_records")
      .select("id, org_id, method, trigger_type, situation_type, context_function")
      .eq("id", recordId)
      .maybeSingle();
    const record = recRaw as unknown as RecordRow | null;
    if (!record || !record.org_id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    await recordLearningSignal(service, {
      orgId: record.org_id,
      sourceSurface: "retrieve",
      signalType: kind === "helped" ? "retrieval_result_used" : "retrieval_result_opened",
      subjectType: "pattern_record",
      subjectId: record.id,
      // Opening is behaviour; "this helped" is a judgment. Only the latter is
      // positive evidence.
      verdict: kind === "helped" ? "positive" : "neutral",
      features: {
        kind,
        similarity: similarity === null ? null : Math.round(similarity * 1000) / 1000,
        // The same three words the card showed the user ("Strong match"), so a
        // future explanation can reuse language they have already seen.
        similarity_band: similarity === null ? null : similarityBand(similarity),
        rank,
        result_count: resultCount,
        method: record.method,
        trigger_type: record.trigger_type,
        situation_type: record.situation_type,
        context_function: record.context_function,
      },
      payload: {
        // The situation the person actually typed. Retrieval quality cannot be
        // learned without knowing what was asked.
        query,
      },
      actorId: viewer.userId,
      actorRole: "member",
    });

    // ─── VALUE LEDGER (2026-08-06) — event 2 of 6: `answer_applied` ─────────
    // ⭐ ONLY 'helped' EMITS. Opening a result is behaviour; "this answered my
    // question" is a judgment, and the REALIZED tier is the one number on
    // /ledger a skeptic reads first. Filling it with implicit clicks would make
    // the honest tier the loudest and the least honest at the same time.
    //
    // The suppression above still governs: a Floor-Guide-confirmed call returns
    // before this line, so no ledger event is written for it either.
    //
    // Additive and fail-open by construction — emitValueEvent never throws, and
    // the response below is identical either way.
    if (kind === "helped") {
      const occurredAt = new Date().toISOString();
      await emitValueEvent(service, {
        orgId: record.org_id,
        eventType: "answer_applied",
        occurredAt,
        subjectType: "retrieval",
        subjectId: record.id,
        contributorId: null,
        // ⭐ ONE PERSON, ONE FRAMEWORK, ONE DAY = ONE AVOIDED INTERRUPTION.
        // learning_signals is append-only INCLUDING repeats — a second click
        // really did happen and that is the right record of behaviour. But the
        // REALIZED tier is the number a skeptic reads first, and it must not be
        // inflatable by clicking the same card again next week.
        dedupeKey: valueDedupeKey({
          eventType: "answer_applied",
          subjectId: record.id,
          actorId: viewer.userId,
          occurredAt,
        }),
        quantity: {
          retrievals: 1,
          // Priced at read time from the org's own interruption rate + minutes.
          interruption_minutes_avoided: null,
          // Stored, deliberately NOT monetized in the realized tier — a
          // probability inside the honest number stops it being honest.
          rework_probability: null,
        },
        basis:
          "Someone searched the library, opened this framework and said it answered their question. " +
          "That is one expert interruption that did not have to happen.",
      });
    }

    // Deliberately says nothing about whether the ledger write succeeded: the
    // ledger never throws into a user's path, and a capture control that could
    // show an error would make the user responsible for our telemetry.
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Unexpected error in retrieve signal route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
