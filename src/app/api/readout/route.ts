// TIER 1 / BUILD 3 — the value readout.
//
// GET ?since=YYYY-MM-DD → everything the readout renders, computed live.
//
// No new tables, no stored metrics: a stored number drifts from the thing it
// claims to describe, and the exported PDF is already the dated snapshot.
// See the header of src/lib/value-readout.ts for the three rules this whole
// feature exists to obey (no invented dollars · no person-level negative ·
// say how thin the data is).
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { buildReadout, requireReadoutViewer } from "@/lib/value-readout";

export async function GET(req: NextRequest) {
  try {
    const session = await createSessionClient();
    const gate = await requireReadoutViewer(session);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error, code: gate.code }, { status: gate.status });
    }

    // ?since is a plain date. An unparseable value is treated as "all time"
    // rather than erroring — a readout that refuses to render because of a
    // malformed query param is a readout somebody gives up on.
    const raw = req.nextUrl.searchParams.get("since");
    const since =
      raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00Z`).toISOString() : null;

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const readout = await buildReadout(service, gate.orgId, since);
    return NextResponse.json({ readout });
  } catch (err) {
    console.error("Unexpected error in readout route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
