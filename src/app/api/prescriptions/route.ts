// P-4A Build 4 — the ROI-ranked prescription queue, list endpoint.
// P-4B — extended with the lifecycle surface: approval/snooze/delivery
// fields, efficacy state, and the lazy snooze-wake (a snoozed row whose
// wake date has passed flips back to 'open' here — snooze defers, never
// deletes).
//
// Org-scoped by RLS ("org prescriptions read" / "org detections read") —
// the session client can only ever see the caller's own org's rows, same
// construction as /api/conflicts. Ranked recurrence × severity, highest
// first: a prioritized list, never a firehose.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

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
  // P-4B lifecycle fields
  approved_by: string | null;
  approved_at: string | null;
  snoozed_until: string | null;
  delivered_at: string | null;
  efficacy_status: string | null;
  efficacy_note: string | null;
  escalated_from_rung: number | null;
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
  "status, created_at, approved_by, approved_at, snoozed_until, delivered_at, " +
  "efficacy_status, efficacy_note, escalated_from_rung";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    // ── Lazy snooze-wake: past-wake rows flip back to 'open' before the
    // list is read. Service role (prescriptions has no update policy), but
    // scoped to the CALLER'S org, read server-side from their profile —
    // never from the request.
    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.org_id) {
      const service = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      await service
        .from("prescriptions")
        .update({ status: "open", snoozed_until: null })
        .eq("org_id", profile.org_id)
        .eq("status", "snoozed")
        .lte("snoozed_until", new Date().toISOString());
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

    // Expert + approver display names for the queue cards.
    const nameIds = [
      ...new Set([
        ...prescriptions.flatMap((p) => (p.experts || []).map((e) => e.user_id)),
        ...prescriptions.map((p) => p.approved_by).filter((v): v is string => !!v),
      ]),
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
          approved_by_name: p.approved_by ? (names[p.approved_by] ?? "Org member") : null,
          approved_at: p.approved_at,
          snoozed_until: p.snoozed_until,
          delivered_at: p.delivered_at,
          efficacy_status: p.efficacy_status,
          efficacy_note: p.efficacy_note,
          escalated_from_rung: p.escalated_from_rung,
        };
      }),
    });
  } catch (err) {
    console.error("Unexpected error in prescriptions route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
