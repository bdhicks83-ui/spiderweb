// FLOOR GUIDE / PHASE C — the admin's ask, and the review view.
//
// POST → an org admin asks one or more contributors how they actually handle
//        something. Creates the request; nothing is written about any target
//        beyond their id being on the live list.
// GET  → the deep-dive view. RLS decides who sees what; this route does not.
//        An admin sees the org's asks and every answer. A manager sees their
//        reports' answers (DECISION 1) and the asks those answers belong to.
//        Everybody else sees nothing.
//
// ═══════════════════════════════════════════════════════════════════════════
// ⭐ THIS SURFACE IS NOT FLOOR GUIDE, AND THE CODE KEEPS THE DISTANCE.
// Nothing here imports @/lib/floor-guide's mode resolution, nothing here is
// called from a Floor Guide page, and nothing a Floor Guide question does can
// reach these tables — there is no code path, which is the only kind of
// promise that survives a refactor. The contributor-facing half (the
// disclosure, the answer, the silent decline) lives in /api/deep-dives/[id]
// and /deep-dives/mine, unmistakably separate from /floor-guide.
//
// ⭐ ADMIN-ONLY REQUESTS, v1 (DECISION 3). Not managers: a manager asking a
// report how they work recreates the evaluation smell this tier spent two
// phases removing, and T1B1 already put administration on its own orthogonal
// axis. Widen later if a pilot asks — deliberately, not by drift.
// ═══════════════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { readViewerContext, CONTRIBUTOR_ROLE } from "@/lib/floor-guide";
import {
  MAX_TARGETS,
  REQUEST_COLUMNS,
  RESPONSE_COLUMNS,
  deepDiveFinding,
  type DeepDiveFinding,
  type DeepDiveRequestRow,
  type DeepDiveResponseRow,
} from "@/lib/deep-dives";

// ⚠️⚠️ DRAFT CUSTOMER-FACING COPY — PENDING BRIAN'S SIGN-OFF (Floor Guide C).
const COPY = {
  notAdmin: "Asking for a deep dive is an account-admin action on this version.",
  needTopic:
    "Say what you want to know in a sentence — \"how do you decide when the line can restart after a changeover\" is the shape.",
  needTargets: "Pick at least one person to ask.",
  badTargets:
    "Deep dives go to people on contributor seats. One of the people picked isn't one — refresh and pick again.",
  badAnchor: "That framework isn't on this account or isn't finished — pick another, or send without one.",
  tooMany: `That's more than ${MAX_TARGETS} people — past that it's a survey, and surveys get survey answers.`,
  created: (n: number) =>
    n === 1
      ? "Sent. They'll see exactly what you'll see and who sees it, before they type a word."
      : `Sent to ${n} people. Each of them sees exactly what you'll see and who sees it, before they type a word.`,
};

type ProfileLite = { id: string; display_name: string | null; claimed_title: string | null };

type ResponseView = {
  id: string;
  request_id: string;
  person: ProfileLite | null;
  answer: string;
  divergence: string | null;
  divergence_note: string | null;
  compared_record_id: string | null;
  candidate_insight_id: string | null;
  candidate_status: string | null;
  training_request_id: string | null;
  created_at: string;
};

type RequestView = {
  id: string;
  topic: string;
  status: string;
  created_at: string;
  sent_to_count: number;
  asked_by: string | null;
  anchor: { id: string; name: string } | null;
  responses: ResponseView[];
  finding: DeepDiveFinding;
};

export async function GET() {
  try {
    const session = await createSessionClient();
    const viewer = await readViewerContext(session);
    if (!viewer) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

    // Both reads go through the SESSION client so RLS is the authorization:
    // admin → org's asks · manager → asks carrying a report's answer ·
    // targeted contributor → their own asks (harmless here; their page is
    // /deep-dives/mine and this one is not linked for them).
    const { data: reqRaw, error: reqError } = await session
      .from("deep_dive_requests")
      .select(REQUEST_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(100);
    if (reqError) {
      return NextResponse.json(
        { error: "Could not load deep dives.", details: reqError.message },
        { status: 500 }
      );
    }
    const requests = (reqRaw ?? []) as unknown as DeepDiveRequestRow[];

    const { data: respRaw, error: respError } = await session
      .from("deep_dive_responses")
      .select(RESPONSE_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(400);
    if (respError) {
      return NextResponse.json(
        { error: "Could not load the answers.", details: respError.message },
        { status: 500 }
      );
    }
    const responses = (respRaw ?? []) as unknown as DeepDiveResponseRow[];

    // Names — the two-query shape every list route here uses.
    const personIds = Array.from(
      new Set([
        ...requests.map((r) => r.created_by),
        ...responses.map((r) => r.user_id),
      ])
    );
    let people: Record<string, ProfileLite> = {};
    if (personIds.length > 0) {
      const { data: profs } = await session
        .from("profiles")
        .select("id, display_name, claimed_title")
        .in("id", personIds);
      people = Object.fromEntries(((profs ?? []) as ProfileLite[]).map((p) => [p.id, p]));
    }

    // Anchor framework names.
    const anchorIds = Array.from(
      new Set(requests.map((r) => r.anchor_record_id).filter((v): v is string => !!v))
    );
    let anchors: Record<string, string> = {};
    if (anchorIds.length > 0) {
      const { data: recs } = await session
        .from("pattern_records")
        .select("id, framework")
        .in("id", anchorIds);
      anchors = Object.fromEntries(
        ((recs ?? []) as { id: string; framework: { name?: string } | null }[]).map((r) => [
          r.id,
          r.framework?.name ?? "a framework",
        ])
      );
    }

    // The second lens's current state, so the card can say "in the queue" vs
    // "made a framework" without a second page load.
    const candidateIds = Array.from(
      new Set(responses.map((r) => r.candidate_insight_id).filter((v): v is string => !!v))
    );
    let candidateStatus: Record<string, string> = {};
    if (candidateIds.length > 0) {
      const { data: cands } = await session
        .from("candidate_insights")
        .select("id, status")
        .in("id", candidateIds);
      candidateStatus = Object.fromEntries(
        ((cands ?? []) as { id: string; status: string }[]).map((c) => [c.id, c.status])
      );
    }

    const byRequest = new Map<string, DeepDiveResponseRow[]>();
    for (const r of responses) {
      const list = byRequest.get(r.request_id) ?? [];
      list.push(r);
      byRequest.set(r.request_id, list);
    }

    const view: RequestView[] = requests.map((r) => {
      const rs = byRequest.get(r.id) ?? [];
      return {
        id: r.id,
        topic: r.topic,
        status: r.status,
        created_at: r.created_at,
        // Frozen at creation — deliberately NOT the live target list, so who
        // has answered/declined is never legible (DECISION 5).
        sent_to_count: r.sent_to_count,
        asked_by: people[r.created_by]?.display_name ?? null,
        anchor: r.anchor_record_id
          ? { id: r.anchor_record_id, name: anchors[r.anchor_record_id] ?? "a framework" }
          : null,
        responses: rs.map((resp) => ({
          id: resp.id,
          request_id: resp.request_id,
          person: people[resp.user_id] ?? null,
          answer: resp.answer,
          divergence: resp.divergence,
          divergence_note: resp.divergence_note,
          compared_record_id: resp.compared_record_id,
          candidate_insight_id: resp.candidate_insight_id,
          candidate_status: resp.candidate_insight_id
            ? candidateStatus[resp.candidate_insight_id] ?? null
            : null,
          training_request_id: resp.training_request_id,
          created_at: resp.created_at,
        })),
        // ⭐ Thin-data guarded, counts only. Computed from what THIS caller can
        // see, which for the admin is everything and for a manager is their
        // reports — an honest slice either way.
        finding: deepDiveFinding(rs),
      };
    });

    const { data: isAdmin } = await session.rpc("is_org_admin");
    const canAsk = isAdmin === true;

    // What the create form needs: who can be asked, and what can anchor it.
    let contributors: ProfileLite[] = [];
    let frameworks: { id: string; name: string }[] = [];
    if (canAsk && viewer.orgId) {
      const { data: contribRows } = await session
        .from("profiles")
        .select("id, display_name, claimed_title")
        .eq("org_id", viewer.orgId)
        .eq("role", CONTRIBUTOR_ROLE)
        .is("deactivated_at", null)
        .order("display_name", { ascending: true });
      contributors = (contribRows ?? []) as ProfileLite[];

      const { data: fwRows } = await session
        .from("pattern_records")
        .select("id, framework")
        .eq("org_id", viewer.orgId)
        .eq("status", "complete")
        .not("framework", "is", null)
        .order("created_at", { ascending: false })
        .limit(60);
      frameworks = ((fwRows ?? []) as { id: string; framework: { name?: string } | null }[])
        .filter((r) => typeof r.framework?.name === "string")
        .map((r) => ({ id: r.id, name: r.framework!.name! }));
    }

    return NextResponse.json({
      can_ask: canAsk,
      viewer: { id: viewer.userId, role: viewer.role },
      contributors,
      frameworks,
      requests: view,
    });
  } catch (err) {
    console.error("Unexpected error in deep-dives GET:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await createSessionClient();
    const viewer = await readViewerContext(session);
    if (!viewer) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    if (!viewer.orgId) {
      return NextResponse.json({ error: "This account isn't in an organization yet." }, { status: 409 });
    }
    const orgId = viewer.orgId;

    // DECISION 3 — admin only, v1. The RPC is the same SECURITY DEFINER answer
    // every /api/admin route trusts.
    const { data: isAdmin } = await session.rpc("is_org_admin");
    if (isAdmin !== true) {
      return NextResponse.json({ error: COPY.notAdmin, code: "NOT_ORG_ADMIN" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      topic?: unknown;
      anchor_record_id?: unknown;
      target_ids?: unknown;
    };
    const topic = typeof body.topic === "string" ? body.topic.trim().slice(0, 600) : "";
    if (topic.length < 12) {
      return NextResponse.json({ error: COPY.needTopic, code: "NEED_TOPIC" }, { status: 400 });
    }
    const targetIds = Array.isArray(body.target_ids)
      ? Array.from(
          new Set(body.target_ids.filter((v): v is string => typeof v === "string" && !!v))
        )
      : [];
    if (targetIds.length === 0) {
      return NextResponse.json({ error: COPY.needTargets, code: "NEED_TARGETS" }, { status: 400 });
    }
    if (targetIds.length > MAX_TARGETS) {
      return NextResponse.json({ error: COPY.tooMany, code: "TOO_MANY" }, { status: 400 });
    }

    // Targets must be live contributor seats in THIS org. Validated here AND
    // shaped by the picker, because a checkbox list is not a gate.
    const { data: targetRows } = await session
      .from("profiles")
      .select("id, role, org_id, deactivated_at")
      .in("id", targetIds);
    const usable = ((targetRows ?? []) as {
      id: string;
      role: string | null;
      org_id: string | null;
      deactivated_at: string | null;
    }[]).filter(
      (p) => p.org_id === orgId && p.role === CONTRIBUTOR_ROLE && !p.deactivated_at
    );
    if (usable.length !== targetIds.length) {
      return NextResponse.json({ error: COPY.badTargets, code: "BAD_TARGETS" }, { status: 400 });
    }

    // The anchor, if any: a complete framework on this account.
    let anchorId: string | null = null;
    if (typeof body.anchor_record_id === "string" && body.anchor_record_id) {
      const { data: recRaw } = await session
        .from("pattern_records")
        .select("id, org_id, status, framework")
        .eq("id", body.anchor_record_id)
        .maybeSingle();
      const rec = recRaw as
        | { id: string; org_id: string | null; status: string | null; framework: unknown }
        | null;
      if (!rec || rec.org_id !== orgId || rec.status !== "complete" || !rec.framework) {
        return NextResponse.json({ error: COPY.badAnchor, code: "BAD_ANCHOR" }, { status: 400 });
      }
      anchorId = rec.id;
    }

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data: created, error: insError } = await service
      .from("deep_dive_requests")
      .insert({
        org_id: orgId,
        created_by: viewer.userId,
        topic,
        anchor_record_id: anchorId,
        targets: usable.map((p) => p.id),
        sent_to_count: usable.length,
        status: "open",
      })
      .select(REQUEST_COLUMNS)
      .single();
    if (insError || !created) {
      return NextResponse.json(
        { error: "Could not send that ask.", details: insError?.message },
        { status: 500 }
      );
    }

    console.log(
      `[deep-dive] ask created (org=${orgId}, targets=${usable.length}, anchored=${!!anchorId})`
    );
    return NextResponse.json({
      ok: true,
      id: (created as unknown as DeepDiveRequestRow).id,
      message: COPY.created(usable.length),
    });
  } catch (err) {
    console.error("Unexpected error in deep-dives POST:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
