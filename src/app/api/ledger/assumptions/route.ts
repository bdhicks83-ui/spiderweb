// THE VALUE LEDGER — POST /api/ledger/assumptions
//
// The CFO edit. Body is any subset of the assumption keys; a number sets it,
// an explicit null clears it back to "no rate entered."
//
// ⭐⭐ THIS IS THE ROUTE THAT MAKES THE AMENDED DOCTRINE TRUE. Every dollar on
// /ledger and on the readout traces back through here to a number a HUMAN
// typed about their own operation. There is no other way for a rate to enter
// the system, and there is no default anywhere behind it: an absent value stays
// absent, and the page says "no rate entered" rather than showing an industry
// average nobody chose.
//
// Write-path doctrine (T1B1): the session client proves who is asking, the
// service-role client does the write. value_assumptions has no client write
// policy — a client that can UPDATE it is a client that can rewrite the number
// in front of the CFO.
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/org-admin";
import {
  ASSUMPTION_FIELDS,
  ASSUMPTION_KEYS,
  readAssumptions,
  requireLedgerViewer,
  type AssumptionKey,
} from "@/lib/value-ledger";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await createSessionClient();
  const gate = await requireLedgerViewer(session);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error, code: gate.code }, { status: gate.status });
  }
  const assumptions = await readAssumptions(session, gate.orgId);
  return NextResponse.json({ assumptions, fields: ASSUMPTION_FIELDS });
}

export async function POST(req: NextRequest) {
  try {
    const session = await createSessionClient();
    const gate = await requireLedgerViewer(session);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error, code: gate.code }, { status: gate.status });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const patch: Record<string, number | null> = {};
    const rejected: string[] = [];

    for (const key of ASSUMPTION_KEYS) {
      if (!(key in body)) continue;
      const raw = body[key];
      if (raw === null || raw === "") {
        // Explicitly clearing a rate is a legitimate, meaningful action: the
        // figures it fed stop rendering and the quantity shows on its own.
        patch[key] = null;
        continue;
      }
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        rejected.push(key);
        continue;
      }
      if (key === "annual_departure_probability" && n > 1) {
        rejected.push(key);
        continue;
      }
      patch[key] = n;
    }

    if (rejected.length > 0) {
      // ⚠️ DRAFT CUSTOMER-FACING COPY — PENDING BRIAN.
      return NextResponse.json(
        {
          error:
            rejected.includes("annual_departure_probability")
              ? "Departure probability is a number between 0 and 1 — 0.12 means a 12% chance in a year."
              : "Those need to be plain positive numbers — no currency symbols or commas.",
          code: "BAD_VALUE",
          fields: rejected,
        },
        { status: 400 }
      );
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
    }

    const service = serviceClient();
    const { error } = await service.from("value_assumptions").upsert(
      {
        org_id: gate.orgId,
        ...patch,
        updated_at: new Date().toISOString(),
        updated_by: gate.userId,
      },
      { onConflict: "org_id" }
    );
    if (error) {
      return NextResponse.json(
        { error: "Could not save that.", details: error.message },
        { status: 500 }
      );
    }

    // Hand back the whole row so the page recomputes from the truth rather than
    // from what it hoped it had just written.
    const assumptions = await readAssumptions(service, gate.orgId);
    return NextResponse.json({
      ok: true,
      assumptions,
      changed: Object.keys(patch) as AssumptionKey[],
    });
  } catch (err) {
    console.error("Unexpected error in ledger assumptions route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
