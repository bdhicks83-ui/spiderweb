// FLOOR GUIDE / PHASE B — the contributor's own view. POSITIVE-ONLY.
//
// GET            → their ideas and what became of them, plus an unread count
// GET ?count=1   → the unread count alone, for the nav badge
// POST           → mark read
//
// ⭐ THE POSITIVE-ONLY RULE IS NOT IMPLEMENTED HERE, and that is deliberate.
// This route has no `.neq("status", "dismissed")` filter. It does not need one:
// the read policy on candidate_insights excludes dismissed rows from the person
// who surfaced them (see supabase/floorguide-b-emergent-insight.sql, DECISION 1).
// Putting the rule in RLS rather than in this file means a future route, a
// future export, or a forgotten filter still cannot show somebody that their
// idea was turned down.
//
// Verbatim the P-9 /api/gaps/mine shape, because the two loops are the same
// loop: something you did has an outcome, and you should find out without
// having to go looking.
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import {
  CANDIDATE_COLUMNS,
  markCandidatesSeen,
  type CandidateRow,
} from "@/lib/candidate-insights";

type FrameworkLite = { name?: unknown; tagline?: unknown };

export async function GET(req: NextRequest) {
  try {
    const session = await createSessionClient();
    const {
      data: { user },
    } = await session.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

    const url = new URL(req.url);
    const countOnly = url.searchParams.get("count") === "1";

    // Whether to offer the "share an idea" panel at all. Only somebody whose
    // input isn't already canonical judgment needs that door — an expert should
    // capture it directly, and being asked "know a better way?" when you own the
    // library reads as the product not knowing who you are.
    const { data: profRaw } = await session
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    const canShare = (profRaw as { role?: string | null } | null)?.role === "contributor";

    const { data, error } = await session
      .from("candidate_insights")
      .select(CANDIDATE_COLUMNS)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      return NextResponse.json(
        { error: "Could not load your ideas.", details: error.message },
        { status: 500 }
      );
    }
    const rows = (data ?? []) as unknown as CandidateRow[];
    const unread = rows.filter((r) => r.notified_at && !r.seen_at).length;

    // The badge path: no joins, no second query. Cheap enough to sit on every
    // page load (the P-9 rule).
    if (countOnly) {
      return NextResponse.json({ unread, total: rows.length, can_share: canShare });
    }

    // Frameworks for the promoted ones — the payoff line is "your idea became
    // THIS," so the name has to be real.
    const recordIds = rows
      .map((r) => r.promoted_record_id)
      .filter((v): v is string => !!v);
    let frameworks: Record<string, { name: string | null; tagline: string | null }> = {};
    let codifiedBy: Record<string, string | null> = {};
    if (recordIds.length > 0) {
      const { data: recs } = await session
        .from("pattern_records")
        .select("id, user_id, framework")
        .in("id", recordIds);
      const recRows = (recs ?? []) as { id: string; user_id: string; framework: FrameworkLite | null }[];
      frameworks = Object.fromEntries(
        recRows.map((r) => [
          r.id,
          {
            name: typeof r.framework?.name === "string" ? r.framework.name : null,
            tagline: typeof r.framework?.tagline === "string" ? r.framework.tagline : null,
          },
        ])
      );
      const authorIds = Array.from(new Set(recRows.map((r) => r.user_id)));
      if (authorIds.length > 0) {
        const { data: profs } = await session
          .from("profiles")
          .select("id, display_name")
          .in("id", authorIds);
        const nameById = Object.fromEntries(
          ((profs ?? []) as { id: string; display_name: string | null }[]).map((p) => [
            p.id,
            p.display_name,
          ])
        );
        codifiedBy = Object.fromEntries(recRows.map((r) => [r.id, nameById[r.user_id] ?? null]));
      }
    }

    // Names for routed-to, so "an expert is looking at it" can say who.
    const routedIds = Array.from(
      new Set(rows.map((r) => r.routed_to_user_id).filter((v): v is string => !!v))
    );
    let routedNames: Record<string, string | null> = {};
    if (routedIds.length > 0) {
      const { data: profs } = await session
        .from("profiles")
        .select("id, display_name")
        .in("id", routedIds);
      routedNames = Object.fromEntries(
        ((profs ?? []) as { id: string; display_name: string | null }[]).map((p) => [
          p.id,
          p.display_name,
        ])
      );
    }

    const ideas = rows.map((r) => ({
      id: r.id,
      created_at: r.created_at,
      source: r.source,
      status: r.status,
      raw_input: r.raw_input,
      summary: r.summary,
      unread: !!r.notified_at && !r.seen_at,
      framework: r.promoted_record_id ? frameworks[r.promoted_record_id] ?? null : null,
      record_id: r.promoted_record_id,
      codified_with: r.promoted_record_id ? codifiedBy[r.promoted_record_id] ?? null : null,
      routed_to: r.routed_to_user_id ? routedNames[r.routed_to_user_id] ?? null : null,
    }));

    // Unread first, then newest. Somebody with good news waiting should not
    // have to scroll for it.
    ideas.sort((a, b) => Number(b.unread) - Number(a.unread));

    return NextResponse.json({ unread, ideas, can_share: canShare });
  } catch (err) {
    console.error("Unexpected error in insights/mine GET:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await createSessionClient();
    const {
      data: { user },
    } = await session.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { id?: unknown };
    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    // user_id comes from the session, never from the body. The id in the body can
    // only ever NARROW the update.
    const marked = await markCandidatesSeen(service, {
      userId: user.id,
      candidateId: typeof body.id === "string" ? body.id : null,
    });
    return NextResponse.json({ ok: true, marked });
  } catch (err) {
    console.error("Unexpected error in insights/mine POST:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
