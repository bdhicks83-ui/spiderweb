// ⭐ P-7 — the "who else needs it" beat, as an action.
//
// POST {}                — (re)compute routing suggestions for this request and
//                          store them on training_requests.routing_targets.
// POST { confirm: true } — the leader routes the training to the flagged
//                          people/role: stamps routed_at / routed_by. The
//                          demo beat is the click; delivery mechanics stay
//                          the existing prescription machinery.
//
// 🛡️ Training-not-surveillance: every reason stored here is exposure/recency/
// role-framed (see src/lib/training-routing.ts — it structurally cannot read a
// performance signal). Routing addresses "who needs this training," never
// "who is failing."
//
// Manager-gated like every other Studio action. Session client proves the
// caller; service client does the cross-table reads/writes.
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import {
  computeRoutingTargets,
  isRoutingTargetArray,
} from "@/lib/training-routing";

export const maxDuration = 60;

type RequestRow = {
  id: string;
  org_id: string;
  requested_by: string;
  audience_role: string | null;
  audience_summary: string;
  subject_entities: { type: string; name: string; detail: string | null }[] | null;
  prescription_id: string | null;
  routing_targets: unknown;
  routed_at: string | null;
  status: string;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const confirm = body?.confirm === true;

    const supabase = await createSessionClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }
    const { data: isManager } = await supabase.rpc("is_manager");
    if (isManager !== true) {
      return NextResponse.json(
        { error: "Routing a training is a manager action." },
        { status: 403 }
      );
    }

    const { data: reqRaw } = await supabase
      .from("training_requests")
      .select(
        "id, org_id, requested_by, audience_role, audience_summary, subject_entities, prescription_id, routing_targets, routed_at, status"
      )
      .eq("id", id)
      .maybeSingle();
    const request = reqRaw as unknown as RequestRow | null;
    if (!request) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // ── Confirm: the leader routes it ────────────────────────────────────────
    if (confirm) {
      if (!isRoutingTargetArray(request.routing_targets) || request.routing_targets.length === 0) {
        return NextResponse.json(
          { error: "Nothing to route yet — generate the training first." },
          { status: 409 }
        );
      }
      if (request.routed_at) {
        return NextResponse.json(
          { error: "Already routed — nothing to redo." },
          { status: 409 }
        );
      }
      const { error: updError } = await service
        .from("training_requests")
        .update({ routed_at: new Date().toISOString(), routed_by: user.id })
        .eq("id", request.id);
      if (updError) {
        return NextResponse.json({ error: updError.message }, { status: 500 });
      }
      return NextResponse.json({
        success: true,
        message:
          "Routed. Everyone flagged gets this training as closing a gap for the seat — never as a mark.",
      });
    }

    // ── Suggest / refresh ────────────────────────────────────────────────────
    // Exclude the SOURCE experts (the training is built FROM them) and the
    // requester (they already have the problem in hand).
    const exclude = new Set<string>([request.requested_by]);
    if (request.prescription_id) {
      const { data: rxRaw } = await service
        .from("prescriptions")
        .select("experts")
        .eq("id", request.prescription_id)
        .maybeSingle();
      const experts = (rxRaw as { experts: { user_id: string }[] | null } | null)?.experts;
      for (const e of experts || []) exclude.add(e.user_id);
    }

    const targets = await computeRoutingTargets(service, {
      orgId: request.org_id,
      audienceRole: request.audience_role,
      audienceSummary: request.audience_summary,
      subjectEntities: request.subject_entities || [],
      excludeUserIds: [...exclude],
    });

    const { error: saveError } = await service
      .from("training_requests")
      .update({ routing_targets: targets })
      .eq("id", request.id);
    if (saveError) {
      return NextResponse.json({ error: saveError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      routing_targets: targets,
      message:
        targets.length > 0
          ? "Here's who else carries this gap — flagged by seat and exposure, never by performance."
          : "No one else in the org matches this training's seat right now.",
    });
  } catch (err) {
    console.error("Unexpected error in training-studio route-targets route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
