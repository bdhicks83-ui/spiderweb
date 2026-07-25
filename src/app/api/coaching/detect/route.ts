// Manager-only Retraining/Coaching Watch — detection sweep for the caller's
// org. POST, no body. Mirrors /api/prescriptions/detect's shape: org id read
// server-side from the caller's own profile, writes go through the service
// role (retraining_signals has no insert/update policy for authenticated
// users — see p6-manager-retraining-watch.sql).
//
// Preserves an existing signal's status (open/acknowledged/dismissed) across
// re-runs rather than blindly resetting it to 'open' — a manager who
// dismissed a signal shouldn't see it silently reopen just because detection
// ran again with the same evidence. It only reopens if NEW evidence pushed
// the recurrence count higher than what the manager last saw.
import { NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import {
  detectRetrainingCandidates,
  assertConcernFrictionOnly,
  RETRAINING_WATCH_SOURCE_COLUMNS,
} from "@/lib/retraining-watch";

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
        message: "You're not part of an org yet — the coaching watch works over an org's shared library.",
      });
    }

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: records, error: recordsErr } = await service
      .from("pattern_records")
      .select(RETRAINING_WATCH_SOURCE_COLUMNS)
      .eq("org_id", profile.org_id)
      .eq("status", "complete");
    if (recordsErr) throw recordsErr;

    const { data: profiles, error: profilesErr } = await service
      .from("profiles")
      .select("id, display_name, manager_id")
      .eq("org_id", profile.org_id);
    if (profilesErr) throw profilesErr;

    const candidates = detectRetrainingCandidates(records ?? [], profiles ?? []);

    const guardrail = assertConcernFrictionOnly(records ?? [], candidates);
    if (!guardrail.ok) {
      console.error("Retraining watch guardrail leak — refusing to write:", guardrail.leaks);
      return NextResponse.json(
        { error: "Internal guardrail failure — no rows written." },
        { status: 500 }
      );
    }

    let written = 0;
    for (const c of candidates) {
      const dedupeKey = `person:${c.personId}`;

      const { data: existing } = await service
        .from("retraining_signals")
        .select("id, status, recurrence")
        .eq("org_id", profile.org_id)
        .eq("dedupe_key", dedupeKey)
        .maybeSingle();

      if (!existing) {
        const { error } = await service.from("retraining_signals").insert({
          org_id: profile.org_id,
          person_id: c.personId,
          dedupe_key: dedupeKey,
          evidence_record_ids: c.evidenceRecordIds,
          recurrence: c.recurrence,
          summary: c.summary,
          status: "open",
        });
        if (!error) written++;
        continue;
      }

      // New evidence pushed recurrence higher than what's on file — refresh
      // the row, and reopen if the manager had dismissed/acknowledged an
      // earlier, smaller version of this pattern. Otherwise leave status
      // alone (don't reopen a dismissed signal just for a no-op re-run).
      if (c.recurrence > existing.recurrence) {
        const { error } = await service
          .from("retraining_signals")
          .update({
            evidence_record_ids: c.evidenceRecordIds,
            recurrence: c.recurrence,
            summary: c.summary,
            status: "open",
            detected_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        if (!error) written++;
      }
    }

    return NextResponse.json({
      candidates: candidates.length,
      written,
      message:
        written > 0
          ? `${written} watch signal${written === 1 ? "" : "s"} updated.`
          : "No new watch signals — nothing new crossed the threshold.",
    });
  } catch (err) {
    console.error("Unexpected error in retraining watch detect route:", err);
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
