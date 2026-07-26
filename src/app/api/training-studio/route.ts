// P-7 Build 1 — the On-Demand Training Studio's front door.
//
// GET  — the org's training requests, newest first (RLS org-scoped).
// POST — a manager+ describes a live issue in plain language, picks the
//        audience, and the request is created.
//
// WHAT THIS IS: the "I need this now" path. The Prescription Engine's other
// door is detection-triggered — the brain notices a gap. This one is
// human-triggered. Everything downstream is the SAME engine: the request
// creates a real prescription_detections row (source_type 'leader_request')
// and a real prescriptions row, so the training generator, the efficacy loop
// and escalation all apply unchanged.
//
// ACCESS: manager+ only, via the SECURITY DEFINER is_manager() added in
// p7-training-studio.sql (profiles.role='manager' OR anyone reports to you) —
// the same family as P-6's is_manager_of(). A leader creates training for
// their own reports and teams.
//
// This route does the issue-UNDERSTANDING model call only. The Format Agent
// runs on the follow-up /recommend call so neither request carries two
// reasoning-heavy model calls in one serverless invocation.
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { understandTrainingIssue } from "@/lib/claude";
import { describeAudience, isAudienceExperience } from "@/lib/training-formats";
import { describeEntities, groundingForIssue, groundingSummary } from "@/lib/training-studio";
import { RUNGS } from "@/lib/prescription";

export const maxDuration = 60;

type RequestRow = {
  id: string;
  requested_by: string;
  issue_text: string;
  audience_summary: string;
  audience_role: string | null;
  audience_team: string | null;
  audience_experience: string | null;
  issue_type: string | null;
  issue_restated: string | null;
  recommended_format: string | null;
  chosen_format: string | null;
  format_overridden: boolean;
  status: string;
  attempt_count: number;
  created_at: string;
  deployed_at: string | null;
  prescription_id: string | null;
};

const LIST_COLUMNS =
  "id, requested_by, issue_text, audience_summary, audience_role, audience_team, " +
  "audience_experience, issue_type, issue_restated, recommended_format, chosen_format, " +
  "format_overridden, status, attempt_count, created_at, deployed_at, prescription_id";

export async function GET() {
  try {
    const supabase = await createSessionClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const { data: rowsRaw, error } = await supabase
      .from("training_requests")
      .select(LIST_COLUMNS)
      .order("created_at", { ascending: false });
    if (error) {
      return NextResponse.json(
        { error: "Could not load the training studio", details: error.message },
        { status: 500 }
      );
    }
    const rows = (rowsRaw || []) as unknown as RequestRow[];

    // Efficacy state lives on the prescription — same source of truth as the
    // detected path, never a second copy.
    const rxIds = rows.map((r) => r.prescription_id).filter((v): v is string => !!v);
    const efficacyById: Record<string, { status: string | null; note: string | null }> = {};
    if (rxIds.length > 0) {
      const { data: rxRaw } = await supabase
        .from("prescriptions")
        .select("id, efficacy_status, efficacy_note")
        .in("id", rxIds);
      for (const p of (rxRaw || []) as {
        id: string;
        efficacy_status: string | null;
        efficacy_note: string | null;
      }[]) {
        efficacyById[p.id] = { status: p.efficacy_status, note: p.efficacy_note };
      }
    }

    const requesterIds = [...new Set(rows.map((r) => r.requested_by))];
    let names: Record<string, string | null> = {};
    if (requesterIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", requesterIds);
      names = Object.fromEntries(
        ((profiles || []) as { id: string; display_name: string | null }[]).map((p) => [
          p.id,
          p.display_name,
        ])
      );
    }

    // Is this caller allowed to create? Drives the form's visibility — RLS
    // and the POST gate are the real boundary, this is just honesty in the UI.
    const { data: canCreate } = await supabase.rpc("is_manager");

    return NextResponse.json({
      can_create: canCreate === true,
      requests: rows.map((r) => ({
        id: r.id,
        issue_text: r.issue_text,
        issue_restated: r.issue_restated,
        issue_type: r.issue_type,
        audience_summary: r.audience_summary,
        recommended_format: r.recommended_format,
        chosen_format: r.chosen_format,
        format_overridden: r.format_overridden,
        status: r.status,
        attempt_count: r.attempt_count,
        created_at: r.created_at,
        deployed_at: r.deployed_at,
        requested_by_name: names[r.requested_by] ?? "Org leader",
        efficacy_status: r.prescription_id
          ? (efficacyById[r.prescription_id]?.status ?? null)
          : null,
        efficacy_note: r.prescription_id
          ? (efficacyById[r.prescription_id]?.note ?? null)
          : null,
      })),
    });
  } catch (err) {
    console.error("Unexpected error in training-studio list route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const issueText =
      typeof body?.issue_text === "string" ? body.issue_text.trim() : "";
    const audienceRole =
      typeof body?.audience_role === "string" && body.audience_role.trim()
        ? body.audience_role.trim()
        : null;
    const audienceTeam =
      typeof body?.audience_team === "string" && body.audience_team.trim()
        ? body.audience_team.trim()
        : null;
    const audienceExperience = isAudienceExperience(body?.audience_experience)
      ? body.audience_experience
      : null;

    if (issueText.length < 20) {
      return NextResponse.json(
        {
          error:
            "Describe the issue in a sentence or two — what is going wrong, and where. The more concrete it is, the better the format recommendation.",
        },
        { status: 400 }
      );
    }
    if (!audienceRole && !audienceTeam) {
      return NextResponse.json(
        { error: "Name the audience — a role, a team, or both." },
        { status: 400 }
      );
    }

    const supabase = await createSessionClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    // ── The manager+ gate ──
    const { data: isManager } = await supabase.rpc("is_manager");
    if (isManager !== true) {
      return NextResponse.json(
        {
          error:
            "Creating training is a manager action — a leader creates training for their own reports and teams. Ask your manager to raise this one.",
        },
        { status: 403 }
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .maybeSingle();
    const orgId = (profile as { org_id: string | null } | null)?.org_id ?? null;
    if (!orgId) {
      return NextResponse.json(
        {
          error:
            "Training is created for an organization, and this account isn't in one yet.",
        },
        { status: 409 }
      );
    }

    const audience = describeAudience({
      role: audienceRole,
      team: audienceTeam,
      experience: audienceExperience,
    });

    // ── Understand the issue (same reasoning as detection triage; the
    //    trigger is the human) ──
    const understanding = await understandTrainingIssue(issueText, audience);
    if (!understanding) {
      // Fail open, P-4A style: nothing half-built is stored.
      return NextResponse.json(
        {
          error:
            "Reading the issue didn't complete — nothing was saved. Try again, or add a sentence of detail.",
        },
        { status: 502 }
      );
    }

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // ── Grounding: which codified frameworks can honestly build this? ──
    const grounding = await groundingForIssue(
      service,
      orgId,
      `${understanding.issueRestated} ${issueText} Audience: ${audience}. Subjects: ${describeEntities(
        understanding.subjectEntities
      )}`
    );

    const rung = understanding.suggestedRung;
    const rungLabel = RUNGS[rung]?.label ?? `Rung ${rung}`;
    const pairingSummary = grounding.captureFirst
      ? `Capture first — nothing codified covers this yet, so there is no expert judgment to build from. ${grounding.note ?? ""}`.trim()
      : `Pair ${[...new Set(grounding.records.map((r) => grounding.authorName(r.user_id)))].join(
          " + "
        )} with ${audience} — ${rungLabel} built from their codified frameworks.`;

    // ── Bridge into the existing engine: a real detection + prescription ──
    const dedupeKey = `leader:${user.id}:${Date.now()}`;
    const { data: detRaw, error: detError } = await service
      .from("prescription_detections")
      .insert({
        org_id: orgId,
        source_type: "leader_request",
        dedupe_key: dedupeKey,
        subject_entities: understanding.subjectEntities,
        evidence_record_ids: grounding.records.map((r) => r.id),
        conflict_id: null,
        summary: understanding.issueRestated,
        detail: understanding.understandingNote || null,
        recurrence: 1,
        status: "prescribed",
        detected_by: "training-studio-v1",
      })
      .select("id")
      .single();
    if (detError || !detRaw) {
      return NextResponse.json(
        { error: detError?.message ?? "Could not open the request" },
        { status: 500 }
      );
    }
    const detectionId = (detRaw as { id: string }).id;

    // The leader IS the manager gate on this path — they asked for it, and
    // WHO + WHEN is recorded exactly as an approval on the detected path.
    // The human-approves-before-deploy gate lands later, on the generated
    // training itself.
    const roi = 1 * rung;
    const { data: rxRaw, error: rxError } = await service
      .from("prescriptions")
      .insert({
        org_id: orgId,
        detection_id: detectionId,
        rung,
        rung_rationale: understanding.understandingNote || `Sized as ${rungLabel} at intake.`,
        gap_summary: understanding.issueRestated,
        experts: grounding.experts,
        capture_first: grounding.captureFirst,
        audience,
        audience_entities: understanding.subjectEntities,
        pairing_summary: pairingSummary,
        recurrence: 1,
        severity: rung,
        roi_score: roi,
        rank_rationale: `Leader-initiated · severity ${rung} (${rungLabel}) = ROI ${roi}`,
        status: "approved",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        triaged_by: "training-studio-v1",
      })
      .select("id")
      .single();
    if (rxError || !rxRaw) {
      return NextResponse.json(
        { error: rxError?.message ?? "Could not open the request" },
        { status: 500 }
      );
    }
    const prescriptionId = (rxRaw as { id: string }).id;

    const { data: reqRaw, error: reqError } = await service
      .from("training_requests")
      .insert({
        org_id: orgId,
        requested_by: user.id,
        issue_text: issueText,
        audience_role: audienceRole,
        audience_team: audienceTeam,
        audience_experience: audienceExperience,
        audience_summary: audience,
        issue_type: understanding.issueType,
        issue_restated: understanding.issueRestated,
        subject_entities: understanding.subjectEntities,
        understanding_note: understanding.understandingNote || null,
        detection_id: detectionId,
        prescription_id: prescriptionId,
        status: "new",
      })
      .select("id")
      .single();
    if (reqError || !reqRaw) {
      return NextResponse.json(
        { error: reqError?.message ?? "Could not open the request" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      id: (reqRaw as { id: string }).id,
      understanding: {
        issue_type: understanding.issueType,
        issue_restated: understanding.issueRestated,
        understanding_note: understanding.understandingNote,
        subject_entities: understanding.subjectEntities,
      },
      grounding: {
        capture_first: grounding.captureFirst,
        summary: groundingSummary(grounding),
      },
      message: grounding.captureFirst
        ? "Request opened — but nothing codified covers this territory yet, so there is no expert judgment to build from."
        : "Request opened. Next: the format recommendation.",
    });
  } catch (err) {
    console.error("Unexpected error in training-studio create route:", err);
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
