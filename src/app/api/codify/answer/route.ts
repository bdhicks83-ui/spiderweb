// P0 — Elicitation Engine, step 2: answer the pending ladder question.
// POST { recordId, answer }.
//
// Order of operations (the order IS the compliance story):
//   1. Scrub the answer — client/individual names stripped BEFORE anything
//      is stored. Scrub failure = FAIL CLOSED: nothing is saved, the user
//      retries. An unscrubbed answer never touches the database.
//   2. One elicitation turn — fold the scrubbed answer into the record
//      fields, get the next ladder question or "done". Model failure falls
//      back to the deterministic ladder question — a session can always
//      converge.
//   3. Completion gate — the model may claim done, but code enforces it:
//      all 6 required fields, which by construction means rung 4 (Signal
//      Detail) AND rung 6 (Boundaries) were reached.
//   4. On completion, generate the branded framework artifact. If that one
//      call fails, the record still completes — /api/codify/frame retries.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { elicitNext, scrubPII, framePattern } from "@/lib/claude";
import {
  EMPTY_FIELDS,
  MAX_QUESTIONS,
  type ElicitQA,
  type PatternFields,
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
} & PatternFields;

const FIELD_COLUMNS =
  "context_summary, context_org_size, context_industry, context_function, " +
  "situation_type, intervention_type, trigger_signal, signal_detail, " +
  "judgment, rationale, boundaries";

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
        `id, qa_pairs, pending_question, pending_rung, status, scrub_status, ${FIELD_COLUMNS}`
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

    // 1. Scrub BEFORE storage. Fail closed: a scrubber hiccup means nothing
    //    is saved and the user simply retries — never "store now, scrub later".
    const scrub = await scrubPII(answer.trim());
    if (!scrub) {
      return NextResponse.json(
        {
          error:
            "Couldn't process that answer safely — nothing was saved. Please try again.",
        },
        { status: 502 }
      );
    }

    const currentFields = mergeFields(EMPTY_FIELDS, row);
    const qaPairs: ElicitQA[] = [
      ...(row.qa_pairs || []),
      {
        rung: row.pending_rung ?? 1,
        question: row.pending_question,
        answer: scrub.scrubbed,
      },
    ];
    const scrubStatus =
      scrub.changed || row.scrub_status === "scrubbed" ? "scrubbed" : "clean";

    // 2. One elicitation turn. Model failure → deterministic ladder fallback.
    //    The model is ALWAYS called (it's the only thing that folds answers
    //    into fields) — but past MAX_QUESTIONS its choice of question is
    //    overridden by the scripted fallback below, so late questions target
    //    only the still-missing required rungs and the session converges.
    const maxRemaining = Math.max(0, MAX_QUESTIONS - qaPairs.length);
    const atCap = qaPairs.length >= MAX_QUESTIONS;
    const step = await elicitNext(
      currentFields,
      qaPairs,
      scrub.scrubbed,
      maxRemaining
    );
    const fields = step ? step.fields : currentFields;

    // 3. Completion gate — code-enforced, never model-trusted. All 6 required
    //    fields ⇒ rung 4 (signal_detail) and rung 6 (boundaries) were reached.
    const complete = isRecordComplete(fields) && (step?.done ?? false);

    if (!complete) {
      // Next question: the model's, or the scripted question for the lowest
      // missing rung when the model stalled, claimed done too early, or the
      // question cap has been reached (cap ⇒ deterministic required-field
      // questions only — no more exploratory rungs).
      const next =
        !atCap && step && !step.done && step.question && step.nextRung
          ? { rung: step.nextRung, question: step.question }
          : fallbackQuestion(fields);

      if (!next) {
        // Every required field is filled but the model didn't say done —
        // treat as complete rather than asking a question we can't pick.
        return completeRecord(supabase, row.id, fields, qaPairs, scrubStatus);
      }

      const { error: updateError } = await supabase
        .from("pattern_records")
        .update({
          ...fields,
          qa_pairs: qaPairs,
          pending_question: next.question,
          pending_rung: next.rung,
          scrub_status: scrubStatus,
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
        scrubbed: scrub.changed,
      });
    }

    return completeRecord(supabase, row.id, fields, qaPairs, scrubStatus);
  } catch (err) {
    console.error("Unexpected error in codify/answer route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}

// 4. Mark the record complete, then generate the branded framework artifact.
//    Artifact failure does NOT undo completion — the UI offers a retry via
//    /api/codify/frame, so the 30 minutes of answers are never at risk.
async function completeRecord(
  supabase: Awaited<ReturnType<typeof createClient>>,
  recordId: string,
  fields: PatternFields,
  qaPairs: ElicitQA[],
  scrubStatus: string
) {
  const { error: completeError } = await supabase
    .from("pattern_records")
    .update({
      ...fields,
      qa_pairs: qaPairs,
      pending_question: null,
      pending_rung: null,
      status: "complete",
      scrub_status: scrubStatus,
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
    const { error: frameworkError } = await supabase
      .from("pattern_records")
      .update({ framework, updated_at: new Date().toISOString() })
      .eq("id", recordId);
    if (!frameworkError) savedFramework = framework;
  }

  return NextResponse.json({
    done: true,
    recordId,
    record: fields,
    rungsReached: rungsReached(fields),
    framework: savedFramework, // null → UI shows a "generate framework" retry
  });
}
