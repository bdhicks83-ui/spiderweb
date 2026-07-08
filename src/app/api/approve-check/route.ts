// Phase 5 — Step 3: consistency / integrity pre-approval check.
// POST { insightId }. Embeds the pending insight, finds the user's closest
// APPROVED insights (same-topic candidates), and asks Claude whether the new
// one directly contradicts an established pattern.
//   → { verdict: 'consistent' }                     (approve normally)
//   → { verdict: 'contradiction', pattern, contradictedInsightId }
//
// Fails OPEN: any embedding/search/model hiccup returns 'consistent' so a
// transient error never blocks the user from approving their own insight.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkConsistency } from "@/lib/claude";

// Only insights this topically close count as "the same topic" and are worth
// checking for a stance contradiction.
const TOPIC_FLOOR = 0.55;
const MATCH_COUNT = 8;

export async function POST(req: NextRequest) {
  try {
    const { insightId } = await req.json();
    if (!insightId || typeof insightId !== "string") {
      return NextResponse.json({ error: "Missing insightId" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    // Load the pending insight (RLS scopes to the owner).
    const { data: insight, error: loadError } = await supabase
      .from("insights")
      .select("id, content")
      .eq("id", insightId)
      .single();
    if (loadError || !insight) {
      return NextResponse.json({ error: "Insight not found" }, { status: 404 });
    }

    // Embed the candidate content — same model/config as embed-insights.
    const voyageRes = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      },
      body: JSON.stringify({ input: [insight.content], model: "voyage-large-2" }),
    });
    if (!voyageRes.ok) {
      return NextResponse.json({ verdict: "consistent" }); // fail open
    }
    const voyageData = await voyageRes.json();
    const embedding = voyageData.data[0].embedding as number[];
    const embeddingString = `[${embedding.join(",")}]`;

    // Closest approved insights (the pending one isn't approved, so no self-match).
    const { data: matches, error: matchError } = await supabase.rpc(
      "search_insights_by_query",
      { query_embedding: embeddingString, p_user_id: user.id, match_count: MATCH_COUNT }
    );
    if (matchError) {
      return NextResponse.json({ verdict: "consistent" }); // fail open
    }

    type M = { id: string; content: string; similarity: number };
    const candidates = ((matches as M[]) || [])
      .filter((m) => m.id !== insight.id && m.similarity >= TOPIC_FLOOR);

    if (candidates.length === 0) {
      return NextResponse.json({ verdict: "consistent" });
    }

    const result = await checkConsistency(
      insight.content,
      candidates.map((c) => c.content)
    );

    // Model hiccup → fail open.
    if (!result || !result.contradicts) {
      return NextResponse.json({ verdict: "consistent" });
    }

    const contradicted =
      result.contradictedIndex != null
        ? candidates[result.contradictedIndex - 1]
        : candidates[0];

    return NextResponse.json({
      verdict: "contradiction",
      pattern: result.existingPattern,
      contradictedInsightId: contradicted?.id ?? null,
      contradictedExcerpt: contradicted
        ? contradicted.content.length > 160
          ? `${contradicted.content.slice(0, 157)}...`
          : contradicted.content
        : null,
    });
  } catch (err) {
    console.error("approve-check error:", err);
    // Fail open — never block approval on an unexpected error.
    return NextResponse.json({ verdict: "consistent" });
  }
}
