// P-7 — Training Studio detail. GET everything the detail page renders:
// the request, the Format Agent's ranked recommendation with its cited
// rationale, the chosen format, the generated artifact (3 altitudes), the
// efficacy state read off the prescription, and the format-outcome log's
// attempt history.
//
// Session client throughout — RLS ("org training requests read" / "org
// prescriptions read" / "org trainings read" / "org format outcomes read")
// is the access boundary. Explainable-not-black-box: the rationale and the
// attempt history are part of the payload, not hidden scoring.
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";

type RequestRow = {
  id: string;
  org_id: string;
  requested_by: string;
  issue_text: string;
  audience_role: string | null;
  audience_team: string | null;
  audience_experience: string | null;
  audience_summary: string;
  issue_type: string | null;
  issue_restated: string | null;
  subject_entities: { type: string; name: string; detail: string | null }[];
  understanding_note: string | null;
  detection_id: string | null;
  prescription_id: string | null;
  recommendations: unknown;
  recommended_format: string | null;
  recommended_at: string | null;
  chosen_format: string | null;
  format_overridden: boolean;
  override_reason: string | null;
  format_chosen_at: string | null;
  status: string;
  current_training_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  deployed_at: string | null;
  attempt_count: number;
  created_at: string;
};

const DETAIL_COLUMNS =
  "id, org_id, requested_by, issue_text, audience_role, audience_team, " +
  "audience_experience, audience_summary, issue_type, issue_restated, " +
  "subject_entities, understanding_note, detection_id, prescription_id, " +
  "recommendations, recommended_format, recommended_at, chosen_format, " +
  "format_overridden, override_reason, format_chosen_at, status, " +
  "current_training_id, approved_by, approved_at, deployed_at, attempt_count, created_at";

type TrainingRow = {
  id: string;
  version: number;
  strategy: string;
  format: string;
  format_key: string | null;
  title: string;
  altitudes: unknown;
  generated_at: string;
};

type OutcomeRow = {
  attempt: number;
  chosen_format: string;
  recommended_format: string | null;
  was_override: boolean;
  override_reason: string | null;
  outcome: string;
  outcome_note: string | null;
  next_format_recommended: string | null;
  next_format_rationale: string | null;
  enhancements: unknown;
  created_at: string;
};

export async function GET(
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

    const { data: reqRaw } = await supabase
      .from("training_requests")
      .select(DETAIL_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    const request = reqRaw as unknown as RequestRow | null;
    if (!request) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // ── The generated artifact(s) — history is never overwritten ──
    let trainings: TrainingRow[] = [];
    if (request.prescription_id) {
      const { data: trRaw } = await supabase
        .from("prescription_trainings")
        .select("id, version, strategy, format, format_key, title, altitudes, generated_at")
        .eq("prescription_id", request.prescription_id)
        .order("version", { ascending: false });
      trainings = (trRaw || []) as unknown as TrainingRow[];
    }

    // ── Efficacy: read off the prescription, the one source of truth ──
    let prescription: {
      id: string;
      status: string;
      capture_first: boolean;
      pairing_summary: string;
      rung: number;
      efficacy_status: string | null;
      efficacy_note: string | null;
      delivered_at: string | null;
      escalated_from_rung: number | null;
    } | null = null;
    if (request.prescription_id) {
      const { data: rxRaw } = await supabase
        .from("prescriptions")
        .select(
          "id, status, capture_first, pairing_summary, rung, efficacy_status, efficacy_note, delivered_at, escalated_from_rung"
        )
        .eq("id", request.prescription_id)
        .maybeSingle();
      prescription = (rxRaw as typeof prescription) ?? null;
    }

    // ── The format-outcome log: what has been tried, and how it went ──
    const { data: outRaw } = await supabase
      .from("training_format_outcomes")
      .select(
        "attempt, chosen_format, recommended_format, was_override, override_reason, outcome, outcome_note, next_format_recommended, next_format_rationale, enhancements, created_at"
      )
      .eq("training_request_id", request.id)
      .order("attempt", { ascending: true });
    const attempts = (outRaw || []) as unknown as OutcomeRow[];

    const nameIds = [
      ...new Set(
        [request.requested_by, request.approved_by].filter((v): v is string => !!v)
      ),
    ];
    let names: Record<string, string | null> = {};
    if (nameIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", nameIds);
      names = Object.fromEntries(
        ((profiles || []) as { id: string; display_name: string | null }[]).map((p) => [
          p.id,
          p.display_name,
        ])
      );
    }

    const { data: isManager } = await supabase.rpc("is_manager");

    return NextResponse.json({
      can_act: isManager === true,
      request: {
        ...request,
        requested_by_name: names[request.requested_by] ?? "Org leader",
        approved_by_name: request.approved_by
          ? (names[request.approved_by] ?? "Org leader")
          : null,
      },
      prescription,
      trainings,
      attempts,
    });
  } catch (err) {
    console.error("Unexpected error in training-studio detail route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
