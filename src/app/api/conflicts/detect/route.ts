// P-2 Build 1 — run the Conflict X-ray for the caller's org, on demand.
//
// POST, no body. The scan is ALWAYS scoped to the requesting user's own
// org — the org id is read server-side from their profile, never from the
// request, so there is no way to point this at someone else's org. Writes
// go through the service role (framework_conflicts has no insert policy).
//
// Surface-with-warning doctrine: this route only ever adds annotation rows.
// It never changes a pattern_record or hides anything.
import { NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { detectOrgConflicts } from "@/lib/conflict";

export async function POST() {
  try {
    const supabase = await createSessionClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    // Own-row read policy (Phase 4) makes this visible to the caller.
    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.org_id) {
      // Solo user, no org — nothing to cross-check against. Not an error.
      return NextResponse.json({
        summary: {
          scanned: 0,
          candidates: 0,
          checked: 0,
          skippedExisting: 0,
          skippedCap: 0,
          flagged: 0,
        },
        message: "You're not part of an org yet — cross-expert detection needs an org library.",
      });
    }

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const summary = await detectOrgConflicts(service, profile.org_id);

    return NextResponse.json({
      summary,
      message:
        summary.flagged > 0
          ? `Flagged ${summary.flagged} new conflict${summary.flagged === 1 ? "" : "s"}.`
          : "No new conflicts found.",
    });
  } catch (err) {
    console.error("Unexpected error in conflict detect route:", err);
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
