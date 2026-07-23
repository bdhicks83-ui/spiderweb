// P-3 (Build 1) — Embedding verification path. "No more guessing."
// POST { table?: "pattern_records" | "insights", ids?: string[] }.
// Reports which records HAVE an embedding and which are still missing one, so a
// failed/queued embed can be found and re-run instead of silently rotting.
//
// Uses the caller's RLS client, so it only ever reports on records the caller
// can already see (org-scoped for pattern_records, own-rows for insights) — it
// never selects the vector itself, only whether it is null.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Table = "pattern_records" | "insights";

// Which rows are "supposed to" have an embedding, per table.
const READY_STATUS: Record<Table, string> = {
  pattern_records: "complete",
  insights: "approved",
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const table: Table = body.table === "insights" ? "insights" : "pattern_records";
    const ids: string[] | null =
      Array.isArray(body.ids) && body.ids.every((x: unknown) => typeof x === "string")
        ? body.ids
        : null;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    // All candidate rows the caller can see.
    let allQuery = supabase.from(table).select("id").eq("status", READY_STATUS[table]);
    if (ids) allQuery = allQuery.in("id", ids);
    const { data: allRows, error: allError } = await allQuery;
    if (allError) {
      return NextResponse.json(
        { error: "Could not read records", details: allError.message },
        { status: 500 }
      );
    }

    // The subset that already has a vector.
    let embeddedQuery = supabase
      .from(table)
      .select("id")
      .eq("status", READY_STATUS[table])
      .not("embedding", "is", null);
    if (ids) embeddedQuery = embeddedQuery.in("id", ids);
    const { data: embeddedRows, error: embeddedError } = await embeddedQuery;
    if (embeddedError) {
      return NextResponse.json(
        { error: "Could not read embedding status", details: embeddedError.message },
        { status: 500 }
      );
    }

    const allIds = (allRows || []).map((r) => r.id as string);
    const embeddedSet = new Set((embeddedRows || []).map((r) => r.id as string));
    const embedded = allIds.filter((id) => embeddedSet.has(id));
    const missing = allIds.filter((id) => !embeddedSet.has(id));

    return NextResponse.json({
      table,
      total: allIds.length,
      embeddedCount: embedded.length,
      missingCount: missing.length,
      allEmbedded: missing.length === 0,
      embedded,
      missing,
    });
  } catch (err) {
    console.error("Unexpected error in embeddings/verify route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
