// TIER 1 / BUILD 2 — "Asked of you."
//
// GET            → every open ask put to the caller, plus what they've already
//                  captured through a campaign.
// GET ?count=1   → just the number, for the nav badge. Kept cheap on purpose:
//                  the badge runs on every page in the app.
//
// This is the assignee's whole experience of a capture campaign. They never see
// the roster, never see who else was asked, and never see who is behind — the
// RLS policy on capture_requests makes that structural rather than a filter
// this route has to remember (see the read-boundary note in the migration).
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import {
  REQUEST_COLUMNS,
  reconcileStartedRequests,
  type RequestRow,
} from "@/lib/capture-campaign";

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
    // 401 is expected on a logged-out page — the badge swallows it silently.
    if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

    const countOnly = req.nextUrl.searchParams.get("count") === "1";

    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .maybeSingle();
    const orgId = (profile as { org_id: string | null } | null)?.org_id ?? null;
    if (!orgId) {
      return NextResponse.json({ org: false, open: 0, requests: [] });
    }

    if (countOnly) {
      // No reconcile on the badge path. It runs on every page load in the app,
      // and a badge that is one page-load stale is fine; a badge that adds a
      // multi-query reconcile to every render is not.
      const { count } = await supabase
        .from("capture_requests")
        .select("id", { count: "exact", head: true })
        .eq("person_id", user.id)
        .in("status", ["open", "started"]);
      return NextResponse.json({ open: count ?? 0 });
    }

    await reconcileStartedRequests(service(), orgId);

    const { data: raw, error } = await supabase
      .from("capture_requests")
      .select(REQUEST_COLUMNS)
      .eq("person_id", user.id)
      .order("created_at", { ascending: false });
    if (error) {
      return NextResponse.json(
        { error: "Could not load what you've been asked", details: error.message },
        { status: 500 }
      );
    }
    const requests = (raw ?? []) as unknown as RequestRow[];

    const campaignIds = Array.from(new Set(requests.map((r) => r.campaign_id)));
    let campaigns: Record<string, { name: string; purpose: string | null; status: string; owner: string }> = {};
    if (campaignIds.length > 0) {
      const { data: rawCampaigns } = await supabase
        .from("capture_campaigns")
        .select("id, name, purpose, status, created_by")
        .in("id", campaignIds);
      const rows = (rawCampaigns || []) as {
        id: string;
        name: string;
        purpose: string | null;
        status: string;
        created_by: string;
      }[];
      const ownerIds = Array.from(new Set(rows.map((c) => c.created_by)));
      let owners: Record<string, string> = {};
      if (ownerIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", ownerIds);
        owners = Object.fromEntries(
          ((profiles || []) as { id: string; display_name: string | null }[]).map((p) => [
            p.id,
            p.display_name || "A teammate",
          ])
        );
      }
      campaigns = Object.fromEntries(
        rows.map((c) => [
          c.id,
          {
            name: c.name,
            purpose: c.purpose,
            status: c.status,
            owner: owners[c.created_by] ?? "A teammate",
          },
        ])
      );
    }

    // ⭐ How many people hit the unanswered question behind a gap-sourced ask.
    // A COUNT, never a name — the P-9 boundary holds here too: an assignee
    // learns that four people needed this, not which four.
    const gapIds = requests.map((r) => r.source_gap_id).filter((v): v is string => !!v);
    let gapDemand: Record<string, number> = {};
    if (gapIds.length > 0) {
      const { data: gaps } = await supabase
        .from("knowledge_gaps")
        .select("id, asked_count")
        .in("id", gapIds);
      gapDemand = Object.fromEntries(
        ((gaps || []) as { id: string; asked_count: number }[]).map((g) => [g.id, g.asked_count])
      );
    }

    const recordIds = requests.map((r) => r.record_id).filter((v): v is string => !!v);
    let frameworks: Record<string, string> = {};
    if (recordIds.length > 0) {
      const { data: records } = await supabase
        .from("pattern_records")
        .select("id, framework")
        .in("id", recordIds);
      frameworks = Object.fromEntries(
        ((records || []) as { id: string; framework: { name?: string } | null }[]).map((r) => [
          r.id,
          r.framework?.name || "the framework",
        ])
      );
    }

    return NextResponse.json({
      org: true,
      open: requests.filter((r) => r.status === "open" || r.status === "started").length,
      requests: requests.map((r) => ({
        id: r.id,
        campaign_id: r.campaign_id,
        campaign_name: campaigns[r.campaign_id]?.name ?? "A campaign",
        campaign_purpose: campaigns[r.campaign_id]?.purpose ?? null,
        asked_by: campaigns[r.campaign_id]?.owner ?? "A teammate",
        prompt: r.prompt,
        source: r.source,
        gap_asked_count: r.source_gap_id ? gapDemand[r.source_gap_id] ?? null : null,
        status: r.status,
        decline_reason: r.decline_reason,
        record_id: r.record_id,
        framework_name: r.record_id ? frameworks[r.record_id] ?? null : null,
        created_at: r.created_at,
        captured_at: r.captured_at,
      })),
    });
  } catch (err) {
    console.error("Unexpected error in requests/mine route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
