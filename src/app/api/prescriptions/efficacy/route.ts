// P-4B Build 5 — the efficacy loop + auto-escalation, on demand.
//
// POST, no body. Runs the efficacy check over every DELIVERED prescription
// in the caller's own org: the same P-4A detection logic (entity-key +
// trouble-trigger matching) scoped to records dated AFTER delivered_at.
// Recurrence ⇒ auto-escalate one rung + flag. Quiet across the window ⇒
// effective, logged as proof, closed. This is Kirkpatrick Level 4 measured
// automatically — training that verifies itself and retries when it fails.
//
// Same construction as /api/prescriptions/detect: org id read server-side
// from the caller's profile, writes through the service role.
//
// ── P-8 Phase 1 (LEARNING LEDGER) — the DETECTED-path efficacy outcome ─────
// The Studio's on-demand path already closes out its attempts on
// training_format_outcomes (resolveFormatAttempt, P-7 Build 4). The
// AUTO-DETECTED path had no equivalent: its verdict lived only in
// prescriptions.efficacy_status, where nothing generalizing could reach it.
// This mirrors effective / did_not_land into the ledger so both paths teach.
//
// ⚠️ 'watching' is NOT logged. A prescription still inside its quiet window has
// not been judged yet — writing it as a signal would flood the ledger with
// re-runs of the same non-verdict every time anyone clicks the button, and a
// reader counting rows would mistake button-mashing for evidence.
//
// The write happens AFTER runEfficacyLoop returns, off its return value,
// rather than inside src/lib/prescription.ts. That keeps the 1,200-line
// engine module untouched by this build and keeps the ledger writer at the
// edge, where every other Phase-1 writer lives.
// WRITERS ONLY — nothing reads this yet.
import { NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { runEfficacyLoop } from "@/lib/prescription";
import { recordLearningSignals, type RecordLearningSignalInput } from "@/lib/learning-ledger";

export async function POST() {
  try {
    const supabase = await createSessionClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile?.org_id) {
      return NextResponse.json({
        summary: null,
        message: "You're not part of an org yet — the efficacy loop works over an org's prescriptions.",
      });
    }

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const summary = await runEfficacyLoop(service, profile.org_id);

    // ── P-8: mirror the DECIDED outcomes into the ledger (never 'watching') ──
    const decided = summary.outcomes.filter(
      (o) => o.outcome === "escalated" || o.outcome === "effective"
    );
    if (decided.length > 0) {
      const ids = decided.map((o) => o.prescriptionId);
      const { data: rxRaw } = await service
        .from("prescriptions")
        .select("id, org_id, rung, escalated_from_rung, detection_id, recurrence, delivered_at")
        .in("id", ids);
      const rxRows = (rxRaw || []) as unknown as {
        id: string;
        org_id: string;
        rung: number;
        escalated_from_rung: number | null;
        detection_id: string;
        recurrence: number;
        delivered_at: string | null;
      }[];
      const rxById = new Map(rxRows.map((r) => [r.id, r]));

      const { data: detRaw } = await service
        .from("prescription_detections")
        .select("id, source_type")
        .in(
          "id",
          rxRows.map((r) => r.detection_id)
        );
      const sourceByDetection = new Map(
        ((detRaw || []) as { id: string; source_type: string }[]).map((d) => [d.id, d.source_type])
      );

      const now = new Date().toISOString();
      const signals: RecordLearningSignalInput[] = [];
      for (const outcome of decided) {
        const rx = rxById.get(outcome.prescriptionId);
        if (!rx) continue;
        const landed = outcome.outcome === "effective";
        const daysWatched = rx.delivered_at
          ? Math.round(
              (new Date(now).getTime() - new Date(rx.delivered_at).getTime()) /
                (24 * 60 * 60 * 1000)
            )
          : null;
        signals.push({
          orgId: rx.org_id,
          sourceSurface: "prescription",
          signalType: "efficacy_outcome",
          subjectType: "prescription",
          subjectId: rx.id,
          verdict: landed ? "positive" : "negative",
          features: {
            // 'effective' / 'did_not_land' — the same two words the Studio's
            // format-outcome log uses, so both paths speak one vocabulary.
            outcome: landed ? "effective" : "did_not_land",
            rung: rx.rung,
            escalated_from_rung: rx.escalated_from_rung,
            source_type: sourceByDetection.get(rx.detection_id) ?? null,
            recurrence: rx.recurrence,
            days_watched: daysWatched,
          },
          payload: {
            // The loop's own plain-language note. Wins-only doctrine already
            // guarantees it names entities and counts, never a person.
            efficacy_note: outcome.note,
          },
          actorId: null,
          actorRole: "system",
          occurredAt: now,
        });
      }
      await recordLearningSignals(service, signals);
    }

    const parts: string[] = [];
    if (summary.escalated) parts.push(`${summary.escalated} escalated (recurrence found)`);
    if (summary.effective) parts.push(`${summary.effective} proven effective`);
    if (summary.watching) parts.push(`${summary.watching} still watching`);
    return NextResponse.json({
      summary,
      message:
        summary.checked === 0
          ? "Nothing delivered to watch yet."
          : `Checked ${summary.checked} delivered prescription${summary.checked === 1 ? "" : "s"}: ${parts.join(" · ")}.`,
    });
  } catch (err) {
    console.error("Unexpected error in prescriptions efficacy route:", err);
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
