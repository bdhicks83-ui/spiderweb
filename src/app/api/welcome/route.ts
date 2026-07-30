// ROLE-BASED ONBOARDING — /api/welcome
//
// GET  → who am I, which track is mine, how far am I, and should the dashboard
//        auto-route me there. needsOnboarding is true ONLY when the caller has
//        an org and NO row exists for their own track — the /welcome page
//        writes a row the moment it loads (steps_done 0), so a person is
//        auto-routed at most once and never hijacked mid-life. Existing seats
//        were backfilled complete by supabase/role-onboarding.sql.
//
// POST → record progress on the caller's OWN track. The track is resolved
//        SERVER-SIDE from the caller's profile — the body cannot name a track,
//        which is what makes the "view another track" switch structurally
//        view-only: there is no request a viewer can send that writes progress
//        on a track that isn't theirs.
//
// Write path doctrine (T1B1): session client proves who's asking; the
// service-role client does the write (onboarding_progress has no client write
// policies). steps_done is monotonic — a re-run of an earlier step never
// walks completion backwards.
import { NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/org-admin";
import {
  STEPS_DONE_COMPLETE,
  TRACKS,
  resolveTrackKey,
  type TrackKey,
} from "@/lib/onboarding-tracks";

export const dynamic = "force-dynamic";

type ProfileRow = {
  org_id: string | null;
  role: string | null;
  persona: string | null;
  is_org_admin: boolean | null;
  display_name: string | null;
  floor_guide_active: boolean | null;
  deactivated_at: string | null;
};

type ProgressRow = {
  track: string;
  steps_done: number;
  completed_at: string | null;
};

const PROFILE_COLUMNS =
  "org_id, role, persona, is_org_admin, display_name, floor_guide_active, deactivated_at";

async function readCaller() {
  const session = await createSessionClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) return null;

  const { data } = await session
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", user.id)
    .maybeSingle();
  const profile = (data ?? null) as ProfileRow | null;
  return { session, userId: user.id, profile };
}

export async function GET() {
  const caller = await readCaller();
  if (!caller) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }
  const { session, userId, profile } = caller;

  // No org yet (a brand-new account mid /admin/start) — the tour would only be
  // in the way. Never route.
  if (!profile?.org_id || profile.deactivated_at) {
    return NextResponse.json({ needsOnboarding: false, track: null });
  }

  const track: TrackKey = resolveTrackKey({
    isOrgAdmin: profile.is_org_admin,
    role: profile.role,
    persona: profile.persona,
  });

  // Own rows only — the RLS select policy is the gate.
  const { data: rows } = await session
    .from("onboarding_progress")
    .select("track, steps_done, completed_at")
    .eq("user_id", userId);
  const own =
    ((rows ?? []) as ProgressRow[]).find((r) => r.track === track) ?? null;

  // The exec/admin tracks deep-link into /readout, which is gated to managers
  // and org admins (requireReadoutViewer's rule). Resolve it here once so the
  // page never renders a link that would 403 in the person's face.
  const [{ data: isManager }, { data: isAdmin }] = await Promise.all([
    session.rpc("is_manager"),
    session.rpc("is_org_admin"),
  ]);

  return NextResponse.json({
    track,
    stepCount: TRACKS[track].steps.length,
    stepsDone: own?.steps_done ?? 0,
    completedAt: own?.completed_at ?? null,
    seen: !!own,
    needsOnboarding: !own,
    displayName: profile.display_name,
    floorGuideActive: !!profile.floor_guide_active,
    canSeeReadout: isManager === true || isAdmin === true,
  });
}

export async function POST(request: Request) {
  const caller = await readCaller();
  if (!caller) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }
  const { userId, profile } = caller;
  if (!profile?.org_id || profile.deactivated_at) {
    return NextResponse.json({ error: "No organization" }, { status: 409 });
  }

  let body: { stepsDone?: unknown; complete?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is fine — treated as "mark seen" (steps_done 0).
  }

  // ⭐ Resolved server-side, never read from the body — the view-only guarantee.
  const track: TrackKey = resolveTrackKey({
    isOrgAdmin: profile.is_org_admin,
    role: profile.role,
    persona: profile.persona,
  });
  const stepCount = TRACKS[track].steps.length;

  const complete = body.complete === true;
  const rawSteps = typeof body.stepsDone === "number" ? body.stepsDone : 0;
  const requestedSteps = complete
    ? STEPS_DONE_COMPLETE
    : Math.max(0, Math.min(Math.floor(rawSteps), stepCount));

  const service = serviceClient();
  const { data: existingData } = await service
    .from("onboarding_progress")
    .select("steps_done, completed_at")
    .eq("user_id", userId)
    .eq("track", track)
    .maybeSingle();
  const existing =
    (existingData ?? null) as Pick<ProgressRow, "steps_done" | "completed_at"> | null;

  const stepsDone = Math.max(existing?.steps_done ?? 0, requestedSteps);
  const completedAt =
    existing?.completed_at ?? (complete ? new Date().toISOString() : null);

  const { error } = await service.from("onboarding_progress").upsert(
    {
      user_id: userId,
      track,
      steps_done: stepsDone,
      completed_at: completedAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,track" }
  );
  if (error) {
    return NextResponse.json({ error: "Could not save progress" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    track,
    stepsDone,
    completedAt,
  });
}
