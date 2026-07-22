// P0 — Elicitation Engine, step 1: start a codify session.
// POST {} → creates a pattern_records row and returns the fixed rung-1
// opener. No model call — starting must be instant. RLS scopes the row to
// the logged-in user.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MAX_QUESTIONS, OPENING_QUESTION } from "@/lib/elicitation";

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const { data: record, error: insertError } = await supabase
      .from("pattern_records")
      .insert({
        user_id: user.id,
        qa_pairs: [],
        pending_question: OPENING_QUESTION,
        pending_rung: 1,
        status: "active",
      })
      .select("id")
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
    });
  } catch (err) {
    console.error("Unexpected error in codify route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
