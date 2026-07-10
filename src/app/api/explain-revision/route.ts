// Phase 8 (Block 2) — belief-revision explanation + depth gate.
// POST { insight_id, explanation }.
//
// An insight flagged needs_explanation earns NO credibility until the expert
// explains what changed. This route scores that explanation for depth: it only
// unlocks scoring if the explanation names the prior belief, the catalyst, the
// current belief, and genuine reasoning (not just a restated conclusion).
//   • depth_ok  → revision_depth_ok=true, then the insight is scored (it becomes
//                 eligible) and its quality_score locks.
//   • shallow   → revision_depth_ok=false; the explanation is still stored (it's
//                 useful in the /ask timeline) but no score is unlocked.
// Either way the explanation is recorded. Writes go through the service role.
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { scoreBeliefRevision } from "@/lib/claude";
import { scoreInsightAtApproval } from "@/lib/insight-score";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const insightId = (body?.insight_id as string | undefined)?.trim();
    const explanation = (body?.explanation as string | undefined)?.trim();
    if (!insightId || !explanation) {
      return NextResponse.json(
        { error: "insight_id and explanation are required" },
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

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Load the flagged insight (must belong to this expert) and the insight it
    // contradicts, so the depth check can compare prior vs. current belief.
    const { data: insight } = await service
      .from("insights")
      .select("id, user_id, content, needs_explanation, contradicts_insight_id")
      .eq("id", insightId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!insight) {
      return NextResponse.json({ error: "Insight not found" }, { status: 404 });
    }

    let priorContent = "(the previously established pattern is not on file)";
    if (insight.contradicts_insight_id) {
      const { data: prior } = await service
        .from("insights")
        .select("content")
        .eq("id", insight.contradicts_insight_id)
        .maybeSingle();
      if (prior?.content) priorContent = prior.content;
    }

    const result = await scoreBeliefRevision(priorContent, insight.content, explanation);

    // Record the explanation regardless. revision_depth_ok stays false unless the
    // gate is cleared; a null result (model hiccup) is treated as "not yet passed".
    const depthOk = result?.depthOk === true;
    const { error: updateError } = await service
      .from("insights")
      .update({
        revision_explanation: explanation,
        revision_depth_ok: depthOk,
        needs_explanation: false, // explained — the badge clears either way
        explained_at: new Date().toISOString(),
      })
      .eq("id", insightId);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // A depth-passing explanation makes the insight eligible — lock its score now.
    if (depthOk) {
      try {
        await scoreInsightAtApproval(service, insightId);
      } catch {
        // non-fatal: the insight is unlocked; scoring can be re-run via backfill
      }
    }

    return NextResponse.json({
      success: true,
      depth_ok: depthOk,
      note: result?.note ?? null,
      message: depthOk
        ? "Thanks — that's a real revision. It now counts toward your credibility."
        : "Logged. Add the prior belief, what changed your mind, and why the new view is better to have it count toward your score.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
