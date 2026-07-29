// P-9 — the shared gaps queue.
//
// GET  → every gap in the caller's org (open + being answered; resolved too on
//        ?include=resolved). VISIBLE TO ALL USERS IN THE ORG — that is the
//        whole point of the surface and it is a decision, not an oversight:
//        there is NO routing or assignment in v1. Anyone can pick one up.
// POST → flag a question the brain could not answer. { question,
//        top_similarity? }
//
// AUTHORIZATION IS THE ORG. The read runs through the SESSION client so the
// "org knowledge gaps read" RLS policy is the real gate; org_id for the write
// comes off the caller's own profile and is NEVER taken from the request body
// (a client-supplied org_id would be a forgeable queue).
//
// ⚠️ The org-wide payload carries asked_count and NEVER an asker identity. Who
// asked lives in knowledge_gap_askers, which is readable only by its own asker
// (/api/gaps/mine). See the read-boundary note in supabase/p9-knowledge-gaps.sql.
//
// ⭐ FLOOR GUIDE PHASE A — POST accepts { floor_guide?: true }. When the SERVER
// confirms that flag against the caller's own profiles.floor_guide_active, the
// gap is recorded with NO asker row and NO actor on its ledger signal. The org
// learns that its onboarding has a hole here; nothing records who hit it. The
// flag is a request, never an assertion — see resolveFloorGuideMode().
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import {
  GAP_COLUMNS,
  flagKnowledgeGap,
  reconcileAnsweringGaps,
  type KnowledgeGapRow,
} from "@/lib/knowledge-gaps";
import { resolveFloorGuideMode } from "@/lib/floor-guide";

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSessionClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .maybeSingle();
    const orgId = (profile as { org_id: string | null } | null)?.org_id ?? null;
    if (!orgId) {
      // A solo user with no org has no shared queue — an honest empty, not an
      // error. (Same posture as the library's own-rows fallback.)
      return NextResponse.json({ gaps: [], reconciled: { resolved: 0, released: 0 }, org: false });
    }

    // ⭐ The self-heal runs FIRST, so the queue can never show "being answered"
    // for a gap whose framework already exists. See reconcileAnsweringGaps().
    const reconciled = await reconcileAnsweringGaps(service(), orgId);

    // Filters BEFORE transforms: .order() returns a transform builder, and
    // reassigning a filter onto it is the kind of thing that type-checks today
    // and stops doing so on a client bump. Build the filter, then order it.
    const includeResolved = req.nextUrl.searchParams.get("include") === "resolved";
    const filtered = includeResolved
      ? supabase.from("knowledge_gaps").select(GAP_COLUMNS).eq("org_id", orgId)
      : supabase
          .from("knowledge_gaps")
          .select(GAP_COLUMNS)
          .eq("org_id", orgId)
          .neq("status", "resolved");

    // ⭐ ORDERED BY DEMAND. The questions the org keeps hitting rise on their
    // own — no scoring model, just the count of how often it was asked.
    const { data: raw, error } = await filtered
      .order("asked_count", { ascending: false })
      .order("last_asked_at", { ascending: false });
    if (error) {
      return NextResponse.json(
        { error: "Could not load the gaps queue", details: error.message },
        { status: 500 }
      );
    }
    const gaps = (raw ?? []) as unknown as KnowledgeGapRow[];

    // Names for the two people-shaped fields that ARE org-visible: who picked a
    // gap up, and who filled it. Both are voluntary public actions — unlike the
    // asker, which stays private.
    const personIds = Array.from(
      new Set(
        gaps.flatMap((g) => [g.claimed_by, g.resolved_by].filter((v): v is string => !!v))
      )
    );
    let names: Record<string, string> = {};
    if (personIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", personIds);
      names = Object.fromEntries(
        ((profiles || []) as { id: string; display_name: string | null }[]).map((p) => [
          p.id,
          p.display_name || "A teammate",
        ])
      );
    }

    // The framework that filled each resolved gap, so the queue can link to it.
    const recordIds = Array.from(
      new Set(gaps.map((g) => g.resolved_record_id).filter((v): v is string => !!v))
    );
    let frameworkNames: Record<string, string> = {};
    if (recordIds.length > 0) {
      const { data: records } = await supabase
        .from("pattern_records")
        .select("id, framework")
        .in("id", recordIds);
      frameworkNames = Object.fromEntries(
        ((records || []) as { id: string; framework: { name?: string } | null }[]).map((r) => [
          r.id,
          r.framework?.name || "the framework",
        ])
      );
    }

    return NextResponse.json({
      org: true,
      reconciled,
      gaps: gaps.map((g) => ({
        id: g.id,
        question: g.question_text,
        status: g.status,
        asked_count: g.asked_count,
        first_asked_at: g.first_asked_at,
        last_asked_at: g.last_asked_at,
        claimed_by_name: g.claimed_by ? names[g.claimed_by] ?? "A teammate" : null,
        claimed_at: g.claimed_at,
        claimed_by_me: g.claimed_by === user.id,
        resolved_by_name: g.resolved_by ? names[g.resolved_by] ?? "A teammate" : null,
        resolved_at: g.resolved_at,
        resolved_record_id: g.resolved_record_id,
        resolved_framework_name: g.resolved_record_id
          ? frameworkNames[g.resolved_record_id] ?? null
          : null,
      })),
    });
  } catch (err) {
    console.error("Unexpected error in gaps GET route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const question = typeof body?.question === "string" ? body.question.trim() : "";
    if (!question) {
      return NextResponse.json({ error: "A question is required" }, { status: 400 });
    }
    const topSimilarity =
      typeof body?.top_similarity === "number" && Number.isFinite(body.top_similarity)
        ? body.top_similarity
        : null;

    const supabase = await createSessionClient();

    // ⭐ ONE read decides both identity and privacy mode. floorGuide is an AND of
    // "the surface asked for it" and "the server says this person is actually in
    // Floor Guide" — a client cannot turn privacy ON for somebody who isn't
    // onboarding, and cannot turn it OFF for somebody who is.
    const mode = await resolveFloorGuideMode(supabase, body?.floor_guide);
    if (!mode) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    const { viewer, floorGuide } = mode;
    const orgId = viewer.orgId;
    if (!orgId) {
      return NextResponse.json(
        {
          error:
            "Gaps are a team surface — you're not in an org yet, so there's no shared queue to add this to.",
          code: "NO_ORG",
        },
        { status: 409 }
      );
    }

    const result = await flagKnowledgeGap(service(), {
      orgId,
      userId: viewer.userId,
      questionText: question,
      topSimilarity,
      floorGuide,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      gap_id: result.gapId,
      question: result.question,
      asked_count: result.askedCount,
      created: result.created,
      reopened: result.reopened,
      matched_by: result.matchedBy,
      // Shipped so the surface never promises a payoff that structurally cannot
      // arrive: a Floor Guide flag has no asker row, so nothing will ever notify
      // this person that it was filled. The Floor Guide copy says so plainly
      // rather than borrowing /retrieve's "you'll be told when someone fills it."
      floor_guide: floorGuide,
      asker_recorded: result.askerRecorded,
    });
  } catch (err) {
    console.error("Unexpected error in gaps POST route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
