// Phase 6 Slice 2 (Step 9) — Decision Simulation Mode.
// POST { scenario }. Reuses the Ask retrieval engine (embed → search) but
// synthesizes with the simulate-decision prompt: the model reasons THROUGH the
// user's captured heuristics rather than retrieving facts. Every response
// carries a visible confidence flag, and the Confidence Heatmap (Step 8) is
// applied to the analysis text.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { simulateDecision } from "@/lib/claude";
import { Match, toSources, gatherCaseExamples, groundClaims } from "@/lib/ask";

const SIMILARITY_FLOOR = 0.5;
const STRONG_SIMILARITY = 0.7;
const MATCH_COUNT = 8;

export async function POST(req: NextRequest) {
  try {
    const { scenario } = await req.json();
    if (!scenario || typeof scenario !== "string" || !scenario.trim()) {
      return NextResponse.json({ error: "Missing scenario" }, { status: 400 });
    }
    const s = scenario.trim();

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    // Embed the scenario (same model/config as the rest of the app).
    const voyageRes = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      },
      body: JSON.stringify({ input: [s], model: "voyage-large-2" }),
    });
    if (!voyageRes.ok) {
      const errText = await voyageRes.text();
      return NextResponse.json({ error: `Voyage API failed: ${errText}` }, { status: 500 });
    }
    const voyageData = await voyageRes.json();
    const embedding = voyageData.data[0].embedding as number[];
    const embeddingString = `[${embedding.join(",")}]`;

    const { data: matches, error: matchError } = await supabase.rpc(
      "search_insights_by_query",
      { query_embedding: embeddingString, p_user_id: user.id, match_count: MATCH_COUNT }
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

    // No captured heuristics apply → honest low-confidence response, no synthesis.
    if (strongMatches.length === 0) {
      return NextResponse.json({
        analysis: null,
        confidence: "low",
        confidenceStatement:
          "Low confidence: your Spiderweb doesn't have captured heuristics that apply to this scenario yet.",
        sources: [],
        examples: [],
        grounded: [],
      });
    }

    const contents = strongMatches.map((m) => m.content);
    const result = await simulateDecision(s, contents);
    if (!result) {
      return NextResponse.json(
        { error: "Simulation failed — try again." },
        { status: 500 }
      );
    }

    // Coverage guardrail: if fewer than 2 heuristics matched strongly, the
    // scenario is thinly covered — never let it read as high confidence.
    const strongCount = strongMatches.filter((m) => m.similarity >= STRONG_SIMILARITY).length;
    let confidence = result.confidence;
    let confidenceStatement = result.confidenceStatement;
    if (strongCount < 2 && confidence === "high") {
      confidence = "medium";
      confidenceStatement =
        "Medium confidence: only part of this maps onto your captured heuristics — treat the rest as inferred.";
    }

    const examples = await gatherCaseExamples(supabase, strongMatches);

    return NextResponse.json({
      analysis: result.analysis,
      confidence,
      confidenceStatement,
      sources: toSources(strongMatches),
      examples,
      grounded: groundClaims(result.analysis, strongMatches),
    });
  } catch (err) {
    console.error("Unexpected error in simulate route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
