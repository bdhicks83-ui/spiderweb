// FLOOR GUIDE / PHASE C — "asked of you," the deep-dive edition.
//
// GET            → every open deep dive put to the caller, plus the ones they
//                  already answered (so the page can show where those went).
// GET ?count=1   → just the number, for the nav badge. Kept cheap on purpose:
//                  the badge runs on every page in the app.
//
// Same shape as /api/requests/mine (T1B2), on purpose — the badge next to it
// behaves identically. The one structural difference is DECISION 5: there is
// no "declined" state to return, because a decline removed the caller from
// the ask's target list and left nothing. A declined ask is simply absent.
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import {
  REQUEST_COLUMNS,
  RESPONSE_COLUMNS,
  type DeepDiveRequestRow,
  type DeepDiveResponseRow,
} from "@/lib/deep-dives";

export async function GET(req: NextRequest) {
  try {
    const session = await createSessionClient();
    const {
      data: { user },
    } = await session.auth.getUser();
    // 401 is expected on a logged-out page — the badge swallows it silently.
    if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

    const countOnly = req.nextUrl.searchParams.get("count") === "1";

    if (countOnly) {
      // One containment query, no joins, no names. RLS (the targeted-read
      // policy) is what makes this row visible at all.
      const { count } = await session
        .from("deep_dive_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "open")
        .contains("targets", [user.id]);
      return NextResponse.json({ open: count ?? 0 });
    }

    // The asks currently waiting on me. RLS scopes; `contains` narrows to mine
    // rather than also returning asks I answered (those come back below, with
    // their answers, so the page can render them as done).
    const { data: openRaw, error: openError } = await session
      .from("deep_dive_requests")
      .select(REQUEST_COLUMNS)
      .eq("status", "open")
      .contains("targets", [user.id])
      .order("created_at", { ascending: false });
    if (openError) {
      return NextResponse.json(
        { error: "Could not load what you've been asked.", details: openError.message },
        { status: 500 }
      );
    }
    const open = (openRaw ?? []) as unknown as DeepDiveRequestRow[];

    // What I already answered — own-row RLS.
    const { data: mineRaw } = await session
      .from("deep_dive_responses")
      .select(RESPONSE_COLUMNS)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    const mine = (mineRaw ?? []) as unknown as DeepDiveResponseRow[];

    // The answered asks' topics (the targeted policy's second branch covers
    // these reads).
    const answeredReqIds = Array.from(new Set(mine.map((r) => r.request_id))).filter(
      (id) => !open.some((o) => o.id === id)
    );
    let answeredReqs: DeepDiveRequestRow[] = [];
    if (answeredReqIds.length > 0) {
      const { data } = await session
        .from("deep_dive_requests")
        .select(REQUEST_COLUMNS)
        .in("id", answeredReqIds);
      answeredReqs = (data ?? []) as unknown as DeepDiveRequestRow[];
    }

    // Who is asking. The disclosure names them, so the list view does too.
    const askerIds = Array.from(
      new Set([...open, ...answeredReqs].map((r) => r.created_by))
    );
    let askers: Record<string, string> = {};
    if (askerIds.length > 0) {
      const { data: profs } = await session
        .from("profiles")
        .select("id, display_name")
        .in("id", askerIds);
      askers = Object.fromEntries(
        ((profs ?? []) as { id: string; display_name: string | null }[]).map((p) => [
          p.id,
          p.display_name ?? "Your leadership team",
        ])
      );
    }

    const responseByRequest = Object.fromEntries(mine.map((r) => [r.request_id, r]));

    return NextResponse.json({
      open: open.filter((r) => !responseByRequest[r.id]).length,
      asks: open
        .filter((r) => !responseByRequest[r.id])
        .map((r) => ({
          id: r.id,
          topic: r.topic,
          asked_by: askers[r.created_by] ?? "Your leadership team",
          created_at: r.created_at,
        })),
      answered: answeredReqs
        .concat(open.filter((r) => !!responseByRequest[r.id]))
        .map((r) => ({
          id: r.id,
          topic: r.topic,
          asked_by: askers[r.created_by] ?? "Your leadership team",
          answered_at: responseByRequest[r.id]?.created_at ?? null,
        })),
    });
  } catch (err) {
    console.error("Unexpected error in deep-dives/mine route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
