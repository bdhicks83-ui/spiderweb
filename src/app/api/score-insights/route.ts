// Phase 8 (Block 1) — retroactive per-insight scoring.
// POST → score every APPROVED insight the logged-in expert owns (including the
// Creator Expert Profile and the already-ingested LIT articles). quality_score
// LOCKS on first scoring and never recalculates; corroboration_score is
// additive-only; the badge is refreshed to reflect the current combined score.
// Writes go through the service role (same lockdown as the other scoring paths).
import { NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { backfillScores } from "@/lib/insight-score";

export async function POST() {
  try {
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

    const scored = await backfillScores(service, user.id);
    return NextResponse.json({ success: true, scored });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
