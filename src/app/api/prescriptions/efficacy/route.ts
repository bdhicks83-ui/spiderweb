// P-4B Build 5 — the efficacy loop + auto-escalation, on demand.
//
// POST, no body. Runs the efficacy check over every DELIVERED prescription
// in the caller's own org: the same P-4A detection logic (entity-key +
// trouble-trigger matching) scoped to records dated AFTER delivered_at.
// Recurrence ⇒ auto-escalate one rung + flag. Quiet across the window ⇒
// effective, logged as proof, closed. This is Kirkpatrick Level 4 measured
// automatically — training that verifies itself and retries when it fails.
//
// Same construction as /api/prescriptions/detect: org id read server-side
// from the caller's profile, writes through the service role.
import { NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { runEfficacyLoop } from "@/lib/prescription";

export async function POST() {
  try {
    const supabase = await createSessionClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile?.org_id) {
      return NextResponse.json({
        summary: null,
        message: "You're not part of an org yet — the efficacy loop works over an org's prescriptions.",
      });
    }

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const summary = await runEfficacyLoop(service, profile.org_id);

    const parts: string[] = [];
    if (summary.escalated) parts.push(`${summary.escalated} escalated (recurrence found)`);
    if (summary.effective) parts.push(`${summary.effective} proven effective`);
    if (summary.watching) parts.push(`${summary.watching} still watching`);
    return NextResponse.json({
      summary,
      message:
        summary.checked === 0
          ? "Nothing delivered to watch yet."
          : `Checked ${summary.checked} delivered prescription${summary.checked === 1 ? "" : "s"}: ${parts.join(" · ")}.`,
    });
  } catch (err) {
    console.error("Unexpected error in prescriptions efficacy route:", err);
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
