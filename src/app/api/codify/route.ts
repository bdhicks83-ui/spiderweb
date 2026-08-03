// P0 / P-0.5 — Elicitation Engine, step 1: start (or resume) a codify session.
//
// POST { captureType } → creates a pattern_records row and returns the
// branch's fixed rung-1 opener (Capture Your Judgment, 2026-08-03: the
// user-facing entry is the 3-way "What are you bringing?" picker; every
// branch runs the CDM engine internally — see src/lib/elicitation.ts).
// No model call for the opener itself — starting must be instant. RLS
// scopes the row to the logged-in user.
//
// Legacy shape POST { triggerType, method } is still accepted (Methodology
// Router, P-0.5 §1 — "offer + suggest, never force") so scripts and any
// in-flight callers keep working; those sessions run exactly as before.
// NOTE: the picker path writes pattern_records.capture_type — run
// supabase/capture-branches.sql before deploying this route.
//
// GET → session guardrails (P-0.5 §Build 3): checks for an existing ACTIVE
// session and returns it if found, so the UI can offer "resume where you
// left off" instead of always starting fresh.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireCanCodify } from "@/lib/floor-guide";
import {
  MAX_QUESTIONS,
  OPENING_QUESTION,
  CAPTURE_BRANCH_TRIGGER,
  CAPTURE_BRANCH_METHOD,
  captureOption,
  isCaptureType,
  isMethodId,
  isTriggerType,
  rungsReached,
  mergeFields,
  EMPTY_FIELDS,
  type CaptureType,
  type ElicitQA,
  type PatternFields,
} from "@/lib/elicitation";

const RESUME_FIELD_COLUMNS =
  "id, qa_pairs, pending_question, pending_rung, trigger_type, method, capture_type, session_start, " +
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
  capture_type: string | null;
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
        captureType: isCaptureType(active.capture_type) ? active.capture_type : null,
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
    const { triggerType, method, captureType } = body ?? {};

    // Capture branch path (the picker) vs legacy Methodology Router path.
    // Exactly one shape must be valid; the branch path derives trigger/method
    // internally so downstream trigger_type consumers see nothing new.
    let resolvedCapture: CaptureType | null = null;
    let resolvedTrigger: string;
    let resolvedMethod: string;
    let openingQuestion: string;
    if (captureType !== undefined) {
      if (!isCaptureType(captureType)) {
        return NextResponse.json({ error: "Invalid captureType" }, { status: 400 });
      }
      resolvedCapture = captureType;
      resolvedTrigger = CAPTURE_BRANCH_TRIGGER;
      resolvedMethod = CAPTURE_BRANCH_METHOD;
      openingQuestion = captureOption(captureType).opening;
    } else {
      if (!isTriggerType(triggerType)) {
        return NextResponse.json({ error: "Missing or invalid triggerType" }, { status: 400 });
      }
      if (!isMethodId(method)) {
        return NextResponse.json({ error: "Missing or invalid method" }, { status: 400 });
      }
      resolvedTrigger = triggerType;
      resolvedMethod = method;
      openingQuestion = OPENING_QUESTION;
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

    const nowIso = new Date().toISOString();
    // capture_type only rides on the picker path — the legacy insert shape is
    // byte-for-byte what it was, so legacy callers work even pre-migration.
    const insertRow: Record<string, unknown> = {
      user_id: user.id,
      qa_pairs: [],
      pending_question: openingQuestion,
      pending_rung: 1,
      status: "active",
      trigger_type: resolvedTrigger,
      method: resolvedMethod,
      session_start: nowIso,
      entity_map: [],
    };
    if (resolvedCapture) insertRow.capture_type = resolvedCapture;
    const { data: record, error: insertError } = await supabase
      .from("pattern_records")
      .insert(insertRow)
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
      question: openingQuestion,
      rung: 1,
      questionNumber: 1,
      maxQuestions: MAX_QUESTIONS,
      triggerType: resolvedTrigger,
      method: resolvedMethod,
      captureType: resolvedCapture,
      sessionStart: record.session_start,
    });
  } catch (err) {
    console.error("Unexpected error in codify route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
