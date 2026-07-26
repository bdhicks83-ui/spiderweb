// P-5 — outcome-nudge: the 6-month one-click follow-up (spec'd in
// ELICITATION-ENGINE-SPEC-ADDENDUM-2026-07-22 §4, never built until now).
//
// A prescription proven "effective" at the efficacy loop is only proven as
// of THAT check — Kirkpatrick Level 4 measured once. Six months on, the
// brain asks again with a single click instead of assuming it still holds.
// This does NOT replace the efficacy loop (which watches for recurrence
// continuously); it's a periodic human gut-check on outcomes the loop
// itself can't see (did the org change the process, did the person leave,
// does it just feel less true now).
//
// POST { status: 'holding' | 'regressed' }. 'regressed' does not silently
// reopen anything — flag-never-block family — it's a recorded signal an
// exec can act on, same doctrine as escalation notes: names records, not
// people.
//
// ── P-8 Phase 1 (LEARNING LEDGER) — SIGNAL 6 of 7: the 6-month check-in ────
// This is the ONLY signal in the product that measures DURABILITY. The
// efficacy loop can prove an intervention held for 14 quiet days; only a human
// six months later can say whether it is still true. An intervention that
// looks identical to another at the 14-day mark but decays by month six is the
// most valuable distinction a Phase-2 reader could learn — and until now it
// dead-ended in outcome_confirmed_status.
// WRITERS ONLY — nothing reads this yet.
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { recordLearningSignal } from "@/lib/learning-ledger";

type RxRow = {
  id: string;
  org_id: string;
  status: string;
  efficacy_status: string | null;
  rung: number;
  detection_id: string;
  delivered_at: string | null;
  recurrence: number;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const status = body?.status === "regressed" ? "regressed" : "holding";

    const supabase = await createSessionClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const { data: rxRaw } = await supabase
      .from("prescriptions")
      .select("id, org_id, status, efficacy_status, rung, detection_id, delivered_at, recurrence")
      .eq("id", id)
      .maybeSingle();
    const rx = rxRaw as unknown as RxRow | null;
    if (!rx) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // Only a closed/effective prescription has an outcome worth re-asking
    // about — nothing else has cleared the efficacy loop yet.
    if (rx.status !== "closed" || rx.efficacy_status !== "effective") {
      return NextResponse.json(
        { error: "Outcome nudges only apply to prescriptions proven effective and closed." },
        { status: 409 }
      );
    }

    const confirmedAt = new Date().toISOString();
    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { error } = await service
      .from("prescriptions")
      .update({
        outcome_confirmed_at: confirmedAt,
        outcome_confirmed_status: status,
        outcome_confirmed_by: user.id,
      })
      .eq("id", rx.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // ── P-8 SIGNAL 6: did it actually hold? ──
    const { data: detRaw } = await service
      .from("prescription_detections")
      .select("source_type")
      .eq("id", rx.detection_id)
      .maybeSingle();
    const monthsSinceDelivery = rx.delivered_at
      ? Math.round(
          (new Date(confirmedAt).getTime() - new Date(rx.delivered_at).getTime()) /
            (30 * 24 * 60 * 60 * 1000)
        )
      : null;

    await recordLearningSignal(service, {
      orgId: rx.org_id,
      sourceSurface: "prescription",
      signalType: "outcome_checkin",
      subjectType: "prescription",
      subjectId: rx.id,
      verdict: status === "holding" ? "positive" : "negative",
      features: {
        outcome_status: status,
        rung: rx.rung,
        source_type: (detRaw as { source_type?: string } | null)?.source_type ?? null,
        recurrence: rx.recurrence,
        // How long the intervention had to decay before someone was asked.
        // Durability is meaningless without the interval it was measured over.
        months_since_delivery: monthsSinceDelivery,
      },
      payload: {
        delivered_at: rx.delivered_at,
        confirmed_at: confirmedAt,
      },
      actorId: user.id,
      actorRole: "manager",
      occurredAt: confirmedAt,
    });

    return NextResponse.json({
      success: true,
      message:
        status === "holding"
          ? "Confirmed — still holding. Next check-in in 6 months."
          : "Recorded — no longer holding. Nothing reopens automatically; this is a signal, not an action.",
    });
  } catch (err) {
    console.error("Unexpected error in prescription outcome route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
