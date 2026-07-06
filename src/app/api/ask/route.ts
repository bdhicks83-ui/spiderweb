// Phase 6 — Consultative Ask, step 1: start a session.
// POST { question }. Flow: embed question via Voyage → search_insights_by_query
// RPC → if nothing clears the floor, say so honestly → otherwise create an
// ask_session (RLS scopes it to the logged-in user) and let Claude decide
// whether a follow-up is needed before recommending. If none is needed, the
// final recommendation comes back immediately.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { nextFollowUp, recommendFromInsights } from "@/lib/claude";
import { MAX_FOLLOWUPS, Match, toSources } from "@/lib/ask";

// Below this similarity, a "match" is noise — better to admit no coverage
// than hallucinate an answer from weakly related insights.
const SIMILARITY_FLOOR = 0.5;
const MATCH_COUNT = 8;

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();
    if (!question || typeof question !== "string" || !question.trim()) {
      return NextResponse.json({ error: "Missing question" }, { status: 400 });
    }
    const q = question.trim();

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    // 1. Embed the question — same model/config as embed-insights.
    const voyageRes = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      },
      body: JSON.stringify({
        input: [q],
        model: "voyage-large-2",
      }),
    });

    if (!voyageRes.ok) {
      const errText = await voyageRes.text();
      return NextResponse.json(
        { error: `Voyage API failed: ${errText}` },
        { status: 500 }
      );
    }

    const voyageData = await voyageRes.json();
    const embedding = voyageData.data[0].embedding as number[];
    const embeddingString = `[${embedding.join(",")}]`;

    // 2. Find the closest approved insights.
    const { data: matches, error: matchError } = await supabase.rpc(
      "search_insights_by_query",
      {
        query_embedding: embeddingString,
        p_user_id: user.id,
        match_count: MATCH_COUNT,
      }
    );

    if (matchError) {
      return NextResponse.json(
        { error: "Search failed", details: matchError.message },
        { status: 500 }
      );
    }

    const strongMatches: Match[] = ((matches as Match[]) || []).filter(
      (m) => m.similarity >= SIMILARITY_FLOOR
    );

    // 3. No real coverage → say so, don't make something up. No session needed.
    if (strongMatches.length === 0) {
      return NextResponse.json({
        noMatch: true,
        message:
          "Your Spiderweb doesn't have enough captured expertise on this yet. Capture more insights on this topic and ask again.",
      });
    }

    const contents = strongMatches.map((m) => m.content);

    // 4. Let Claude decide whether it needs context before recommending.
    //    A null decision (model hiccup) falls back to recommending now —
    //    a slightly less-tailored answer beats a dead end.
    const decision = await nextFollowUp(q, contents, [], MAX_FOLLOWUPS);
    const needsFollowUp = decision !== null && !decision.done;

    // 5. Persist the session so the conversation survives refresh.
    const { data: session, error: insertError } = await supabase
      .from("ask_sessions")
      .insert({
        user_id: user.id,
        question: q,
        matched_insights: strongMatches,
        qa_pairs: [],
        pending_question: needsFollowUp ? decision.question : null,
        status: needsFollowUp ? "active" : "complete",
      })
      .select("id")
      .single();

    if (insertError || !session) {
      return NextResponse.json(
        { error: "Could not start session", details: insertError?.message },
        { status: 500 }
      );
    }

    // 6a. Follow-up needed → hand the question to the UI, one at a time.
    if (needsFollowUp) {
      return NextResponse.json({
        noMatch: false,
        done: false,
        sessionId: session.id,
        followUp: decision.question,
        insightCount: strongMatches.length,
      });
    }

    // 6b. Enough context already → synthesize the recommendation now.
    const recommendation = await recommendFromInsights(q, contents, []);
    if (!recommendation) {
      return NextResponse.json(
        { error: "Recommendation synthesis failed — try again" },
        { status: 500 }
      );
    }

    await supabase
      .from("ask_sessions")
      .update({ recommendation, updated_at: new Date().toISOString() })
      .eq("id", session.id);

    return NextResponse.json({
      noMatch: false,
      done: true,
      sessionId: session.id,
      ...recommendation,
      sources: toSources(strongMatches),
    });
  } catch (err) {
    console.error("Unexpected error in ask route:", err);
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}
