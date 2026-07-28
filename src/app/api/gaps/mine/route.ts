// P-9 Part 4 — MY QUESTIONS. The loop closed for the person who asked.
//
// GET  → every question THIS caller asked that hit a gap, with status, plus the
//        unread count for the nav badge.
// POST → { gap_id? } mark answered questions as seen (clears the badge).
//
// ⭐ OWN ROWS ONLY. knowledge_gap_askers RLS is `user_id = auth.uid()`, so this
// route cannot return another person's questions even if it tried. That is the
// deliberate asymmetry with the shared queue in /api/gaps: everyone sees the
// GAPS; only you see YOUR questions. A peer being able to enumerate who kept
// asking about something nobody could answer is one inference away from a
// person-level negative signal, which in this product is a manager-only surface
// (P-6) and never a peer-visible one.
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { reconcileAnsweringGaps, type KnowledgeGapRow } from "@/lib/knowledge-gaps";

type AskerRow = {
  id: string;
  gap_id: string;
  asked_count: number;
  first_asked_at: string;
  last_asked_at: string;
  notified_at: string | null;
  seen_at: string | null;
};

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSessionClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

    const { data: askerRaw, error } = await supabase
      .from("knowledge_gap_askers")
      .select("id, gap_id, asked_count, first_asked_at, last_asked_at, notified_at, seen_at")
      .order("last_asked_at", { ascending: false });
    if (error) {
      return NextResponse.json(
        { error: "Could not load your questions", details: error.message },
        { status: 500 }
      );
    }
    const askers = (askerRaw ?? []) as unknown as AskerRow[];
    const unread = askers.filter((a) => a.notified_at && !a.seen_at).length;

    // The badge path only needs the number — skip the joins entirely so the
    // nav badge stays cheap enough to sit on every page.
    if (req.nextUrl.searchParams.get("count") === "1") {
      return NextResponse.json({ unread, total: askers.length });
    }

    if (askers.length === 0) {
      return NextResponse.json({ unread: 0, questions: [] });
    }

    // Self-heal before reporting status, so "still open" is never stale for the
    // one person most invested in the answer.
    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .maybeSingle();
    const orgId = (profile as { org_id: string | null } | null)?.org_id ?? null;
    if (orgId) {
      const service = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      await reconcileAnsweringGaps(service, orgId);
    }

    const gapIds = askers.map((a) => a.gap_id);
    const { data: gapRaw } = await supabase
      .from("knowledge_gaps")
      .select(
        "id, question_text, status, asked_count, first_asked_at, resolved_record_id, " +
          "resolved_training_request_id, resolved_by, resolved_at"
      )
      .in("id", gapIds);
    const gaps = (gapRaw ?? []) as unknown as Pick<
      KnowledgeGapRow,
      | "id"
      | "question_text"
      | "status"
      | "asked_count"
      | "first_asked_at"
      | "resolved_record_id"
      | "resolved_training_request_id"
      | "resolved_by"
      | "resolved_at"
    >[];
    const gapById = new Map(gaps.map((g) => [g.id, g]));

    const recordIds = Array.from(
      new Set(gaps.map((g) => g.resolved_record_id).filter((v): v is string => !!v))
    );
    let frameworks: Record<string, { name: string; tagline: string | null }> = {};
    if (recordIds.length > 0) {
      const { data: records } = await supabase
        .from("pattern_records")
        .select("id, framework")
        .in("id", recordIds);
      frameworks = Object.fromEntries(
        ((records || []) as { id: string; framework: { name?: string; tagline?: string } | null }[]).map(
          (r) => [
            r.id,
            { name: r.framework?.name || "the framework", tagline: r.framework?.tagline ?? null },
          ]
        )
      );
    }

    const resolverIds = Array.from(
      new Set(gaps.map((g) => g.resolved_by).filter((v): v is string => !!v))
    );
    let names: Record<string, string> = {};
    if (resolverIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", resolverIds);
      names = Object.fromEntries(
        ((profiles || []) as { id: string; display_name: string | null }[]).map((p) => [
          p.id,
          p.display_name || "A teammate",
        ])
      );
    }

    const questions = askers
      .map((a) => {
        const gap = gapById.get(a.gap_id);
        if (!gap) return null;
        const fw = gap.resolved_record_id ? frameworks[gap.resolved_record_id] ?? null : null;
        return {
          gap_id: gap.id,
          question: gap.question_text,
          status: gap.status,
          my_asked_count: a.asked_count,
          org_asked_count: gap.asked_count,
          first_asked_at: a.first_asked_at,
          last_asked_at: a.last_asked_at,
          unread: !!a.notified_at && !a.seen_at,
          answered_at: gap.resolved_at,
          answered_by_name: gap.resolved_by ? names[gap.resolved_by] ?? "A teammate" : null,
          framework_id: gap.resolved_record_id,
          framework_name: fw?.name ?? null,
          framework_tagline: fw?.tagline ?? null,
          training_request_id: gap.resolved_training_request_id,
        };
      })
      .filter((q): q is NonNullable<typeof q> => q !== null)
      // Answered-and-unread first — that is the payoff moment and it should not
      // be buried under questions still waiting.
      .sort((a, b) => Number(b.unread) - Number(a.unread));

    return NextResponse.json({ unread, questions });
  } catch (err) {
    console.error("Unexpected error in my-questions GET route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const gapId = typeof body?.gap_id === "string" ? body.gap_id : null;

    const supabase = await createSessionClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    // user_id is taken from the SESSION, never the body — this is the one write
    // a user makes to their own asker rows and it must not be forgeable.
    let q = service
      .from("knowledge_gap_askers")
      .update({ seen_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("seen_at", null)
      .not("notified_at", "is", null);
    if (gapId) q = q.eq("gap_id", gapId);
    const { error } = await q;
    if (error) {
      console.warn(`[knowledge-gaps] mark-seen skipped: ${error.message}`);
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Unexpected error in my-questions POST route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
