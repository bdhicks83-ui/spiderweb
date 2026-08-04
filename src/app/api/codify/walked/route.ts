// "Already Walked" (2026-08-04) — the expert acts on the duplicate card.
//
// POST { recordId, action: "viewed" | "kept_going" | "saved_time" }.
//
// - "viewed"      → they opened the existing framework in a new tab. The
//                   session stays active and resumable; we just record it.
// - "kept_going"  → "Mine's different — keep going": one click, the card
//                   collapses and is never re-shown this session (the acted
//                   flag on walked_check is the latch). Capture continues.
// - "saved_time"  → "Good — that saves me time": ends the session gracefully
//                   with a positive frame. The session row is DELETED —
//                   nothing negative recorded, no abandoned-session resume
//                   banner, and (T1B2) a campaign request is NOT marked
//                   complete by this: request reconciliation only ever
//                   matches COMPLETE records, and this row never completes.
//
// RLS does the authorization: pattern_records update/delete are author-only,
// so a wrong recordId is someone else's row and simply doesn't match.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isWalkedCheck } from "@/lib/walked-check";

const ACTIONS = ["viewed", "kept_going", "saved_time"] as const;
type WalkedAction = (typeof ACTIONS)[number];

export async function POST(req: NextRequest) {
  try {
    const { recordId, action } = await req.json();
    if (!recordId || typeof recordId !== "string") {
      return NextResponse.json({ error: "Missing recordId" }, { status: 400 });
    }
    if (!ACTIONS.includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
    const walkedAction = action as WalkedAction;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const { data: row, error: loadError } = await supabase
      .from("pattern_records")
      .select("id, status, walked_check")
      .eq("id", recordId)
      .maybeSingle();
    if (loadError || !row) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (row.status !== "active") {
      return NextResponse.json(
        { error: "This session is already complete" },
        { status: 409 }
      );
    }

    if (walkedAction === "saved_time") {
      const { error: deleteError } = await supabase
        .from("pattern_records")
        .delete()
        .eq("id", recordId);
      if (deleteError) {
        return NextResponse.json(
          { error: "Could not close the session", details: deleteError.message },
          { status: 500 }
        );
      }
      return NextResponse.json({ ok: true, closed: true });
    }

    // viewed / kept_going: merge the acted flag into the stored verdict.
    const existing = isWalkedCheck(row.walked_check) ? row.walked_check : null;
    const { error: updateError } = await supabase
      .from("pattern_records")
      .update({
        walked_check: { ...(existing ?? { status: "clear", checked_at: new Date().toISOString() }), acted: walkedAction },
        updated_at: new Date().toISOString(),
      })
      .eq("id", recordId);
    if (updateError) {
      // Best-effort record-keeping — the card already behaved client-side.
      console.error(
        `walked action store failed for ${recordId}: ${updateError.message}`
      );
    }
    return NextResponse.json({ ok: true, closed: false });
  } catch (err) {
    console.error("Unexpected error in codify/walked route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
