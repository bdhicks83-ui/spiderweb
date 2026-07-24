// P-4.5 — Win Column: one-click evidence packet.
//
// Compiles every WIN narrative one person appears in — quoted, dated,
// attributed to the expert who said it, with the framework it came from.
// Same RLS scoping as /api/win-column (org library read); same wins-only
// filter (trigger_type='win' at the query AND inside aggregateWinColumn).
// A person's failure-record appearances never reach this route's response,
// by construction — the query never selects them.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  aggregateWinColumn,
  normalizePersonKey,
  WIN_COLUMN_SOURCE_COLUMNS,
  type WinColumnSourceRow,
} from "@/lib/win-column";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const personParam = searchParams.get("person");
    if (!personParam || !personParam.trim()) {
      return NextResponse.json({ error: "Missing ?person=" }, { status: 400 });
    }
    const targetKey = normalizePersonKey(personParam);

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const { data: records, error } = await supabase
      .from("pattern_records")
      .select(WIN_COLUMN_SOURCE_COLUMNS)
      .eq("status", "complete")
      .eq("trigger_type", "win")
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: "Could not load the evidence packet", details: error.message },
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
    const person = people.find((p) => p.personKey === targetKey);

    if (!person) {
      return NextResponse.json({ error: "No win-column record for this person" }, { status: 404 });
    }

    return NextResponse.json({
      personKey: person.personKey,
      displayName: person.displayName,
      role: person.role,
      mentionCount: person.mentionCount,
      distinctAuthorCount: person.distinctAuthorCount,
      generatedAt: new Date().toISOString(),
      entries: person.mentions
        .slice()
        .reverse() // most recent first — the packet reads newest-first
        .map((m) => ({
          recordId: m.recordId,
          authorName: m.authorName,
          date: m.date,
          quote: m.chip,
          frameworkName: m.frameworkName,
          method: m.method,
          contextFunction: m.contextFunction,
        })),
    });
  } catch (err) {
    console.error("Unexpected error in win-column evidence route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
