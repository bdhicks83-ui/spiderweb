// Phase 5 (Step 7) — recompute + store the Expert Credibility Score for the
// logged-in user. POST → returns the fresh breakdown. Session client for auth;
// service role for the compute (reads across sources/insights/contradictions,
// writes credibility_scores which is user-read-only).
import { NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { computeAndStoreCredibility } from "@/lib/credibility";

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
    const breakdown = await computeAndStoreCredibility(service, user.id);
    return NextResponse.json(breakdown);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
