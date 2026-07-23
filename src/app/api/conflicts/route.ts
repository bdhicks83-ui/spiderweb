// P-2 Build 3 — Conflict review: list endpoint.
//
// Returns every framework_conflict the requesting user's org has, open
// first. RLS ("org conflicts read", p2-conflict-xray.sql) scopes the
// conflict rows to the caller's org on its own; the record summaries are
// fetched through the same session client, so the "org library read" policy
// on pattern_records independently guarantees we never leak a record the
// caller couldn't already see in /library. Org-scoped by construction —
// no cross-org row can survive either policy.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { FrameworkArtifact } from "@/lib/elicitation";

// Same GenericStringError cast-workaround as /api/library — a raw
// multi-column select string can't be inferred by the TS client.
type ConflictRow = {
  id: string;
  org_id: string;
  record_a_id: string;
  record_b_id: string;
  status: string;
  detected_at: string;
  territory: string | null;
  rationale: string;
  resolution: string | null;
  resolution_note: string | null;
  superseding_record_id: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
};

type RecordRow = {
  id: string;
  user_id: string;
  judgment: string | null;
  framework: FrameworkArtifact | null;
};

const CONFLICT_COLUMNS =
  "id, org_id, record_a_id, record_b_id, status, detected_at, territory, " +
  "rationale, resolution, resolution_note, superseding_record_id, resolved_by, resolved_at";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const { data: conflictsRaw, error } = await supabase
      .from("framework_conflicts")
      .select(CONFLICT_COLUMNS)
      .order("status", { ascending: true }) // 'open' < 'resolved' alphabetically — open first
      .order("detected_at", { ascending: false });
    if (error) {
      return NextResponse.json(
        { error: "Could not load conflicts", details: error.message },
        { status: 500 }
      );
    }
    const conflicts = (conflictsRaw || []) as unknown as ConflictRow[];

    if (conflicts.length === 0) {
      return NextResponse.json({ conflicts: [] });
    }

    // Summaries for both sides of every conflict, one query.
    const recordIds = Array.from(
      new Set(conflicts.flatMap((c) => [c.record_a_id, c.record_b_id]))
    );
    const { data: recordsRaw } = await supabase
      .from("pattern_records")
      .select("id, user_id, judgment, framework")
      .in("id", recordIds);
    const records = (recordsRaw || []) as unknown as RecordRow[];
    const byId = Object.fromEntries(records.map((r) => [r.id, r]));

    // Author names for attribution (same two-step join as /api/library).
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

    const side = (id: string) => {
      const r = byId[id];
      if (!r) return { id, name: null, judgment: null, author: null };
      return {
        id: r.id,
        name: r.framework?.name ?? null,
        judgment: r.judgment,
        author: authors[r.user_id] ?? null,
      };
    };

    return NextResponse.json({
      conflicts: conflicts.map((c) => ({
        id: c.id,
        status: c.status,
        detected_at: c.detected_at,
        territory: c.territory,
        rationale: c.rationale,
        resolution: c.resolution,
        resolved_at: c.resolved_at,
        a: side(c.record_a_id),
        b: side(c.record_b_id),
      })),
    });
  } catch (err) {
    console.error("Unexpected error in conflicts route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
