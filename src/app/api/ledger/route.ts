// THE VALUE LEDGER — GET /api/ledger?since=YYYY-MM-DD
//
// Everything /ledger renders. See src/lib/value-ledger.ts for the amended
// doctrine this whole surface obeys: the system never invents a rate, the
// customer supplies every rate, and the claim is asset-acquisition cost —
// never a saving.
//
// ⭐ SERVICE-ROLE READ, gated in the route. The same call /api/readout makes and
// for the same reason: this reports TOTALS, and "the total as far as you can
// see" presented as the total is the exact T1B3 bug. (Compare /api/exposure,
// which is person-attributed and reads as the caller.)
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import {
  ASSUMPTION_FIELDS,
  EVENT_META,
  buildLedger,
  requireLedgerViewer,
} from "@/lib/value-ledger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await createSessionClient();
    const gate = await requireLedgerViewer(session);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error, code: gate.code }, { status: gate.status });
    }

    // An unparseable ?since is treated as "all time" rather than erroring — a
    // page that refuses to render because of a malformed query param is a page
    // somebody gives up on. Same rule as /api/readout.
    const raw = req.nextUrl.searchParams.get("since");
    const since =
      raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00Z`).toISOString() : null;

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const ledger = await buildLedger(service, gate.orgId, since);
    // The editable-field catalog and the line labels travel WITH the data:
    // /lib/value-ledger.ts is server-only, and a second copy of this list in the
    // page is a copy that drifts.
    return NextResponse.json({ ledger, fields: ASSUMPTION_FIELDS, labels: EVENT_META });
  } catch (err) {
    console.error("Unexpected error in ledger route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
