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
import { buildLedger, toReadoutBlock } from "@/lib/value-ledger";

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

    // ─── VALUE LEDGER BLOCK (2026-08-06) ──────────────────────────────────
    // ⭐ ADDITIVE ONLY. The years-of-judgment anchor above is untouched and
    // stays the headline; this block sits BELOW it, never above.
    //
    // ⭐⭐ toReadoutBlock() RETURNS null WHEN THE ORG HAS ENTERED NO RATES, and
    // on null the page and the PDF render nothing at all — the readout falls
    // back to exactly its v2.59 behaviour. No half-populated dollar figure ever
    // leaves the building.
    //
    // Fail-open: a ledger that cannot be built must never cost a champion their
    // readout the week before a renewal conversation.
    let ledger = null;
    try {
      ledger = toReadoutBlock(await buildLedger(service, gate.orgId, since));
    } catch (e) {
      console.error("readout: ledger block failed and was dropped:", e);
    }

    return NextResponse.json({ readout, ledger });
  } catch (err) {
    console.error("Unexpected error in readout route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
