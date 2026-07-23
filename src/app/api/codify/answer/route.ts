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
import { elicitNext, framePattern } from "@/lib/claude";
import { embedPatternRecord } from "@/lib/pattern-embedding";
import {
  EMPTY_FIELDS,
  MAX_QUESTIONS,
  isMethodId,
  isTriggerType,
  isPersona,
  type ElicitQA,
  type PatternFields,
  type MethodId,
  type TriggerType,
  fallbackQuestion,
  isRecordComplete,
  mergeFields,
  rungsReached,
} from "@/lib/elicitation";

type RecordRow = {
  id: string;
  qa_pairs: ElicitQA[];
  pending_question: string | null;
  pending_rung: number | null;
  status: string;
  scrub_status: string;
  trigger_type: string | null;
  method: string | null;
  session_start: string;
} & PatternFields;

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

    // Load the session (RLS scopes this to the logged-in user).
    const { data: record, error: loadError } = await supabase
      .from("pattern_records")
      .select(
        `id, qa_pairs, pending_question, pending_rung, status, scrub_status, trigger_type, method, session_start, ${FIELD_COLUMNS}`
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
      persona
    );
    const fields = step ? step.fields : currentFields;

    // 3. Completion gate — code-enforced, never model-trusted. All 6 required
    //    string fields + a non-empty entity map (field #8) ⇒ rungs 4, 6, and
    //    7 (signal_detail, entity_map, boundaries) were reached.
    const complete = isRecordComplete(fields) && (step?.done ?? false);

    if (!complete) {
      const next =
        !atCap && step && !step.done && step.question && step.nextRung
          ? { rung: step.nextRung, question: step.question }
          : fallbackQuestion(fields, method);

      if (!next) {
        // Every required field is filled but the model didn't say done —
        // treat as complete rather than asking a question we can't pick.
        return completeRecord(supabase, row.id, fields, qaPairs, row.session_start);
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
      });
    }

    return completeRecord(supabase, row.id, fields, qaPairs, row.session_start);
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
  recordId: string,
  fields: PatternFields,
  qaPairs: ElicitQA[],
  sessionStart: string
) {
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

  return NextResponse.json({
    done: true,
    recordId,
    record: fields,
    rungsReached: rungsReached(fields),
    framework: savedFramework, // null → UI shows a "generate framework" retry
    embedded,
  });
}
