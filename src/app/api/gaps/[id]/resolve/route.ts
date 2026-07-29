// P-9 — the fill. POST { record_id, training_request_id? }
//
// A codified framework now covers this gap. The record must be COMPLETE and
// carry a framework artifact; the gap flips to resolved, links to it, embeds it
// if it somehow isn't yet, and every person who asked gets notified.
//
// ⭐ THE SYSTEM NEVER FILLS ITS OWN GAP. There is no path here that generates a
// framework — this route only points at one a HUMAN captured. Auto-answering a
// gap would be the product fabricating expertise, which is the single thing it
// exists not to do.
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { resolveGapWithRecord } from "@/lib/knowledge-gaps";
import { requireCanCodify } from "@/lib/floor-guide";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const recordId = typeof body?.record_id === "string" ? body.record_id : "";
    if (!UUID_RE.test(recordId)) {
      return NextResponse.json({ error: "record_id (uuid) is required" }, { status: 400 });
    }
    const trainingRequestId =
      typeof body?.training_request_id === "string" && UUID_RE.test(body.training_request_id)
        ? body.training_request_id
        : null;

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
    if (!orgId) return NextResponse.json({ error: "Not in an org" }, { status: 409 });

    // ─── FLOOR GUIDE PHASE A ───
    // A contributor cannot own the act of declaring "this framework is now the
    // team's answer to that question." The framework they'd be pointing at is
    // somebody else's, but the resolution is attributed to the person who did
    // it (knowledge_gaps.resolved_by) and shows up as such in the queue.
    const codifyGate = await requireCanCodify(supabase);
    if (!codifyGate.ok) {
      return NextResponse.json(
        { error: codifyGate.error, code: codifyGate.code },
        { status: codifyGate.status }
      );
    }

    // THE AUTHORIZATION: the record is loaded through the caller's own RLS
    // first. A framework they cannot see cannot be used to close a gap.
    const { data: visible } = await supabase
      .from("pattern_records")
      .select("id")
      .eq("id", recordId)
      .maybeSingle();
    if (!visible) return NextResponse.json({ error: "Framework not found" }, { status: 404 });

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const result = await resolveGapWithRecord(service, {
      gapId: id,
      orgId,
      recordId,
      userId: user.id,
      trainingRequestId,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      gap_id: result.gap.id,
      status: result.gap.status,
      already_resolved: result.alreadyResolved,
      embedded: result.embedded,
      askers_notified: result.askersNotified,
      note: result.note,
    });
  } catch (err) {
    console.error("Unexpected error in gap resolve route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
