// P-4.5 — Win Column: ranked mention view + summary tiles.
//
// RLS does all the org-scoping here, same as /api/library: "org library
// read" (p1-org-foundation.sql) already returns the caller's own records
// (any status) plus their org's COMPLETE records. We additionally filter to
// trigger_type='win' — see src/lib/win-column.ts for why that filter lives
// there too (defense in depth, not "trust this route got it right").
//
// No service-role client anywhere in this route. Nothing here can see
// another org's data, and nothing here can see a non-win record's contents
// beyond deciding it isn't a win (the query itself never selects failure
// records' entity_map into the response).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  aggregateWinColumn,
  buildSummaryTiles,
  WIN_COLUMN_SOURCE_COLUMNS,
  type WinColumnSourceRow,
} from "@/lib/win-column";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    // Fetch every record we're ALLOWED to fetch that could carry a mention —
    // scoped to 'win' at the query level (belt) as well as inside
    // aggregateWinColumn (suspenders). Nothing beyond win-record fields is
    // ever loaded, so there is no failure-record content in memory to leak.
    const { data: records, error } = await supabase
      .from("pattern_records")
      .select(WIN_COLUMN_SOURCE_COLUMNS)
      .eq("status", "complete")
      .eq("trigger_type", "win")
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: "Could not load the Win Column", details: error.message },
        { status: 500 }
      );
    }

    const rows = (records || []) as unknown as WinColumnSourceRow[];
    const authorIds = Array.from(new Set(rows.map((r) => r.user_id)));

    let authorNamesById: Record<string, string> = {};
    if (authorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", authorIds);
      authorNamesById = Object.fromEntries(
        (profiles || []).map((p) => [p.id, p.display_name || "Org member"])
      );
    }

    const people = aggregateWinColumn(rows, authorNamesById, new Date().toISOString());
    const summary = buildSummaryTiles(people);

    // Trim each person's mentions down to the top few chips for the list
    // view — the evidence packet route returns the full set.
    const cards = people.map((p) => ({
      personKey: p.personKey,
      displayName: p.displayName,
      role: p.role,
      mentionCount: p.mentionCount,
      distinctAuthorCount: p.distinctAuthorCount,
      authorNames: p.authorNames,
      departmentsTouched: p.departmentsTouched,
      firstMentionDate: p.firstMentionDate,
      mostRecentMentionDate: p.mostRecentMentionDate,
      crossDeptImpact: p.crossDeptImpact,
      risingSignal: p.risingSignal,
      retentionWatch: p.retentionWatch,
      chips: p.mentions.slice(-3).reverse().map((m) => ({
        text: m.chip,
        authorName: m.authorName,
        date: m.date,
      })),
    }));

    return NextResponse.json({ people: cards, summary });
  } catch (err) {
    console.error("Unexpected error in win-column route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
