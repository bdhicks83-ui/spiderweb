// P-4B Build 2 — the expert fidelity check.
//
// POST { decision: 'confirmed' | 'rejected', note?: string }
//
// Before a curriculum built from an expert's framework ships, the authoring
// expert(s) named in prescriptions.experts get the 60-second confirm:
// "yes, that's how I think" (confirmed) / "not quite" (rejected + note).
// Doctrine: fidelity enforced at the transfer layer — NOTHING ships in an
// expert's name without their confirmed row (the training route enforces
// it). Capture-first prescriptions SKIP fidelity entirely: nothing has been
// authored yet, so there is nothing to confirm.
//
// Only a NAMED expert may submit — this is the one P-4B write that checks
// identity beyond org membership, because the signature being protected is
// the expert's own.
//
// ── P-8 Phase 1 (LEARNING LEDGER) — SIGNAL 2 of 7: expert fidelity ──────────
// A REJECTION here is the highest-value negative signal in the system: a named
// expert saying the engine misrepresented their judgment. Until now it landed
// in prescription_fidelity and dead-ended there. Both directions are logged —
// a ledger that only ever hears rejections teaches a pessimistic prior — but
// the rejection is the one worth building for. The features describe the
// FRAMEWORK and the situation (method, trigger type, rung, detection source),
// never the expert: see GUARDRAIL 1 in src/lib/learning-ledger.ts.
// WRITERS ONLY — nothing reads this yet.
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { recordLearningSignal } from "@/lib/learning-ledger";

type RxRow = {
  id: string;
  org_id: string;
  status: string;
  capture_first: boolean;
  experts: { user_id: string; record_id: string }[];
  rung: number;
  detection_id: string;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const decision = body?.decision;
    const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null;
    if (decision !== "confirmed" && decision !== "rejected") {
      return NextResponse.json(
        { error: "decision must be 'confirmed' or 'rejected'" },
        { status: 400 }
      );
    }
    // "Not quite" without saying what's off leaves the L&D agent guessing —
    // require the note on rejection (it goes back with the prescription).
    if (decision === "rejected" && !note) {
      return NextResponse.json(
        { error: "A short note is required with 'not quite' — what's off?" },
        { status: 400 }
      );
    }

    const supabase = await createSessionClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const { data: rxRaw } = await supabase
      .from("prescriptions")
      .select("id, org_id, status, capture_first, experts, rung, detection_id")
      .eq("id", id)
      .maybeSingle();
    const rx = rxRaw as unknown as RxRow | null;
    if (!rx) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (rx.capture_first) {
      return NextResponse.json(
        {
          error:
            "Capture-first prescriptions skip the fidelity check — nothing has been authored yet to confirm.",
        },
        { status: 409 }
      );
    }
    const mine = (rx.experts || []).find((e) => e.user_id === user.id);
    if (!mine) {
      return NextResponse.json(
        { error: "Only an authoring expert named on this prescription can fidelity-check it." },
        { status: 403 }
      );
    }
    // Fidelity happens after the manager gate, before (or after — a changed
    // mind is allowed while things are in flight) delivery.
    if (rx.status !== "approved" && rx.status !== "delivered") {
      return NextResponse.json(
        { error: `Fidelity check applies after approval (status is '${rx.status}')` },
        { status: 409 }
      );
    }

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const decidedAt = new Date().toISOString();
    const { error } = await service.from("prescription_fidelity").upsert(
      {
        org_id: rx.org_id,
        prescription_id: rx.id,
        expert_user_id: user.id,
        record_id: mine.record_id,
        decision,
        note,
        decided_at: decidedAt,
      },
      { onConflict: "prescription_id,expert_user_id" }
    );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // ── P-8 SIGNAL 2: the expert's verdict on how they were represented ──
    // Feature context is fetched AFTER the user's write has already succeeded,
    // so nothing about the learning write can cost the expert their decision.
    const { data: recRaw } = await service
      .from("pattern_records")
      .select("id, method, trigger_type, situation_type, context_function")
      .eq("id", mine.record_id)
      .maybeSingle();
    const rec = recRaw as unknown as {
      method: string | null;
      trigger_type: string | null;
      situation_type: string | null;
      context_function: string | null;
    } | null;
    const { data: detRaw } = await service
      .from("prescription_detections")
      .select("source_type")
      .eq("id", rx.detection_id)
      .maybeSingle();

    await recordLearningSignal(service, {
      orgId: rx.org_id,
      sourceSurface: "prescription",
      signalType: "expert_fidelity",
      subjectType: "pattern_record",
      subjectId: mine.record_id,
      verdict: decision === "confirmed" ? "positive" : "negative",
      features: {
        decision,
        rung: rx.rung,
        source_type: (detRaw as { source_type?: string } | null)?.source_type ?? null,
        method: rec?.method ?? null,
        trigger_type: rec?.trigger_type ?? null,
        situation_type: rec?.situation_type ?? null,
        context_function: rec?.context_function ?? null,
      },
      payload: {
        prescription_id: rx.id,
        // The expert's own words on what we got wrong. This is the text a
        // Phase-2 reader will want most and the one thing that cannot be
        // reconstructed later.
        note,
      },
      actorId: user.id,
      actorRole: "expert",
      occurredAt: decidedAt,
    });

    return NextResponse.json({
      success: true,
      decision,
      message:
        decision === "confirmed"
          ? "Confirmed — training built from your framework may now generate and ship in your name."
          : "Recorded — nothing will ship in your name. Your note goes back with the prescription.",
    });
  } catch (err) {
    console.error("Unexpected error in prescription fidelity route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
