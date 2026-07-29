// TIER 1 / BUILD 1 — everything the /admin console renders, in one GET.
//
// Returns: the org, its people (with role, title, manager, capture count and
// sign-in state), the setup checklist, and whether the caller is an admin.
//
// FLOOR GUIDE PHASE A adds each person's floor_guide_active / _started_at, a
// contributor count, and an `onboarding` list — the "who's in Floor Guide right
// now" view. That list is a management fact (the admin switched it on), NOT a
// window into anything private: it says WHO is onboarding and for how long, and
// it structurally cannot say what any of them asked, because a Floor Guide
// question is never written against a person in the first place.
//
// AUTHORIZATION IS THE ORG, TWICE OVER. requireOrgAdmin() proves the caller is
// a live admin via the is_org_admin() RPC (evaluated by Postgres as the
// caller), and every query below is scoped to the org_id read off the CALLER'S
// OWN PROFILE — never from the request. There is no parameter on this route
// that can point it at another org.
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import {
  ORG_COLUMNS,
  PROFILE_COLUMNS,
  authUsersByIds,
  computeChecklist,
  requireOrgAdmin,
  serviceClient,
  type OrgRow,
  type ProfileRow,
} from "@/lib/org-admin";

export async function GET(_req: NextRequest) {
  try {
    const session = await createSessionClient();
    const gate = await requireOrgAdmin(session);
    if (!gate.ok) {
      return NextResponse.json(
        { error: gate.error, code: gate.code, is_org_admin: false },
        { status: gate.status }
      );
    }
    const { ctx } = gate;
    const service = serviceClient();

    // ─── The org ───
    const { data: orgRaw, error: orgError } = await session
      .from("orgs")
      .select(ORG_COLUMNS)
      .eq("id", ctx.orgId)
      .maybeSingle();
    if (orgError || !orgRaw) {
      return NextResponse.json(
        { error: "Could not load your organization", details: orgError?.message },
        { status: 500 }
      );
    }
    const org = orgRaw as unknown as OrgRow;

    // ─── The people ───
    // Read through the SESSION client so the "org members read profiles" policy
    // is the real gate on this list, not the .eq() below it.
    const { data: peopleRaw, error: peopleError } = await session
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("org_id", ctx.orgId)
      .order("created_at", { ascending: true });
    if (peopleError) {
      return NextResponse.json(
        { error: "Could not load your people", details: peopleError.message },
        { status: 500 }
      );
    }
    const people = (peopleRaw ?? []) as unknown as ProfileRow[];
    const ids = people.map((p) => p.id);

    // ─── Capture status: COMPLETE frameworks per person, this org only ───
    const capturedByPerson: Record<string, number> = {};
    if (ids.length > 0) {
      const { data: records } = await service
        .from("pattern_records")
        .select("user_id")
        .eq("org_id", ctx.orgId)
        .eq("status", "complete");
      for (const r of (records ?? []) as { user_id: string }[]) {
        capturedByPerson[r.user_id] = (capturedByPerson[r.user_id] ?? 0) + 1;
      }
    }

    // ─── Email + sign-in state (service-role-only auth data) ───
    // ⚠️ Emails are shown ONLY to an admin, and only for their own org's
    // people. They never travel on any other surface in this app.
    let authById: Record<string, { email: string | null; last_sign_in_at: string | null }> = {};
    let authWarning: string | null = null;
    try {
      authById = await authUsersByIds(service, ids);
    } catch (err) {
      // A failed auth read must not blank the whole console — the people list
      // is still correct without emails, and saying so is better than an
      // empty page with no explanation.
      authWarning = err instanceof Error ? err.message : "Could not read sign-in state";
    }

    const nameById: Record<string, string> = Object.fromEntries(
      people.map((p) => [p.id, p.display_name || "Unnamed seat"])
    );

    const members = people.map((p) => {
      const auth = authById[p.id];
      const signedIn = auth?.last_sign_in_at ?? null;
      return {
        id: p.id,
        display_name: p.display_name,
        email: auth?.email ?? null,
        claimed_title: p.claimed_title,
        role: (p.role as string) ?? "member",
        persona: p.persona,
        manager_id: p.manager_id,
        manager_name: p.manager_id ? nameById[p.manager_id] ?? null : null,
        is_org_admin: !!p.is_org_admin,
        floor_guide_active: !!p.floor_guide_active,
        floor_guide_started_at: p.floor_guide_started_at,
        is_me: p.id === ctx.user.id,
        deactivated_at: p.deactivated_at,
        invited_at: p.invited_at,
        last_sign_in_at: signedIn,
        // "Invited but never opened it." Derived, never stored — a stored
        // pending flag drifts the moment somebody signs in.
        pending: !signedIn,
        frameworks_codified: capturedByPerson[p.id] ?? 0,
      };
    });

    const activeMembers = people.filter((p) => !p.deactivated_at);
    const checklist = computeChecklist({ org, activeMembers, capturedByPerson });

    return NextResponse.json({
      is_org_admin: true,
      me: { id: ctx.user.id, display_name: ctx.profile.display_name },
      org: {
        id: org.id,
        name: org.name,
        industry: org.industry,
        default_persona: org.default_persona,
        is_demo: !!org.is_demo,
        created_at: org.created_at,
      },
      members,
      counts: {
        active: activeMembers.length,
        deactivated: people.length - activeMembers.length,
        managers: activeMembers.filter((p) => p.role === "manager").length,
        admins: activeMembers.filter((p) => p.is_org_admin).length,
        contributors: activeMembers.filter((p) => p.role === "contributor").length,
        onboarding: activeMembers.filter((p) => p.floor_guide_active).length,
      },
      // Longest-running stint first: the useful question an admin has about this
      // list is "has anybody been left in onboarding mode for four months," and
      // sorting by start date is the whole answer.
      onboarding: activeMembers
        .filter((p) => p.floor_guide_active)
        .sort((a, b) =>
          (a.floor_guide_started_at ?? "").localeCompare(b.floor_guide_started_at ?? "")
        )
        .map((p) => ({
          id: p.id,
          display_name: p.display_name,
          claimed_title: p.claimed_title,
          role: (p.role as string) ?? "member",
          started_at: p.floor_guide_started_at,
        })),
      checklist: checklist.items,
      setup_percent: checklist.percent,
      auth_warning: authWarning,
    });
  } catch (err) {
    console.error("Unexpected error in admin overview route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
