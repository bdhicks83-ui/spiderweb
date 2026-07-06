// Phase 6 — Consultative Ask, step 2: answer a follow-up.
// POST { sessionId, answer }. Appends the Q&A pair to the session, then lets
// Claude decide: another follow-up (up to MAX_FOLLOWUPS total) or synthesize
// the final recommendation. RLS means a user can only ever load their own
// sessions — no explicit ownership check needed beyond auth.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { nextFollowUp, recommendFromInsights, QAPair } from "@/lib/claude";
import { MAX_FOLLOWUPS, Match, toSources } from "@/lib/ask";

export async function POST(req: NextRequest) {
  try {
    const { sessionId, answer } = await req.json();
    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
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

    // 1. Load the session (RLS scopes this to the logged-in user).
    const { data: session, error: loadError } = await supabase
      .from("ask_sessions")
      .select("id, question, matched_insights, qa_pairs, pending_question, status")
      .eq("id", sessionId)
      .single();

    if (loadError || !session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (session.status !== "active" || !session.pending_question) {
      return NextResponse.json(
        { error: "This session is already complete — ask a new question" },
        { status: 409 }
      );
    }

    const matches = (session.matched_insights as Match[]) || [];
    const contents = matches.map((m) => m.content);
    const qaPairs: QAPair[] = [
      ...((session.qa_pairs as QAPair[]) || []),
      { question: session.pending_question, answer: answer.trim() },
    ];

    // 2. Decide: more context needed, or ready to recommend?
    //    Cap reached or model hiccup (null) → recommend with what we have.
    const remaining = MAX_FOLLOWUPS - qaPairs.length;
    const decision =
      remaining > 0
        ? await nextFollowUp(session.question, contents, qaPairs, remaining)
        : null;

    // 3a. Another follow-up → persist progress, hand the question to the UI.
    if (decision && !decision.done) {
      const { error: updateError } = await supabase
        .from("ask_sessions")
        .update({
          qa_pairs: qaPairs,
          pending_question: decision.question,
          updated_at: new Date().toISOString(),
        })
        .eq("id", session.id);

      if (updateError) {
        return NextResponse.json(
          { error: "Could not save progress", details: updateError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        done: false,
        sessionId: session.id,
        followUp: decision.question,
      });
    }

    // 3b. Enough context → synthesize the final recommendation, grounded
    //     ONLY in the matched insights.
    const recommendation = await recommendFromInsights(
      session.question,
      contents,
      qaPairs
    );
    if (!recommendation) {
      return NextResponse.json(
        { error: "Recommendation synthesis failed — try again" },
        { status: 500 }
      );
    }

    const { error: completeError } = await supabase
      .from("ask_sessions")
      .update({
        qa_pairs: qaPairs,
        pending_question: null,
        status: "complete",
        recommendation,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.id);

    if (completeError) {
      return NextResponse.json(
        { error: "Could not save recommendation", details: completeError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      done: true,
      sessionId: session.id,
      ...recommendation,
      sources: toSources(matches),
    });
  } catch (err) {
    console.error("Unexpected error in ask/answer route:", err);
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}
