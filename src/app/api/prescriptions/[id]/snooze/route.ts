// P-4B Build 1 — the manager approval gate: snooze.
//
// POST { days?: number } (default 7, 1..90). Snooze DEFERS, never deletes —
// flag-never-block family. The row keeps everything and gets a wake date;
// the queue list route lazily flips it back to 'open' once the wake date
// passes. Who snoozed and when is recorded, same as approval.
//
// ── P-8 Phase 1 (LEARNING LEDGER) — SIGNAL 4a of 7: the snooze ─────────────
// A snooze is a manager saying "the engine surfaced this, and it is not worth
// acting on right now." That is a direct verdict on the engine's own ranking,
// and it dead-ended in snoozed_until. The ledger keys it on the SHAPE of what
// was deferred — rung, detection source, recurrence, ROI — so a Phase-2 reader
// can eventually learn which kinds of prescriptions managers reliably defer,
// without ever learning which MANAGER defers things.
// WRITERS ONLY — nothing reads this yet.
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { recordLearningSignal } from "@/lib/learning-ledger";

type RxRow = {
  id: string;
  org_id: string;
  status: string;
  rung: number;
  detection_id: string;
  recurrence: number;
  roi_score: number;
  capture_first: boolean;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const rawDays = typeof body?.days === "number" ? Math.round(body.days) : 7;
    const days = Math.max(1, Math.min(90, rawDays));

    const supabase = await createSessionClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const { data: rxRaw } = await supabase
      .from("prescriptions")
      .select("id, org_id, status, rung, detection_id, recurrence, roi_score, capture_first")
      .eq("id", id)
      .maybeSingle();
    const rx = rxRaw as unknown as RxRow | null;
    if (!rx) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // Snooze from 'open' (or re-snooze to move the wake date). Anything
    // already approved/delivered is past the gate — too late to defer.
    if (rx.status !== "open" && rx.status !== "snoozed") {
      return NextResponse.json(
        { error: `Cannot snooze a prescription in status '${rx.status}'` },
        { status: 409 }
      );
    }

    const wake = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const snoozedAt = new Date().toISOString();
    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { error } = await service
      .from("prescriptions")
      .update({
        status: "snoozed",
        snoozed_by: user.id,
        snoozed_at: snoozedAt,
        snoozed_until: wake.toISOString(),
      })
      .eq("id", rx.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // ── P-8 SIGNAL 4a: "not worth acting on right now" ──
    const { data: detRaw } = await service
      .from("prescription_detections")
      .select("source_type")
      .eq("id", rx.detection_id)
      .maybeSingle();

    await recordLearningSignal(service, {
      orgId: rx.org_id,
      sourceSurface: "prescription",
      signalType: "prescription_snooze",
      subjectType: "prescription",
      subjectId: rx.id,
      // Negative on the engine's RANKING, not on the underlying gap. A
      // deferred prescription may still be a real gap — flag-never-block —
      // but the queue put it in front of a manager who said "not now."
      verdict: "negative",
      features: {
        rung: rx.rung,
        source_type: (detRaw as { source_type?: string } | null)?.source_type ?? null,
        recurrence: rx.recurrence,
        roi_score: rx.roi_score,
        capture_first: rx.capture_first,
        snooze_days: days,
        was_re_snooze: rx.status === "snoozed",
      },
      payload: {
        snoozed_until: wake.toISOString(),
      },
      actorId: user.id,
      actorRole: "manager",
      occurredAt: snoozedAt,
    });

    return NextResponse.json({
      success: true,
      snoozed_until: wake.toISOString(),
      message: `Snoozed for ${days} day${days === 1 ? "" : "s"} — it drops out of the queue and wakes on its own. Nothing is deleted.`,
    });
  } catch (err) {
    console.error("Unexpected error in prescription snooze route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
