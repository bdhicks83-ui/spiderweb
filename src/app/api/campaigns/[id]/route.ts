// TIER 1 / BUILD 2 — one campaign: the progress view, and close/reopen.
//
// GET   → the campaign plus every ask THE CALLER MAY READ, with names and the
//         framework each captured ask produced.
// PATCH → { name?, purpose?, due_on?, status? } — owner/admin only.
// POST  → add more asks to an existing campaign.
//         { asks: [{ person_id, prompt, gap_id? }] }
//
// ⚠️ The ask list here is read through the SESSION client, so RLS is the real
// gate on the roster: a peer who opens this page sees the campaign and their
// own ask, a manager sees their direct reports', an admin sees all. The page
// is deliberately safe to link to from anywhere.
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import {
  CAMPAIGN_COLUMNS,
  REQUEST_COLUMNS,
  cleanPrompt,
  computeProgress,
  normalizeRequestPrompt,
  reconcileStartedRequests,
  requireCampaignOwner,
  type CampaignRow,
  type RequestRow,
} from "@/lib/capture-campaign";

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

    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .maybeSingle();
    const orgId = (profile as { org_id: string | null } | null)?.org_id ?? null;
    if (!orgId) return NextResponse.json({ error: "Not in an org" }, { status: 409 });

    await reconcileStartedRequests(service(), orgId);

    const { data: rawCampaign } = await supabase
      .from("capture_campaigns")
      .select(CAMPAIGN_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    const campaign = (rawCampaign ?? null) as unknown as CampaignRow | null;
    if (!campaign) {
      return NextResponse.json({ error: "That campaign isn't on this account." }, { status: 404 });
    }

    // ─── TWO READS, TWO DIFFERENT BOUNDARIES, ON PURPOSE ───
    //
    // (1) The ROSTER — who was asked what, and how they answered — through the
    //     SESSION client, so the capture_requests policy is the real gate. A
    //     peer sees their own ask; a manager sees their direct reports'; an
    //     admin and the person who sent the asks see all of them.
    const { data: rawRequests } = await supabase
      .from("capture_requests")
      .select(REQUEST_COLUMNS)
      .eq("campaign_id", id)
      .order("created_at", { ascending: true });
    const requests = (rawRequests ?? []) as unknown as RequestRow[];

    // (2) The TOTALS — service role, campaign-wide. An aggregate carries no
    //     name (the P-9 rule: the org-wide row has a COUNT, never a NAME), so
    //     everyone gets the true number even when they can only see part of
    //     the roster. Showing a caller "0 of 1" for a two-ask campaign was the
    //     first cut's real bug: not a leak, but a partial view presented as
    //     the whole, which is how somebody reports a wrong number upward with
    //     complete confidence.
    const { data: rawAll } = await service()
      .from("capture_requests")
      .select(REQUEST_COLUMNS)
      .eq("campaign_id", id);
    const allRequests = (rawAll ?? []) as unknown as RequestRow[];

    const personIds = Array.from(
      new Set([...requests.map((r) => r.person_id), campaign.created_by])
    );
    let people: Record<string, { name: string; title: string | null }> = {};
    if (personIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, claimed_title")
        .in("id", personIds);
      people = Object.fromEntries(
        (
          (profiles || []) as { id: string; display_name: string | null; claimed_title: string | null }[]
        ).map((p) => [p.id, { name: p.display_name || "A teammate", title: p.claimed_title }])
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

    // Is the caller allowed to RUN this campaign (edit it, add asks)? The
    // routes enforce it; this just tells the UI whether to render the controls.
    const [{ data: isManager }, { data: isAdmin }] = await Promise.all([
      supabase.rpc("is_manager"),
      supabase.rpc("is_org_admin"),
    ]);
    const canManage = isManager === true || isAdmin === true;

    return NextResponse.json({
      campaign: {
        id: campaign.id,
        name: campaign.name,
        purpose: campaign.purpose,
        status: campaign.status,
        due_on: campaign.due_on,
        created_at: campaign.created_at,
        owner_name: people[campaign.created_by]?.name ?? "A teammate",
        owned_by_me: campaign.created_by === user.id,
      },
      can_manage: canManage,
      progress: computeProgress(allRequests),
      // ⚠️ SAY SO WHEN THE LIST BELOW ISN'T THE WHOLE LIST. "No silent caps":
      // if a surface bounds what it shows, it has to admit it, or the reader
      // fills the gap with an assumption that it didn't.
      roster_is_partial: requests.length < allRequests.length,
      roster_shown: requests.length,
      roster_total: allRequests.length,
      requests: requests.map((r) => ({
        id: r.id,
        person_id: r.person_id,
        person_name: people[r.person_id]?.name ?? "A teammate",
        person_title: people[r.person_id]?.title ?? null,
        prompt: r.prompt,
        source: r.source,
        source_gap_id: r.source_gap_id,
        status: r.status,
        decline_reason: r.decline_reason,
        record_id: r.record_id,
        framework_name: r.record_id ? frameworks[r.record_id] ?? null : null,
        is_mine: r.person_id === user.id,
        created_at: r.created_at,
        captured_at: r.captured_at,
      })),
    });
  } catch (err) {
    console.error("Unexpected error in campaign GET route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createSessionClient();
    const gate = await requireCampaignOwner(supabase);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error, code: gate.code }, { status: gate.status });
    }
    const svc = service();

    const { data: existing } = await svc
      .from("capture_campaigns")
      .select("id, org_id, status")
      .eq("id", id)
      .maybeSingle();
    const row = existing as { id: string; org_id: string; status: string } | null;
    if (!row || row.org_id !== gate.orgId) {
      return NextResponse.json({ error: "That campaign isn't on this account." }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const update: Record<string, unknown> = {};

    const name = cleanPrompt(body?.name, 120);
    if (body?.name !== undefined) {
      if (!name) return NextResponse.json({ error: "Give the campaign a name." }, { status: 400 });
      update.name = name;
    }
    if (body?.purpose !== undefined) update.purpose = cleanPrompt(body.purpose, 600);
    if (body?.due_on !== undefined) {
      update.due_on =
        typeof body.due_on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.due_on)
          ? body.due_on
          : null;
    }
    if (body?.status !== undefined) {
      if (body.status !== "open" && body.status !== "closed") {
        return NextResponse.json({ error: "Status must be open or closed." }, { status: 400 });
      }
      update.status = body.status;
      // 🛑 Closing a campaign is NOT a delete and never touches its asks. The
      // asks stay exactly as they are — captured ones keep their frameworks,
      // declined ones keep their reasons. Closing means "we're done pushing on
      // this," not "none of that happened."
      update.closed_at = body.status === "closed" ? new Date().toISOString() : null;
      update.closed_by = body.status === "closed" ? gate.userId : null;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }
    update.updated_at = new Date().toISOString();

    const { error } = await svc
      .from("capture_campaigns")
      .update(update)
      .eq("id", id)
      .eq("org_id", gate.orgId);
    if (error) {
      return NextResponse.json(
        { error: "Could not save the campaign.", details: error.message },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true, campaign_id: id, updated: Object.keys(update) });
  } catch (err) {
    console.error("Unexpected error in campaign PATCH route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createSessionClient();
    const gate = await requireCampaignOwner(supabase);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error, code: gate.code }, { status: gate.status });
    }
    const svc = service();

    const { data: existing } = await svc
      .from("capture_campaigns")
      .select("id, org_id, status")
      .eq("id", id)
      .maybeSingle();
    const campaign = existing as { id: string; org_id: string; status: string } | null;
    if (!campaign || campaign.org_id !== gate.orgId) {
      return NextResponse.json({ error: "That campaign isn't on this account." }, { status: 404 });
    }
    if (campaign.status === "closed") {
      return NextResponse.json(
        { error: "That campaign is closed — reopen it before adding asks.", code: "CLOSED" },
        { status: 409 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const rawAsks = Array.isArray(body?.asks) ? body.asks : [];
    if (rawAsks.length === 0) {
      return NextResponse.json({ error: "Nothing to add." }, { status: 400 });
    }

    const { data: rawPeople } = await svc
      .from("profiles")
      .select("id, deactivated_at")
      .eq("org_id", gate.orgId);
    const activeIds = new Set(
      ((rawPeople ?? []) as { id: string; deactivated_at: string | null }[])
        .filter((p) => !p.deactivated_at)
        .map((p) => p.id)
    );

    const rows = [];
    for (const a of rawAsks) {
      const personId = typeof a?.person_id === "string" ? a.person_id : "";
      const prompt = cleanPrompt(a?.prompt, 600);
      if (!personId || !prompt) continue;
      if (!activeIds.has(personId)) {
        return NextResponse.json(
          { error: "One of those people isn't an active member of this account." },
          { status: 400 }
        );
      }
      rows.push({
        campaign_id: id,
        org_id: gate.orgId,
        person_id: personId,
        prompt,
        prompt_norm: normalizeRequestPrompt(prompt),
        source: typeof a?.gap_id === "string" && a.gap_id ? "gap" : "manual",
        source_gap_id: typeof a?.gap_id === "string" && a.gap_id ? a.gap_id : null,
        created_by: gate.userId,
        updated_at: new Date().toISOString(),
      });
    }
    if (rows.length === 0) {
      return NextResponse.json({ error: "Every ask needs a person and a question." }, { status: 400 });
    }

    const { error } = await svc.from("capture_requests").upsert(rows, {
      onConflict: "campaign_id,person_id,prompt_norm",
      ignoreDuplicates: true,
    });
    if (error) {
      return NextResponse.json(
        { error: "Could not add those asks.", details: error.message },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true, campaign_id: id, asks_added: rows.length });
  } catch (err) {
    console.error("Unexpected error in campaign add-asks route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
