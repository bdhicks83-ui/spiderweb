// TIER 1 / BUILD 1 — EDIT A PERSON.
//
// PATCH { display_name?, claimed_title?, role?, persona?, manager_id?,
//         is_org_admin?, floor_guide_active? }
//
// This route is how an org's REPORTING STRUCTURE gets set — manager_id is what
// makes is_manager_of() true, which is what routes coaching signals (P-6) and
// prescription gates (P-4B) to the right person. Before this build, that
// relationship could only be written by a seed script.
//
// FOUR GUARDS, each protecting something that has bitten before:
//   1. same-org — enforced against the caller's own org_id, not the body
//   2. no reporting cycles — the coaching/prescription code walks this graph
//   3. can't remove the last admin — an org with no admin is unadministrable
//   4. can't demote yourself out of admin — same lockout, one click closer
//
// ─── FLOOR GUIDE PHASE A adds the two assignment actions and two more guards ──
//   role: 'contributor'   — the rung below member. Their input never becomes
//                           canonical judgment (enforced by the pattern_records
//                           trigger, not by this route).
//   floor_guide_active    — switch the onboarding surface on/off for a person.
//
//   5. a contributor cannot have direct reports. is_manager_of() and the
//      coaching/prescription routing walk manager_id, so a contributor sitting in
//      somebody's reporting line would receive manager-only person-level signals
//      about them. is_manager() was hardened in SQL to refuse them the manager
//      CAPABILITY; this refuses the inconsistent DATA so nobody has to rely on
//      both halves agreeing.
//   6. a contributor cannot also administer the account. Not a security hole (an
//      admin can change roles anyway, including their own), but a genuinely
//      confusing state to hold in your head while looking at a live console —
//      "this person can promote anyone but cannot capture a framework." Refused
//      with a sentence that says which order to do it in.
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import {
  cleanText,
  isPersonaValue,
  isRole,
  requireOrgAdmin,
  serviceClient,
  wouldCycle,
} from "@/lib/org-admin";

export async function PATCH(
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

    // ─── Guard 1: the target must be in the caller's org ───
    const { data: targetRaw } = await service
      .from("profiles")
      .select("id, org_id, is_org_admin, deactivated_at, manager_id, role, floor_guide_active")
      .eq("id", id)
      .maybeSingle();
    const target = targetRaw as
      | {
          id: string;
          org_id: string | null;
          is_org_admin: boolean | null;
          deactivated_at: string | null;
          manager_id: string | null;
          role: string | null;
          floor_guide_active: boolean | null;
        }
      | null;
    if (!target || target.org_id !== ctx.orgId) {
      // Same response for "doesn't exist" and "belongs to another org" — an
      // admin should not be able to probe another tenant's ids.
      return NextResponse.json({ error: "That person isn't on this account." }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const update: Record<string, unknown> = {};

    const displayName = cleanText(body?.display_name, 80);
    if (displayName !== undefined) {
      if (displayName === null) {
        return NextResponse.json(
          { error: "A name is required — it's what shows on everything they capture." },
          { status: 400 }
        );
      }
      update.display_name = displayName;
    }

    const claimedTitle = cleanText(body?.claimed_title, 120);
    if (claimedTitle !== undefined) update.claimed_title = claimedTitle;

    if (body?.role !== undefined) {
      if (!isRole(body.role)) {
        return NextResponse.json(
          { error: "Role must be contributor, member or manager." },
          { status: 400 }
        );
      }
      // ─── Guards 5 + 6: the contributor rung has two prerequisites ───
      if (body.role === "contributor") {
        const { count: reports } = await service
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("org_id", ctx.orgId)
          .eq("manager_id", id)
          .is("deactivated_at", null);
        if ((reports ?? 0) > 0) {
          // ⚠️ DRAFT CUSTOMER-FACING COPY — PENDING BRIAN (Floor Guide A).
          return NextResponse.json(
            {
              error:
                "People report to this person, so they can't be a contributor — coaching signals and approvals route through them. Move their reports to someone else first.",
              code: "CONTRIBUTOR_HAS_REPORTS",
            },
            { status: 400 }
          );
        }
        // The admin flag as it will stand AFTER this request, so turning both off
        // in one save is allowed and only a genuinely conflicting end state is
        // refused.
        const adminAfter =
          body?.is_org_admin !== undefined ? body.is_org_admin === true : !!target.is_org_admin;
        if (adminAfter) {
          return NextResponse.json(
            {
              error:
                "This person administers the account, so they can't be a contributor at the same time. Take their admin access off first, then change the role.",
              code: "CONTRIBUTOR_IS_ADMIN",
            },
            { status: 400 }
          );
        }
      }
      update.role = body.role;
    }

    // ─── FLOOR GUIDE ASSIGNMENT ───
    // Deliberately NOT tied to the role. A new operator (contributor) and a new
    // PM (member, or even manager) are both day-one nervous and both need the
    // same thing; role-locking it would have meant the new PM never gets it.
    //
    // started_at is re-stamped on every switch-ON so the console shows how long
    // THIS stint has been running, and is left alone on switch-off so the record
    // of when they last onboarded survives. activated_by records which admin did
    // it — an assignment nobody can account for is one nobody will turn off.
    if (body?.floor_guide_active !== undefined) {
      const wantFloorGuide = body.floor_guide_active === true;
      update.floor_guide_active = wantFloorGuide;
      if (wantFloorGuide && !target.floor_guide_active) {
        update.floor_guide_started_at = new Date().toISOString();
        update.floor_guide_activated_by = ctx.user.id;
      }
    }

    if (body?.persona !== undefined) {
      if (!isPersonaValue(body.persona)) {
        return NextResponse.json({ error: "Unknown persona." }, { status: 400 });
      }
      update.persona = body.persona;
    }

    // ─── Guard 2: reporting structure, no cycles ───
    if (body?.manager_id !== undefined) {
      const managerId =
        typeof body.manager_id === "string" && body.manager_id ? body.manager_id : null;

      if (managerId) {
        if (managerId === id) {
          return NextResponse.json({ error: "Nobody reports to themselves." }, { status: 400 });
        }
        const { data: peopleRaw } = await service
          .from("profiles")
          .select("id, manager_id, org_id, deactivated_at")
          .eq("org_id", ctx.orgId);
        const people = (peopleRaw ?? []) as {
          id: string;
          manager_id: string | null;
          deactivated_at: string | null;
        }[];
        const candidate = people.find((p) => p.id === managerId);
        if (!candidate) {
          return NextResponse.json({ error: "That manager isn't on this account." }, { status: 400 });
        }
        if (candidate.deactivated_at) {
          return NextResponse.json(
            { error: "That manager's seat is deactivated — pick an active one." },
            { status: 400 }
          );
        }
        const managerOf: Record<string, string | null> = Object.fromEntries(
          people.map((p) => [p.id, p.manager_id])
        );
        if (wouldCycle(id, managerId, managerOf)) {
          return NextResponse.json(
            {
              error:
                "That would make the reporting line loop back on itself. Pick someone further up the chain.",
              code: "REPORTING_CYCLE",
            },
            { status: 400 }
          );
        }
      }
      update.manager_id = managerId;
    }

    // ─── Guards 3 + 4: never leave the org without an admin ───
    if (body?.is_org_admin !== undefined) {
      const wantAdmin = body.is_org_admin === true;
      if (!wantAdmin && target.is_org_admin) {
        if (target.id === ctx.user.id) {
          return NextResponse.json(
            {
              error:
                "You can't remove your own admin access — make someone else an admin first, then they can do it.",
              code: "LAST_ADMIN_SELF",
            },
            { status: 400 }
          );
        }
        const { count } = await service
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("org_id", ctx.orgId)
          .eq("is_org_admin", true)
          .is("deactivated_at", null);
        if ((count ?? 0) <= 1) {
          return NextResponse.json(
            {
              error: "This is the account's only admin — add another one first.",
              code: "LAST_ADMIN",
            },
            { status: 400 }
          );
        }
      }
      update.is_org_admin = wantAdmin;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    update.updated_at = new Date().toISOString();

    const { error } = await service
      .from("profiles")
      .update(update)
      // Belt and braces: the org check above already passed, and this .eq()
      // means even a bug upstream cannot write across a tenant boundary.
      .eq("id", id)
      .eq("org_id", ctx.orgId);

    if (error) {
      return NextResponse.json({ error: "Could not save that.", details: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, member_id: id, updated: Object.keys(update) });
  } catch (err) {
    console.error("Unexpected error in admin member PATCH route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
