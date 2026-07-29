// TIER 1 / BUILD 1 — CREATE AN ORGANIZATION.
//
// This is the route that ends "Brian hand-runs a seed script to onboard a
// pilot." Two modes, and which one you get is decided by who you are — never
// by anything in the request body:
//
//   MODE A · FIRST RUN (anyone with no org yet)
//     POST { name, industry? }
//     → creates the org, makes the caller its first admin, drops them into the
//       setup checklist. Cannot touch an existing org: the caller must have
//       org_id IS NULL, so there is no path here that joins, renames, or
//       hijacks somebody else's account.
//
//   MODE B · PLATFORM OWNER (Brian, per PLATFORM_OWNER_USER_IDS)
//     POST { name, industry?, admin_email, admin_name, admin_title? }
//     → creates the org AND its first admin seat, and returns the invite link
//       to hand over. The new admin takes it from there — every subsequent
//       person on that account is invited by them, in the console, with no SQL.
//
// The caller's own org is NEVER modified by either mode.
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import {
  cleanText,
  findAuthUserByEmail,
  generateInviteLink,
  generateSignInLink,
  isPlatformOwner,
  isValidEmail,
  requestOrigin,
  serviceClient,
  waitForProfile,
} from "@/lib/org-admin";

export async function POST(req: NextRequest) {
  try {
    const session = await createSessionClient();
    const {
      data: { user },
    } = await session.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

    const { data: profRaw } = await session
      .from("profiles")
      .select("id, org_id, display_name")
      .eq("id", user.id)
      .maybeSingle();
    const me = (profRaw ?? null) as { id: string; org_id: string | null; display_name: string | null } | null;

    const body = await req.json().catch(() => ({}));
    const name = cleanText(body?.name, 120);
    if (!name) {
      return NextResponse.json({ error: "Your organization needs a name." }, { status: 400 });
    }
    const industry = cleanText(body?.industry, 80) ?? null;

    const owner = isPlatformOwner(user.id);
    const wantsSeparateAdmin = typeof body?.admin_email === "string" && body.admin_email.trim() !== "";

    if (wantsSeparateAdmin && !owner) {
      return NextResponse.json(
        {
          error: "You can create an organization for yourself, but not one administered by someone else.",
          code: "NOT_PLATFORM_OWNER",
        },
        { status: 403 }
      );
    }
    if (!wantsSeparateAdmin && me?.org_id) {
      return NextResponse.json(
        {
          error: "You're already part of an organization.",
          code: "ALREADY_IN_ORG",
        },
        { status: 409 }
      );
    }

    const service = serviceClient();
    const origin = requestOrigin(req.headers, req.nextUrl.origin);

    // ─── The org itself ───
    const { data: orgRaw, error: orgError } = await service
      .from("orgs")
      .insert({
        name,
        industry,
        is_demo: false,
        created_by: me ? user.id : null,
        updated_at: new Date().toISOString(),
      })
      .select("id, name")
      .single();
    if (orgError || !orgRaw) {
      return NextResponse.json(
        { error: "Could not create the organization.", details: orgError?.message },
        { status: 500 }
      );
    }
    const org = orgRaw as { id: string; name: string };

    // ─── MODE A: the caller becomes the first admin ───
    if (!wantsSeparateAdmin) {
      const { error } = await service
        .from("profiles")
        .update({
          org_id: org.id,
          is_org_admin: true,
          display_name: me?.display_name || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id)
        // Only claim a seat that has no org. If a parallel request just placed
        // this person in an org, this affects zero rows rather than moving them.
        .is("org_id", null);
      if (error) {
        return NextResponse.json(
          { error: "The organization was created but we couldn't add you to it.", details: error.message },
          { status: 500 }
        );
      }
      return NextResponse.json({
        success: true,
        mode: "self",
        org_id: org.id,
        org_name: org.name,
        next: "/admin",
      });
    }

    // ─── MODE B: platform owner stands up an account for a customer ───
    const adminEmail = String(body.admin_email).trim().toLowerCase();
    if (!isValidEmail(adminEmail)) {
      return NextResponse.json({ error: "That doesn't look like an email address." }, { status: 400 });
    }
    const adminName = cleanText(body?.admin_name, 80);
    if (!adminName) {
      return NextResponse.json({ error: "The first admin needs a name." }, { status: 400 });
    }
    const adminTitle = cleanText(body?.admin_title, 120) ?? null;

    let existing;
    try {
      existing = await findAuthUserByEmail(service, adminEmail);
    } catch (err) {
      return NextResponse.json(
        {
          error: "Couldn't check whether that email is already in use.",
          details: err instanceof Error ? err.message : String(err),
        },
        { status: 500 }
      );
    }

    let adminId: string;
    let link;

    if (existing) {
      const { data: prof } = await service
        .from("profiles")
        .select("org_id")
        .eq("id", existing.id)
        .maybeSingle();
      const existingOrg = (prof as { org_id: string | null } | null)?.org_id ?? null;
      if (existingOrg) {
        return NextResponse.json(
          {
            error:
              "That email is already on another account. The organization was created — invite a different first admin, or move that person off their current account first.",
            code: "OTHER_ORG",
            org_id: org.id,
          },
          { status: 409 }
        );
      }
      adminId = existing.id;
      const gen = await generateSignInLink(service, adminEmail, origin);
      if (!gen.ok) return NextResponse.json({ error: gen.error, org_id: org.id }, { status: 500 });
      link = gen.link;
    } else {
      const gen = await generateInviteLink(service, adminEmail, origin);
      if (!gen.ok) return NextResponse.json({ error: gen.error, org_id: org.id }, { status: 500 });
      adminId = gen.userId;
      link = gen.link;
    }

    const ready = await waitForProfile(service, adminId);
    if (!ready) {
      return NextResponse.json(
        {
          error: "The organization and the account exist, but the admin's profile hasn't appeared yet.",
          code: "PROFILE_NOT_READY",
          org_id: org.id,
        },
        { status: 503 }
      );
    }

    const { error: adminError } = await service
      .from("profiles")
      .update({
        org_id: org.id,
        display_name: adminName,
        claimed_title: adminTitle,
        role: "manager",
        is_org_admin: true,
        invited_at: new Date().toISOString(),
        invited_by: user.id,
        deactivated_at: null,
        deactivated_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", adminId);
    if (adminError) {
      return NextResponse.json(
        {
          error: "The organization was created but its first admin couldn't be set up.",
          details: adminError.message,
          org_id: org.id,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      mode: "platform_owner",
      org_id: org.id,
      org_name: org.name,
      admin_id: adminId,
      admin_email: adminEmail,
      invite_link: link.url,
      invite_kind: link.kind,
      invite_expires_hint: link.expires_hint,
    });
  } catch (err) {
    console.error("Unexpected error in admin orgs route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
