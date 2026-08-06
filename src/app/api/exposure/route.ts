// THE EXPOSURE ENGINE — GET /api/exposure
//
// Everything /exposure renders, computed live. See src/lib/exposure.ts for the
// four rules the whole surface obeys (never a person as a liability · Coaching
// Watch contributes nothing · every row ends in an action · the empty state is
// a real result).
//
// ⭐ SESSION CLIENT, NOT SERVICE ROLE. Exposure is row-level and
// person-attributed, so it reads as the caller and lets RLS scope it. That is
// the deliberate opposite of /api/readout, which reports aggregates that must
// be true totals. Stated at length in buildWalkingRisk()'s header.
import { NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { buildWalkingRisk, requireExposureViewer, EXPOSURE_PAGE_ROWS } from "@/lib/exposure";
import { buildFrameworkWarnings } from "@/lib/precedence";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await createSessionClient();
    const gate = await requireExposureViewer(session);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error, code: gate.code }, { status: gate.status });
    }

    // Both blocks are independent: a failure in one must not blank the other.
    // Block 2 in particular is allowed to be unavailable (its migration may not
    // have run yet), and it reports that honestly rather than rendering an
    // empty list that would read as "nothing is warning you."
    const [walking, warnings] = await Promise.all([
      buildWalkingRisk(session, gate.orgId),
      buildFrameworkWarnings(session, gate.orgId),
    ]);

    return NextResponse.json({
      walking_risk: walking,
      warnings,
      page_rows: EXPOSURE_PAGE_ROWS,
    });
  } catch (err) {
    console.error("Unexpected error in exposure route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
