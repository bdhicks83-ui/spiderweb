// Phase 8 (Block 5) — Longitudinal Growth Score API (dashboard-only).
//   POST → recompute + upsert THIS month's snapshot for the logged-in expert.
//   GET  → return the expert's snapshot history (oldest→newest) for the trend line.
// Read is RLS-scoped to the owner; the recompute writes via the service role.
// Out of scope by spec: any external/marketing sharing of this number.
import { NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { computeGrowthSnapshot } from "@/lib/growth";

export async function POST() {
  try {
    const supabase = await createSessionClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const snapshot = await computeGrowthSnapshot(service, user.id);
    return NextResponse.json({ success: true, snapshot });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = await createSessionClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

    const { data } = await supabase
      .from("growth_snapshots")
      .select(
        "snapshot_month, quality_avg, corroboration_avg, combined_avg, insight_depth, case_evidence_ratio, growth_value, approved_count"
      )
      .eq("user_id", user.id)
      .order("snapshot_month", { ascending: true });

    return NextResponse.json({ snapshots: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
