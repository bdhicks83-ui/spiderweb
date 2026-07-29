// TIER 1 / BUILD 1 — ORG SETTINGS.
//
// PATCH { name?, industry?, default_persona? }
//
// Nothing destructive lives on this route by design: there is no delete, no
// merge, no transfer, and no way to change which org the caller belongs to.
// The three fields here are the three that change what the product SAYS
// (attribution reads as the customer's own team) and how a new seat starts
// (default_persona shades /codify's register for someone who hasn't picked one).
//
// orgs has no update RLS policy — renames are service-role behind this gate,
// the same lockdown doctrine as profiles.plan and profiles.role.
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { cleanText, isPersonaValue, requireOrgAdmin, serviceClient } from "@/lib/org-admin";

export async function PATCH(req: NextRequest) {
  try {
    const session = await createSessionClient();
    const gate = await requireOrgAdmin(session);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error, code: gate.code }, { status: gate.status });
    }
    const { ctx } = gate;

    const body = await req.json().catch(() => ({}));
    const update: Record<string, unknown> = {};

    const name = cleanText(body?.name, 120);
    if (name !== undefined) {
      if (!name) {
        return NextResponse.json({ error: "Your organization needs a name." }, { status: 400 });
      }
      update.name = name;
    }

    const industry = cleanText(body?.industry, 80);
    if (industry !== undefined) update.industry = industry;

    if (body?.default_persona !== undefined) {
      if (body.default_persona === null || body.default_persona === "") {
        update.default_persona = null;
      } else if (!isPersonaValue(body.default_persona)) {
        return NextResponse.json({ error: "Unknown persona." }, { status: 400 });
      } else {
        update.default_persona = body.default_persona;
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }
    update.updated_at = new Date().toISOString();

    const service = serviceClient();
    const { error } = await service.from("orgs").update(update).eq("id", ctx.orgId);
    if (error) {
      return NextResponse.json(
        { error: "Could not save your organization settings.", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, org_id: ctx.orgId, updated: Object.keys(update) });
  } catch (err) {
    console.error("Unexpected error in admin org route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
