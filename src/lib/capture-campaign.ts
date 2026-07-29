// TIER 1 / BUILD 2 — the Capture Campaign's server-side spine.
//
// ⛔ SERVER-ONLY. Reaches the service-role client. A "use client" page that
// imports this leaks the key into the browser bundle — the same boundary that
// keeps @/lib/claude and @/lib/knowledge-gaps out of client pages. Everything
// the UI needs travels over /api/campaigns/* and /api/requests/*.
import type { SupabaseClient } from "@supabase/supabase-js";

// ═════════════════════════════════════════════════════════════════════════════
// TYPES
// ═════════════════════════════════════════════════════════════════════════════

export type CampaignStatus = "open" | "closed";
export type RequestStatus = "open" | "started" | "captured" | "declined";
export type RequestSource = "manual" | "gap";

export type CampaignRow = {
  id: string;
  org_id: string;
  name: string;
  purpose: string | null;
  status: CampaignStatus;
  due_on: string | null;
  created_by: string;
  created_at: string;
  closed_at: string | null;
};

export const CAMPAIGN_COLUMNS =
  "id, org_id, name, purpose, status, due_on, created_by, created_at, closed_at";

export type RequestRow = {
  id: string;
  campaign_id: string;
  org_id: string;
  person_id: string;
  prompt: string;
  prompt_norm: string;
  source: RequestSource;
  source_gap_id: string | null;
  status: RequestStatus;
  record_id: string | null;
  decline_reason: string | null;
  started_at: string | null;
  captured_at: string | null;
  declined_at: string | null;
  created_by: string;
  created_at: string;
};

export const REQUEST_COLUMNS =
  "id, campaign_id, org_id, person_id, prompt, prompt_norm, source, source_gap_id, " +
  "status, record_id, decline_reason, started_at, captured_at, declined_at, " +
  "created_by, created_at";

/**
 * How long a "started" request holds its soft claim before the reconciler
 * gives up trying to match a framework to it and puts it back to open.
 *
 * Mirrors P-9's CLAIM_STALE_HOURS deliberately — it is the same shape of
 * promise ("I'm on it") with the same failure mode (they got pulled away), and
 * two different numbers for the same idea is how a codebase starts lying to
 * itself. Change both or neither.
 */
export const CLAIM_STALE_HOURS = 24;

// ═════════════════════════════════════════════════════════════════════════════
// NORMALIZATION
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Mirrors capture_requests.prompt_norm in supabase/t1b2-capture-campaign.sql —
 * change one, change both.
 *
 * Its ONLY job is stopping the same person being asked the identical question
 * twice in one campaign. It is deliberately NOT the P-9 gap de-dupe: there is
 * no semantic matching here and there should not be. Two similarly-worded asks
 * to the same person are a judgment call the ASKER is allowed to make — maybe
 * they really do want both angles — and silently merging them would delete an
 * instruction a human wrote on purpose. Exact-normalized collision only.
 */
export function normalizeRequestPrompt(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1000);
}

export function cleanPrompt(value: unknown, max = 600): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!t) return null;
  return t.slice(0, max);
}

// ═════════════════════════════════════════════════════════════════════════════
// PROGRESS
// ═════════════════════════════════════════════════════════════════════════════

export type CampaignProgress = {
  asks: number;
  captured: number;
  declined: number;
  started: number;
  open: number;
  /** captured / (asks - declined). Declines are removed from the denominator. */
  percent: number;
  /** How many DISTINCT people have captured at least one ask. */
  people_captured: number;
  people: number;
};

/**
 * ⚠️ DECLINES COME OUT OF THE DENOMINATOR.
 *
 * "Not the right person, ask Dana" is a correct and useful answer, and a
 * campaign that counts it against completion teaches managers to stop offering
 * the decline option — which converts a real routing signal back into silence
 * that looks like non-compliance. A campaign where 3 of 10 declined and 7 of 7
 * captured is DONE, and it should say 100%.
 */
export function computeProgress(requests: RequestRow[]): CampaignProgress {
  const asks = requests.length;
  const captured = requests.filter((r) => r.status === "captured").length;
  const declined = requests.filter((r) => r.status === "declined").length;
  const started = requests.filter((r) => r.status === "started").length;
  const open = requests.filter((r) => r.status === "open").length;
  const answerable = asks - declined;
  const people = new Set(requests.map((r) => r.person_id)).size;
  const people_captured = new Set(
    requests.filter((r) => r.status === "captured").map((r) => r.person_id)
  ).size;
  return {
    asks,
    captured,
    declined,
    started,
    open,
    percent: answerable > 0 ? Math.round((captured / answerable) * 100) : 0,
    people,
    people_captured,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// THE RECONCILER
// ═════════════════════════════════════════════════════════════════════════════

export type ReconcileSummary = { captured: number; released: number };

/**
 * ⭐ DERIVED AT READ TIME, NOT PUSHED BY A CLIENT CALLBACK.
 *
 * This is the P-9 lesson repeated because it is the same situation exactly.
 * "Capture this" hands the person off to a multi-turn interview they may finish
 * in another tab, tomorrow, or after a refresh. A client-side "mark it captured
 * when the session ends" is the close-the-loop step that silently doesn't
 * happen — the framework exists, the request still says open, and the campaign
 * under-reports forever with no error anywhere.
 *
 * So nothing pushes. Every read of a campaign or of "asked of you" runs this
 * first, and it matches on what actually exists in pattern_records.
 *
 * KNOWN IMPRECISION, stated rather than hidden: if somebody starts a request
 * and then codifies something UNRELATED in that window, the wrong framework
 * links. Same trade P-9 made, same mitigation — the assignee can re-link by
 * hand from their queue, and the scale fix is a similarity check, never a
 * callback.
 */
export async function reconcileStartedRequests(
  service: SupabaseClient,
  orgId: string
): Promise<ReconcileSummary> {
  const summary: ReconcileSummary = { captured: 0, released: 0 };
  try {
    const { data: raw, error } = await service
      .from("capture_requests")
      .select(REQUEST_COLUMNS)
      .eq("org_id", orgId)
      .eq("status", "started");
    if (error) {
      console.warn(`[capture-campaign] reconcile skipped: ${error.message}`);
      return summary;
    }
    const requests = (raw ?? []) as unknown as RequestRow[];
    const nowMs = Date.now();

    for (const req of requests) {
      if (!req.started_at) continue;

      // (a) An explicitly linked record that is now finished.
      let recordId: string | null = null;
      if (req.record_id) {
        const { data: recRaw } = await service
          .from("pattern_records")
          .select("id, status, framework")
          .eq("id", req.record_id)
          .maybeSingle();
        const rec = recRaw as { id: string; status: string | null; framework: unknown } | null;
        if (rec && rec.status === "complete" && rec.framework) recordId = rec.id;
      }

      // (b) Otherwise: the newest framework THIS PERSON completed since they
      //     started. Scoped to the person and to the org — a framework by
      //     somebody else can never close somebody else's ask.
      if (!recordId) {
        const { data: candRaw } = await service
          .from("pattern_records")
          .select("id, framework, created_at")
          .eq("org_id", orgId)
          .eq("user_id", req.person_id)
          .eq("status", "complete")
          .gte("created_at", req.started_at)
          .order("created_at", { ascending: false })
          .limit(1);
        const cand = ((candRaw ?? []) as { id: string; framework: unknown }[])[0];
        if (cand && cand.framework) recordId = cand.id;
      }

      if (recordId) {
        const { error: upErr } = await service
          .from("capture_requests")
          .update({
            status: "captured",
            record_id: recordId,
            captured_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", req.id)
          // Only close a row still in the state we read it in — two concurrent
          // reads must not double-count.
          .eq("status", "started");
        if (!upErr) summary.captured++;
        continue;
      }

      // (c) Stale claim → back on the shelf, so the campaign stops showing
      //     "in progress" for something nobody is doing.
      const ageHours = (nowMs - new Date(req.started_at).getTime()) / 3_600_000;
      if (ageHours >= CLAIM_STALE_HOURS) {
        const { error: relErr } = await service
          .from("capture_requests")
          .update({
            status: "open",
            started_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", req.id)
          .eq("status", "started");
        if (!relErr) summary.released++;
      }
    }
  } catch (err) {
    // A reconciler that can break a page read is worse than a stale count.
    console.warn("[capture-campaign] reconcile threw:", err);
  }
  return summary;
}

// ═════════════════════════════════════════════════════════════════════════════
// AUTHORITY
// ═════════════════════════════════════════════════════════════════════════════

export type OwnerGate =
  | { ok: true; userId: string; orgId: string }
  | { ok: false; status: number; error: string; code?: string };

/**
 * Who may create and run a campaign: a MANAGER (is_manager(), P-7) or an ORG
 * ADMIN (is_org_admin(), T1B1). Both checks are RPCs on the SESSION client, so
 * Postgres evaluates them as the caller under SECURITY DEFINER — the same
 * reasoning as the T1B1 admin gate, and the reason neither is a column read.
 *
 * Deliberately BROADER than the admin console. Asking your people to write down
 * how they decide something is ordinary management, not account administration;
 * restricting it to admins would put a purchasing decision in front of a
 * coaching conversation. Assignees are unrestricted — anyone can be asked.
 */
export async function requireCampaignOwner(session: SupabaseClient): Promise<OwnerGate> {
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Not logged in" };

  const { data: profile } = await session
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  const orgId = (profile as { org_id: string | null } | null)?.org_id ?? null;
  if (!orgId) {
    return {
      ok: false,
      status: 409,
      error: "Capture campaigns are a team surface — you're not part of an organization yet.",
      code: "NO_ORG",
    };
  }

  const [{ data: isManager }, { data: isAdmin }] = await Promise.all([
    session.rpc("is_manager"),
    session.rpc("is_org_admin"),
  ]);

  if (isManager !== true && isAdmin !== true) {
    return {
      ok: false,
      status: 403,
      error:
        "Campaigns are run by managers and account admins. If there's judgment worth capturing, tell yours — or capture it yourself.",
      code: "NOT_CAMPAIGN_OWNER",
    };
  }

  return { ok: true, userId: user.id, orgId };
}
