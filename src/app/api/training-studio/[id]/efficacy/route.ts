// P-7 Build 4 — effectiveness, and drive-until-solved BY MODALITY.
//
// POST, no body.
//
// This EXTENDS the P-4B efficacy loop; it does not replace it. The watch
// itself is runEfficacyLoop() called verbatim — the same post-delivery
// recurrence check, the same 14-day quiet window, the same one-rung
// auto-escalation, the same blameless note (entities and counts, never a
// person).
//
// WHAT'S NEW: when an attempt doesn't land, the system no longer only
// escalates the rung. It asks the Format Agent for a DIFFERENT MODALITY —
// "the written framework didn't reduce the error; try the hands-on drill" —
// naming the structural limit of the format that was used. Drive-until-
// solved now means trying a different shape, not the same shape louder.
//
// Every attempt closes out on the format-outcome log (format used · outcome ·
// what changed), which is the corpus Build 5 learns from.
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { lastFormatReadaptDiagnostic, recommendNextFormat } from "@/lib/claude";
import { TRAINING_FORMATS, isTrainingFormatKey } from "@/lib/training-formats";
import { runEfficacyLoop } from "@/lib/prescription";
import { describeEntities, resolveFormatAttempt } from "@/lib/training-studio";
import { codifyTrainingToGraph } from "@/lib/graph-codify";
import {
  computeFormatPrior,
  formatPriorForPrompt,
  storedTrackRecord,
} from "@/lib/format-prior";

export const maxDuration = 60;

type RequestRow = {
  id: string;
  org_id: string;
  issue_restated: string | null;
  issue_type: string | null;
  subject_entities: { type: string; name: string; detail: string | null }[];
  audience_summary: string;
  chosen_format: string | null;
  current_training_id: string | null;
  prescription_id: string | null;
  status: string;
  attempt_count: number;
  recommendations: Record<string, unknown> | null;
};

type OutcomeRow = {
  attempt: number;
  chosen_format: string;
  enhancements: { note?: string }[] | null;
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

    const { data: reqRaw } = await supabase
      .from("training_requests")
      .select(
        "id, org_id, issue_restated, issue_type, subject_entities, audience_summary, chosen_format, current_training_id, prescription_id, status, attempt_count, recommendations"
      )
      .eq("id", id)
      .maybeSingle();
    const request = reqRaw as unknown as RequestRow | null;
    if (!request) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (request.status !== "deployed") {
      return NextResponse.json(
        { error: "Nothing to watch yet — the training has to be approved and out first." },
        { status: 409 }
      );
    }
    if (!request.prescription_id) {
      return NextResponse.json(
        { error: "This request lost its link to the engine — open a new one." },
        { status: 409 }
      );
    }

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // ── The watch itself: the EXISTING loop, unchanged ──
    const summary = await runEfficacyLoop(service, request.org_id);

    const { data: rxRaw } = await service
      .from("prescriptions")
      .select(
        "id, rung, efficacy_status, efficacy_note, efficacy_evidence_record_ids, escalated_from_rung"
      )
      .eq("id", request.prescription_id)
      .maybeSingle();
    const rx = rxRaw as unknown as {
      id: string;
      rung: number;
      efficacy_status: string | null;
      efficacy_note: string | null;
      efficacy_evidence_record_ids: string[] | null;
      escalated_from_rung: number | null;
    } | null;
    if (!rx) {
      return NextResponse.json({ error: "Could not read the watch state" }, { status: 500 });
    }

    const attempt = Math.max(1, request.attempt_count);
    const priorFormat = isTrainingFormatKey(request.chosen_format)
      ? request.chosen_format
      : null;

    // ── Quiet across the window: it landed ──
    if (rx.efficacy_status === "effective") {
      const outcomeNote = rx.efficacy_note ?? "Quiet across the watch window.";
      await resolveFormatAttempt(service, {
        trainingRequestId: request.id,
        attempt,
        outcome: "effective",
        outcomeNote,
      });

      // ── P-7 Build 6: THE LOOP CLOSES. The resolved artifact codifies into
      //    the knowledge graph — retrievable, embedded, conflict-checked like
      //    any framework. Never throws; a codification failure is reported in
      //    the response, and the close-out below happens regardless. ──
      const codify = await codifyTrainingToGraph(service, {
        requestId: request.id,
        attempt,
        outcomeNote,
      });

      await service
        .from("training_requests")
        .update({ status: "closed" })
        .eq("id", request.id);
      return NextResponse.json({
        success: true,
        efficacy_status: "effective",
        message: `It held. ${
          priorFormat ? `The ${TRAINING_FORMATS[priorFormat].name.toLowerCase()} did what it was picked for — ` : ""
        }no repeat of the problem across the watch window, on live evidence.${
          codify.codified || codify.alreadyCodified
            ? " What worked is now codified into your team's library — retrieval can surface it the next time this comes up."
            : ""
        }`,
        efficacy_note: rx.efficacy_note,
        codified: {
          codified: codify.codified,
          already_codified: codify.alreadyCodified,
          record_id: codify.recordId,
          embedded: codify.embedded,
          conflicts: codify.conflicts,
          note: codify.note,
        },
        summary,
      });
    }

    // ── Still quiet, window not elapsed ──
    if (rx.efficacy_status !== "escalated") {
      return NextResponse.json({
        success: true,
        efficacy_status: rx.efficacy_status ?? "watching",
        message: rx.efficacy_note ?? "Still watching — no repeat of the problem so far.",
        efficacy_note: rx.efficacy_note,
        summary,
      });
    }

    // ── It didn't land: recommend a DIFFERENT FORMAT ──
    if (!priorFormat) {
      return NextResponse.json({
        success: true,
        efficacy_status: "escalated",
        message: rx.efficacy_note ?? "The problem came back after delivery.",
        efficacy_note: rx.efficacy_note,
        summary,
      });
    }

    const { data: outRaw } = await service
      .from("training_format_outcomes")
      .select("attempt, chosen_format, enhancements")
      .eq("training_request_id", request.id)
      .order("attempt", { ascending: true });
    const attempts = (outRaw || []) as unknown as OutcomeRow[];
    const triedFormatKeys = [
      ...new Set(attempts.map((a) => a.chosen_format).filter(isTrainingFormatKey)),
    ];
    const currentEnhancements = (
      attempts.find((a) => a.attempt === attempt)?.enhancements || []
    )
      .map((e) => e?.note)
      .filter((n): n is string => typeof n === "string" && n.trim().length > 0);

    const { data: trRaw } = await service
      .from("prescription_trainings")
      .select("title, strategy")
      .eq("id", request.current_training_id ?? "")
      .maybeSingle();
    const prior = (trRaw as { title: string; strategy: string } | null) ?? {
      title: "(untitled)",
      strategy: "(unrecorded)",
    };

    // ── P-7 Build 5: the re-recommendation also sees the org's track record.
    //    (This attempt still reads as 'pending' here — it is closed out as
    //    did_not_land just below; the prompt already carries the recurrence
    //    directly via efficacy_note, so nothing is double-counted.)
    //    Null-safe — degrades to no record. ──
    const orgPrior = await computeFormatPrior(service, request.org_id, request.issue_type);

    const readapt = await recommendNextFormat({
      priorFormatKey: priorFormat,
      triedFormatKeys,
      attempt,
      priorTitle: prior.title,
      priorStrategy: prior.strategy,
      enhancements: currentEnhancements.join(" · "),
      issueRestated: request.issue_restated ?? "(not restated)",
      issueType: request.issue_type ?? "unclassified",
      audience: request.audience_summary,
      subjectEntities: describeEntities(request.subject_entities || []),
      efficacyNote: rx.efficacy_note ?? "The problem recurred after delivery.",
      trackRecord: formatPriorForPrompt(orgPrior),
    });

    // Close out the failed attempt either way — the miss IS the learning
    // signal, and it must be logged whether or not the re-recommendation
    // model call succeeded.
    await resolveFormatAttempt(service, {
      trainingRequestId: request.id,
      attempt,
      outcome: "did_not_land",
      outcomeNote: rx.efficacy_note ?? "The problem recurred after delivery.",
      evidenceRecordIds: rx.efficacy_evidence_record_ids ?? [],
      nextFormatRecommended: readapt?.nextFormat ?? null,
      nextFormatRationale: readapt
        ? `${readapt.whyTheLastOneDidNotLand} → ${readapt.rationale}`
        : null,
    });

    if (!readapt) {
      return NextResponse.json({
        success: true,
        efficacy_status: "escalated",
        message:
          "The problem came back, and picking the next format didn't complete. Run the check again — the miss is already recorded.",
        diagnostic: lastFormatReadaptDiagnostic,
        efficacy_note: rx.efficacy_note,
        summary,
      });
    }

    // Re-open the choice with the new recommendation on the table. The
    // leader decides again — flag-never-block holds on the retry too.
    const nextFormat = readapt.nextFormat;
    const readaptBlock = {
      headline: `${TRAINING_FORMATS[priorFormat].name} didn't move it — try a ${TRAINING_FORMATS[nextFormat].name.toLowerCase()}.`,
      why_the_last_one_did_not_land: readapt.whyTheLastOneDidNotLand,
      tradeoff: null,
      grounding_caution: readapt.notATrainingProblem,
      not_a_training_problem: readapt.notATrainingProblem,
      ranked: [
        {
          format_key: nextFormat,
          format_name: TRAINING_FORMATS[nextFormat].name,
          effort: TRAINING_FORMATS[nextFormat].effort,
          rank: 1,
          is_primary: true,
          rationale: readapt.rationale,
          citations: readapt.citations,
        },
        ...Object.values(TRAINING_FORMATS)
          .filter((f) => f.key !== nextFormat)
          .map((f, i) => ({
            format_key: f.key,
            format_name: f.name,
            effort: f.effort,
            rank: i + 2,
            is_primary: false,
            rationale: triedFormatKeys.includes(f.key)
              ? `Already tried on this issue — the problem came back after it.`
              : `Available if you'd rather: ${f.oneLiner}`,
            citations: [],
          })),
      ],
      previous: request.recommendations ?? null,
      // P-7 Build 5 — the same evidence the agent saw, for the cards.
      track_record: storedTrackRecord(orgPrior),
    };

    const { error: updError } = await service
      .from("training_requests")
      .update({
        recommendations: readaptBlock,
        recommended_format: nextFormat,
        recommended_at: new Date().toISOString(),
        // The leader chooses again — a new choice opens a new attempt.
        chosen_format: null,
        format_overridden: false,
        override_reason: null,
        current_training_id: null,
        status: "recommended",
      })
      .eq("id", request.id);
    if (updError) {
      return NextResponse.json({ error: updError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      efficacy_status: "escalated",
      next_format: nextFormat,
      why_the_last_one_did_not_land: readapt.whyTheLastOneDidNotLand,
      rationale: readapt.rationale,
      citations: readapt.citations,
      not_a_training_problem: readapt.notATrainingProblem,
      message: `The problem came back. ${readapt.whyTheLastOneDidNotLand} Next suggestion: a ${TRAINING_FORMATS[nextFormat].name.toLowerCase()}.`,
      efficacy_note: rx.efficacy_note,
      summary,
    });
  } catch (err) {
    console.error("Unexpected error in training-studio efficacy route:", err);
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
