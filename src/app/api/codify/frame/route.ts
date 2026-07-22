// P0 — Elicitation Engine: (re)generate the branded framework artifact for a
// completed Pattern Record. POST { recordId }. Used when the artifact call
// failed at completion time — the record (30 minutes of answers) is already
// safe; this retries only the cheap final step.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { framePattern } from "@/lib/claude";
import {
  EMPTY_FIELDS,
  isRecordComplete,
  mergeFields,
} from "@/lib/elicitation";

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
        "id, status, context_summary, context_org_size, context_industry, context_function, situation_type, intervention_type, trigger_signal, signal_detail, judgment, rationale, boundaries"
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

    const { error: saveError } = await supabase
      .from("pattern_records")
      .update({ framework, updated_at: new Date().toISOString() })
      .eq("id", record.id);
    if (saveError) {
      return NextResponse.json(
        { error: "Could not save the framework — try again", details: saveError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ recordId: record.id, framework });
  } catch (err) {
    console.error("Unexpected error in codify/frame route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
