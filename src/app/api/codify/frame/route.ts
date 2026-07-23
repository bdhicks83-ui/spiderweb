// P0 / P-0.5 — Elicitation Engine: (re)generate the branded framework artifact
// for a completed Pattern Record. POST { recordId }. Used when the artifact
// call failed at completion time — the record (the session's answers) is
// already safe; this retries only the cheap final step. Also stamps
// time-to-first-value on the FIRST successful render, same as the happy path
// in /api/codify/answer, so a retried render still gets measured.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { framePattern } from "@/lib/claude";
import { EMPTY_FIELDS, isRecordComplete, mergeFields } from "@/lib/elicitation";
import { embedPatternRecord } from "@/lib/pattern-embedding";

export async function POST(req: NextRequest) {
  try {
    const { recordId } = await req.json();
    if (!recordId || typeof recordId !== "string") {
      return NextResponse.json({ error: "Missing recordId" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const { data: record, error: loadError } = await supabase
      .from("pattern_records")
      .select(
        "id, status, session_start, framework_rendered_at, context_summary, context_org_size, context_industry, context_function, situation_type, intervention_type, trigger_signal, signal_detail, judgment, rationale, boundaries, entity_map"
      )
      .eq("id", recordId)
      .single();

    if (loadError || !record) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }
    if (record.status !== "complete") {
      return NextResponse.json(
        { error: "Record isn't complete yet" },
        { status: 409 }
      );
    }

    const fields = mergeFields(EMPTY_FIELDS, record);
    if (!isRecordComplete(fields)) {
      return NextResponse.json(
        { error: "Record is missing required fields" },
        { status: 409 }
      );
    }

    const framework = await framePattern(fields);
    if (!framework) {
      return NextResponse.json(
        { error: "Framework generation failed — try again" },
        { status: 502 }
      );
    }

    const updates: Record<string, unknown> = {
      framework,
      updated_at: new Date().toISOString(),
    };
    // Only stamp TTFV once — the first time a framework ever renders for this
    // record, whether that happens on the happy path or on a retry here.
    if (!record.framework_rendered_at) {
      const renderedAt = new Date();
      updates.framework_rendered_at = renderedAt.toISOString();
      updates.time_to_first_value_seconds = Math.max(
        0,
        Math.round((renderedAt.getTime() - new Date(record.session_start).getTime()) / 1000)
      );
    }

    const { error: saveError } = await supabase
      .from("pattern_records")
      .update(updates)
      .eq("id", record.id);
    if (saveError) {
      return NextResponse.json(
        { error: "Could not save the framework — try again", details: saveError.message },
        { status: 500 }
      );
    }

    // P-3 (Build 2) — same auto-embed as the happy path in /api/codify/answer,
    // so a framework generated via this retry route is retrievable too.
    // Best-effort and non-blocking; reported honestly, never faked.
    let embedded = false;
    try {
      const embedResult = await embedPatternRecord(supabase, record.id);
      embedded = embedResult.ok;
      if (!embedResult.ok) {
        console.error(`codify/frame: embedding record ${record.id} failed:`, embedResult.error);
      }
    } catch (e) {
      console.error(`codify/frame: embedding record ${record.id} threw:`, e);
    }

    return NextResponse.json({ recordId: record.id, framework, embedded });
  } catch (err) {
    console.error("Unexpected error in codify/frame route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
