// TIER 1 / BUILD 2 — one ask: read it, and move it.
//
// GET  → the ask, for the /codify?request=<id> banner.
// POST → { action: "start" | "decline" | "link", reason?, record_id? }
//
// ONE ROUTE FOR THREE TRANSITIONS, deliberately: all three are the ASSIGNEE
// acting on their own single row, they share the same ownership check, and
// splitting them into three files would triple that check for no gain. (P-9
// split claim/resolve because they had genuinely different authority models —
// anyone could claim, but resolving wrote to a second table.)
//
// ⚠️ ONLY THE PERSON ASKED MAY MOVE THEIR OWN ASK. Not their manager, not an
// admin. A manager marking somebody else's ask "captured" would put a claim
// about what a person knows into the record without that person ever having
// said it — which is the one thing this entire product exists not to do.
// Managers can see the row (RLS) and can add or close asks (campaign routes).
// They cannot answer for someone.
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { REQUEST_COLUMNS, cleanPrompt, type RequestRow } from "@/lib/capture-campaign";

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createSessionClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

    // Read through the SESSION client: the capture_requests policy decides
    // whether this caller may see the row at all.
    const { data: raw } = await supabase
      .from("capture_requests")
      .select(REQUEST_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    const request = (raw ?? null) as unknown as RequestRow | null;
    if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data: campaignRaw } = await supabase
      .from("capture_campaigns")
      .select("id, name, purpose, created_by")
      .eq("id", request.campaign_id)
      .maybeSingle();
    const campaign = campaignRaw as
      | { id: string; name: string; purpose: string | null; created_by: string }
      | null;

    let askedBy = "A teammate";
    if (campaign?.created_by) {
      const { data: owner } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", campaign.created_by)
        .maybeSingle();
      askedBy = (owner as { display_name: string | null } | null)?.display_name || "A teammate";
    }

    let gapAskedCount: number | null = null;
    if (request.source_gap_id) {
      const { data: gap } = await supabase
        .from("knowledge_gaps")
        .select("asked_count")
        .eq("id", request.source_gap_id)
        .maybeSingle();
      gapAskedCount = (gap as { asked_count: number } | null)?.asked_count ?? null;
    }

    return NextResponse.json({
      request: {
        id: request.id,
        prompt: request.prompt,
        status: request.status,
        source: request.source,
        gap_asked_count: gapAskedCount,
        campaign_name: campaign?.name ?? "A campaign",
        campaign_purpose: campaign?.purpose ?? null,
        asked_by: askedBy,
        is_mine: request.person_id === user.id,
      },
    });
  } catch (err) {
    console.error("Unexpected error in request GET route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createSessionClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = body?.action;
    if (action !== "start" && action !== "decline" && action !== "link" && action !== "reopen") {
      return NextResponse.json(
        { error: "action must be start, decline, link or reopen." },
        { status: 400 }
      );
    }

    const svc = service();
    const { data: raw } = await svc
      .from("capture_requests")
      .select(REQUEST_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    const request = (raw ?? null) as unknown as RequestRow | null;
    if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // ⭐ The ownership check. See the header: only the person asked.
    if (request.person_id !== user.id) {
      return NextResponse.json(
        {
          error: "Only the person who was asked can answer this.",
          code: "NOT_YOURS",
        },
        { status: 403 }
      );
    }

    const now = new Date().toISOString();

    if (action === "start") {
      // A SOFT claim, exactly like a P-9 gap claim: it exists so the campaign
      // can show somebody is on it and so the reconciler knows whose next
      // completed framework closes this. It locks nobody out of anything.
      if (request.status === "captured") {
        return NextResponse.json({ success: true, status: "captured", already: true });
      }
      const { error } = await svc
        .from("capture_requests")
        .update({ status: "started", started_at: now, declined_at: null, decline_reason: null, updated_at: now })
        .eq("id", id);
      if (error) {
        return NextResponse.json({ error: "Could not start that.", details: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, status: "started" });
    }

    if (action === "decline") {
      // ⭐ NOT A FAILURE PATH. "I'm not the right person — ask Dana" is the
      // single most useful thing an assignee can say when the ask is misrouted,
      // and it only gets said if saying it is easy and carries no penalty. The
      // reason is required for exactly that: a decline with no reason is a
      // shrug, a decline with one is routing intelligence.
      const reason = cleanPrompt(body?.reason, 400);
      if (!reason) {
        return NextResponse.json(
          { error: "Say why in a line — that's the useful part." },
          { status: 400 }
        );
      }
      const { error } = await svc
        .from("capture_requests")
        .update({
          status: "declined",
          decline_reason: reason,
          declined_at: now,
          started_at: null,
          updated_at: now,
        })
        .eq("id", id);
      if (error) {
        return NextResponse.json({ error: "Could not save that.", details: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, status: "declined" });
    }

    if (action === "reopen") {
      const { error } = await svc
        .from("capture_requests")
        .update({ status: "open", declined_at: null, decline_reason: null, started_at: null, updated_at: now })
        .eq("id", id);
      if (error) {
        return NextResponse.json({ error: "Could not reopen that.", details: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, status: "open" });
    }

    // action === "link" — the manual override for the reconciler, same escape
    // hatch P-9 shipped: they captured it in a different session than the one
    // the claim expected, so they point at it by hand.
    const recordId = typeof body?.record_id === "string" ? body.record_id : "";
    if (!recordId) {
      return NextResponse.json({ error: "Pick a framework to link." }, { status: 400 });
    }
    const { data: recRaw } = await svc
      .from("pattern_records")
      .select("id, user_id, org_id, status, framework")
      .eq("id", recordId)
      .maybeSingle();
    const rec = recRaw as
      | { id: string; user_id: string; org_id: string | null; status: string | null; framework: unknown }
      | null;
    if (!rec || rec.org_id !== request.org_id) {
      return NextResponse.json({ error: "That framework isn't on this account." }, { status: 404 });
    }
    // ⚠️ It has to be THEIR framework. Linking somebody else's capture to your
    // own ask would credit you with judgment you did not put on the record.
    if (rec.user_id !== user.id) {
      return NextResponse.json(
        { error: "You can only link a framework you captured yourself.", code: "NOT_AUTHOR" },
        { status: 403 }
      );
    }
    if (rec.status !== "complete" || !rec.framework) {
      return NextResponse.json(
        { error: "That session isn't finished yet — finish it and it'll link itself." },
        { status: 409 }
      );
    }

    const { error } = await svc
      .from("capture_requests")
      .update({ status: "captured", record_id: recordId, captured_at: now, updated_at: now })
      .eq("id", id);
    if (error) {
      return NextResponse.json({ error: "Could not link that.", details: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, status: "captured", record_id: recordId });
  } catch (err) {
    console.error("Unexpected error in request POST route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
