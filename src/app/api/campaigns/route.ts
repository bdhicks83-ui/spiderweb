// TIER 1 / BUILD 2 — campaigns list + create.
//
// GET  → every campaign in the caller's org, with progress computed from the
//        requests THE CALLER CAN READ. Org-wide list; the roster underneath is
//        not (see the read-boundary note in supabase/t1b2-capture-campaign.sql).
// POST → create a campaign and its first asks in one call.
//        { name, purpose?, due_on?, asks: [{ person_id, prompt, gap_id? }] }
//
// AUTHORIZATION: requireCampaignOwner() — a manager (is_manager(), P-7) or an
// org admin (is_org_admin(), T1B1), both evaluated by Postgres as the caller
// over RPC. org_id always comes off the caller's own profile, never the body.
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

export async function GET(_req: NextRequest) {
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
      return NextResponse.json({ org: false, campaigns: [] });
    }

    // ⭐ Self-heal FIRST, so a campaign can never show "in progress" for an ask
    // whose framework already exists. See reconcileStartedRequests().
    await reconcileStartedRequests(service(), orgId);

    const { data: rawCampaigns, error } = await supabase
      .from("capture_campaigns")
      .select(CAMPAIGN_COLUMNS)
      .eq("org_id", orgId)
      .order("status", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) {
      return NextResponse.json(
        { error: "Could not load campaigns", details: error.message },
        { status: 500 }
      );
    }
    const campaigns = (rawCampaigns ?? []) as unknown as CampaignRow[];

    // ⭐ PROGRESS IS COMPUTED FROM THE **TRUE** ROW SET, NOT FROM WHAT THE
    // CALLER CAN SEE — and that is a correction, not a widening.
    //
    // The first cut read these through the SESSION client so RLS scoped them.
    // That produced an honest-looking lie: a manager who could see one of a
    // campaign's two asks was shown "0 of 1", with nothing saying it was a
    // partial view. A count that silently drops rows reads as "this is the
    // whole campaign" when it isn't — the same class of failure as a silent
    // truncation, and it would have had managers reporting wrong numbers
    // upward with total confidence.
    //
    // The fix is the P-9 shape: an AGGREGATE CARRIES NO NAME. "6 of 15
    // captured" says nothing about who, so it is safe for everyone in the org;
    // the per-person ROSTER stays RLS-scoped on the detail route, which is
    // where the person-level information actually lives.
    const { data: rawRequests } = await service()
      .from("capture_requests")
      .select(REQUEST_COLUMNS)
      .eq("org_id", orgId);
    const requests = (rawRequests ?? []) as unknown as RequestRow[];

    const byCampaign = new Map<string, RequestRow[]>();
    for (const r of requests) {
      const list = byCampaign.get(r.campaign_id) ?? [];
      list.push(r);
      byCampaign.set(r.campaign_id, list);
    }

    const ownerIds = Array.from(new Set(campaigns.map((c) => c.created_by)));
    let names: Record<string, string> = {};
    if (ownerIds.length > 0) {
      const { data: owners } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", ownerIds);
      names = Object.fromEntries(
        ((owners || []) as { id: string; display_name: string | null }[]).map((p) => [
          p.id,
          p.display_name || "A teammate",
        ])
      );
    }

    return NextResponse.json({
      org: true,
      campaigns: campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        purpose: c.purpose,
        status: c.status,
        due_on: c.due_on,
        created_at: c.created_at,
        owner_name: names[c.created_by] ?? "A teammate",
        owned_by_me: c.created_by === user.id,
        // True campaign-wide totals. Names never leave the server.
        progress: computeProgress(byCampaign.get(c.id) ?? []),
      })),
    });
  } catch (err) {
    console.error("Unexpected error in campaigns GET route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSessionClient();
    const gate = await requireCampaignOwner(supabase);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error, code: gate.code }, { status: gate.status });
    }

    const body = await req.json().catch(() => ({}));
    const name = cleanPrompt(body?.name, 120);
    if (!name) {
      return NextResponse.json({ error: "Give the campaign a name." }, { status: 400 });
    }
    const purpose = cleanPrompt(body?.purpose, 600);
    const dueOn =
      typeof body?.due_on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.due_on)
        ? body.due_on
        : null;

    const rawAsks = Array.isArray(body?.asks) ? body.asks : [];
    if (rawAsks.length === 0) {
      return NextResponse.json(
        { error: "A campaign with no asks in it does nothing — add at least one." },
        { status: 400 }
      );
    }
    if (rawAsks.length > 200) {
      return NextResponse.json({ error: "That's too many asks at once (max 200)." }, { status: 400 });
    }

    const svc = service();

    // Every assignee must be an ACTIVE member of the caller's org. Checked
    // against the org, not merely against existence — a person_id from the
    // body is otherwise a way to write a row into somebody else's world.
    const { data: rawPeople } = await svc
      .from("profiles")
      .select("id, deactivated_at, role")
      .eq("org_id", gate.orgId);
    const people = (rawPeople ?? []) as {
      id: string;
      deactivated_at: string | null;
      role: string | null;
    }[];
    const activeIds = new Set(people.filter((p) => !p.deactivated_at).map((p) => p.id));
    // ─── FLOOR GUIDE PHASE A ───
    // A capture ask says "write down how you decide this, and it becomes the
    // team's framework." Sending one to a contributor would set them up to hit
    // the integrity guard at the end of an interview they were invited into —
    // the cruellest possible place to enforce a rule. Refuse at assignment.
    // (Phase C is what gives an admin a legitimate way to ask a contributor for
    // input: a deep-dive request, captured as input rather than as judgment.)
    const contributorIds = new Set(
      people.filter((p) => p.role === "contributor").map((p) => p.id)
    );

    type Ask = { person_id: string; prompt: string; gap_id: string | null };
    const asks: Ask[] = [];
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
      if (contributorIds.has(personId)) {
        // ⚠️ DRAFT CUSTOMER-FACING COPY — PENDING BRIAN (Floor Guide A).
        return NextResponse.json(
          {
            error:
              "One of those people is set up as a contributor, so they can't codify a framework. Move them to member first if capturing their judgment is the goal.",
            code: "CONTRIBUTOR_ASSIGNEE",
          },
          { status: 400 }
        );
      }
      asks.push({
        person_id: personId,
        prompt,
        gap_id: typeof a?.gap_id === "string" && a.gap_id ? a.gap_id : null,
      });
    }
    if (asks.length === 0) {
      return NextResponse.json(
        { error: "Every ask needs a person and a question." },
        { status: 400 }
      );
    }

    const { data: campaignRaw, error: campaignError } = await svc
      .from("capture_campaigns")
      .insert({
        org_id: gate.orgId,
        name,
        purpose,
        due_on: dueOn,
        created_by: gate.userId,
        updated_at: new Date().toISOString(),
      })
      .select(CAMPAIGN_COLUMNS)
      .single();
    if (campaignError || !campaignRaw) {
      return NextResponse.json(
        { error: "Could not create the campaign.", details: campaignError?.message },
        { status: 500 }
      );
    }
    const campaign = campaignRaw as unknown as CampaignRow;

    const rows = asks.map((a) => ({
      campaign_id: campaign.id,
      org_id: gate.orgId,
      person_id: a.person_id,
      prompt: a.prompt,
      prompt_norm: normalizeRequestPrompt(a.prompt),
      source: a.gap_id ? "gap" : "manual",
      source_gap_id: a.gap_id,
      created_by: gate.userId,
      updated_at: new Date().toISOString(),
    }));

    // Upsert against the PLAIN unique index (campaign_id, person_id,
    // prompt_norm) — see the index note in the migration. ignoreDuplicates so
    // re-submitting the same form never errors in the owner's face.
    const { error: reqError } = await svc
      .from("capture_requests")
      .upsert(rows, {
        onConflict: "campaign_id,person_id,prompt_norm",
        ignoreDuplicates: true,
      });
    if (reqError) {
      return NextResponse.json(
        {
          error: "The campaign was created but the asks didn't land.",
          details: reqError.message,
          campaign_id: campaign.id,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      campaign_id: campaign.id,
      name: campaign.name,
      asks_created: rows.length,
    });
  } catch (err) {
    console.error("Unexpected error in campaigns POST route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
