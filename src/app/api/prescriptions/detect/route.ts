// P-4A Build 1-3 — run the Prescription Engine for the caller's org, on
// demand: detection (conflicts · coverage gaps · entity signals) → triage
// onto the intervention ladder → auto-pairing → ROI-ranked rows.
//
// POST, no body. Always scoped to the requesting user's own org — the org id
// is read server-side from their profile, never from the request, exactly
// like /api/conflicts/detect. Writes go through the service role (neither
// prescription table has an insert policy).
import { NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { runPrescriptionEngine } from "@/lib/prescription";

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
        message:
          "You're not part of an org yet — the Prescription Engine works over an org's shared library.",
      });
    }

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const summary = await runPrescriptionEngine(service, profile.org_id);

    return NextResponse.json({
      summary,
      message:
        summary.prescriptionsNew > 0
          ? `Wrote ${summary.prescriptionsNew} new prescription${summary.prescriptionsNew === 1 ? "" : "s"}.`
          : "No new prescriptions — no unhandled gaps detected.",
    });
  } catch (err) {
    console.error("Unexpected error in prescriptions detect route:", err);
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
