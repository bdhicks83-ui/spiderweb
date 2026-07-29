// TIER 1 / BUILD 1 — RE-ISSUE A SIGN-IN LINK.
//
// POST (no body) → a fresh magic link for an existing seat.
//
// Exists because an invite link expires and the first thing that happens in a
// real onboarding session is that somebody doesn't click it in time. Without
// this, the admin's only recourse is to delete and re-invite — which is exactly
// the destructive move this build exists to make unnecessary.
//
// Nothing about the account changes: no password is set, no role moves, no
// token is stored. It is the same Supabase admin API call the invite uses.
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import {
  authUsersByIds,
  generateSignInLink,
  requestOrigin,
  requireOrgAdmin,
  serviceClient,
} from "@/lib/org-admin";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await createSessionClient();
    const gate = await requireOrgAdmin(session);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error, code: gate.code }, { status: gate.status });
    }
    const { ctx } = gate;
    const service = serviceClient();

    const { data: targetRaw } = await service
      .from("profiles")
      .select("id, org_id, deactivated_at, display_name")
      .eq("id", id)
      .maybeSingle();
    const target = targetRaw as
      | { id: string; org_id: string | null; deactivated_at: string | null; display_name: string | null }
      | null;
    if (!target || target.org_id !== ctx.orgId) {
      return NextResponse.json({ error: "That person isn't on this account." }, { status: 404 });
    }
    if (target.deactivated_at) {
      return NextResponse.json(
        {
          error: "That seat is deactivated — reopen it first, then send a link.",
          code: "DEACTIVATED",
        },
        { status: 409 }
      );
    }

    const auth = await authUsersByIds(service, [id]);
    const email = auth[id]?.email ?? null;
    if (!email) {
      return NextResponse.json(
        { error: "We couldn't find an email address for that seat." },
        { status: 409 }
      );
    }

    const origin = requestOrigin(req.headers, req.nextUrl.origin);
    const gen = await generateSignInLink(service, email, origin);
    if (!gen.ok) {
      return NextResponse.json({ error: gen.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      member_id: id,
      email,
      invite_link: gen.link.url,
      invite_kind: gen.link.kind,
      invite_expires_hint: gen.link.expires_hint,
    });
  } catch (err) {
    console.error("Unexpected error in admin invite-link route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
