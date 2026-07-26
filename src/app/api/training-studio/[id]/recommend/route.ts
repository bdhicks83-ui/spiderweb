// P-7 Build 2 — THE L&D FORMAT AGENT, invoked.
//
// POST, no body. Given (issue type + audience + the org's codified material
// on this territory), the agent recommends the best training FORMAT and says
// WHY — ranked, with rationale cited from a closed learning-science catalog
// (src/lib/training-formats.ts). The leader sees why, not just what.
//
// Doctrine:
//   • flag-never-block — the agent recommends; the leader decides (and can
//     override to any format on the next call).
//   • explainable — the full ranked list, the citations, the tradeoff, and
//     any grounding caution are all stored and shown. Nothing is hidden
//     scoring.
//   • fail open — a model or citation-validation failure stores NOTHING and
//     returns a retryable error, exactly like triage on the detected path.
//
// Reasoning-heavy: max_tokens 8000, timeout 60s, maxRetries 0 (all set on
// the shared Anthropic client / helper in @/lib/claude).
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { recommendTrainingFormat } from "@/lib/claude";
import { TRAINING_FORMATS } from "@/lib/training-formats";
import { describeEntities, groundingForIssue, groundingSummary } from "@/lib/training-studio";

export const maxDuration = 60;

type RequestRow = {
  id: string;
  org_id: string;
  issue_text: string;
  issue_restated: string | null;
  issue_type: string | null;
  understanding_note: string | null;
  subject_entities: { type: string; name: string; detail: string | null }[];
  audience_summary: string;
  status: string;
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
        { error: "Creating training is a manager action." },
        { status: 403 }
      );
    }

    // Membership is proven by the SESSION read — RLS decides whether this
    // row exists for this caller at all.
    const { data: reqRaw } = await supabase
      .from("training_requests")
      .select(
        "id, org_id, issue_text, issue_restated, issue_type, understanding_note, subject_entities, audience_summary, status"
      )
      .eq("id", id)
      .maybeSingle();
    const request = reqRaw as unknown as RequestRow | null;
    if (!request) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const grounding = await groundingForIssue(
      service,
      request.org_id,
      `${request.issue_restated ?? ""} ${request.issue_text} Audience: ${request.audience_summary}. Subjects: ${describeEntities(
        request.subject_entities || []
      )}`
    );

    const recommendation = await recommendTrainingFormat({
      issueText: request.issue_text,
      issueRestated: request.issue_restated ?? request.issue_text,
      issueType: request.issue_type ?? "unclassified",
      understandingNote: request.understanding_note ?? "(none recorded)",
      subjectEntities: describeEntities(request.subject_entities || []),
      audience: request.audience_summary,
      grounding: grounding.captureFirst
        ? `NOTHING CODIFIED YET on this territory. ${grounding.note ?? ""}`
        : grounding.groundingText.slice(0, 24000),
    });

    if (!recommendation) {
      // Fail open: nothing stored, the leader simply asks again.
      return NextResponse.json(
        {
          error:
            "The format recommendation didn't complete — nothing was saved. Try again.",
        },
        { status: 502 }
      );
    }

    const stored = recommendation.recommendations.map((r) => ({
      format_key: r.formatKey,
      format_name: TRAINING_FORMATS[r.formatKey].name,
      effort: TRAINING_FORMATS[r.formatKey].effort,
      rank: r.rank,
      is_primary: r.isPrimary,
      rationale: r.rationale,
      citations: r.citations,
    }));

    const { error: updError } = await service
      .from("training_requests")
      .update({
        recommendations: {
          headline: recommendation.headline,
          tradeoff: recommendation.tradeoff,
          grounding_caution: recommendation.groundingCaution,
          grounding_summary: groundingSummary(grounding),
          capture_first: grounding.captureFirst,
          ranked: stored,
        },
        recommended_format: recommendation.primaryFormat,
        recommended_at: new Date().toISOString(),
        status: request.status === "new" ? "recommended" : request.status,
      })
      .eq("id", request.id);
    if (updError) {
      return NextResponse.json({ error: updError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      primary_format: recommendation.primaryFormat,
      headline: recommendation.headline,
      ranked: stored,
      tradeoff: recommendation.tradeoff,
      grounding_caution: recommendation.groundingCaution,
      capture_first: grounding.captureFirst,
      message: `Recommended: ${TRAINING_FORMATS[recommendation.primaryFormat].name}. You can take it or choose a different format — the choice is yours either way.`,
    });
  } catch (err) {
    console.error("Unexpected error in training-studio recommend route:", err);
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
