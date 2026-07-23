// P-1 Build 2 — Shared org library: single-record detail endpoint.
// Same RLS-does-the-work approach as /api/library: a plain select by id
// either returns the row (own record, or a COMPLETE org-peer record) or
// nothing at all (RLS silently filters — not our record, not our org, or
// still in progress), which we surface as a clean 404 either way.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { EntityMapEntry, FrameworkArtifact } from "@/lib/elicitation";

const DETAIL_COLUMNS =
  "id, user_id, org_id, status, created_at, updated_at, trigger_type, method, " +
  "context_summary, context_org_size, context_industry, context_function, " +
  "situation_type, intervention_type, trigger_signal, signal_detail, judgment, " +
  "rationale, boundaries, entity_map, framework, framework_rendered_at, " +
  "time_to_first_value_seconds";

// Same GenericStringError cast-workaround as /api/library and
// /api/codify/answer — a raw multi-column select string can't be inferred.
type DetailRow = {
  id: string;
  user_id: string;
  org_id: string | null;
  status: string;
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
  trigger_signal: string | null;
  signal_detail: string | null;
  judgment: string | null;
  rationale: string | null;
  boundaries: string | null;
  entity_map: EntityMapEntry[];
  framework: FrameworkArtifact | null;
  framework_rendered_at: string | null;
  time_to_first_value_seconds: number | null;
};

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

    const { data: recordRaw, error } = await supabase
      .from("pattern_records")
      .select(DETAIL_COLUMNS)
      .eq("id", id)
      .eq("status", "complete")
      .maybeSingle();
    const record = recordRaw as unknown as DetailRow | null;

    if (error) {
      return NextResponse.json(
        { error: "Could not load this record", details: error.message },
        { status: 500 }
      );
    }
    if (!record) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: author } = await supabase
      .from("profiles")
      .select("display_name, persona")
      .eq("id", record.user_id)
      .maybeSingle();

    return NextResponse.json({
      record: {
        ...record,
        is_mine: record.user_id === user.id,
        author: author ?? null,
      },
    });
  } catch (err) {
    console.error("Unexpected error in library detail route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
