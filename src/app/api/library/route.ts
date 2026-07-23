// P-1 Build 2 — Shared org library: list endpoint.
//
// Returns every COMPLETE pattern_record the requesting user is allowed to
// see. RLS ("org library read" policy, p1-org-foundation.sql) already scopes
// this correctly on its own:
//   - the user's own records, any status (though we filter to 'complete'
//     here anyway — an in-progress session belongs on /codify, not in the
//     library list)
//   - any COMPLETE record belonging to the user's org
// So a solo user with no org (org_id null) still sees exactly what they saw
// before P-1 (their own completed frameworks) — Build 2's "keep existing
// single-user views working" requirement falls out of the RLS design, not
// out of anything special in this route.
//
// Author attribution: pattern_records.user_id references auth.users, not
// profiles, so PostgREST can't auto-embed a profiles join. Two queries
// instead — fetch the records, then fetch profiles for the distinct authors
// (RLS on profiles independently allows this: same-org peers are readable
// via "org members read profiles", so the set of profiles that resolve here
// lines up exactly with the set of records that were visible above).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { EntityMapEntry, FrameworkArtifact } from "@/lib/elicitation";

const LIST_COLUMNS =
  "id, user_id, org_id, created_at, updated_at, trigger_type, method, " +
  "context_summary, context_org_size, context_industry, context_function, " +
  "situation_type, intervention_type, entity_map, framework, " +
  "framework_rendered_at, time_to_first_value_seconds";

// The Supabase client can't infer a proper row type from a raw multi-column
// select string (falls back to an unhelpful "GenericStringError" type) —
// same reason /api/codify/answer and /api/codify cast their select results.
// Cast once here too.
type ListRow = {
  id: string;
  user_id: string;
  org_id: string | null;
  created_at: string;
  updated_at: string;
  trigger_type: string | null;
  method: string | null;
  context_summary: string | null;
  context_org_size: string | null;
  context_industry: string | null;
  context_function: string | null;
  situation_type: string | null;
  intervention_type: string | null;
  entity_map: EntityMapEntry[];
  framework: FrameworkArtifact | null;
  framework_rendered_at: string | null;
  time_to_first_value_seconds: number | null;
};

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const { data: records, error } = await supabase
      .from("pattern_records")
      .select(LIST_COLUMNS)
      .eq("status", "complete")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: "Could not load the library", details: error.message },
        { status: 500 }
      );
    }

    const rows = (records || []) as unknown as ListRow[];
    const authorIds = Array.from(new Set(rows.map((r) => r.user_id)));

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

    // P-2 Build 2 — contested badges (surface-with-warning). OPEN conflicts
    // annotate their two records; the records themselves stay fully visible
    // and usable — nothing here filters the list. RLS ("org conflicts read")
    // scopes the conflict rows to the caller's org on its own.
    const contestedBy: Record<string, { conflict_id: string; other_record_id: string }[]> = {};
    if (rows.length > 0) {
      const idList = rows.map((r) => r.id).join(",");
      const { data: conflicts } = await supabase
        .from("framework_conflicts")
        .select("id, record_a_id, record_b_id")
        .eq("status", "open")
        .or(`record_a_id.in.(${idList}),record_b_id.in.(${idList})`);
      for (const c of (conflicts || []) as {
        id: string;
        record_a_id: string;
        record_b_id: string;
      }[]) {
        (contestedBy[c.record_a_id] ??= []).push({
          conflict_id: c.id,
          other_record_id: c.record_b_id,
        });
        (contestedBy[c.record_b_id] ??= []).push({
          conflict_id: c.id,
          other_record_id: c.record_a_id,
        });
      }
    }

    const enriched = rows.map((r) => ({
      ...r,
      is_mine: r.user_id === user.id,
      author: authors[r.user_id] ?? null,
      contested: contestedBy[r.id] ?? [],
    }));

    return NextResponse.json({ records: enriched });
  } catch (err) {
    console.error("Unexpected error in library route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
