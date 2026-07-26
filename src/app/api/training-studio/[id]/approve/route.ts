// P-7 Build 3 (the gate) — the leader approves the generated training, and
// only then does it deploy.
//
// POST, no body.
//
// HUMAN-APPROVES-BEFORE-DEPLOY, unchanged from the detected path: on the
// Prescription Engine the manager gate sits before generation; on the Studio
// the leader already triggered the request, so the gate sits where it still
// has teeth — on the artifact itself. WHO approved and WHEN are recorded
// either way.
//
// Deploying starts the efficacy watch through the EXISTING machinery: the
// underlying prescription flips to 'delivered' with delivered_at stamped and
// efficacy_status 'watching', which is exactly what runEfficacyLoop() looks
// for. No second watcher was built.
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { TRAINING_FORMATS, isTrainingFormatKey } from "@/lib/training-formats";
import { EFFICACY_QUIET_WINDOW_DAYS } from "@/lib/prescription";

type RequestRow = {
  id: string;
  org_id: string;
  chosen_format: string | null;
  current_training_id: string | null;
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
        { error: "Approving training for deployment is a manager action." },
        { status: 403 }
      );
    }

    const { data: reqRaw } = await supabase
      .from("training_requests")
      .select(
        "id, org_id, chosen_format, current_training_id, prescription_id, status, attempt_count"
      )
      .eq("id", id)
      .maybeSingle();
    const request = reqRaw as unknown as RequestRow | null;
    if (!request) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!request.current_training_id) {
      return NextResponse.json(
        { error: "There's nothing to approve yet — generate the training first." },
        { status: 409 }
      );
    }
    if (request.status === "deployed") {
      return NextResponse.json(
        { error: "This training is already out and under watch." },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error: updError } = await service
      .from("training_requests")
      .update({
        status: "deployed",
        approved_by: user.id,
        approved_at: now,
        deployed_at: now,
      })
      .eq("id", request.id);
    if (updError) {
      return NextResponse.json({ error: updError.message }, { status: 500 });
    }

    // Hand off to the existing efficacy loop — same fields, same watcher.
    if (request.prescription_id) {
      const { error: rxError } = await service
        .from("prescriptions")
        .update({
          status: "delivered",
          delivered_at: now,
          efficacy_status: "watching",
          efficacy_note: `Watching — deployed as a ${
            isTrainingFormatKey(request.chosen_format)
              ? TRAINING_FORMATS[request.chosen_format].name
              : "training"
          } (attempt ${request.attempt_count}). The watch runs on new failure and friction records from here.`,
          efficacy_evidence_record_ids: [],
          efficacy_checked_at: null,
        })
        .eq("id", request.prescription_id);
      if (rxError) {
        return NextResponse.json({ error: rxError.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Approved and out. From here the system watches whether the problem comes back — quiet for ${EFFICACY_QUIET_WINDOW_DAYS} days and it's proven; a recurrence and you'll get a different format to try, not the same one again.`,
    });
  } catch (err) {
    console.error("Unexpected error in training-studio approve route:", err);
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
