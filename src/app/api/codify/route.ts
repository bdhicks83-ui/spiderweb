// P0 / P-0.5 — Elicitation Engine, step 1: start (or resume) a codify session.
//
// POST { triggerType, method } → creates a pattern_records row and returns
// the fixed rung-1 opener. No model call for the opener itself — starting
// must be instant. RLS scopes the row to the logged-in user. triggerType +
// method come from the Methodology Router screen (P-0.5 §1): the router
// suggests a method for the picked trigger, but the expert may swap to any
// of the 5 — "offer + suggest, never force" — so any valid combination is
// accepted here.
//
// GET → session guardrails (P-0.5 §Build 3): checks for an existing ACTIVE
// session and returns it if found, so the UI can offer "resume where you
// left off" instead of always starting fresh.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  MAX_QUESTIONS,
  OPENING_QUESTION,
  isMethodId,
  isTriggerType,
  rungsReached,
  mergeFields,
  EMPTY_FIELDS,
  type ElicitQA,
  type PatternFields,
} from "@/lib/elicitation";

const RESUME_FIELD_COLUMNS =
  "id, qa_pairs, pending_question, pending_rung, trigger_type, method, session_start, " +
  "context_summary, context_org_size, context_industry, context_function, " +
  "situation_type, intervention_type, trigger_signal, signal_detail, " +
  "judgment, rationale, boundaries, entity_map";

// The Supabase client can't infer a proper row type from a raw multi-column
// select string (falls back to an unhelpful "GenericStringError" type) —
// same reason /api/codify/answer casts its select result. Cast once here too.
type ResumeRow = {
  id: string;
  qa_pairs: ElicitQA[];
  pending_question: string | null;
  pending_rung: number | null;
  trigger_type: string | null;
  method: string | null;
  session_start: string;
} & PatternFields;

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const { data: activeRaw, error } = await supabase
      .from("pattern_records")
      .select(RESUME_FIELD_COLUMNS)
      .eq("status", "active")
      .order("session_start", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: "Could not check for an in-progress session", details: error.message },
        { status: 500 }
      );
    }
    if (!activeRaw) {
      return NextResponse.json({ active: null });
    }
    const active = activeRaw as unknown as ResumeRow;
    if (!active.pending_question) {
      return NextResponse.json({ active: null });
    }

    const fields = mergeFields(EMPTY_FIELDS, active);
    const qaPairs: ElicitQA[] = active.qa_pairs || [];

    return NextResponse.json({
      active: {
        recordId: active.id,
        question: active.pending_question,
        rung: active.pending_rung,
        questionNumber: qaPairs.length + 1,
        maxQuestions: MAX_QUESTIONS,
        rungsReached: rungsReached(fields),
        triggerType: active.trigger_type,
        method: active.method,
        sessionStart: active.session_start,
      },
    });
  } catch (err) {
    console.error("Unexpected error in codify GET route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { triggerType, method } = body ?? {};
    if (!isTriggerType(triggerType)) {
      return NextResponse.json({ error: "Missing or invalid triggerType" }, { status: 400 });
    }
    if (!isMethodId(method)) {
      return NextResponse.json({ error: "Missing or invalid method" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const nowIso = new Date().toISOString();
    const { data: record, error: insertError } = await supabase
      .from("pattern_records")
      .insert({
        user_id: user.id,
        qa_pairs: [],
        pending_question: OPENING_QUESTION,
        pending_rung: 1,
        status: "active",
        trigger_type: triggerType,
        method,
        session_start: nowIso,
        entity_map: [],
      })
      .select("id, session_start")
      .single();

    if (insertError || !record) {
      return NextResponse.json(
        { error: "Could not start session", details: insertError?.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      recordId: record.id,
      question: OPENING_QUESTION,
      rung: 1,
      questionNumber: 1,
      maxQuestions: MAX_QUESTIONS,
      triggerType,
      method,
      sessionStart: record.session_start,
    });
  } catch (err) {
    console.error("Unexpected error in codify route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
