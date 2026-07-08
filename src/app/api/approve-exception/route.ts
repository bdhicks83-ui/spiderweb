// Phase 5 — Step 3: approve an insight as a "genuine exception" to an existing
// pattern. POST { insightId, contradictedInsightId?, justification }.
//
// Auth via the session client (user must own the insight). The approval +
// contradiction-event write go through the service role so the contradiction
// log is not user-tamperable (it will later feed the credibility score).
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const insightId = body?.insightId as string | undefined;
    const contradictedInsightId = (body?.contradictedInsightId as string | null) ?? null;
    const justification = (body?.justification as string | undefined)?.trim();

    if (!insightId) {
      return NextResponse.json({ error: "Missing insightId" }, { status: 400 });
    }
    if (!justification) {
      return NextResponse.json(
        { error: "A justification is required to approve a genuine exception." },
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

    // Ownership check via RLS (user can only read their own insight).
    const { data: insight, error: loadError } = await supabase
      .from("insights")
      .select("id, status")
      .eq("id", insightId)
      .single();
    if (loadError || !insight) {
      return NextResponse.json({ error: "Insight not found" }, { status: 404 });
    }

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Approve, stamping the justification.
    const { error: updateError } = await service
      .from("insights")
      .update({
        status: "approved",
        decided_at: new Date().toISOString(),
        exception_justification: justification,
      })
      .eq("id", insightId)
      .eq("user_id", user.id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // 2. Log the standing (unresolved) contradiction for later scoring.
    const { error: eventError } = await service.from("contradiction_events").insert({
      user_id: user.id,
      new_insight_id: insightId,
      contradicted_insight_id: contradictedInsightId,
      justification,
      resolved: false,
    });
    if (eventError) {
      // The approval already succeeded; surface the logging failure but don't
      // pretend the whole thing failed.
      return NextResponse.json({ success: true, warning: eventError.message });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
