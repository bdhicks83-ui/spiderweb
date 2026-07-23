// P-4A Build 4 — the ROI-ranked prescription queue, list endpoint.
//
// Org-scoped by RLS ("org prescriptions read" / "org detections read") —
// the session client can only ever see the caller's own org's rows, same
// construction as /api/conflicts. Ranked recurrence × severity, highest
// first: a prioritized list, never a firehose.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Cast targets for raw multi-column selects (P-1 gotcha: the TS client can't
// infer a raw select string).
type PrescriptionRow = {
  id: string;
  detection_id: string;
  rung: number;
  rung_rationale: string;
  gap_summary: string;
  experts: { user_id: string; record_id: string }[];
  capture_first: boolean;
  audience: string;
  pairing_summary: string;
  recurrence: number;
  severity: number;
  roi_score: number;
  rank_rationale: string;
  status: string;
  created_at: string;
};

type DetectionRow = {
  id: string;
  source_type: string;
  evidence_record_ids: string[];
  conflict_id: string | null;
};

const PRESCRIPTION_COLUMNS =
  "id, detection_id, rung, rung_rationale, gap_summary, experts, capture_first, " +
  "audience, pairing_summary, recurrence, severity, roi_score, rank_rationale, " +
  "status, created_at";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const { data: rxRaw, error } = await supabase
      .from("prescriptions")
      .select(PRESCRIPTION_COLUMNS)
      .order("roi_score", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) {
      return NextResponse.json(
        { error: "Could not load the prescription queue", details: error.message },
        { status: 500 }
      );
    }
    const prescriptions = (rxRaw || []) as unknown as PrescriptionRow[];
    if (prescriptions.length === 0) {
      return NextResponse.json({ prescriptions: [] });
    }

    const detectionIds = [...new Set(prescriptions.map((p) => p.detection_id))];
    const { data: detRaw } = await supabase
      .from("prescription_detections")
      .select("id, source_type, evidence_record_ids, conflict_id")
      .in("id", detectionIds);
    const detections = (detRaw || []) as unknown as DetectionRow[];
    const detById = Object.fromEntries(detections.map((d) => [d.id, d]));

    // Expert display names for the queue cards.
    const expertIds = [
      ...new Set(prescriptions.flatMap((p) => (p.experts || []).map((e) => e.user_id))),
    ];
    let names: Record<string, string | null> = {};
    if (expertIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", expertIds);
      names = Object.fromEntries(
        ((profiles || []) as { id: string; display_name: string | null }[]).map((p) => [
          p.id,
          p.display_name,
        ])
      );
    }

    return NextResponse.json({
      prescriptions: prescriptions.map((p) => {
        const d = detById[p.detection_id];
        return {
          id: p.id,
          source_type: d?.source_type ?? null,
          evidence_count: d?.evidence_record_ids?.length ?? p.recurrence,
          rung: p.rung,
          rung_rationale: p.rung_rationale,
          gap_summary: p.gap_summary,
          expert_names: (p.experts || []).map((e) => names[e.user_id] ?? "Org expert"),
          capture_first: p.capture_first,
          audience: p.audience,
          pairing_summary: p.pairing_summary,
          recurrence: p.recurrence,
          severity: p.severity,
          roi_score: Number(p.roi_score),
          rank_rationale: p.rank_rationale,
          status: p.status,
          created_at: p.created_at,
        };
      }),
    });
  } catch (err) {
    console.error("Unexpected error in prescriptions route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
