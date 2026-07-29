// FLOOR GUIDE / PHASE A — the oriented start.
//
// GET → is Floor Guide switched on for this caller, and if so, the handful of
//       frameworks their own experts say matter most in their job.
//
// ⭐ WHY THIS ROUTE EXISTS AT ALL — THE BLANK-BOX PROBLEM.
// The obvious build of "a search surface for new hires" is a text box and a
// prompt. That surface fails the exact person it is for: somebody on day one
// does not know the words. They cannot ask about post-changeover release because
// nobody has said "changeover" to them yet. A blank box asks a beginner to
// already know what to want, which is why new hires guess and ask the nearest
// warm body instead.
//
// So the surface OPENS WITH ANSWERS. Here is what the veterans on your line say
// matters most — four cards, tappable, before you have typed anything. The text
// box is still there, and it is now the second thing you see rather than the
// only thing.
//
// ⭐ ROLE-SCOPED, REUSING THE ENGINE. "Operator sees operator judgment first; a
// new PM sees PM stuff." The honest material for that scoping already exists and
// the admin already typed it: profiles.claimed_title. So the title becomes a
// query, the query goes through the SAME embedding + SAME nearest-neighbour RPC
// that /retrieve uses, and the nearest frameworks are the role-scoped ones. No
// taxonomy to maintain, no second scoring model, nothing new to keep in sync.
//
// ⭐ THE THRESHOLD IS DELIBERATELY NOT APPLIED HERE, and this is the one place
// in the product where that is correct. 0.75 answers "is this framework a
// confident ANSWER to the question that was asked?" — and a wrong answer is
// worse than none, which is why /retrieve holds that line hard. These cards
// answer nothing. They are orientation, presented as "here's what your team
// thinks matters," and the honest failure mode is a card that turns out to be
// about a neighbouring part of the plant. Applying 0.75 to a job title would
// hand a new hire an empty screen on their first morning, which is the blank box
// again wearing a different hat.
//
// ⚠️ PRIVACY: this route WRITES NOTHING. No signal, no view record, no "started
// Floor Guide" event. Opening the surface leaves no trace, which is the same
// promise as the questions asked inside it.
import { NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { embedText } from "@/lib/voyage";
import {
  FLOOR_GUIDE_START_COUNT,
  beginnerFrame,
  floorGuideScopeQuery,
  readViewerContext,
  type BeginnerFrame,
} from "@/lib/floor-guide";

const CARD_COLUMNS =
  "id, user_id, org_id, created_at, method, context_function, situation_type, framework";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pull more than we show, because some matches will have no framework artifact. */
const SEARCH_WIDTH = FLOOR_GUIDE_START_COUNT * 3;

type CardRow = {
  id: string;
  user_id: string;
  org_id: string | null;
  created_at: string;
  method: string | null;
  context_function: string | null;
  situation_type: string | null;
  framework: {
    name?: string;
    tagline?: string;
    the_play?: string;
    signals?: unknown;
    when_to_apply?: unknown;
    why_it_works?: string;
    boundaries?: unknown;
  } | null;
};

type AuthorLite = { display_name: string | null; claimed_title: string | null };

type Card = {
  id: string;
  name: string;
  tagline: string;
  method: string | null;
  context_function: string | null;
  author: AuthorLite | null;
  beginner: BeginnerFrame;
  contested: boolean;
};

function log(msg: string, extra?: Record<string, unknown>) {
  console.log(`[floor-guide] ${msg}${extra ? ` ${JSON.stringify(extra)}` : ""}`);
}

export async function GET() {
  try {
    const supabase = await createSessionClient();
    const viewer = await readViewerContext(supabase);
    if (!viewer) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    // ⭐ THE GATE, AND IT IS A REAL ONE. A person without floor_guide_active gets
    // the honest "not switched on" state and NO retrieval at all — not a
    // degraded version of the surface.
    //
    // This is not tidiness. The write suppression in /api/retrieve/signal and
    // /api/gaps is derived from floor_guide_active. If somebody without the flag
    // could use this page, they would be reading "ask anything, nobody's grading
    // you" while their questions were being written to an org-readable ledger
    // under their name. The gate and the promise are the same mechanism, so they
    // cannot drift apart.
    if (!viewer.floorGuideActive) {
      return NextResponse.json({
        active: false,
        role: viewer.role,
        deactivated: viewer.deactivated,
      });
    }

    if (!viewer.orgId) {
      return NextResponse.json({
        active: true,
        org: false,
        cards: [],
        scoped_by: null,
        started_at: viewer.floorGuideStartedAt,
        you: { display_name: viewer.displayName, claimed_title: viewer.claimedTitle },
      });
    }
    const orgId = viewer.orgId;

    // ── 1. Role-scoped, via the retrieval engine. Every failure below degrades
    //    to the org-wide fallback — a new hire must never see an error page on
    //    the surface built to calm them down.
    let ids: string[] = [];
    let scopedBy: string | null = null;
    const scope = floorGuideScopeQuery(viewer);
    if (scope) {
      const embed = await embedText(scope, { inputType: "query" });
      if (embed.ok) {
        const { data: matches, error } = await supabase.rpc(
          "search_pattern_records_by_query",
          { query_embedding: embed.vector, match_count: SEARCH_WIDTH }
        );
        if (error) {
          log("scope search failed — falling back to org-wide", { error: error.message });
        } else {
          ids = ((matches ?? []) as { id?: unknown }[])
            .map((m) => m.id)
            .filter((v): v is string => typeof v === "string" && UUID_RE.test(v));
          if (ids.length > 0) scopedBy = viewer.claimedTitle;
        }
      } else {
        log("scope embed failed — falling back to org-wide", { error: embed.error });
      }
    }

    // ── 2. Load the records. Ordered by the search when we have one; by recency
    //    when we don't.
    let rows: CardRow[] = [];
    if (ids.length > 0) {
      const { data } = await supabase.from("pattern_records").select(CARD_COLUMNS).in("id", ids);
      const byId = new Map(
        ((data ?? []) as unknown as CardRow[]).map((r) => [r.id, r])
      );
      // Preserve the search's ordering — .in() does not.
      rows = ids.map((id) => byId.get(id)).filter((r): r is CardRow => !!r);
    }
    if (rows.length === 0) {
      // ── The fallback. A brand-new org, a seat with no title yet, or an embed
      //    that failed. Newest first: the most recently captured judgment is the
      //    most likely to still be how the team actually works.
      const { data } = await supabase
        .from("pattern_records")
        .select(CARD_COLUMNS)
        .eq("org_id", orgId)
        .eq("status", "complete")
        .order("created_at", { ascending: false })
        .limit(SEARCH_WIDTH);
      rows = (data ?? []) as unknown as CardRow[];
      scopedBy = null;
    }

    const usable = rows
      .filter((r) => !!r.framework && typeof r.framework.name === "string")
      .slice(0, FLOOR_GUIDE_START_COUNT);

    // ── 3. Attribution. Two queries, same as /api/library and /api/retrieve —
    //    pattern_records.user_id references auth.users, so there is no join.
    const authorIds = Array.from(new Set(usable.map((r) => r.user_id)));
    let authors: Record<string, AuthorLite> = {};
    if (authorIds.length > 0) {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, claimed_title")
        .in("id", authorIds);
      authors = Object.fromEntries(
        ((data ?? []) as { id: string; display_name: string | null; claimed_title: string | null }[]).map(
          (p) => [p.id, { display_name: p.display_name, claimed_title: p.claimed_title }]
        )
      );
    }

    // ── 4. Contested badges (P-2, surface-with-warning). A new hire especially
    //    needs to know when two veterans disagree — being handed one side of a
    //    live disagreement as settled fact is how a new person walks into an
    //    argument they had no way to see coming.
    const contested = new Set<string>();
    if (usable.length > 0) {
      const idList = usable.map((r) => r.id).join(",");
      const { data: conflicts } = await supabase
        .from("framework_conflicts")
        .select("id, record_a_id, record_b_id")
        .eq("status", "open")
        .or(`record_a_id.in.(${idList}),record_b_id.in.(${idList})`);
      for (const c of (conflicts ?? []) as { record_a_id: string; record_b_id: string }[]) {
        contested.add(c.record_a_id);
        contested.add(c.record_b_id);
      }
    }

    const cards: Card[] = usable.map((r) => {
      const author = authors[r.user_id] ?? null;
      return {
        id: r.id,
        name: r.framework?.name ?? "A framework",
        tagline: typeof r.framework?.tagline === "string" ? r.framework.tagline : "",
        method: r.method,
        context_function: r.context_function,
        author,
        beginner: beginnerFrame(r.framework, author),
        contested: contested.has(r.id),
      };
    });

    log("start cards", {
      cards: cards.length,
      scoped: !!scopedBy,
      contested: cards.filter((c) => c.contested).length,
    });

    return NextResponse.json({
      active: true,
      org: true,
      role: viewer.role,
      started_at: viewer.floorGuideStartedAt,
      you: { display_name: viewer.displayName, claimed_title: viewer.claimedTitle },
      // Null means "these are the org's most recent frameworks, not scoped to
      // your job." The page says which it is rather than implying a precision it
      // doesn't have.
      scoped_by: scopedBy,
      cards,
    });
  } catch (err) {
    console.error("Unexpected error in floor-guide route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
