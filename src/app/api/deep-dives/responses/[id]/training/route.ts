// FLOOR GUIDE / PHASE C — a diverging answer becomes a training request.
//
// POST → route this response's gap into the EXISTING Training Studio engine.
//
// ═══════════════════════════════════════════════════════════════════════════
// ⭐ NOT A PARALLEL TRAINING CONCEPT. This route performs exactly the inserts
// the Studio's own front door performs — same understanding call, same
// grounding, a real prescription_detections row (source_type
// 'leader_request'), a real prescription, a real training_requests row — so
// the generator, the manager approval gate, the efficacy loop, escalation and
// Build-5 format learning all apply unchanged. The only Phase C thing here is
// WHAT the issue text says, and that is composed in code
// (composeTrainingIssue) so the "our training missed this, not this person is
// wrong" framing is a promise rather than a hope. The person's name never
// enters the training pipeline.
//
// ⭐ THE GATE: manager OR org admin. The Studio's own door is manager-only
// (a leader creates training for their reports). Deep-dive routing adds the
// org admin because the deep dive is the ADMIN'S instrument (DECISION 3) and
// its whole payoff is "route what you learned into training" — an admin who
// can ask the question but not act on the answer is a dead end. T1B1's
// orthogonality holds where it matters: this creates a training REQUEST that
// still waits behind the same human approval as every other one; it creates
// no judgment and touches no pattern_record.
// ═══════════════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { understandTrainingIssue } from "@/lib/claude";
import { describeAudience } from "@/lib/training-formats";
import { describeEntities, groundingForIssue, groundingSummary } from "@/lib/training-studio";
import { RUNGS } from "@/lib/prescription";
import {
  RESPONSE_COLUMNS,
  REQUEST_COLUMNS,
  composeTrainingIssue,
  deepDiveFinding,
  type DeepDiveRequestRow,
  type DeepDiveResponseRow,
} from "@/lib/deep-dives";

export const maxDuration = 60;

// ⚠️⚠️ DRAFT CUSTOMER-FACING COPY — PENDING BRIAN'S SIGN-OFF (Floor Guide C).
const COPY = {
  notAllowed:
    "Routing a deep dive into training is for managers and account admins.",
  gone: "That answer is no longer here.",
  notDiverging:
    "This answer matched the playbook (or couldn't be compared), so there's no training gap to route.",
  already: "This one's already in the Training Studio.",
  failed:
    "Couldn't open the training request — nothing was saved. Try again in a moment.",
  routed: "Opened in the Training Studio. From here it runs like any other request — format recommendation, your approval, then the loop that watches whether it landed.",
};

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await createSessionClient();
    const {
      data: { user },
    } = await session.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

    // The gate — see the header for why it is wider than the Studio's own.
    const [{ data: isManager }, { data: isAdmin }] = await Promise.all([
      session.rpc("is_manager"),
      session.rpc("is_org_admin"),
    ]);
    if (isManager !== true && isAdmin !== true) {
      return NextResponse.json({ error: COPY.notAllowed, code: "NOT_ALLOWED" }, { status: 403 });
    }

    // Session read: RLS decides whether this caller may see this response at
    // all (admin → org's · manager → their reports'). No service-role read
    // here, so the authority check and the visibility check are the same rule.
    const { data: respRaw } = await session
      .from("deep_dive_responses")
      .select(RESPONSE_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    const response = (respRaw ?? null) as unknown as DeepDiveResponseRow | null;
    if (!response) return NextResponse.json({ error: COPY.gone }, { status: 404 });

    if (response.training_request_id) {
      return NextResponse.json({
        ok: true,
        already: true,
        training_request_id: response.training_request_id,
        message: COPY.already,
      });
    }
    if (response.divergence !== "diverges") {
      return NextResponse.json({ error: COPY.notDiverging, code: "NOT_DIVERGING" }, { status: 409 });
    }

    const { data: reqRaw } = await session
      .from("deep_dive_requests")
      .select(REQUEST_COLUMNS)
      .eq("id", response.request_id)
      .maybeSingle();
    const request = (reqRaw ?? null) as unknown as DeepDiveRequestRow | null;
    if (!request) return NextResponse.json({ error: COPY.gone }, { status: 404 });

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // The aggregate context, so the issue text is honest about scale (service
    // read: the admin slice, not the caller's RLS slice — a manager routing
    // one report's gap should still hand the Studio the true org-wide count).
    const { data: allRespRaw } = await service
      .from("deep_dive_responses")
      .select("divergence")
      .eq("request_id", request.id);
    const finding = deepDiveFinding((allRespRaw ?? []) as { divergence: string | null }[]);

    // The anchor's name, for the composed issue.
    let frameworkName: string | null = null;
    if (response.compared_record_id) {
      const { data: rec } = await service
        .from("pattern_records")
        .select("framework")
        .eq("id", response.compared_record_id)
        .maybeSingle();
      frameworkName =
        ((rec as { framework: { name?: string } | null } | null)?.framework?.name as string) ?? null;
    }

    // The responder's title shapes the AUDIENCE (a role, never a name).
    const { data: responderRaw } = await service
      .from("profiles")
      .select("claimed_title")
      .eq("id", response.user_id)
      .maybeSingle();
    const audienceRole =
      (responderRaw as { claimed_title: string | null } | null)?.claimed_title ?? "Contributors";

    const issueText = composeTrainingIssue({
      topic: request.topic,
      frameworkName,
      divergenceNote: response.divergence_note,
      finding,
    });
    const audience = describeAudience({ role: audienceRole, team: null, experience: "new" });

    // ── From here down this is the Studio front door, verbatim in shape. ──
    const understanding = await understandTrainingIssue(issueText, audience);
    if (!understanding) {
      // Fail open, P-4A style: nothing half-built is stored.
      return NextResponse.json({ error: COPY.failed, code: "UNDERSTANDING_FAILED" }, { status: 502 });
    }

    const grounding = await groundingForIssue(
      service,
      request.org_id,
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

    // Deterministic dedupe key: a double-click routes to the SAME detection
    // instead of opening two.
    const dedupeKey = `deep-dive:${response.id}`;
    const { data: detRaw, error: detError } = await service
      .from("prescription_detections")
      .insert({
        org_id: request.org_id,
        source_type: "leader_request",
        dedupe_key: dedupeKey,
        subject_entities: understanding.subjectEntities,
        evidence_record_ids: grounding.records.map((r) => r.id),
        conflict_id: null,
        summary: understanding.issueRestated,
        detail: understanding.understandingNote || null,
        recurrence: Math.max(1, finding.diverging),
        status: "prescribed",
        detected_by: "deep-dive-v1",
      })
      .select("id")
      .single();
    if (detError || !detRaw) {
      return NextResponse.json(
        { error: detError?.message ?? COPY.failed },
        { status: 500 }
      );
    }
    const detectionId = (detRaw as { id: string }).id;

    const roi = Math.max(1, finding.diverging) * rung;
    const { data: rxRaw, error: rxError } = await service
      .from("prescriptions")
      .insert({
        org_id: request.org_id,
        detection_id: detectionId,
        rung,
        rung_rationale: understanding.understandingNote || `Sized as ${rungLabel} at intake.`,
        gap_summary: understanding.issueRestated,
        experts: grounding.experts,
        capture_first: grounding.captureFirst,
        audience,
        audience_entities: understanding.subjectEntities,
        pairing_summary: pairingSummary,
        recurrence: Math.max(1, finding.diverging),
        severity: rung,
        roi_score: roi,
        rank_rationale: `Deep-dive finding · ${finding.diverging} of ${finding.responses} diverge · severity ${rung} (${rungLabel}) = ROI ${roi}`,
        status: "approved",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        triaged_by: "deep-dive-v1",
      })
      .select("id")
      .single();
    if (rxError || !rxRaw) {
      return NextResponse.json({ error: rxError?.message ?? COPY.failed }, { status: 500 });
    }
    const prescriptionId = (rxRaw as { id: string }).id;

    const { data: trRaw, error: trError } = await service
      .from("training_requests")
      .insert({
        org_id: request.org_id,
        requested_by: user.id,
        issue_text: issueText,
        audience_role: audienceRole,
        audience_team: null,
        audience_experience: "new",
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
    if (trError || !trRaw) {
      return NextResponse.json({ error: trError?.message ?? COPY.failed }, { status: 500 });
    }
    const trainingRequestId = (trRaw as { id: string }).id;

    // The back-link. The training request exists and works either way; log,
    // never fail the action that succeeded.
    const { error: linkError } = await service
      .from("deep_dive_responses")
      .update({ training_request_id: trainingRequestId })
      .eq("id", response.id);
    if (linkError) {
      console.error(`[deep-dive] training back-link failed for ${response.id}: ${linkError.message}`);
    }

    console.log(
      `[deep-dive] routed to training (response=${response.id} -> training_request=${trainingRequestId}, ` +
        `diverging=${finding.diverging}/${finding.responses})`
    );
    return NextResponse.json({
      ok: true,
      training_request_id: trainingRequestId,
      grounding: { capture_first: grounding.captureFirst, summary: groundingSummary(grounding) },
      message: COPY.routed,
    });
  } catch (err) {
    console.error("Unexpected error in deep-dive training route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
