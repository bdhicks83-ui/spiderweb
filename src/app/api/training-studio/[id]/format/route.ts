// P-7 Build 3 (first half) — the leader chooses the format.
//
// POST { format_key, override_reason? }
//
// The agent recommended; the leader decides. Taking the recommendation and
// overriding it are equally valid paths through this route — flag-never-block.
//
// THE OVERRIDE IS A LEARNING SIGNAL. Every choice — matching or overriding —
// opens an attempt row on the format-outcome log (stubbed in
// p7-training-studio.sql for Build 5). An override is written the moment it
// happens, with the reason, alongside what the agent had recommended and its
// full rationale. Build 5 learns from exactly this pairing: "when a leader
// overrode the agent for this issue type and audience, who turned out to be
// right?"
//
// Choosing a format also re-sizes the underlying prescription — the Studio's
// formats sit on the same 4-rung effort ladder the rest of the engine ranks
// by, so the queue, the ROI rank and the efficacy loop keep seeing one
// consistent shape.
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { TRAINING_FORMATS, isTrainingFormatKey } from "@/lib/training-formats";
import { logFormatAttempt, rungForFormat } from "@/lib/training-studio";
import { RUNGS } from "@/lib/prescription";

type RequestRow = {
  id: string;
  org_id: string;
  audience_role: string | null;
  audience_team: string | null;
  audience_experience: string | null;
  issue_type: string | null;
  recommendations: { ranked?: unknown } | null;
  recommended_format: string | null;
  prescription_id: string | null;
  status: string;
  attempt_count: number;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const formatKey = body?.format_key;
    const overrideReason =
      typeof body?.override_reason === "string" && body.override_reason.trim()
        ? body.override_reason.trim()
        : null;

    if (!isTrainingFormatKey(formatKey)) {
      return NextResponse.json({ error: "Unknown training format" }, { status: 400 });
    }

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
        { error: "Choosing the format is a manager action." },
        { status: 403 }
      );
    }

    const { data: reqRaw } = await supabase
      .from("training_requests")
      .select(
        "id, org_id, audience_role, audience_team, audience_experience, issue_type, recommendations, recommended_format, prescription_id, status, attempt_count"
      )
      .eq("id", id)
      .maybeSingle();
    const request = reqRaw as unknown as RequestRow | null;
    if (!request) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!request.recommended_format) {
      return NextResponse.json(
        { error: "Get the format recommendation first — then choose." },
        { status: 409 }
      );
    }

    const wasOverride = formatKey !== request.recommended_format;
    const attempt = request.attempt_count + 1;
    const rung = rungForFormat(formatKey);
    const now = new Date().toISOString();

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error: updError } = await service
      .from("training_requests")
      .update({
        chosen_format: formatKey,
        format_overridden: wasOverride,
        override_reason: wasOverride ? overrideReason : null,
        format_chosen_by: user.id,
        format_chosen_at: now,
        // The chosen format OPENS the attempt. Generation (and any re-run of
        // it) then works on this same attempt number — a new attempt only
        // starts when a format is chosen again.
        attempt_count: attempt,
        status: request.status === "new" ? "recommended" : request.status,
      })
      .eq("id", request.id);
    if (updError) {
      return NextResponse.json({ error: updError.message }, { status: 500 });
    }

    // Keep the underlying prescription's effort sizing honest.
    if (request.prescription_id) {
      const rungLabel = RUNGS[rung]?.label ?? `Rung ${rung}`;
      await service
        .from("prescriptions")
        .update({
          rung,
          severity: rung,
          roi_score: rung,
          rank_rationale: `Leader-initiated · ${TRAINING_FORMATS[formatKey].name} · severity ${rung} (${rungLabel}) = ROI ${rung}`,
        })
        .eq("id", request.prescription_id);
    }

    // ── Open the attempt on the format-outcome log (Build 5 input) ──
    await logFormatAttempt(service, {
      orgId: request.org_id,
      trainingRequestId: request.id,
      prescriptionId: request.prescription_id,
      trainingId: null,
      attempt,
      issueType: request.issue_type,
      audienceRole: request.audience_role,
      audienceTeam: request.audience_team,
      audienceExperience: request.audience_experience,
      recommendedFormat: request.recommended_format,
      chosenFormat: formatKey,
      wasOverride,
      overrideReason: wasOverride ? overrideReason : null,
      agentRationale: request.recommendations?.ranked ?? [],
    });

    return NextResponse.json({
      success: true,
      chosen_format: formatKey,
      was_override: wasOverride,
      attempt,
      message: wasOverride
        ? `${TRAINING_FORMATS[formatKey].name} it is. Your choice is recorded alongside the recommendation — the system learns from where you disagree with it.`
        : `${TRAINING_FORMATS[formatKey].name} it is. Next: generate the training in that format.`,
    });
  } catch (err) {
    console.error("Unexpected error in training-studio format route:", err);
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
