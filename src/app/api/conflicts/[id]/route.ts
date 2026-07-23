// P-2 Build 3 — Conflict review: single-conflict detail (both sides, full).
//
// Same RLS-does-the-work approach as /api/library/[id]: the conflict row is
// fetched through the session client ("org conflicts read" scopes it), and
// both pattern_records come through the session client too ("org library
// read"), so nothing here can cross an org boundary. A missing row either
// way surfaces as a clean 404.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { EntityMapEntry, FrameworkArtifact } from "@/lib/elicitation";

type ConflictRow = {
  id: string;
  org_id: string;
  record_a_id: string;
  record_b_id: string;
  status: string;
  detected_at: string;
  detected_by: string;
  territory: string | null;
  rationale: string;
  resolution: string | null;
  resolution_note: string | null;
  resolution_depth_ok: boolean | null;
  superseding_record_id: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
};

type RecordRow = {
  id: string;
  user_id: string;
  created_at: string;
  trigger_type: string | null;
  method: string | null;
  context_summary: string | null;
  trigger_signal: string | null;
  signal_detail: string | null;
  judgment: string | null;
  rationale: string | null;
  boundaries: string | null;
  entity_map: EntityMapEntry[];
  framework: FrameworkArtifact | null;
};

const CONFLICT_COLUMNS =
  "id, org_id, record_a_id, record_b_id, status, detected_at, detected_by, " +
  "territory, rationale, resolution, resolution_note, resolution_depth_ok, " +
  "superseding_record_id, resolved_by, resolved_at";

const RECORD_COLUMNS =
  "id, user_id, created_at, trigger_type, method, context_summary, " +
  "trigger_signal, signal_detail, judgment, rationale, boundaries, " +
  "entity_map, framework";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const { data: conflictRaw, error } = await supabase
      .from("framework_conflicts")
      .select(CONFLICT_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    const conflict = conflictRaw as unknown as ConflictRow | null;

    if (error) {
      return NextResponse.json(
        { error: "Could not load this conflict", details: error.message },
        { status: 500 }
      );
    }
    if (!conflict) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: recordsRaw } = await supabase
      .from("pattern_records")
      .select(RECORD_COLUMNS)
      .in("id", [conflict.record_a_id, conflict.record_b_id]);
    const records = (recordsRaw || []) as unknown as RecordRow[];
    const recordA = records.find((r) => r.id === conflict.record_a_id) ?? null;
    const recordB = records.find((r) => r.id === conflict.record_b_id) ?? null;

    const authorIds = Array.from(new Set(records.map((r) => r.user_id)));
    let authors: Record<string, { display_name: string | null; persona: string | null }> = {};
    if (authorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, persona")
        .in("id", authorIds);
      authors = Object.fromEntries(
        (profiles || []).map((p) => [p.id, { display_name: p.display_name, persona: p.persona }])
      );
    }

    // Resolver attribution (may be null — e.g. account deleted).
    let resolver: { display_name: string | null } | null = null;
    if (conflict.resolved_by) {
      const { data: rp } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", conflict.resolved_by)
        .maybeSingle();
      resolver = rp ?? null;
    }

    const withAuthor = (r: RecordRow | null) =>
      r
        ? { ...r, is_mine: r.user_id === user.id, author: authors[r.user_id] ?? null }
        : null;

    return NextResponse.json({
      conflict: {
        ...conflict,
        a: withAuthor(recordA),
        b: withAuthor(recordB),
        resolver,
      },
    });
  } catch (err) {
    console.error("Unexpected error in conflict detail route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
