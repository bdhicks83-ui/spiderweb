// Phase 5 — Step 5: capture a Case (real-world example) as evidence.
// POST { situation, action, outcome, lesson, relatedInsightId? }.
//
// A case is an insight with evidence_type='case' plus the S/A/O/L structure.
// The user is deliberately authoring it, so it's created approved and embedded
// immediately (no /approve pass — it's illustrative evidence, not a competing
// heuristic). Session client: RLS scopes every write to the owner.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const situation = (body?.situation as string | undefined)?.trim();
    const action = (body?.action as string | undefined)?.trim();
    const outcome = (body?.outcome as string | undefined)?.trim();
    const lesson = (body?.lesson as string | undefined)?.trim();
    const relatedInsightId = (body?.relatedInsightId as string | null) ?? null;

    if (!situation || !action || !outcome || !lesson) {
      return NextResponse.json(
        { error: "Situation, action, outcome, and lesson are all required." },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const narrative = `Situation: ${situation}\nAction: ${action}\nOutcome: ${outcome}\nLesson: ${lesson}`;

    // A case gets its own lightweight source row for provenance.
    const { data: source, error: sourceError } = await supabase
      .from("sources")
      .insert({ user_id: user.id, kind: "text", raw_text: narrative })
      .select("id")
      .single();
    if (sourceError || !source) {
      return NextResponse.json(
        { error: sourceError?.message ?? "Could not save the case." },
        { status: 500 }
      );
    }

    const { data: insight, error: insightError } = await supabase
      .from("insights")
      .insert({
        user_id: user.id,
        source_id: source.id,
        content: narrative,
        status: "approved",
        decided_at: new Date().toISOString(),
        evidence_type: "case",
        situation,
        action,
        outcome,
        lesson,
        related_insight_id: relatedInsightId,
      })
      .select("id")
      .single();
    if (insightError || !insight) {
      return NextResponse.json(
        { error: insightError?.message ?? "Could not save the case." },
        { status: 500 }
      );
    }

    // Embed now so the case is retrievable in Ask/Simulate right away.
    try {
      const voyageRes = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
        },
        body: JSON.stringify({ input: [narrative], model: "voyage-large-2" }),
      });
      if (voyageRes.ok) {
        const voyageData = await voyageRes.json();
        const embedding = voyageData.data[0].embedding as number[];
        await supabase
          .from("insights")
          .update({ embedding: `[${embedding.join(",")}]` })
          .eq("id", insight.id);
      }
    } catch {
      // Non-fatal: the case is saved; it just won't be retrievable until
      // re-embedded. Surface a soft warning rather than failing the save.
      return NextResponse.json({ id: insight.id, warning: "saved but not yet searchable" });
    }

    return NextResponse.json({ id: insight.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
