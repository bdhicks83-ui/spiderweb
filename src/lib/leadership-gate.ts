// THE LEADERSHIP GATE — one authority check for /exposure and /ledger.
//
// ⛔ SERVER-ONLY.
//
// Manager OR org admin OR an executive seat (persona 'exec' — the same signal
// resolveTrackKey() uses to route the executive onboarding track). One rung
// wider than requireReadoutViewer, deliberately:
//
//   • /readout is the artifact a champion forwards OUT of the building. It is
//     gated tightly because a readout circulating before its owner has read it
//     is how a half-finished number ends up in front of a VP.
//   • /exposure and /ledger stay INSIDE. An executive on the account is exactly
//     the person they exist for.
//
// ⭐ ONE implementation, two surfaces. Two copies of an authority check is how
// two surfaces quietly start disagreeing about who is allowed in.
//
// HIDDEN, NEVER LOCKED for everyone else: the dashboard does not offer the
// door, and a direct visit is sent quietly home by the page.
import type { SupabaseClient } from "@supabase/supabase-js";

export type LeadershipGate =
  | { ok: true; userId: string; orgId: string; isExec: boolean }
  | { ok: false; status: number; error: string; code?: string };

export async function requireLeadershipViewer(
  session: SupabaseClient,
  opts: { denial: string }
): Promise<LeadershipGate> {
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Not logged in" };

  const { data: profile } = await session
    .from("profiles")
    .select("org_id, persona, deactivated_at")
    .eq("id", user.id)
    .maybeSingle();
  const row = (profile ?? null) as {
    org_id: string | null;
    persona: string | null;
    deactivated_at: string | null;
  } | null;

  const orgId = row?.org_id ?? null;
  if (!orgId || row?.deactivated_at) {
    return {
      ok: false,
      status: 409,
      error: "You're not part of an organization yet.",
      code: "NO_ORG",
    };
  }

  // Both are SECURITY DEFINER functions evaluated by Postgres AS THE CALLER, so
  // the UI is never offered a door the database would refuse.
  const [{ data: isManager }, { data: isAdmin }] = await Promise.all([
    session.rpc("is_manager"),
    session.rpc("is_org_admin"),
  ]);
  const isExec = row?.persona === "exec";
  if (isManager !== true && isAdmin !== true && !isExec) {
    return { ok: false, status: 403, error: opts.denial, code: "NOT_VIEWER" };
  }
  return { ok: true, userId: user.id, orgId, isExec };
}
