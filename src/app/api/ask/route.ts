// Phase 5 — "Ask Your Spiderweb": question in, grounded answer out.
// POST { question }. Session-aware client (RLS scopes everything to the
// logged-in user). Flow: embed question via Voyage → search_insights_by_query
// RPC → if nothing clears the floor, say so honestly → otherwise synthesize
// an answer from the matched insights only.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { answerFromInsights } from "@/lib/claude";

// Below this similarity, a "match" is noise — better to admit no coverage
// than hallucinate an answer from weakly related insights.
const SIMILARITY_FLOOR = 0.5;
const MATCH_COUNT = 8;

type Match = { id: string; content: string; similarity: number };

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();
    if (!question || typeof question !== "string" || !question.trim()) {
      return NextResponse.json({ error: "Missing question" }, { status: 400 });
    }

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
        input: [question.trim()],
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

    // 3. No real coverage → say so, don't make something up.
    if (strongMatches.length === 0) {
      return NextResponse.json({
        answer: null,
        noMatch: true,
        message:
          "Your Spiderweb doesn't have enough captured expertise on this yet. Capture more insights on this topic and ask again.",
        sources: [],
      });
    }

    // 4. Synthesize an answer grounded ONLY in the matched insights.
    const answer = await answerFromInsights(
      question.trim(),
      strongMatches.map((m) => m.content)
    );

    if (!answer) {
      return NextResponse.json(
        { error: "Answer synthesis failed — try again" },
        { status: 500 }
      );
    }

    // 5. Return the answer plus sources for transparency.
    return NextResponse.json({
      answer,
      noMatch: false,
      sources: strongMatches.map((m) => ({
        id: m.id,
        excerpt:
          m.content.length > 160 ? `${m.content.slice(0, 157)}...` : m.content,
        similarity: Math.round(m.similarity * 100) / 100,
      })),
    });
  } catch (err) {
    console.error("Unexpected error in ask route:", err);
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}
