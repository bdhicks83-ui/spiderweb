// P-8 Phase 1 — SIGNAL 4b of 7: the manager's verdict on a Coaching Watch
// early signal (acknowledge / dismiss).
//
// POST { status: 'acknowledged' | 'dismissed' }
//
// WHY THIS ROUTE EXISTS AT ALL. Until now /coaching wrote this status straight
// from the client: retraining_signals carries an UPDATE policy scoped by
// is_manager_of(person_id), so a same-privilege client write was correct and
// needed no route. It still is. What it could NOT do is write to the ledger —
// learning_signals has no insert policy for authenticated users at all (same
// lockdown doctrine as prescription_detections), and it must not get one: a
// client-writable ledger is a forgeable ledger.
//
// So this route is a thin server-side mirror of the write the page was already
// making. Behaviour is IDENTICAL by design — same two columns set, same
// values, same resulting UI. The only new thing that happens is the ledger row.
//
// AUTHORIZATION IS THE READ. The SESSION client's SELECT on retraining_signals
// is already gated by is_manager_of(person_id) — the narrowest boundary in the
// product. If the caller can read the row, they are that person's direct
// manager; if they cannot, this route 404s exactly as the RLS intends. There is
// no second, hand-rolled permission check to drift out of sync with the policy.
//
// ⚠️ PRIVACY CONSTRUCTION — READ BEFORE ADDING A FIELD TO THE LEDGER WRITE.
// learning_signals is ORG-WIDE readable. retraining_signals is MANAGER-ONLY.
// The ledger row is therefore built to carry nothing that could resolve to the
// named person:
//   • no person_id, and no `summary` — the summary is blameless in register but
//     it CONTAINS THE PERSON'S NAME;
//   • no actor_id, uniquely for this surface, because "manager M dismissed a
//     direct report's early signal" is precisely the inference P-6 exists to
//     prevent. actor_role is kept; the identity is not.
//   • subject_id is the retraining_signals row id, which an org peer cannot
//     resolve back to a person through that table's own RLS.
// See the header of supabase/p8-learning-ledger.sql for the full reasoning.
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { recordLearningSignal } from "@/lib/learning-ledger";

type SignalRow = {
  id: string;
  org_id: string;
  status: string;
  recurrence: number;
  detected_at: string;
  evidence_record_ids: string[] | null;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const status = body?.status;
    if (status !== "acknowledged" && status !== "dismissed") {
      return NextResponse.json(
        { error: "status must be 'acknowledged' or 'dismissed'" },
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

    // THE AUTHORIZATION. Only the named person's direct manager can see this
    // row at all (is_manager_of), so a successful read IS the permission check.
    const { data: sigRaw } = await supabase
      .from("retraining_signals")
      .select("id, org_id, status, recurrence, detected_at, evidence_record_ids")
      .eq("id", id)
      .maybeSingle();
    const signal = sigRaw as unknown as SignalRow | null;
    if (!signal) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const acknowledgedAt = new Date().toISOString();
    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    // Byte-for-byte the same write the page used to make from the client —
    // status + acknowledged_at, nothing else. (acknowledged_by is deliberately
    // still not set: this build changes no existing behaviour, and the ledger
    // now records the judgment anyway.)
    const { error } = await service
      .from("retraining_signals")
      .update({ status, acknowledged_at: acknowledgedAt })
      .eq("id", signal.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // ── P-8 SIGNAL 4b: "worth acting on" / "not worth acting on" ──
    const daysOpen = Math.max(
      0,
      Math.round(
        (new Date(acknowledgedAt).getTime() - new Date(signal.detected_at).getTime()) /
          (24 * 60 * 60 * 1000)
      )
    );
    await recordLearningSignal(service, {
      orgId: signal.org_id,
      sourceSurface: "coaching",
      signalType: status === "dismissed" ? "coaching_dismiss" : "coaching_acknowledge",
      subjectType: "person_signal",
      subjectId: signal.id,
      // A dismissal is a negative verdict on the DETECTOR — the watch fired
      // and the manager judged it not worth acting on.
      verdict: status === "dismissed" ? "negative" : "positive",
      features: {
        recurrence: signal.recurrence,
        evidence_count: (signal.evidence_record_ids || []).length,
        days_open: daysOpen,
        prior_status: signal.status,
      },
      // Deliberately empty. See the privacy note in this file's header: the
      // summary names a person and must not cross into an org-readable table.
      payload: {},
      actorId: null,
      actorRole: "manager",
      occurredAt: acknowledgedAt,
    });

    return NextResponse.json({ success: true, status });
  } catch (err) {
    console.error("Unexpected error in coaching status route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
