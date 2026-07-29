// TIER 1 / BUILD 1 — DEACTIVATE / REACTIVATE A SEAT.
//
// POST { action: "deactivate" | "reactivate" }
//
// 🛑 THERE IS NO DELETE HERE AND THERE NEVER WILL BE.
//
// Deactivation sets profiles.deactivated_at and bans the auth user (a
// REVERSIBLE GoTrue flag, not a destructive one). It drops no rows, cascades
// nothing, and removes nothing from any surface the person's work appears on.
// Their frameworks stay in the library under their name; their conflicts stay
// open; their win-column mentions stay; the gaps they filled stay filled.
//
// This is the +test1 lesson encoded as a product rule rather than a warning in
// a doc: a person row can be the cascade parent of a large part of the live
// knowledge web (29 sources → 1,248 insights), and "remove this person" is
// almost never a request to destroy what they knew. It is a request to close
// the seat. So that is the only thing this route does.
//
// The two halves are reported separately on purpose. If the sign-in block
// fails, the seat is still marked deactivated in the app — and the admin is
// TOLD the person can still sign in, rather than being shown a green check
// over a half-applied change.
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { requireOrgAdmin, serviceClient } from "@/lib/org-admin";

// GoTrue takes a duration string. 100 years ≈ permanent, and 'none' lifts it.
const BAN_FOREVER = "876000h";

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

    const body = await req.json().catch(() => ({}));
    const action = body?.action;
    if (action !== "deactivate" && action !== "reactivate") {
      return NextResponse.json(
        { error: "action must be deactivate or reactivate." },
        { status: 400 }
      );
    }

    const service = serviceClient();

    const { data: targetRaw } = await service
      .from("profiles")
      .select("id, org_id, is_org_admin, deactivated_at, display_name")
      .eq("id", id)
      .maybeSingle();
    const target = targetRaw as
      | {
          id: string;
          org_id: string | null;
          is_org_admin: boolean | null;
          deactivated_at: string | null;
          display_name: string | null;
        }
      | null;
    if (!target || target.org_id !== ctx.orgId) {
      return NextResponse.json({ error: "That person isn't on this account." }, { status: 404 });
    }

    if (action === "deactivate") {
      if (target.id === ctx.user.id) {
        return NextResponse.json(
          { error: "You can't deactivate your own seat.", code: "SELF_DEACTIVATE" },
          { status: 400 }
        );
      }
      if (target.is_org_admin) {
        const { count } = await service
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("org_id", ctx.orgId)
          .eq("is_org_admin", true)
          .is("deactivated_at", null);
        if ((count ?? 0) <= 1) {
          return NextResponse.json(
            { error: "This is the account's only admin — add another one first.", code: "LAST_ADMIN" },
            { status: 400 }
          );
        }
      }

      const { error } = await service
        .from("profiles")
        .update({
          deactivated_at: new Date().toISOString(),
          deactivated_by: ctx.user.id,
          // A deactivated seat keeps no admin authority. is_org_admin() also
          // checks deactivated_at, so this is belt-and-braces — but leaving a
          // true flag on a closed seat is the kind of thing that comes back.
          is_org_admin: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("org_id", ctx.orgId);
      if (error) {
        return NextResponse.json(
          { error: "Could not deactivate that seat.", details: error.message },
          { status: 500 }
        );
      }

      const { error: banError } = await service.auth.admin.updateUserById(id, {
        ban_duration: BAN_FOREVER,
      });

      return NextResponse.json({
        success: true,
        member_id: id,
        status: "deactivated",
        sign_in_blocked: !banError,
        // Reported, never hidden — the same posture as the P-8 audit answer.
        warning: banError
          ? "The seat is closed in the app, but we couldn't block sign-in on the account itself. Try again, or reset it from Supabase."
          : null,
      });
    }

    // ─── reactivate ───
    const { error } = await service
      .from("profiles")
      .update({
        deactivated_at: null,
        deactivated_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("org_id", ctx.orgId);
    if (error) {
      return NextResponse.json(
        { error: "Could not reopen that seat.", details: error.message },
        { status: 500 }
      );
    }

    const { error: unbanError } = await service.auth.admin.updateUserById(id, {
      ban_duration: "none",
    });

    return NextResponse.json({
      success: true,
      member_id: id,
      status: "active",
      sign_in_restored: !unbanError,
      warning: unbanError
        ? "The seat is open again in the app, but sign-in is still blocked on the account itself. Send them a fresh sign-in link and try again."
        : null,
      // Admin access is NOT restored automatically — reopening a seat and
      // handing back administrative authority are two different decisions.
      note: "Admin access isn't restored automatically — grant it again if they need it.",
    });
  } catch (err) {
    console.error("Unexpected error in admin member status route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
