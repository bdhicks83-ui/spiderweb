// P-2 Build 3 — resolve a conflict.
// POST { resolution: 'sharpen_boundaries'|'reconcile'|'supersede'|'escalate',
//        note: string, superseding_record_id?: uuid }
//
// Every one of the four options RESOLVES the conflict row and clears the
// contested badge — escalate is a handoff to a named human owner, not a
// quarantine (surface-with-warning doctrine: nothing is ever held).
//
// Depth gate (belief-revision pattern reapplied): sharpen_boundaries /
// reconcile / supersede all CHANGE what the org's operating guidance is, so
// their note must pass scoreConflictResolution before the badge clears —
// exactly like an insight revision earns nothing until the explanation
// names the prior belief, catalyst, current belief, and reasoning. A
// shallow note is still STORED (visible in the thread, useful history) but
// the conflict stays open — mirroring /api/explain-revision, which records
// every explanation but only unlocks on depth. Escalate skips the gate: it
// changes no framework, it routes the call to a person.
//
// Who resolved it and how is recorded on the row — this is P-4's detection
// history input.
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { scoreConflictResolution } from "@/lib/claude";
import {
  isConflictResolution,
  formatRecordForConflict,
  CONFLICT_RECORD_COLUMNS,
  type ConflictCandidateRecord,
} from "@/lib/conflict";

type ConflictRow = {
  id: string;
  org_id: string;
  record_a_id: string;
  record_b_id: string;
  status: string;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const resolution = body?.resolution;
    const note = typeof body?.note === "string" ? body.note.trim() : "";
    const supersedingRecordId =
      typeof body?.superseding_record_id === "string" ? body.superseding_record_id : null;

    if (!isConflictResolution(resolution)) {
      return NextResponse.json({ error: "Invalid resolution" }, { status: 400 });
    }
    if (!note) {
      return NextResponse.json(
        { error: "A resolution note is required" },
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

    // Fetch through the SESSION client: RLS ("org conflicts read") is what
    // proves the caller is a member of this conflict's org. If it's not
    // visible to them, it doesn't exist for them.
    const { data: conflictRaw } = await supabase
      .from("framework_conflicts")
      .select("id, org_id, record_a_id, record_b_id, status")
      .eq("id", id)
      .maybeSingle();
    const conflict = conflictRaw as unknown as ConflictRow | null;
    if (!conflict) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (conflict.status === "resolved") {
      return NextResponse.json(
        { error: "This conflict is already resolved" },
        { status: 409 }
      );
    }

    if (resolution === "supersede") {
      if (
        supersedingRecordId !== conflict.record_a_id &&
        supersedingRecordId !== conflict.record_b_id
      ) {
        return NextResponse.json(
          { error: "supersede requires superseding_record_id set to one of the two records" },
          { status: 400 }
        );
      }
    }

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // ─── Depth gate for framework-changing resolutions ───
    let depthOk: boolean | null = null;
    let gateNote: string | null = null;
    if (resolution !== "escalate") {
      const { data: recordsRaw } = await service
        .from("pattern_records")
        .select(CONFLICT_RECORD_COLUMNS)
        .in("id", [conflict.record_a_id, conflict.record_b_id]);
      const records = (recordsRaw || []) as unknown as ConflictCandidateRecord[];
      const a = records.find((r) => r.id === conflict.record_a_id);
      const b = records.find((r) => r.id === conflict.record_b_id);

      const score =
        a && b
          ? await scoreConflictResolution(
              formatRecordForConflict(a),
              formatRecordForConflict(b),
              resolution,
              note
            )
          : null;
      // Model hiccup (null) = "not yet passed", same as explain-revision.
      depthOk = score?.depthOk === true;
      gateNote = score?.note ?? null;

      if (!depthOk) {
        // Store the shallow note on the open conflict (it's real history and
        // shows in the thread) — but the badge does NOT clear.
        await service
          .from("framework_conflicts")
          .update({ resolution_note: note, resolution_depth_ok: false })
          .eq("id", conflict.id);
        return NextResponse.json({
          success: true,
          resolved: false,
          depth_ok: false,
          note: gateNote,
          message:
            "Logged, but not resolved yet. Name what each framework prescribes, the concrete condition that divides (or settles) them, what the org's guidance now is, and why — then it will clear.",
        });
      }
    }

    const { error: updateError } = await service
      .from("framework_conflicts")
      .update({
        status: "resolved",
        resolution,
        resolution_note: note,
        resolution_depth_ok: depthOk, // null for escalate — gate not applicable
        superseding_record_id: resolution === "supersede" ? supersedingRecordId : null,
        resolved_by: user.id,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", conflict.id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      resolved: true,
      depth_ok: depthOk,
      note: gateNote,
      message:
        resolution === "escalate"
          ? "Escalated and recorded — the contested badge is cleared; the thread notes who owns the call now."
          : "Resolved — that's a real settlement. The contested badge is cleared on both frameworks.",
    });
  } catch (err) {
    console.error("Unexpected error in conflict resolve route:", err);
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
