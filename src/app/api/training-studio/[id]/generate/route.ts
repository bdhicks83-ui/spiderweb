// P-7 Build 3 (second half) — generate the training IN the chosen format.
//
// POST, no body.
//
// This EXTENDS the P-4B generator rather than replacing it. The detected
// path still generates by RUNG (clarification card / micro-training /
// designed session / curriculum) through generateTraining(). The Studio
// generates by FORMAT — each format carries its own structure template in
// src/lib/training-formats.ts, so a drill really is steps + materials and a
// scenario really is setup + decision points + debrief. The three audience
// altitudes still apply WITHIN each format, and artifacts land in the same
// versioned prescription_trainings table (history is never overwritten).
//
// Grounding doctrine, unchanged: built ONLY from the org's codified
// framework material. Nothing codified ⇒ nothing generated, honestly.
//
// Nothing DEPLOYS here — generation produces a draft the leader reads and
// approves (human-approves-before-deploy). Approval is the /approve route.
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { generateFormatTraining } from "@/lib/claude";
import { TRAINING_FORMATS, isTrainingFormatKey } from "@/lib/training-formats";
import { describeEntities, groundingForIssue, rungForFormat } from "@/lib/training-studio";

export const maxDuration = 60;

type RequestRow = {
  id: string;
  org_id: string;
  issue_text: string;
  issue_restated: string | null;
  issue_type: string | null;
  subject_entities: { type: string; name: string; detail: string | null }[];
  audience_summary: string;
  chosen_format: string | null;
  recommendations: { ranked?: { format_key: string; rationale: string }[] } | null;
  prescription_id: string | null;
  status: string;
  attempt_count: number;
};

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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
        "id, org_id, issue_text, issue_restated, issue_type, subject_entities, audience_summary, chosen_format, recommendations, prescription_id, status, attempt_count"
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

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // ── Grounding: the ONLY permitted source of substance ──
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

    // The attempt was opened when the format was chosen; re-running
    // generation works on that same attempt (a new one starts only when a
    // format is chosen again).
    const attempt = Math.max(1, request.attempt_count);
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
      frameworks: grounding.groundingText.slice(0, 14000),
    });
    if (!artifact) {
      // Fail open — nothing half-built is stored.
      return NextResponse.json(
        { error: "The training generator flaked — nothing was stored. Try again." },
        { status: 502 }
      );
    }

    // ── Version it into the SAME table the detected path uses ──
    const { data: priorRaw } = await service
      .from("prescription_trainings")
      .select("version")
      .eq("prescription_id", request.prescription_id)
      .order("version", { ascending: false })
      .limit(1);
    const version =
      ((priorRaw || []) as { version: number }[])[0]?.version ?? 0;
    const nextVersion = version + 1;

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
        altitudes: artifact.altitudes,
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

    const { error: updError } = await service
      .from("training_requests")
      .update({
        status: "generated",
        current_training_id: trainingId,
        attempt_count: attempt,
      })
      .eq("id", request.id);
    if (updError) {
      return NextResponse.json({ error: updError.message }, { status: 500 });
    }

    // Attach the artifact to this attempt's format-outcome row.
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
      training: {
        id: trainingId,
        version: nextVersion,
        format_key: formatKey,
        format_name: TRAINING_FORMATS[formatKey].name,
        strategy: artifact.strategy,
        title: artifact.title,
      },
      grounding_summary: `Built from ${grounding.records.length} codified framework${grounding.records.length === 1 ? "" : "s"}.`,
      message: `Draft ready as a ${TRAINING_FORMATS[formatKey].name}, in three audience altitudes. Read it — nothing goes out until you approve it.`,
    });
  } catch (err) {
    console.error("Unexpected error in training-studio generate route:", err);
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
