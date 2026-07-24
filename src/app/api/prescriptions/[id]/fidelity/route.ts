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
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

type RxRow = {
  id: string;
  org_id: string;
  status: string;
  capture_first: boolean;
  experts: { user_id: string; record_id: string }[];
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
      .select("id, org_id, status, capture_first, experts")
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
    const { error } = await service.from("prescription_fidelity").upsert(
      {
        org_id: rx.org_id,
        prescription_id: rx.id,
        expert_user_id: user.id,
        record_id: mine.record_id,
        decision,
        note,
        decided_at: new Date().toISOString(),
      },
      { onConflict: "prescription_id,expert_user_id" }
    );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

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
