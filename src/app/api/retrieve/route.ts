// P-3 (Build 3) — Contextual retrieval: the Copilot moment.
// POST { situation }. An employee describes a situation in natural language;
// the right org framework(s) surface, org-scoped, with author attribution and
// (surface-with-warning) any ⚠️ Contested badge intact.
//
// Grounding doctrine reused from Ask Your Spiderweb (/api/ask): embed the
// query → nearest-neighbour search → if nothing clears the honesty threshold,
// say so plainly rather than return a confident wrong match. Org scoping and
// contested badges are the exact RLS + enrichment pattern from /api/library.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { embedText } from "@/lib/voyage";
import type { FrameworkArtifact } from "@/lib/elicitation";

// Below this cosine similarity a "match" is noise. A wrong framework is worse
// than an empty result (a confident wrong answer erodes trust in the brain).
//
// TUNED against live demo data (DECISION-LOG 2026-07-23): voyage-large-2
// compresses cosine similarity into a high band, so an absolute floor must sit
// well up. Empirically, on-target frameworks for the seeded changeover/QC
// situation scored ~0.85, while an unrelated cross-domain query (SaaS pricing)
// topped out at ~0.69. 0.75 clears the bullseye frameworks with ~0.10 margin
// and rejects the cross-domain query with ~0.06 margin. (An earlier 0.55 —
// borrowed from Ask Your Spiderweb's insight floor — was far too low and let
// unrelated queries through.) The noMatch response echoes the top near-miss so
// this stays re-tunable as the library grows.
const SIMILARITY_THRESHOLD = 0.75;
const MATCH_COUNT = 5;

const RESULT_COLUMNS =
  "id, user_id, org_id, created_at, trigger_type, method, context_function, " +
  "situation_type, framework";

type ResultRow = {
  id: string;
  user_id: string;
  org_id: string | null;
  created_at: string;
  trigger_type: string | null;
  method: string | null;
  context_function: string | null;
  situation_type: string | null;
  framework: FrameworkArtifact | null;
};

export async function POST(req: NextRequest) {
  try {
    const { situation } = await req.json();
    if (!situation || typeof situation !== "string" || !situation.trim()) {
      return NextResponse.json({ error: "Describe a situation first." }, { status: 400 });
    }
    const query = situation.trim();

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    // 1. Embed the situation as a query. A failure is surfaced, never swallowed.
    const embed = await embedText(query, { inputType: "query" });
    if (!embed.ok) {
      return NextResponse.json(
        {
          error: embed.rateLimited
            ? "The search service is busy right now — try again in a moment."
            : "Could not run the search. Please try again.",
          details: embed.error,
        },
        { status: 502 }
      );
    }

    // 2. Nearest frameworks, org-scoped by RLS inside the RPC.
    const { data: matches, error: matchError } = await supabase.rpc(
      "search_pattern_records_by_query",
      { query_embedding: embed.vector, match_count: MATCH_COUNT }
    );
    if (matchError) {
      return NextResponse.json(
        { error: "Search failed", details: matchError.message },
        { status: 500 }
      );
    }

    const scored = ((matches as { id: string; similarity: number }[]) || []).filter(
      (m) => typeof m.similarity === "number"
    );
    const strong = scored.filter((m) => m.similarity >= SIMILARITY_THRESHOLD);

    // 3. Nothing codified on this yet → say so honestly. Echo the near-miss so
    //    the threshold can be tuned against real demo data.
    if (strong.length === 0) {
      return NextResponse.json({
        noMatch: true,
        message:
          "Nothing codified on this yet. No one on your team has captured a framework that matches this situation — this is a gap worth codifying.",
        topSimilarity: scored.length ? Math.round(scored[0].similarity * 1000) / 1000 : null,
      });
    }

    const simById = new Map(strong.map((m) => [m.id, m.similarity]));
    const ids = strong.map((m) => m.id);

    // 4. Load the full records (RLS re-scopes to the caller's org + own rows).
    const { data: records, error: recError } = await supabase
      .from("pattern_records")
      .select(RESULT_COLUMNS)
      .in("id", ids);
    if (recError) {
      return NextResponse.json(
        { error: "Could not load frameworks", details: recError.message },
        { status: 500 }
      );
    }
    const rows = (records || []) as unknown as ResultRow[];

    // 5. Author attribution (same two-query pattern as /api/library — user_id
    //    references auth.users, not profiles, so no auto-embed join).
    const authorIds = Array.from(new Set(rows.map((r) => r.user_id)));
    let authors: Record<string, { display_name: string | null; persona: string | null }> = {};
    if (authorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, persona")
        .in("id", authorIds);
      authors = Object.fromEntries(
        (profiles || []).map((p) => [p.id, { display_name: p.display_name, persona: p.persona }])
      );
    }

    // 6. Contested badges (P-2, surface-with-warning). Open conflicts annotate
    //    a record — they never remove it from results.
    const contestedBy: Record<string, { conflict_id: string; other_record_id: string }[]> = {};
    if (rows.length > 0) {
      const idList = rows.map((r) => r.id).join(",");
      const { data: conflicts } = await supabase
        .from("framework_conflicts")
        .select("id, record_a_id, record_b_id")
        .eq("status", "open")
        .or(`record_a_id.in.(${idList}),record_b_id.in.(${idList})`);
      for (const c of (conflicts || []) as {
        id: string;
        record_a_id: string;
        record_b_id: string;
      }[]) {
        (contestedBy[c.record_a_id] ??= []).push({ conflict_id: c.id, other_record_id: c.record_b_id });
        (contestedBy[c.record_b_id] ??= []).push({ conflict_id: c.id, other_record_id: c.record_a_id });
      }
    }

    const results = rows
      .map((r) => ({
        id: r.id,
        similarity: Math.round((simById.get(r.id) ?? 0) * 1000) / 1000,
        trigger_type: r.trigger_type,
        method: r.method,
        context_function: r.context_function,
        situation_type: r.situation_type,
        framework: r.framework,
        is_mine: r.user_id === user.id,
        author: authors[r.user_id] ?? null,
        contested: contestedBy[r.id] ?? [],
      }))
      .sort((a, b) => b.similarity - a.similarity);

    return NextResponse.json({ noMatch: false, query, results });
  } catch (err) {
    console.error("Unexpected error in retrieve route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
