// P-9 — one gap. GET only.
//
// Used by the gap detail view, the /codify "you're answering this" banner, and
// the Training Studio prefill. Read through the SESSION client, so the org RLS
// policy is the gate.
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { GAP_COLUMNS, type KnowledgeGapRow } from "@/lib/knowledge-gaps";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createSessionClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

    const { data: raw, error } = await supabase
      .from("knowledge_gaps")
      .select(GAP_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: "Could not load the gap", details: error.message }, { status: 500 });
    }
    const gap = (raw as unknown as KnowledgeGapRow | null) ?? null;
    if (!gap) return NextResponse.json({ error: "Not found" }, { status: 404 });

    let resolvedFrameworkName: string | null = null;
    if (gap.resolved_record_id) {
      const { data: rec } = await supabase
        .from("pattern_records")
        .select("id, framework")
        .eq("id", gap.resolved_record_id)
        .maybeSingle();
      resolvedFrameworkName =
        (rec as { framework: { name?: string } | null } | null)?.framework?.name ?? null;
    }

    return NextResponse.json({
      gap: {
        id: gap.id,
        question: gap.question_text,
        status: gap.status,
        asked_count: gap.asked_count,
        first_asked_at: gap.first_asked_at,
        last_asked_at: gap.last_asked_at,
        claimed_by_me: gap.claimed_by === user.id,
        resolved_record_id: gap.resolved_record_id,
        resolved_framework_name: resolvedFrameworkName,
        resolved_training_request_id: gap.resolved_training_request_id,
        resolved_at: gap.resolved_at,
      },
    });
  } catch (err) {
    console.error("Unexpected error in gap GET route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
