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
  efficacy_checked_at: string | null;
  // P-5 — outcome-nudge (6-month one-click follow-up)
  outcome_confirmed_at: string | null;
  outcome_confirmed_status: string | null;
  outcome_confirmed_by: string | null;
};

type DetectionRow = {
  id: string;
  source_type: string;
  evidence_record_ids: string[];
  conflict_id: string | null;
};

// P-5 fix — ROI ranking bias, logged in MASTER-STATE/DECISION-LOG: ROI =
// recurrence × rung severity systematically buries conflict-sourced
// prescriptions, because conflicts are rung-clamped to ≤2 (see RUNG_CEILING
// in src/lib/prescription.ts) while entity/coverage gaps can reach 3-4 on
// the same recurrence count. But a live contradiction is the most
// TIME-SENSITIVE item on the queue — two teams are acting on opposing
// guidance today, while "capture HR's knowledge" has no clock. Fix: an
// urgency dimension, independent of effort/rung, ranks the queue FIRST —
// ROI is the tiebreak within a tier, not the primary sort. Both numbers
// ship to the UI so the exec can see the raw ROI too.
const URGENCY_RANK: Record<string, number> = {
  conflict: 3, // live contradiction — two teams acting on opposing guidance today
  entity_signal: 2, // known recurrence, no active contradiction
  coverage_gap: 1, // no clock — nobody's blocked, just uncovered
};
const URGENCY_LABEL: Record<string, string> = {
  conflict: "High",
  entity_signal: "Medium",
  coverage_gap: "Low",
};

const PRESCRIPTION_COLUMNS =
  "id, detection_id, rung, rung_rationale, gap_summary, experts, capture_first, " +
  "audience, pairing_summary, recurrence, severity, roi_score, rank_rationale, " +
  "status, created_at, approved_by, approved_at, snoozed_until, delivered_at, " +
  "efficacy_status, efficacy_note, escalated_from_rung, efficacy_checked_at, " +
  "outcome_confirmed_at, outcome_confirmed_status, outcome_confirmed_by";

// P-5 — outcome-nudge cadence: a prescription's outcome is re-asked every 6
// months after the last confirmation (or after the efficacy loop first
// proved it effective, if never confirmed).
const OUTCOME_NUDGE_MS = 1000 * 60 * 60 * 24 * 30 * 6;

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

    // Fetched unsorted (small org-scale result set) — final rank is computed
    // in JS below because urgency depends on source_type, which lives on
    // the joined prescription_detections row, not this table.
    const { data: rxRaw, error } = await supabase
      .from("prescriptions")
      .select(PRESCRIPTION_COLUMNS)
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
        ...prescriptions.map((p) => p.outcome_confirmed_by).filter((v): v is string => !!v),
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

    const mapped = prescriptions.map((p) => {
      const d = detById[p.detection_id];
      const sourceType = d?.source_type ?? null;
      const urgencyRank = sourceType ? (URGENCY_RANK[sourceType] ?? 0) : 0;
      return {
        id: p.id,
        source_type: sourceType,
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
        urgency: sourceType ? (URGENCY_LABEL[sourceType] ?? "—") : "—",
        urgency_rank: urgencyRank,
        status: p.status,
        created_at: p.created_at,
        approved_by_name: p.approved_by ? (names[p.approved_by] ?? "Org member") : null,
        approved_at: p.approved_at,
        snoozed_until: p.snoozed_until,
        delivered_at: p.delivered_at,
        efficacy_status: p.efficacy_status,
        efficacy_note: p.efficacy_note,
        escalated_from_rung: p.escalated_from_rung,
        outcome_confirmed_at: p.outcome_confirmed_at,
        outcome_confirmed_status: p.outcome_confirmed_status,
        outcome_confirmed_by_name: p.outcome_confirmed_by
          ? (names[p.outcome_confirmed_by] ?? "Org member")
          : null,
        // Due once 6 months have passed since the last confirmation, or
        // since the efficacy loop first proved it effective if never
        // confirmed. Only meaningful for closed/effective rows — the UI
        // gates on that too, this is belt-and-suspenders.
        outcome_nudge_due:
          p.status === "closed" &&
          p.efficacy_status === "effective" &&
          (() => {
            const since = p.outcome_confirmed_at ?? p.efficacy_checked_at;
            if (!since) return false;
            return Date.now() - new Date(since).getTime() >= OUTCOME_NUDGE_MS;
          })(),
      };
    });

    // P-7 — leader-initiated requests live on the Training Studio surface,
    // not in the detected queue. They are real prescriptions (same tables,
    // same efficacy loop) but they arrive through a different door and are
    // already past the manager gate, so listing them here would read as a
    // backlog of things to approve when there is nothing to approve.
    const visible = mapped.filter((m) => m.source_type !== "leader_request");

    // Rank: urgency first (a live conflict is time-sensitive regardless of
    // its clamped rung), ROI as the tiebreak within a tier, newest last.
    visible.sort((a, b) => {
      if (b.urgency_rank !== a.urgency_rank) return b.urgency_rank - a.urgency_rank;
      if (b.roi_score !== a.roi_score) return b.roi_score - a.roi_score;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return NextResponse.json({ prescriptions: visible });
  } catch (err) {
    console.error("Unexpected error in prescriptions route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
