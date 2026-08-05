// P-7 Build 3 (second half) — generate the training IN the chosen format.
//
// POST { altitude?: "floor" | "supervisor" | "exec" }   (default "floor")
//
// This EXTENDS the P-4B generator rather than replacing it. The detected path
// still generates by RUNG (clarification card / micro-training / designed
// session / curriculum) through generateTraining(). The Studio generates by
// FORMAT — each format carries its own structure template in
// src/lib/training-formats.ts, so a drill really is steps + materials and a
// scenario really is setup + decision points + debrief.
//
// ⚠️ WHY THIS IS THREE CALLS, NOT ONE (measured on the deployed app, July 26):
// Under the old maxDuration=60 cap, writing all three audience altitudes in
// one model call took ~55-60s and died at Vercel's wall with
// FUNCTION_INVOCATION_TIMEOUT. maxDuration is now 300 (Aug 5) because even
// single-altitude calls were 504ing, but the three-call shape stays — each
// call is short, retryable, and nothing half-built is ever stored. So:
//
//   1. "floor"      generates the substance and INSERTS the version row.
//   2. "supervisor" re-frames the floor version and patches it in.
//   3. "exec"       does the same, and only then does the request flip to
//                   'generated' and become approvable.
//
// The client drives the three in sequence with visible progress. Re-framing
// (rather than generating each altitude independently) is also the stronger
// fidelity story: the other two altitudes cannot introduce a fact the floor
// version does not already contain.
//
// Grounding doctrine, unchanged: built ONLY from the org's codified framework
// material. Nothing codified ⇒ nothing generated, honestly.
//
// Nothing DEPLOYS here — generation produces a draft the leader reads and
// approves (human-approves-before-deploy). Approval is the /approve route.
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import {
  generateFormatTraining,
  lastFormatGenerationDiagnostic,
  reframeTrainingAltitude,
  type TrainingAltitude,
} from "@/lib/claude";
import { TRAINING_FORMATS, isTrainingFormatKey } from "@/lib/training-formats";
import {
  describeEntities,
  groundingForIssue,
  rungForFormat,
} from "@/lib/training-studio";
import { computeRoutingTargets } from "@/lib/training-routing";

export const maxDuration = 300;

type RequestRow = {
  id: string;
  org_id: string;
  requested_by: string;
  issue_text: string;
  issue_restated: string | null;
  issue_type: string | null;
  subject_entities: { type: string; name: string; detail: string | null }[];
  audience_role: string | null;
  audience_summary: string;
  chosen_format: string | null;
  recommendations: { ranked?: { format_key: string; rationale: string }[] } | null;
  prescription_id: string | null;
  current_training_id: string | null;
  routing_targets: unknown;
  status: string;
  attempt_count: number;
};

type Altitudes = {
  floor?: TrainingAltitude;
  supervisor?: TrainingAltitude;
  exec?: TrainingAltitude;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const altitude: "floor" | "supervisor" | "exec" =
      body?.altitude === "supervisor" || body?.altitude === "exec"
        ? body.altitude
        : "floor";

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
        { error: "Generating training is a manager action." },
        { status: 403 }
      );
    }

    const { data: reqRaw } = await supabase
      .from("training_requests")
      .select(
        "id, org_id, requested_by, issue_text, issue_restated, issue_type, subject_entities, audience_role, audience_summary, chosen_format, recommendations, prescription_id, current_training_id, routing_targets, status, attempt_count"
      )
      .eq("id", id)
      .maybeSingle();
    const request = reqRaw as unknown as RequestRow | null;
    if (!request) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!isTrainingFormatKey(request.chosen_format)) {
      return NextResponse.json(
        { error: "Choose a format first — the training is built in the shape you pick." },
        { status: 409 }
      );
    }
    if (!request.prescription_id) {
      return NextResponse.json(
        { error: "This request lost its link to the engine — open a new one." },
        { status: 409 }
      );
    }
    const formatKey = request.chosen_format;
    const attempt = Math.max(1, request.attempt_count);

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // ═══ STEP 2 + 3 — re-frame an existing floor version ═══════════════════
    if (altitude !== "floor") {
      const { data: trRaw } = await service
        .from("prescription_trainings")
        .select("id, title, altitudes")
        .eq("prescription_id", request.prescription_id)
        .order("version", { ascending: false })
        .limit(1);
      const training = ((trRaw || []) as unknown as {
        id: string;
        title: string;
        altitudes: Altitudes | null;
      }[])[0];
      const floor = training?.altitudes?.floor;
      if (!training || !floor) {
        return NextResponse.json(
          { error: "Write the floor version first — the other altitudes re-frame it." },
          { status: 409 }
        );
      }

      const reframed = await reframeTrainingAltitude({
        formatKey,
        altitude,
        floorTitle: floor.title,
        floorBody: floor.body,
        issueRestated: request.issue_restated ?? request.issue_text,
        audience: request.audience_summary,
      });
      if (!reframed) {
        return NextResponse.json(
          {
            error: `The ${altitude === "exec" ? "executive" : "supervisor"} version didn't come through — the floor version is safe. Try again.`,
          },
          { status: 502 }
        );
      }

      const altitudes: Altitudes = { ...(training.altitudes || {}), [altitude]: reframed };
      const complete = !!(altitudes.floor && altitudes.supervisor && altitudes.exec);

      const { error: updTrError } = await service
        .from("prescription_trainings")
        .update({ altitudes })
        .eq("id", training.id);
      if (updTrError) {
        return NextResponse.json({ error: updTrError.message }, { status: 500 });
      }

      if (complete && request.status !== "deployed") {
        await service
          .from("training_requests")
          .update({ status: "generated" })
          .eq("id", request.id);

        // ⭐ The "who else needs it" beat, computed the moment the training is
        // complete — the panel is already waiting when the leader reads the
        // draft, no extra click. Fail-soft: a routing miss never costs the
        // leader their generated training. Seeded demo requests arrive with
        // curated targets already present, so an empty check keeps them.
        try {
          const existing = request.routing_targets;
          if (!Array.isArray(existing) || existing.length === 0) {
            const exclude = new Set<string>([request.requested_by]);
            const { data: rxRaw } = await service
              .from("prescriptions")
              .select("experts")
              .eq("id", request.prescription_id)
              .maybeSingle();
            for (const e of ((rxRaw as { experts: { user_id: string }[] | null } | null)
              ?.experts || [])) {
              exclude.add(e.user_id);
            }
            const targets = await computeRoutingTargets(service, {
              orgId: request.org_id,
              audienceRole: request.audience_role,
              audienceSummary: request.audience_summary,
              subjectEntities: request.subject_entities || [],
              excludeUserIds: [...exclude],
            });
            if (targets.length > 0) {
              await service
                .from("training_requests")
                .update({ routing_targets: targets })
                .eq("id", request.id);
            }
          }
        } catch (routingErr) {
          console.warn("routing-target suggestion skipped:", routingErr);
        }
      }

      return NextResponse.json({
        success: true,
        altitude,
        complete,
        message: complete
          ? "All three versions are written. Read them — nothing goes out until you approve it."
          : `The ${altitude === "exec" ? "executive" : "supervisor"} version is written.`,
      });
    }

    // ═══ STEP 1 — the floor version carries the substance ══════════════════
    const grounding = await groundingForIssue(
      service,
      request.org_id,
      `${request.issue_restated ?? ""} ${request.issue_text} Audience: ${request.audience_summary}. Subjects: ${describeEntities(
        request.subject_entities || []
      )}`
    );
    if (grounding.captureFirst) {
      return NextResponse.json(
        {
          error:
            grounding.note ??
            "Nothing codified covers this territory yet, so there is no expert judgment to build training from. Capture first, then come back.",
          capture_first: true,
        },
        { status: 409 }
      );
    }

    const chosenRationale =
      (request.recommendations?.ranked || []).find((r) => r.format_key === formatKey)
        ?.rationale ??
      `Chosen by the leader: ${TRAINING_FORMATS[formatKey].oneLiner}`;

    const attemptNote =
      attempt === 1
        ? "First attempt on this issue."
        : `Attempt ${attempt} on this issue — an earlier format did not move the problem, so this is a different modality, not a longer version of the same thing.`;

    const artifact = await generateFormatTraining({
      formatKey,
      formatRationale: chosenRationale,
      issueText: request.issue_text,
      issueRestated: request.issue_restated ?? request.issue_text,
      issueType: request.issue_type ?? "unclassified",
      audience: request.audience_summary,
      attemptNote,
      frameworks: grounding.groundingText.slice(0, 12000),
      // When the grounding frameworks carry an OPEN conflict, generation
      // teaches the BOUNDARY between the two experts (P-2's X-ray finally
      // feeding the Studio). Empty string when the sources agree.
      conflictNote: grounding.conflictNote,
    });
    if (!artifact) {
      // Fail open — nothing half-built is stored.
      return NextResponse.json(
        {
          error: "The training generator flaked — nothing was stored. Try again.",
          diagnostic: lastFormatGenerationDiagnostic,
        },
        { status: 502 }
      );
    }

    const { data: priorRaw } = await service
      .from("prescription_trainings")
      .select("version")
      .eq("prescription_id", request.prescription_id)
      .order("version", { ascending: false })
      .limit(1);
    const nextVersion = (((priorRaw || []) as { version: number }[])[0]?.version ?? 0) + 1;

    const { data: inserted, error: insError } = await service
      .from("prescription_trainings")
      .insert({
        org_id: request.org_id,
        prescription_id: request.prescription_id,
        version: nextVersion,
        strategy: artifact.strategy,
        rung: rungForFormat(formatKey),
        format: TRAINING_FORMATS[formatKey].name,
        format_key: formatKey,
        title: artifact.title,
        altitudes: { floor: artifact.floor },
        generated_by: "training-studio-format-v1",
      })
      .select("id, version")
      .single();
    if (insError || !inserted) {
      return NextResponse.json(
        { error: insError?.message ?? "Could not store the training" },
        { status: 500 }
      );
    }
    const trainingId = (inserted as { id: string }).id;

    // Status stays short of 'generated' until all three altitudes exist —
    // the approve gate must never open on a half-written draft.
    const { error: updError } = await service
      .from("training_requests")
      .update({ current_training_id: trainingId })
      .eq("id", request.id);
    if (updError) {
      return NextResponse.json({ error: updError.message }, { status: 500 });
    }

    const { error: logError } = await service
      .from("training_format_outcomes")
      .update({ training_id: trainingId })
      .eq("training_request_id", request.id)
      .eq("attempt", attempt);
    if (logError) {
      console.warn(`format-outcome training link skipped: ${logError.message}`);
    }

    return NextResponse.json({
      success: true,
      altitude: "floor",
      complete: false,
      training: {
        id: trainingId,
        version: nextVersion,
        format_key: formatKey,
        format_name: TRAINING_FORMATS[formatKey].name,
        strategy: artifact.strategy,
        title: artifact.title,
      },
      message: `Floor version written as a ${TRAINING_FORMATS[formatKey].name}. Writing the other two altitudes now.`,
    });
  } catch (err) {
    console.error("Unexpected error in training-studio generate route:", err);
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
