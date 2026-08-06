// P0 / P-0.5 — Elicitation Engine, step 2: answer the pending ladder question.
// POST { recordId, answer }.
//
// Order of operations (the order IS the compliance story):
//   1. Store the answer AS GIVEN. P-0.5 change (DECISION-LOG 2026-07-22):
//      capture-time PII scrubbing is OFF. This system now captures INTERNAL
//      organizational judgment (Track B pivot), and the entity map (field #8)
//      exists specifically to keep named team members under org-scoped RLS —
//      scrubbing the answer before storage would silently strip the very
//      names the entity map is supposed to capture. The PII scrub still
//      exists (`scrubForExport`) but only runs at export time (the PDF
//      route), never at capture.
//   2. One elicitation turn — fold the answer into the record fields
//      (including the entity map), get the next ladder question or "done".
//      Model failure falls back to the deterministic ladder question — a
//      session can always converge. The method + persona (from the expert's
//      profile) shade HOW the question is asked; router logic never changes.
//   3. Completion gate — the model may claim done, but code enforces it: all
//      6 original required fields AND a non-empty entity map (field #8),
//      which by construction means rung 4 (Signal), rung 6 (Entities), and
//      rung 7 (Boundaries) were reached.
//   4. On completion, generate the branded framework artifact and stamp
//      time-to-first-value (session_start -> framework_rendered_at). If the
//      framework call fails, the record still completes — /api/codify/frame
//      retries and stamps TTFV then instead.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
// Service client — ONLY for the Already Walked conflict write at completion
// (framework_conflicts has no insert policy; writes are service-role, same
// as P-2 detection). Everything else in this route stays on the session
// client so RLS keeps doing the work.
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { inngest } from "@/inngest/client";
import { requireCanCodify } from "@/lib/floor-guide";
import { elicitNext, framePattern } from "@/lib/claude";
import { embedPatternRecord } from "@/lib/pattern-embedding";
import { runWalkedCheck, isWalkedCheck, type WalkedCheck } from "@/lib/walked-check";
import {
  EMPTY_FIELDS,
  MAX_QUESTIONS,
  isCaptureType,
  isMethodId,
  isTriggerType,
  isPersona,
  type CaptureType,
  type ElicitQA,
  type PatternFields,
  type MethodId,
  type TriggerType,
  fallbackQuestion,
  isRecordComplete,
  mergeFields,
  rungsReached,
} from "@/lib/elicitation";

// Vercel kills at 60s — pin the ceiling explicitly now that the first turn
// can carry the (bonus, fail-open) Already Walked check alongside elicitNext.
export const maxDuration = 60;

type RecordRow = {
  id: string;
  user_id: string;
  org_id: string | null;
  qa_pairs: ElicitQA[];
  pending_question: string | null;
  pending_rung: number | null;
  status: string;
  scrub_status: string;
  trigger_type: string | null;
  method: string | null;
  capture_type: string | null;
  session_start: string;
  walked_check: unknown;
} & PatternFields;

// What the /codify page renders between interviewer turns (duplicate card /
// one-line conflict heads-up) or on the completion screen (contested line).
type WalkedPayload =
  | { kind: "duplicate"; matchId: string; title: string; author: string }
  | { kind: "conflict"; title: string; author: string };

const FIELD_COLUMNS =
  "context_summary, context_org_size, context_industry, context_function, " +
  "situation_type, intervention_type, trigger_signal, signal_detail, " +
  "judgment, rationale, boundaries, entity_map";

export async function POST(req: NextRequest) {
  try {
    const { recordId, answer } = await req.json();
    if (!recordId || typeof recordId !== "string") {
      return NextResponse.json({ error: "Missing recordId" }, { status: 400 });
    }
    if (!answer || typeof answer !== "string" || !answer.trim()) {
      return NextResponse.json({ error: "Missing answer" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    // ─── FLOOR GUIDE PHASE A — THE INTEGRITY RULE, FRIENDLY HALF ───
    // A contributor may not create canonical judgment. The load-bearing guard
    // is the pattern_records trigger (it covers the service-role paths this
    // gate never sees); this one exists so a person reads a sentence instead of
    // a Postgres exception. See src/lib/floor-guide.ts.
    const codifyGate = await requireCanCodify(supabase);
    if (!codifyGate.ok) {
      return NextResponse.json(
        { error: codifyGate.error, code: codifyGate.code },
        { status: codifyGate.status }
      );
    }

    // Load the session (RLS scopes this to the logged-in user).
    const { data: record, error: loadError } = await supabase
      .from("pattern_records")
      .select(
        `id, user_id, org_id, qa_pairs, pending_question, pending_rung, status, scrub_status, trigger_type, method, capture_type, session_start, walked_check, ${FIELD_COLUMNS}`
      )
      .eq("id", recordId)
      .single();

    if (loadError || !record) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    const row = record as unknown as RecordRow;
    if (row.status !== "active" || !row.pending_question) {
      return NextResponse.json(
        { error: "This record is already complete — start a new one" },
        { status: 409 }
      );
    }
    if (!isMethodId(row.method) || !isTriggerType(row.trigger_type)) {
      return NextResponse.json(
        {
          error:
            "This session predates the methodology router and can't continue — please start a new one.",
        },
        { status: 409 }
      );
    }
    const method: MethodId = row.method;
    const triggerType: TriggerType = row.trigger_type;
    // Capture branch (2026-08-03): selects which approved interview script
    // shades the questions. null = legacy Methodology Router session — the
    // interview runs exactly as it did before this feature.
    const captureType: CaptureType | null = isCaptureType(row.capture_type)
      ? row.capture_type
      : null;

    // Persona shades wording only — never routing/ladder logic. Best-effort:
    // a lookup failure just falls back to neutral phrasing.
    const { data: profile } = await supabase
      .from("profiles")
      .select("persona")
      .eq("id", user.id)
      .maybeSingle();
    const persona = isPersona(profile?.persona) ? profile.persona : null;

    const trimmedAnswer = answer.trim();
    const currentFields = mergeFields(EMPTY_FIELDS, row);
    const qaPairs: ElicitQA[] = [
      ...(row.qa_pairs || []),
      {
        rung: row.pending_rung ?? 1,
        question: row.pending_question,
        answer: trimmedAnswer,
      },
    ];

    // 2. One elicitation turn. Model failure -> deterministic ladder fallback.
    //    The model is ALWAYS called (it's the only thing that folds answers
    //    into fields, including the entity map) — but past MAX_QUESTIONS its
    //    choice of question is overridden by the scripted fallback below, so
    //    late questions target only the still-missing required rungs and the
    //    session converges.
    const maxRemaining = Math.max(0, MAX_QUESTIONS - qaPairs.length);
    const atCap = qaPairs.length >= MAX_QUESTIONS;
    const step = await elicitNext(
      currentFields,
      qaPairs,
      trimmedAnswer,
      maxRemaining,
      method,
      triggerType,
      persona,
      captureType
    );
    const fields = step ? step.fields : currentFields;

    // ─── "ALREADY WALKED" (2026-08-04) — one bonus check per session ───────
    // Exactly once: on the FIRST folded answer (qa_pairs was empty before
    // this turn), and only if the latch is unset — a ?gap= entry pre-writes
    // {status:"skipped"} at session start, and a resumed session past turn 1
    // never re-runs it (cost + noise). BONUS path: every failure inside is
    // logged + dropped and the capture proceeds as if the feature doesn't
    // exist. The raw capture is the baseline and is never delayed by a
    // failure here — runWalkedCheck never throws.
    let walked: WalkedPayload | null = null;
    let walkedCheck: WalkedCheck | null = isWalkedCheck(row.walked_check)
      ? row.walked_check
      : null;
    const isFirstAnswer = (row.qa_pairs || []).length === 0;
    if (isFirstAnswer && row.walked_check == null) {
      try {
        const check = await runWalkedCheck(supabase, {
          selfRecordId: row.id,
          firstAnswer: trimmedAnswer,
          fields,
        });
        walkedCheck = check;
        if (check.status === "error") {
          // Fail open with a REAL diagnostic — never a bare "try again".
          console.error(
            `walked-check dropped for record ${row.id}: ${check.diagnostic ?? "(none)"}`
          );
        }
        // Store the verdict on the session row so completion can act on it
        // without re-computing — best-effort, a write failure is logged and
        // dropped like everything else on this path.
        const { error: walkedWriteError } = await supabase
          .from("pattern_records")
          .update({ walked_check: check })
          .eq("id", row.id);
        if (walkedWriteError) {
          console.error(
            `walked-check store failed for record ${row.id}: ${walkedWriteError.message}`
          );
        }
        if (check.status === "duplicate" && check.match_record_id) {
          walked = {
            kind: "duplicate",
            matchId: check.match_record_id,
            title: check.match_title ?? "an existing framework",
            author: check.match_author ?? "A colleague",
          };
        } else if (check.status === "conflict") {
          walked = {
            kind: "conflict",
            title: check.match_title ?? "an existing framework",
            author: check.match_author ?? "A colleague",
          };
        }
      } catch (e) {
        console.error(`walked-check threw for record ${row.id} (dropped):`, e);
      }
    }

    // 3. Completion gate — code-enforced, never model-trusted. All 6 required
    //    string fields + a non-empty entity map (field #8) ⇒ rungs 4, 6, and
    //    7 (signal_detail, entity_map, boundaries) were reached.
    const complete = isRecordComplete(fields) && (step?.done ?? false);

    if (!complete) {
      const next =
        !atCap && step && !step.done && step.question && step.nextRung
          ? { rung: step.nextRung, question: step.question }
          : fallbackQuestion(fields, method, captureType);

      if (!next) {
        // Every required field is filled but the model didn't say done —
        // treat as complete rather than asking a question we can't pick.
        return completeRecord(supabase, row, fields, qaPairs, walkedCheck);
      }

      const { error: updateError } = await supabase
        .from("pattern_records")
        .update({
          ...fields,
          qa_pairs: qaPairs,
          pending_question: next.question,
          pending_rung: next.rung,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      if (updateError) {
        return NextResponse.json(
          { error: "Could not save progress", details: updateError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        done: false,
        recordId: row.id,
        question: next.question,
        rung: next.rung,
        questionNumber: qaPairs.length + 1,
        maxQuestions: MAX_QUESTIONS,
        rungsReached: rungsReached(fields),
        // Already Walked: null for everyone except the one turn where the
        // check just fired with something to say.
        walked,
      });
    }

    return completeRecord(supabase, row, fields, qaPairs, walkedCheck);
  } catch (err) {
    console.error("Unexpected error in codify/answer route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}

// 4. Mark the record complete, then generate the branded framework artifact
//    and stamp time-to-first-value. Artifact failure does NOT undo
//    completion — the UI offers a retry via /api/codify/frame, so the
//    session's answers are never at risk.
async function completeRecord(
  supabase: Awaited<ReturnType<typeof createClient>>,
  row: RecordRow,
  fields: PatternFields,
  qaPairs: ElicitQA[],
  walkedCheck: WalkedCheck | null
) {
  const recordId = row.id;
  const sessionStart = row.session_start;
  const { error: completeError } = await supabase
    .from("pattern_records")
    .update({
      ...fields,
      qa_pairs: qaPairs,
      pending_question: null,
      pending_rung: null,
      status: "complete",
      updated_at: new Date().toISOString(),
    })
    .eq("id", recordId);

  if (completeError) {
    return NextResponse.json(
      { error: "Could not save the record", details: completeError.message },
      { status: 500 }
    );
  }

  // Only report a framework the DB actually holds — if the save fails, the
  // UI's retry path (/api/codify/frame) regenerates AND persists it, so we
  // must not hand back an artifact the PDF route can't find.
  let savedFramework = null;
  const framework = await framePattern(fields);
  if (framework) {
    const renderedAt = new Date();
    const ttfvSeconds = Math.max(
      0,
      Math.round((renderedAt.getTime() - new Date(sessionStart).getTime()) / 1000)
    );
    const { error: frameworkError } = await supabase
      .from("pattern_records")
      .update({
        framework,
        framework_rendered_at: renderedAt.toISOString(),
        time_to_first_value_seconds: ttfvSeconds,
        updated_at: renderedAt.toISOString(),
      })
      .eq("id", recordId);
    if (!frameworkError) savedFramework = framework;
  }

  // P-3 (Build 2) — auto-embed on codify completion so a new framework is
  // retrievable immediately and never silently left unembedded. Best-effort
  // and non-blocking: a failure NEVER undoes completion (the answers are
  // safe) — it just leaves embedding null, which the /api/embeddings/verify
  // path + the backfill script will catch. We report `embedded` honestly so a
  // failure is never dressed up as success. Requires the P-3 migration; if it
  // hasn't run yet this simply returns embedded:false.
  let embedded = false;
  if (savedFramework) {
    try {
      const embedResult = await embedPatternRecord(supabase, recordId);
      embedded = embedResult.ok;
      if (!embedResult.ok) {
        console.error(`codify/answer: embedding record ${recordId} failed:`, embedResult.error);
      }
    } catch (e) {
      console.error(`codify/answer: embedding record ${recordId} threw:`, e);
    }
  }

  // ─── "ALREADY WALKED" — the conflict path's value beat (2026-08-04) ──────
  // The capture-time signal said opposing_call and the expert finished (a
  // captured conflict is an asset). Now open the conflict through the
  // EXISTING machinery: one framework_conflicts row, the same table P-2
  // detection writes and every CONTESTED badge reads — nothing parallel is
  // built. The capture-time verdict SEEDS the pair (we already know it and
  // why), so no re-discovery scan runs here. Human-gated from here on: the
  // compare-session suggestion renders on the conflict's X-ray view; nothing
  // is scheduled, sent, or notified automatically. Entirely fail-open —
  // completion already succeeded and nothing below may undo or delay it.
  let walkedConflict: {
    kind: "conflict";
    conflictId: string | null;
    otherTitle: string;
    otherAuthor: string;
    managerName: string | null;
  } | null = null;
  if (
    walkedCheck &&
    walkedCheck.status === "conflict" &&
    walkedCheck.match_record_id &&
    row.org_id
  ) {
    try {
      const service = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      // Pair order matches framework_conflict_pair_order (a < b) — one pair,
      // one possible row; an existing row of ANY status is settled history.
      const other = walkedCheck.match_record_id;
      const [aId, bId] = recordId < other ? [recordId, other] : [other, recordId];
      const { data: existing } = await service
        .from("framework_conflicts")
        .select("id")
        .eq("record_a_id", aId)
        .eq("record_b_id", bId)
        .maybeSingle();
      let conflictId: string | null = existing?.id ?? null;
      if (!conflictId) {
        // ⚠️ DRAFT rationale copy — PENDING BRIAN'S WALK (Already Walked).
        const { data: inserted, error: insertError } = await service
          .from("framework_conflicts")
          .insert({
            org_id: row.org_id,
            record_a_id: aId,
            record_b_id: bId,
            territory: walkedCheck.territory ?? null,
            rationale:
              (walkedCheck.reason ??
                "The two frameworks take opposite calls on the same ground.") +
              " Spotted live while the newer framework was being captured — the expert was told and chose to finish. Two experts drawing the line in different places is expertise, not error: the boundary between them is now teachable.",
            detected_by: "walked-check-v1",
          })
          .select("id")
          .single();
        if (insertError) {
          // Unique-index race (pair flagged concurrently) is fine to drop.
          console.warn(
            `walked-check conflict insert skipped (${aId}, ${bId}): ${insertError.message}`
          );
        } else {
          conflictId = inserted?.id ?? null;
        }
      }
      // Manager name for the completion line — best-effort, generic fallback.
      let managerName: string | null = null;
      const { data: me } = await supabase
        .from("profiles")
        .select("manager_id")
        .eq("id", row.user_id)
        .maybeSingle();
      if (me?.manager_id) {
        const { data: mgr } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("id", me.manager_id)
          .maybeSingle();
        managerName = mgr?.display_name ?? null;
      }
      walkedConflict = {
        kind: "conflict",
        conflictId,
        otherTitle: walkedCheck.match_title ?? "an existing framework",
        otherAuthor: walkedCheck.match_author ?? "another expert",
        managerName,
      };
    } catch (e) {
      console.error(
        `walked-check completion conflict path failed for ${recordId} (dropped):`,
        e
      );
    }
  }

  // ─── VALUE LEDGER (2026-08-06) — hand the finished framework to the scorer ──
  // ⭐ WHY A JOB AND NOT A DIRECT WRITE: value_events is APPEND-ONLY, so the
  // `pattern_captured` row cannot be written now and updated with the score
  // later. The Inngest job scores first and emits ONCE, with the score already
  // in quantity_json. A pattern the model can't confidently score is still
  // emitted — with reproduction_hours null, which excludes it from every total
  // and shows up in the visible excluded count.
  //
  // ⚠️ ENTIRELY FAIL-OPEN. Completion has already succeeded; nothing below may
  // undo or delay it. If this send fails the record simply has no ledger event
  // yet, and the backfill picks it up.
  // ─── EXPOSURE BLOCK 2 (2026-08-06) — precedence extraction ────────────────
  // One question: does this framework assert that one observable condition
  // precedes another outcome? Zero is the common and correct answer.
  //
  // Both sends share one wrapper: neither may cost the expert their capture.
  try {
    await Promise.all([
      inngest.send({ name: "ledger/score-pattern", data: { record_id: recordId } }),
      inngest.send({ name: "precedence/extract", data: { record_id: recordId } }),
    ]);
  } catch (e) {
    console.error(`codify/answer: background triggers failed for ${recordId} (dropped):`, e);
  }

  return NextResponse.json({
    done: true,
    recordId,
    record: fields,
    rungsReached: rungsReached(fields),
    framework: savedFramework, // null → UI shows a "generate framework" retry
    embedded,
    // Already Walked conflict path: the completion screen's one extra line.
    walked: walkedConflict,
  });
}
