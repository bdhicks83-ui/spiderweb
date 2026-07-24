// P-4A Build 4 — prescription detail: the full evidence chain.
// P-4B — extended with the full lifecycle surface: approval/snooze record,
// fidelity decisions, versioned trainings (3 altitudes each), teach-backs,
// efficacy state, and viewer flags (is the caller a named authoring
// expert?) so the UI can offer the right actions.
//
// An exec must be able to ask "why does it think that?" and get a real
// answer: the detection that fired, every evidence record behind it (loaded
// through the caller's own RLS, so nothing they couldn't already see in
// /library ever appears here), the conflict row when the source is the
// Conflict X-ray, the rung + its one-line rationale, the pairing, and the
// rank math.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { FrameworkArtifact } from "@/lib/elicitation";
import type { EntityMapEntry } from "@/lib/elicitation";

type PrescriptionRow = {
  id: string;
  detection_id: string;
  rung: number;
  rung_rationale: string;
  gap_summary: string;
  experts: { user_id: string; record_id: string }[];
  capture_first: boolean;
  audience: string;
  audience_entities: EntityMapEntry[];
  pairing_summary: string;
  recurrence: number;
  severity: number;
  roi_score: number;
  rank_rationale: string;
  status: string;
  triaged_by: string;
  created_at: string;
  // P-4B lifecycle fields
  approved_by: string | null;
  approved_at: string | null;
  snoozed_by: string | null;
  snoozed_at: string | null;
  snoozed_until: string | null;
  delivered_at: string | null;
  efficacy_status: string | null;
  efficacy_checked_at: string | null;
  efficacy_note: string | null;
  efficacy_evidence_record_ids: string[];
  escalated_from_rung: number | null;
};

type DetectionRow = {
  id: string;
  source_type: string;
  dedupe_key: string;
  subject_entities: EntityMapEntry[];
  evidence_record_ids: string[];
  conflict_id: string | null;
  summary: string;
  detail: string | null;
  recurrence: number;
  detected_at: string;
  detected_by: string;
};

type EvidenceRow = {
  id: string;
  user_id: string;
  created_at: string;
  trigger_type: string | null;
  method: string | null;
  context_summary: string | null;
  trigger_signal: string | null;
  judgment: string | null;
  entity_map: EntityMapEntry[];
  framework: FrameworkArtifact | null;
};

type ConflictRow = {
  id: string;
  status: string;
  territory: string | null;
  rationale: string;
  resolution: string | null;
  resolution_note: string | null;
  detected_at: string;
};

type FidelityRow = {
  expert_user_id: string;
  record_id: string;
  decision: string;
  note: string | null;
  decided_at: string;
};

type TrainingAltitude = { title: string; body: string };

type TrainingRow = {
  id: string;
  version: number;
  strategy: string;
  rung: number;
  format: string;
  title: string;
  altitudes: {
    floor: TrainingAltitude;
    supervisor: TrainingAltitude;
    exec: TrainingAltitude;
  };
  regenerate_note: string | null;
  generated_at: string;
};

type TeachbackRow = {
  id: string;
  training_id: string;
  learner_user_id: string;
  scenario: string;
  question: string;
  answer: string | null;
  score: number | null;
  passed: boolean | null;
  feedback: string | null;
  missed: string[];
  created_at: string;
  completed_at: string | null;
};

const PRESCRIPTION_COLUMNS =
  "id, detection_id, rung, rung_rationale, gap_summary, experts, capture_first, " +
  "audience, audience_entities, pairing_summary, recurrence, severity, roi_score, " +
  "rank_rationale, status, triaged_by, created_at, approved_by, approved_at, " +
  "snoozed_by, snoozed_at, snoozed_until, delivered_at, efficacy_status, " +
  "efficacy_checked_at, efficacy_note, efficacy_evidence_record_ids, escalated_from_rung";

const DETECTION_COLUMNS =
  "id, source_type, dedupe_key, subject_entities, evidence_record_ids, conflict_id, " +
  "summary, detail, recurrence, detected_at, detected_by";

const EVIDENCE_COLUMNS =
  "id, user_id, created_at, trigger_type, method, context_summary, trigger_signal, " +
  "judgment, entity_map, framework";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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
      .eq("id", id)
      .maybeSingle();
    if (error) {
      return NextResponse.json(
        { error: "Could not load prescription", details: error.message },
        { status: 500 }
      );
    }
    if (!rxRaw) {
      // RLS filters other orgs' rows silently — an out-of-org id 404s here.
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const rx = rxRaw as unknown as PrescriptionRow;

    const { data: detRaw } = await supabase
      .from("prescription_detections")
      .select(DETECTION_COLUMNS)
      .eq("id", rx.detection_id)
      .maybeSingle();
    const detection = (detRaw as unknown as DetectionRow) ?? null;

    // Evidence records through the caller's own RLS — including the
    // post-delivery records that drove an escalation, so the efficacy chain
    // is as inspectable as the original detection.
    const evidenceIds = [
      ...new Set([
        ...(detection?.evidence_record_ids ?? []),
        ...(rx.efficacy_evidence_record_ids ?? []),
      ]),
    ];
    let evidence: EvidenceRow[] = [];
    if (evidenceIds.length > 0) {
      const { data: evRaw } = await supabase
        .from("pattern_records")
        .select(EVIDENCE_COLUMNS)
        .in("id", evidenceIds);
      evidence = (evRaw || []) as unknown as EvidenceRow[];
      const order = new Map(evidenceIds.map((rid, i) => [rid, i]));
      evidence.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    }
    const efficacyEvidenceSet = new Set(rx.efficacy_evidence_record_ids ?? []);

    // The conflict row, when this prescription came from the X-ray.
    let conflict: ConflictRow | null = null;
    if (detection?.conflict_id) {
      const { data: cRaw } = await supabase
        .from("framework_conflicts")
        .select("id, status, territory, rationale, resolution, resolution_note, detected_at")
        .eq("id", detection.conflict_id)
        .maybeSingle();
      conflict = (cRaw as unknown as ConflictRow) ?? null;
    }

    // P-4B surfaces — all through the caller's RLS ("org * read").
    const { data: fidelityRaw } = await supabase
      .from("prescription_fidelity")
      .select("expert_user_id, record_id, decision, note, decided_at")
      .eq("prescription_id", rx.id);
    const fidelity = (fidelityRaw || []) as unknown as FidelityRow[];

    const { data: trainingsRaw } = await supabase
      .from("prescription_trainings")
      .select(
        "id, version, strategy, rung, format, title, altitudes, regenerate_note, generated_at"
      )
      .eq("prescription_id", rx.id)
      .order("version", { ascending: false });
    const trainings = (trainingsRaw || []) as unknown as TrainingRow[];

    const { data: teachbacksRaw } = await supabase
      .from("prescription_teachbacks")
      .select(
        "id, training_id, learner_user_id, scenario, question, answer, score, passed, feedback, missed, created_at, completed_at"
      )
      .eq("prescription_id", rx.id)
      .order("created_at", { ascending: false });
    const teachbacks = (teachbacksRaw || []) as unknown as TeachbackRow[];

    // Author + expert + approver + learner names (two-step join, same as
    // /api/library).
    const userIds = [
      ...new Set([
        ...evidence.map((r) => r.user_id),
        ...(rx.experts || []).map((e) => e.user_id),
        ...fidelity.map((f) => f.expert_user_id),
        ...teachbacks.map((t) => t.learner_user_id),
        ...(rx.approved_by ? [rx.approved_by] : []),
        ...(rx.snoozed_by ? [rx.snoozed_by] : []),
      ]),
    ];
    let profiles: Record<
      string,
      { display_name: string | null; persona: string | null; role: string | null }
    > = {};
    if (userIds.length > 0) {
      const { data: profRaw } = await supabase
        .from("profiles")
        .select("id, display_name, persona, role")
        .in("id", userIds);
      profiles = Object.fromEntries(
        (
          (profRaw || []) as {
            id: string;
            display_name: string | null;
            persona: string | null;
            role: string | null;
          }[]
        ).map((p) => [p.id, { display_name: p.display_name, persona: p.persona, role: p.role }])
      );
    }
    const fidelityByExpert = new Map(fidelity.map((f) => [f.expert_user_id, f]));

    return NextResponse.json({
      prescription: {
        id: rx.id,
        rung: rx.rung,
        rung_rationale: rx.rung_rationale,
        gap_summary: rx.gap_summary,
        capture_first: rx.capture_first,
        experts: (rx.experts || []).map((e) => ({
          user_id: e.user_id,
          record_id: e.record_id,
          profile: profiles[e.user_id] ?? null,
          fidelity: fidelityByExpert.get(e.user_id)
            ? {
                decision: fidelityByExpert.get(e.user_id)!.decision,
                note: fidelityByExpert.get(e.user_id)!.note,
                decided_at: fidelityByExpert.get(e.user_id)!.decided_at,
              }
            : null,
        })),
        audience: rx.audience,
        audience_entities: rx.audience_entities,
        pairing_summary: rx.pairing_summary,
        recurrence: rx.recurrence,
        severity: rx.severity,
        roi_score: Number(rx.roi_score),
        rank_rationale: rx.rank_rationale,
        status: rx.status,
        triaged_by: rx.triaged_by,
        created_at: rx.created_at,
        approved_by_name: rx.approved_by
          ? (profiles[rx.approved_by]?.display_name ?? "Org member")
          : null,
        approved_by_role: rx.approved_by ? (profiles[rx.approved_by]?.role ?? null) : null,
        approved_at: rx.approved_at,
        snoozed_by_name: rx.snoozed_by
          ? (profiles[rx.snoozed_by]?.display_name ?? "Org member")
          : null,
        snoozed_until: rx.snoozed_until,
        delivered_at: rx.delivered_at,
        efficacy_status: rx.efficacy_status,
        efficacy_checked_at: rx.efficacy_checked_at,
        efficacy_note: rx.efficacy_note,
        escalated_from_rung: rx.escalated_from_rung,
      },
      detection: detection
        ? {
            id: detection.id,
            source_type: detection.source_type,
            subject_entities: detection.subject_entities,
            summary: detection.summary,
            detail: detection.detail,
            recurrence: detection.recurrence,
            detected_at: detection.detected_at,
            detected_by: detection.detected_by,
          }
        : null,
      conflict,
      trainings: trainings.map((t) => ({
        id: t.id,
        version: t.version,
        strategy: t.strategy,
        rung: t.rung,
        format: t.format,
        title: t.title,
        altitudes: t.altitudes,
        regenerate_note: t.regenerate_note,
        generated_at: t.generated_at,
      })),
      teachbacks: teachbacks.map((t) => ({
        id: t.id,
        training_id: t.training_id,
        learner_name: profiles[t.learner_user_id]?.display_name ?? "Org member",
        is_mine: t.learner_user_id === user.id,
        scenario: t.scenario,
        question: t.question,
        answer: t.answer,
        score: t.score,
        passed: t.passed,
        feedback: t.feedback,
        missed: t.missed,
        created_at: t.created_at,
        completed_at: t.completed_at,
      })),
      viewer: {
        id: user.id,
        is_named_expert: (rx.experts || []).some((e) => e.user_id === user.id),
      },
      evidence: evidence.map((r) => ({
        id: r.id,
        created_at: r.created_at,
        trigger_type: r.trigger_type,
        method: r.method,
        framework_name: r.framework?.name ?? null,
        framework_tagline: r.framework?.tagline ?? null,
        context_summary: r.context_summary,
        trigger_signal: r.trigger_signal,
        judgment: r.judgment,
        entity_map: r.entity_map,
        author: profiles[r.user_id] ?? null,
        is_mine: r.user_id === user.id,
        is_efficacy_evidence: efficacyEvidenceSet.has(r.id),
      })),
    });
  } catch (err) {
    console.error("Unexpected error in prescription detail route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
